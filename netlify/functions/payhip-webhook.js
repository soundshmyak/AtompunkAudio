// netlify/functions/payhip-webhook.js

// --- 1. Подготовка: Загружаем инструменты и секреты ---
const crypto = require('crypto'); // Подключаем модуль для хеширования (проверка подписи)
require('dotenv').config(); // Загружаем секреты из .env (только локально)
const { ManagementClient } = require('auth0');

// --- 2. Настраиваем связь с Auth0 ---
const auth0 = new ManagementClient({
  domain: process.env.AUTH0_DOMAIN,
  clientId: process.env.AUTH0_M2M_CLIENT_ID,
  clientSecret: process.env.AUTH0_M2M_CLIENT_SECRET,
  scope: "read:users update:users",
});

// --- 3. Основная часть: Функция, которая будет выполняться при запросе ---
exports.handler = async (event, context) => {
  console.log("Получен запрос к функции payhip-webhook...");

  // --- Шаг А: Проверяем, что запрос пришел методом POST ---
  if (event.httpMethod !== 'POST') {
    console.log("Метод не POST, отклоняем.");
    return { statusCode: 405, body: 'Разрешен только метод POST' };
  }

  // --- Шаг Б: Получаем и парсим данные из запроса (ожидаем JSON) ---
  let payload;
  let rawBody;
  try {
    rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    payload = JSON.parse(rawBody);
    console.log('Данные от Payhip (payload):', JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error('Ошибка разбора JSON данных от Payhip:', error);
    // Важно вернуть 200 OK, чтобы Payhip не повторял некорректный запрос
    // Но логируем ошибку для себя. Можно вернуть и 400, если уверены, что проблема на стороне Payhip.
    // return { statusCode: 400, body: 'Не могу разобрать тело запроса (ожидался JSON)' };
     return { statusCode: 200, body: 'OK (ошибка парсинга JSON)' }; // Возвращаем OK, чтобы Payhip не повторял
  }

  // --- Шаг В: БЕЗОПАСНОСТЬ - Проверяем подпись Payhip ---
  const payhipApiKey = process.env.PAYHIP_API_KEY; // Берем API ключ из переменных окружения
  const signatureFromPayhip = payload.signature; // Берем подпись из тела JSON

  if (!payhipApiKey) {
      console.error("!!! КРИТИЧЕСКАЯ ОШИБКА: Переменная окружения PAYHIP_API_KEY не установлена !!!");
      // Не можем проверить подпись, лучше отклонить запрос
      return { statusCode: 500, body: 'Ошибка конфигурации сервера (отсутствует API Key)' };
  }
  if (!signatureFromPayhip) {
      console.warn("!!! ВНИМАНИЕ: В полученных данных от Payhip отсутствует поле 'signature'. Запрос отклонен.");
      return { statusCode: 400, body: 'Отсутствует подпись в запросе' };
  }

  // Вычисляем ожидаемую подпись (хеш API ключа)
  const expectedSignature = crypto.createHash('sha256').update(payhipApiKey).digest('hex');

  // Сравниваем подписи
  if (signatureFromPayhip !== expectedSignature) {
      console.error(`!!! ПРОВЕРКА ПОДПИСИ PAYHIP НЕ ПРОШЛА !!! Ожидалось: ${expectedSignature}, Получено: ${signatureFromPayhip}. Запрос отклонен.`);
      return { statusCode: 403, body: 'Неверная подпись запроса' };
  }
  console.log("Проверка подписи Payhip пройдена.");


  // --- Шаг Г: Находим нужную информацию ---
  const eventType = payload.type;                     // Тип события (например, 'subscription.created')
  const customerEmail = payload.customer_email || payload.email; // Email покупателя (разные поля для разных событий)
  const planName = payload.plan_name;                 // Название плана (для подписок)
  // Можно извлечь и другие данные при необходимости:
  // const transactionId = payload.id; // ID транзакции для paid/refunded
  // const subscriptionId = payload.subscription_id; // ID подписки для subscription.*
  // const price = payload.price; // Цена в центах для paid/refunded

  // Проверяем, есть ли тип события и email
  if (!eventType || !customerEmail) {
    console.error('В данных от Payhip не хватает type или email/customer_email.');
    // Возвращаем OK, чтобы Payhip не повторял, но логируем ошибку
    return { statusCode: 200, body: 'OK (Не хватает данных в запросе)' };
  }

  console.log(`Событие: ${eventType}, Email: ${customerEmail}, План: ${planName || 'N/A'}`);

  // --- Шаг Д: Ищем пользователя в Auth0 по Email ---
  let auth0User = null;
  try {
    console.log(`Ищем пользователя в Auth0 по email: ${customerEmail}...`);
    const users = await auth0.getUsersByEmail(customerEmail);

    if (users && users.length === 1) {
      auth0User = users[0];
      console.log(`Найден пользователь Auth0: ID = ${auth0User.user_id}`);
    } else if (users && users.length > 1) {
      console.warn(`Найдено НЕСКОЛЬКО пользователей (${users.length}) с email ${customerEmail}. Обновление НЕ выполняется.`);
      return { statusCode: 200, body: 'OK (Найдено несколько пользователей)' };
    } else {
      console.warn(`Пользователь с email ${customerEmail} НЕ найден в Auth0.`);
      // Возможно, стоит создать пользователя или просто игнорировать? Пока игнорируем.
      return { statusCode: 200, body: 'OK (Пользователь не найден)' };
    }
  } catch (error) {
    console.error(`Ошибка при поиске пользователя в Auth0 (${customerEmail}):`, error);
    // Возвращаем 500, т.к. это проблема на нашей стороне или с Auth0
    return { statusCode: 500, body: 'Ошибка сервера при поиске пользователя в Auth0' };
  }

  // --- Шаг Е: Обновляем статус пользователя в Auth0 ---
  try {
    const currentMetadata = auth0User.app_metadata || {};
    let updatedMetadata = { ...currentMetadata };
    let needsUpdate = false; // Флаг, что нужно обновлять

    // Определяем тип подписки по НАЗВАНИЮ плана Payhip
    // !!! ЗАМЕНИТЕ 'Название Вашего Месячного Плана' и 'Название Вашего Вечного Плана'
    //     на РЕАЛЬНЫЕ названия ваших планов из Payhip !!!
    let subscriptionType = currentMetadata.subscription_type; // Сохраняем текущий тип по умолчанию
    if (eventType === 'subscription.created') {
       if (planName === 'Название Вашего Месячного Плана') { // <--- ЗАМЕНИТЬ
         subscriptionType = 'monthly';
       } else if (planName === 'Название Вашего Вечного Плана') { // <--- ЗАМЕНИТЬ
         subscriptionType = 'lifetime';
       } else {
         console.warn(`Неизвестное название плана Payhip: ${planName}`);
         subscriptionType = 'unknown'; // Или null, или не меняем
       }
    }
    // TODO: Добавить обработку события 'paid', если покупка разового продукта тоже дает доступ
    // if (eventType === 'paid') {
    //   // Проверить payload.items[0].product_name или product_id
    //   // и установить соответствующий subscriptionType или другие метаданные
    // }


    // Решаем, что делать в зависимости от типа события
    if (eventType === 'subscription.created') {
      console.log(`Пользователю ${auth0User.user_id} назначается подписка (${subscriptionType}).`);
      updatedMetadata.is_subscriber = true;
      updatedMetadata.subscription_type = subscriptionType;
      // updatedMetadata.payhip_subscription_id = payload.subscription_id; // Можно сохранить ID подписки Payhip
      // updatedMetadata.subscription_start_date = payload.date_subscription_started; // И дату начала
      needsUpdate = true;

    } else if (eventType === 'subscription.deleted') {
      console.log(`У пользователя ${auth0User.user_id} отменяется подписка (План: ${planName}).`);
      // Проверяем, совпадает ли отменяемый план с текущим активным типом, чтобы не отменить случайно другую подписку
      // Эта проверка необязательна, но может быть полезна, если у пользователя может быть несколько типов доступов
      let typeBeingCancelled = null;
       if (planName === 'Название Вашего Месячного Плана') typeBeingCancelled = 'monthly'; // <--- ЗАМЕНИТЬ
       else if (planName === 'Название Вашего Вечного Плана') typeBeingCancelled = 'lifetime'; // <--- ЗАМЕНИТЬ

      // Отменяем подписку, только если тип совпадает ИЛИ если тип не определен (на всякий случай)
      if (currentMetadata.is_subscriber && (!typeBeingCancelled || currentMetadata.subscription_type === typeBeingCancelled)) {
          updatedMetadata.is_subscriber = false;
          // Можно очистить поля или оставить для истории
          // delete updatedMetadata.subscription_type;
          // delete updatedMetadata.payhip_subscription_id;
          // updatedMetadata.subscription_cancel_date = payload.date_subscription_deleted; // Сохранить дату отмены
          needsUpdate = true;
          console.log(`Статус подписчика для ${auth0User.user_id} изменен на false.`);
      } else {
           console.log(`Отмена подписки для плана "${planName}" не привела к изменению статуса подписчика (текущий статус: ${currentMetadata.is_subscriber}, тип: ${currentMetadata.subscription_type}).`);
      }
    }
    // TODO: Добавить обработку события 'refunded', если нужно отзывать доступ при возврате
    // else if (eventType === 'refunded') {
    //   // Проверить payload.items[0].product_name или product_id
    //   // Проверить payload.amount_refunded === payload.price (полный возврат)
    //   // Отозвать доступ: updatedMetadata.is_subscriber = false; needsUpdate = true;
    // }
    else {
      console.log(`Тип события ${eventType} не требует обновления статуса подписки в текущей логике.`);
    }

    // Обновляем данные в Auth0, ТОЛЬКО если они действительно изменились
    // Сравнение JSON строк - простой способ проверить изменения в объекте
    if (needsUpdate && JSON.stringify(currentMetadata) !== JSON.stringify(updatedMetadata)) {
      console.log(`Обновляем app_metadata для пользователя ${auth0User.user_id}...`);
      await auth0.updateAppMetadata({ id: auth0User.user_id }, updatedMetadata);
      console.log(`app_metadata для ${auth0User.user_id} успешно обновлены.`);
    } else if (needsUpdate) {
      console.log(`app_metadata для ${auth0User.user_id} не изменились, обновление не требуется.`);
    }

  } catch (error) {
    console.error(`Ошибка при обновлении app_metadata для ${auth0User.user_id}:`, error);
    // Это внутренняя ошибка, возвращаем 500
    return { statusCode: 500, body: 'Ошибка сервера при обновлении данных в Auth0' };
  }

  // --- Шаг Ж: Говорим Payhip, что все прошло хорошо ---
  console.log("Обработка вебхука успешно завершена.");
  return {
    statusCode: 200, // Статус "OK"
    body: 'OK',      // Ответ для Payhip
  };
};
