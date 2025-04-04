// netlify/functions/download.js
require('dotenv').config();
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const { ManagementClient } = require('auth0'); // Если нужна проверка подписки через API
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


// --- Конфигурация AWS S3 (Пример) ---
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
    signatureVersion: 'v4', // Важно для presigned URLs
});
const BUCKET_NAME = process.env.S3_BUCKET_NAME;

// --- (Опционально) Конфигурация Auth0 Management Client для проверки подписки по API ---
// const auth0 = new ManagementClient({ ... }); // Как в предыдущей функции


// --- Основной обработчик Netlify Function ---
exports.handler = async (event, context) => {
  // 1. Проверка метода (должен быть GET)
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // 2. Получение имени файла из запроса
  const fileName = event.queryStringParameters.file;
  if (!fileName) {
    return { statusCode: 400, body: 'Bad Request: Missing "file" query parameter' };
  }

  // 3. Получение и проверка токена Auth0
  let decodedToken;
  try {
    const bearerToken = event.headers.authorization;
    decodedToken = await verifyToken(bearerToken);
    console.log(`Токен пользователя ${decodedToken.sub} верифицирован.`);
  } catch (error) {
    console.warn('Ошибка верификации токена:', error.message);
    return { statusCode: 401, body: 'Unauthorized: Invalid or missing token' };
  }

  // 4. Проверка статуса подписки пользователя
  let isSubscriber = false;
  const userId = decodedToken.sub; // Уникальный ID пользователя Auth0
  
  // Вариант В (Менее эффективный, но надежный): Запрос к Auth0 Management API
   try {
       const auth0User = await auth0.getUser({ id: userId }); // Нужен M2M клиент auth0
       if (auth0User && auth0User.app_metadata && auth0User.app_metadata.is_subscriber === true) {
           isSubscriber = true;
           console.log(`Пользователь ${userId} является подписчиком (проверено через API).`);
       } else {
            console.log(`Пользователь ${userId} НЕ является подписчиком (проверено через API).`);
       }
   } catch(apiError) {
        console.error(`Ошибка получения данных пользователя ${userId} из Auth0 API:`, apiError);
       // Не выдаем доступ, если не удалось проверить
       isSubscriber = false;
   }


  if (!isSubscriber) {
    console.warn(`Пользователь ${userId} попытался скачать файл ${fileName}, не будучи подписчиком.`);
    return { statusCode: 403, body: 'Forbidden: Subscription required' };
  }

  // 5. Генерация Pre-signed URL для скачивания из S3 (Пример)
  const params = {
    Bucket: BUCKET_NAME,
    Key: `sounds/${fileName}`, // Путь к файлу в S3 (адаптируйте!)
    Expires: 60 * 5, // Ссылка действительна 5 минут
    ResponseContentDisposition: `attachment; filename="${fileName}"` // Чтобы браузер предложил скачать
  };

  try {
    const signedUrl = await s3.getSignedUrlPromise('getObject', params);
    console.log(`Сгенерирована ссылка для ${userId} на файл ${fileName}`);

    // 6. Перенаправление пользователя на скачивание
    return {
      statusCode: 302, // Found (Redirect)
      headers: {
        Location: signedUrl,
      },
      body: '', // Тело не нужно для редиректа
    };
  } catch (error) {
    console.error(`Ошибка генерации pre-signed URL для файла ${fileName}:`, error);
    // Проверить, существует ли файл в S3 с таким Key
    if (error.code === 'NoSuchKey') {
        return { statusCode: 404, body: 'Not Found: File does not exist' };
    }
    return { statusCode: 500, body: 'Internal Server Error: Could not generate download link' };
  }
};