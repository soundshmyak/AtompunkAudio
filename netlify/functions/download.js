require('dotenv').config();
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const { ManagementClient } = require('auth0');
const AWS = require('aws-sdk'); // Пример для AWS S3

// --- Конфигурация клиента JWKS для проверки токенов Auth0 ---
const client = jwksClient({
  jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, function(err, key) {
    if (err) {
        console.error("Ошибка получения ключа JWKS:", err);
        return callback(err);
    }
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}

// --- Функция проверки токена Auth0 ---
const verifyToken = (bearerToken) => {
  return new Promise((resolve, reject) => {
    if (!bearerToken || !bearerToken.startsWith('Bearer ')) {
      return reject(new Error('Отсутствует или неверный формат токена Bearer'));
    }
    const token = bearerToken.substring(7); // Убираем "Bearer "

    jwt.verify(token, getKey, {
      // audience: 'YOUR_API_IDENTIFIER', // Укажите audience вашего API, если настроен в Auth0
      issuer: `https://${process.env.AUTH0_DOMAIN}/`,
      algorithms: ['RS256']
    }, (err, decoded) => {
      if (err) {
        console.error("Ошибка верификации токена:", err);
        return reject(err);
      }
      resolve(decoded); // Возвращаем раскодированный токен (payload)
    });
  });
};

// --- Конфигурация Auth0 Management Client ---
// Нужен для чтения и ЗАПИСИ app_metadata
const auth0 = new ManagementClient({
  domain: process.env.AUTH0_DOMAIN,
  clientId: process.env.AUTH0_M2M_CLIENT_ID, // Используем M2M ключи
  clientSecret: process.env.AUTH0_M2M_CLIENT_SECRET,
  scope: "read:users update:users read:users_app_metadata update:users_app_metadata", // Расширенные права!
});

// --- Конфигурация AWS S3 (Пример) ---
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
    signatureVersion: 'v4', // Важно для presigned URLs
});
const BUCKET_NAME = process.env.S3_BUCKET_NAME;

// --- Основной обработчик Netlify Function ---
exports.handler = async (event, context) => {
  // 1. Проверка метода GET
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' }; // Более корректный статус для "метод не разрешен"
  }

  // 2. Получение имени файла и СТОИМОСТИ из запроса
  const fileName = event.queryStringParameters.file;
  const costParam = event.queryStringParameters.cost; // Клиент должен передать стоимость!
  const cost = parseInt(costParam, 10);

  if (!fileName || isNaN(cost) || cost < 0) {
    return { statusCode: 400, body: 'Bad Request: Missing or invalid "file" or "cost" query parameter' };
  }

  // 3. Проверка токена Auth0
  let decodedToken;
  try {
    decodedToken = await verifyToken(event.headers.authorization);
  } catch (error) {
    return { statusCode: 401, body: 'Unauthorized: Invalid or missing token' };
  }

  const userId = decodedToken.sub;
  console.log(`Запрос на скачивание файла ${fileName} (стоимость ${cost}) от пользователя ${userId}`);

  // 4. Получение ТЕКУЩЕГО баланса пользователя из Auth0
  let currentUserData;
  let currentBalance;
  try {
    currentUserData = await auth0.getUser({ id: userId });
    currentBalance = currentUserData?.app_metadata?.atom_balance ?? 0; // Если баланса нет, считаем 0
    console.log(`Текущий баланс пользователя ${userId}: ${currentBalance} атомов.`);
  } catch (error) {
    console.error(`Ошибка получения данных пользователя ${userId} из Auth0 API:`, error);
    return { statusCode: 500, body: 'Internal Server Error: Cannot fetch user balance' };
  }

  // 5. Проверка баланса
  if (currentBalance < cost) {
    console.warn(`Недостаточно атомов у пользователя ${userId} (нужно ${cost}, есть ${currentBalance}) для файла ${fileName}.`);
    return { statusCode: 402, body: 'Payment Required: Insufficient atoms' }; // 402 Payment Required - подходящий статус
  }

  // 6. СПИСАНИЕ АТОМОВ (перед генерацией ссылки!)
  const newBalance = currentBalance - cost;
  try {
    // Обновляем только баланс, сохраняя остальные метаданные
    const updatedMetadata = { ...currentUserData.app_metadata, atom_balance: newBalance };
    await auth0.updateAppMetadata({ id: userId }, updatedMetadata);
    console.log(`Списано ${cost} атомов у пользователя ${userId}. Новый баланс: ${newBalance}`);
  } catch (error) {
    console.error(`Ошибка списания атомов у пользователя ${userId}:`, error);
    // Важно: НЕ выдаем ссылку, если списание не удалось!
    return { statusCode: 500, body: 'Internal Server Error: Failed to deduct atoms' };
  }

  // 7. Генерация Pre-signed URL для S3 (как раньше, но адаптируем путь к файлу)
  const params = {
    Bucket: BUCKET_NAME,
    Key: `sounds/${fileName}`, // Путь к файлу в S3 (предполагаем, что файлы в папке "sounds/")
    Expires: 60 * 5, // Ссылка действительна 5 минут
    ResponseContentDisposition: `attachment; filename="${fileName}"` // Чтобы браузер предложил скачать
  };
  try {
    const signedUrl = await s3.getSignedUrlPromise('getObject', params);
    console.log(`Сгенерирована ссылка для ${userId} на файл ${fileName}`);
    // 8. Перенаправление на скачивание
    return {
      statusCode: 302,
      headers: { Location: signedUrl },
      body: '',
    };
  } catch (error) {
    console.error(`Ошибка генерации pre-signed URL для файла ${fileName}:`, error);
     // Важно: Что делать с уже списанными атомами, если S3 не сработал?
     // В данном примере, если ошибка произошла *после* списания, атомы уже списаны.
     // В реальном приложении нужно продумать компенсацию (например, отдельный процесс "возврата" атомов).
     // Пока что просто логируем ошибку.
    return { statusCode: 500, body: 'Internal Server Error: Could not generate download link after deduction' };
  }
};