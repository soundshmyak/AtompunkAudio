// netlify/functions/download.js
require('dotenv').config();
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const { ManagementClient } = require('auth0');
const AWS = require('aws-sdk');

// --- Конфигурация клиента JWKS для проверки токенов Auth0 ---
const client = jwksClient({
  jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`
});

function getKey(header, callback) {
  console.log(`[getKey] Попытка получить ключ для kid: ${header.kid}`); // Лог
  client.getSigningKey(header.kid, function(err, key) {
    if (err) {
        console.error("[getKey] Ошибка получения ключа JWKS:", err);
        return callback(err);
    }
    const signingKey = key.publicKey || key.rsaPublicKey;
    console.log(`[getKey] Ключ для kid: ${header.kid} успешно получен.`); // Лог
    callback(null, signingKey);
  });
}

// --- Функция проверки токена Auth0 ---
const verifyToken = (bearerToken) => {
  return new Promise((resolve, reject) => {
    if (!bearerToken || !bearerToken.startsWith('Bearer ')) {
      console.error('[verifyToken] Отсутствует или неверный формат токена Bearer');
      return reject(new Error('Отсутствует или неверный формат токена Bearer'));
    }
    const token = bearerToken.substring(7);

    // *** ВАЖНО: Замените 'YOUR_CUSTOM_API_IDENTIFIER' на реальный Identifier вашего API из Auth0 ***
    // Например: 'https://api.noise.pw/download' или тот, который вы создали
    const expectedAudience = process.env.AUTH0_AUDIENCE || 'https://api.noise.pw/download';
    const expectedIssuer = `https://${process.env.AUTH0_DOMAIN}/`;

    console.log(`[verifyToken] Проверка токена (начало): ${token.substring(0,15)}...`);
    console.log(`[verifyToken] Ожидаемый Issuer: ${expectedIssuer}`);
    console.log(`[verifyToken] Ожидаемый Audience: ${expectedAudience}`);

    jwt.verify(token, getKey, {
      audience: expectedAudience,  // <-- ИСПОЛЬЗУЕМ ПРАВИЛЬНЫЙ AUDIENCE
      issuer: expectedIssuer,      // <-- Проверяем issuer
      algorithms: ['RS256']        // <-- Проверяем алгоритм
    }, (err, decoded) => {
      if (err) {
        // Логируем ошибку подробно
        console.error("[verifyToken] ОШИБКА ВЕРИФИКАЦИИ:", err.name, err.message);
        if (err.name === 'JsonWebTokenError') {
             console.error('[verifyToken] Возможные причины: неверный формат, неверная подпись, неверный audience/issuer.');
        } else if (err.name === 'TokenExpiredError') {
             console.error('[verifyToken] Срок действия токена истек.');
        }
        return reject(err); // Отклоняем промис с ошибкой
      }
      console.log('[verifyToken] Токен УСПЕШНО верифицирован. Decoded:', decoded);
      resolve(decoded); // Возвращаем раскодированный токен (payload)
    });
  });
};

// --- Конфигурация Auth0 Management Client ---
const auth0 = new ManagementClient({
  domain: process.env.AUTH0_DOMAIN,
  clientId: process.env.AUTH0_M2M_CLIENT_ID,
  clientSecret: process.env.AUTH0_M2M_CLIENT_SECRET,
  scope: "read:users update:users read:users_app_metadata update:users_app_metadata",
});

// --- Конфигурация AWS S3 ---
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
    signatureVersion: 'v4',
});
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
    // Получаем заголовок Authorization
    const bearerToken = event.headers.authorization;
    console.log(`[handler] Получен заголовок Authorization: ${bearerToken ? 'Да' : 'Нет'}`);
    decodedToken = await verifyToken(bearerToken);
    // Если верификация прошла, токен валидный
    console.log(`[handler] Токен верифицирован для пользователя: ${decodedToken.sub}`);
  } catch (error) {
    console.error('[handler] Ошибка проверки токена:', error.message);
    // Возвращаем 401, если токен не прошел проверку
    return { statusCode: 401, body: `Unauthorized: ${error.message}` };
  }

  // ---- С этого момента токен валидный ----

  const userId = decodedToken.sub;
  console.log(`[handler] Запрос на скачивание файла ${fileName} (стоимость ${cost}) от пользователя ${userId}`);

  // 4. Получение баланса
  let currentUserData;
  let currentBalance;
  try {
    currentUserData = await auth0.users.get({ id: userId });
    currentBalance = currentUserData?.app_metadata?.atom_balance ?? 0;
    console.log(`[handler] Текущий баланс пользователя ${userId}: ${currentBalance} атомов.`);
  } catch (error) {
    console.error(`[handler] Ошибка получения данных пользователя ${userId} из Auth0 API:`, error);
    return { statusCode: 500, body: 'Internal Server Error: Cannot fetch user balance' };
  }

  // 5. Проверка баланса
  if (currentBalance < cost) {
    console.warn(`[handler] Недостаточно атомов у пользователя ${userId} (нужно ${cost}, есть ${currentBalance}) для файла ${fileName}.`);
    return { statusCode: 402, body: 'Payment Required: Insufficient atoms' };
  }

  // 6. Списание атомов
  const newBalance = currentBalance - cost;
  try {
    const updatedMetadata = { ...currentUserData.app_metadata, atom_balance: newBalance };
    // Используем правильный метод users.update
    await auth0.users.update(
        { id: userId },
        { app_metadata: updatedMetadata }
    );
    console.log(`[handler] Списано ${cost} атомов у пользователя ${userId}. Новый баланс: ${newBalance}`);
  } catch (error) {
    console.error(`[handler] Ошибка списания атомов у пользователя ${userId}:`, error);
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
    // Логируем ошибку, но атомы уже списаны.
    return { statusCode: 500, body: 'Internal Server Error: Could not generate download link' };
  }
};