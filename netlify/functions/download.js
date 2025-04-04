// netlify/functions/download.js
require('dotenv').config();
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const { ManagementClient } = require('auth0');
const AWS = require('aws-sdk');

// --- Конфигурация JWKS (как раньше) ---
const client = jwksClient({
  jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`
});

function getKey(header, callback) {
  console.log(`[getKey] Попытка получить ключ для kid: ${header.kid}`);
  client.getSigningKey(header.kid, function(err, key) {
    if (err) {
        console.error("[getKey] Ошибка получения ключа JWKS:", err);
        return callback(err);
    }
    const signingKey = key.publicKey || key.rsaPublicKey;
    console.log(`[getKey] Ключ для kid: ${header.kid} успешно получен.`);
    callback(null, signingKey);
  });
}

// --- Функция проверки токена (как раньше, с правильным audience) ---
const verifyToken = (bearerToken) => {
  return new Promise((resolve, reject) => {
    if (!bearerToken || !bearerToken.startsWith('Bearer ')) {
      console.error('[verifyToken] Отсутствует или неверный формат токена Bearer');
      return reject(new Error('Отсутствует или неверный формат токена Bearer'));
    }
    const token = bearerToken.substring(7);
    const expectedAudience = process.env.AUTH0_AUDIENCE || 'https://api.noise.pw/download'; // Убедитесь, что это ваш Identifier API
    const expectedIssuer = `https://${process.env.AUTH0_DOMAIN}/`;

    console.log(`[verifyToken] Проверка токена (начало)...`);
    console.log(`[verifyToken] Ожидаемый Issuer: ${expectedIssuer}`);
    console.log(`[verifyToken] Ожидаемый Audience: ${expectedAudience}`);

    jwt.verify(token, getKey, {
      audience: expectedAudience,
      issuer: expectedIssuer,
      algorithms: ['RS256']
    }, (err, decoded) => {
      if (err) {
        console.error("[verifyToken] ОШИБКА ВЕРИФИКАЦИИ:", err.name, err.message);
        return reject(err);
      }
      console.log('[verifyToken] Токен УСПЕШНО верифицирован.');
      resolve(decoded);
    });
  });
};

// --- Конфигурация Auth0 Management Client (как раньше) ---
const auth0 = new ManagementClient({
  domain: process.env.AUTH0_DOMAIN,
  clientId: process.env.AUTH0_M2M_CLIENT_ID,
  clientSecret: process.env.AUTH0_M2M_CLIENT_SECRET,
  scope: "read:users update:users read:users_app_metadata update:users_app_metadata",
});

// --- Конфигурация AWS S3 (как раньше) ---
const s3 = new AWS.S3({ /* ... */ });
const BUCKET_NAME = process.env.S3_BUCKET_NAME;

// --- Основной обработчик Netlify Function ---
exports.handler = async (event, context) => {
  // 1. Проверка метода GET
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // 2. Получение параметров
  const fileName = event.queryStringParameters.file;
  const costParam = event.queryStringParameters.cost;
  const cost = parseInt(costParam, 10);

  if (!fileName || isNaN(cost) || cost < 0) {
    return { statusCode: 400, body: 'Bad Request: Missing or invalid "file" or "cost"' };
  }

  // 3. Проверка токена
  let decodedToken;
  try {
    const bearerToken = event.headers.authorization;
    console.log(`[handler] Получен заголовок Authorization: ${bearerToken ? 'Да' : 'Нет'}`);
    decodedToken = await verifyToken(bearerToken);
    console.log(`[handler] Токен верифицирован для пользователя: ${decodedToken.sub}`);
  } catch (error) {
    console.error('[handler] Ошибка проверки токена:', error.message);
    return { statusCode: 401, body: `Unauthorized: ${error.message}` };
  }

  const userId = decodedToken.sub;
  console.log(`[handler] Запрос на скачивание файла ${fileName} (стоимость ${cost}) от пользователя ${userId}`);

  // 4. Получение и ОБРАБОТКА баланса
  let currentUserData;
  let currentBalance = 0; // Инициализация нулем
  try {
    currentUserData = await auth0.users.get({ id: userId });
    const balanceFromMeta = currentUserData?.data?.app_metadata?.atom_balance;
    console.log(`[handler] Баланс из app_metadata: ${balanceFromMeta} (тип: ${typeof balanceFromMeta})`);

    // *** ИСПРАВЛЕНИЕ: Парсим и присваиваем значение ***
    currentBalance = parseInt(balanceFromMeta, 10);
    if (isNaN(currentBalance)) { // Обработка случая, если значение не число или отсутствует
        currentBalance = 0;
    }
    // *** КОНЕЦ ИСПРАВЛЕНИЯ ***

    console.log(`[handler] Текущий БАЛАНС (число): ${currentBalance} атомов.`);

  } catch (error) {
    console.error(`[handler] Ошибка получения данных пользователя ${userId} из Auth0 API: Status Code: ${error.statusCode}, Message: ${error.message}`);
    console.error('Полный объект ошибки Auth0 API:', JSON.stringify(error, null, 2));
    return { statusCode: 500, body: 'Internal Server Error: Cannot fetch user balance' };
  }

  // 5. Проверка баланса (Теперь currentBalance содержит правильное число)
  console.log(`[handler] Проверка: currentBalance (${currentBalance}) < cost (${cost}) ? ${currentBalance < cost}`); // Добавлен лог сравнения
  if (currentBalance < cost) {
    console.warn(`[handler] Недостаточно атомов у пользователя ${userId} (нужно ${cost}, есть ${currentBalance}) для файла ${fileName}.`);
    return { statusCode: 402, body: 'Payment Required: Insufficient atoms' };
  }

  // 6. Списание атомов (Теперь newBalance будет рассчитан верно)
  const newBalance = currentBalance - cost;
  try {
    const metaDataToUpdate = currentUserData?.data?.app_metadata || {}; // Берем текущие метаданные или пустой объект
    metaDataToUpdate.atom_balance = newBalance; // Обновляем баланс

    await auth0.users.update(
        { id: userId },
        { app_metadata: metaDataToUpdate } // Передаем обновленный объект метаданных
    );
    console.log(`[handler] Списано ${cost} атомов у пользователя ${userId}. Новый баланс: ${newBalance}`);
  } catch (error) {
    console.error(`[handler] Ошибка списания атомов у пользователя ${userId}: Status Code: ${error.statusCode}, Message: ${error.message}`);
    console.error('Полный объект ошибки Auth0 API при списании:', JSON.stringify(error, null, 2));
    return { statusCode: 500, body: 'Internal Server Error: Failed to deduct atoms' };
  }

  // 7. Генерация Pre-signed URL для S3
  const params = {
    Bucket: BUCKET_NAME,
    Key: `sounds/${fileName}`, // Убедитесь, что путь верный
    Expires: 300, // 5 минут
    ResponseContentDisposition: `attachment; filename="${fileName}"`
  };
  try {
    const signedUrl = await s3.getSignedUrlPromise('getObject', params);
    console.log(`[handler] Сгенерирована ссылка для ${userId} на файл ${fileName}`);

    // 8. Возврат 302 редиректа
    return {
      statusCode: 302,
      headers: { Location: signedUrl },
      body: '',
    };
  } catch (error) {
    console.error(`[handler] Ошибка генерации pre-signed URL для файла ${fileName}:`, error);
    return { statusCode: 500, body: 'Internal Server Error: Could not generate download link' };
  }
};