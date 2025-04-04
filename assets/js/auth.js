let auth0Client = null;
let userAtomBalance = 0;
// !!! ВАЖНО: УБЕДИТЕСЬ, ЧТО ЭТОТ NAMESPACE ТОЧНО СОВПАДАЕТ С НАСТРОЙКОЙ В ACTION AUTH0 !!!
// Пример: 'https://your-app-name.com/claims/' или 'http://localhost:4000/' для локальной разработки
const namespace = 'https://noise.pw/claims/'; // <-- ЗАМЕНИТЕ НА ВАШ NAMESPACE ИЗ AUTH0 ACTION

// --- Конфигурация ---
const auth0Domain = 'dev-bj0zepm87lwu8wov.us.auth0.com'; // <-- ВАШ DOMAIN ИЗ AUTH0
const auth0ClientId = 'jXNsNNd0J1kRRItKlhmoR7eSz6f47DxA'; // <-- ВАШ CLIENT ID ИЗ AUTH0
// URL для редиректа ПОСЛЕ логина (должен быть в Allowed Callback URLs в Auth0)
const auth0CallbackUrl = window.location.origin + '/callback';
// URL для редиректа ПОСЛЕ выхода (должен быть в Allowed Logout URLs в Auth0)
const auth0ReturnToUrl = window.location.origin;
// --------------------

// Функция инициализации клиента Auth0
const configureClient = async () => {
    try {
        console.log("Auth0: Конфигурирую клиент...");
        auth0Client = await auth0.createAuth0Client({
            domain: auth0Domain,
            clientId: auth0ClientId,
            authorizationParams: {
                redirect_uri: auth0CallbackUrl
                // audience: 'YOUR_API_IDENTIFIER', // Раскомментируйте, если ваша Netlify функция - это защищенный API
                // scope: 'openid profile email offline_access' // Добавьте offline_access если нужны refresh токены
            },
             cacheLocation: 'localstorage' // Рекомендуется для production для сохранения сессии между вкладками/закрытиями браузера
        });
        console.log("Auth0: Клиент сконфигурирован.");
    } catch (err) {
        console.error("Auth0: Ошибка конфигурации клиента:", err);
        alert("Не удалось инициализировать систему аутентификации. Пожалуйста, обновите страницу или попробуйте позже.");
    }
};

// --- Функция для обновления состояния ОДНОЙ кнопки скачивания ---
const updateSingleDownloadButtonState = async (button) => {
    if (!button) {
        console.warn("updateSingleDownloadButtonState: Передан невалидный элемент кнопки.");
        return;
    }

    // Получаем актуальный статус аутентификации. Используем optional chaining на случай, если клиент еще не готов.
    const isAuthenticated = await auth0Client?.isAuthenticated();

    // Сбрасываем предыдущие обработчики и состояние
    button.onclick = null;
    button.disabled = false;
    button.style.cursor = 'pointer'; // Убедимся, что курсор по умолчанию правильный

    const cost = parseInt(button.dataset.cost, 10);
    const soundId = button.dataset.soundId || button.closest('[data-sound-pak-name]')?.dataset?.soundPakName || 'unknown'; // Получаем ID для лога

    if (isNaN(cost)) {
        console.warn(`Кнопка для soundId=${soundId} без data-cost или с неверным значением:`, button);
        button.textContent = 'Error Cost';
        button.disabled = true;
        button.style.cursor = 'not-allowed';
        return;
    }

    if (!auth0Client || !isAuthenticated) {
        // Не залогинен или клиент не готов
        button.textContent = 'Download'; // Короткий текст
        button.onclick = () => {
            if (auth0Client) {
                auth0Client.loginWithRedirect({
                    authorizationParams: { screen_hint: 'signup' },
                    appState: { targetUrl: window.location.pathname + window.location.search + window.location.hash } // Сохраняем текущий URL
                });
            } else {
                alert('Ошибка инициализации аутентификации. Попробуйте обновить страницу.');
            }
        };
        // console.log(`Кнопка обновлена (Download): ID=${soundId}`);
    } else {
        // Залогинен
        // Используем ГЛОБАЛЬНЫЙ userAtomBalance, который обновляется в updateUI
        if (userAtomBalance >= cost) {
            button.textContent = `Download (${cost} a.)`;
            button.onclick = handleDownloadClick; // Назначаем глобальный обработчик скачивания
            // console.log(`Кнопка обновлена (Download): ID=${soundId}, Balance=${userAtomBalance}, Cost=${cost}`);
        } else {
            button.textContent = `Need ${cost} a.`;
            button.disabled = true;
            button.style.cursor = 'not-allowed';
            // console.log(`Кнопка обновлена (Need Atoms): ID=${soundId}, Balance=${userAtomBalance}, Cost=${cost}`);
        }
    }
};
// --- Делаем функцию доступной глобально ---
window.updateSingleDownloadButtonState = updateSingleDownloadButtonState;


// --- Функция для обновления состояния ВСЕХ кнопок скачивания ---
const updateDownloadButtonsState = async () => {
    // console.log(`updateDownloadButtonsState: Обновление всех кнопок...`);
    const buttons = document.querySelectorAll('.sound-action-button');
    if (buttons.length === 0) {
        // console.log("updateDownloadButtonsState: Кнопки для обновления не найдены.");
        return;
    }
    // Используем Promise.all для параллельного (но асинхронного) обновления
    // Преобразуем NodeList в массив для использования map
    await Promise.all(Array.from(buttons).map(button => updateSingleDownloadButtonState(button)));
    // console.log(`updateDownloadButtonsState: Обновление ${buttons.length} кнопок завершено.`);
};
// --- Делаем функцию доступной глобально ---
window.updateDownloadButtonsState = updateDownloadButtonsState;


// Функция для обновления интерфейса (кнопки, информация о пользователе)
const updateUI = async () => {
    if (!auth0Client) {
         console.warn("Auth0: Клиент еще не сконфигурирован для обновления UI.");
         // Даже если клиент не готов, пытаемся обновить кнопки (покажут Download)
         await updateDownloadButtonsState();
         return;
    }
    console.log("Auth0: Обновляю UI...");
    try {
        const isAuthenticated = await auth0Client.isAuthenticated();
        const loginBtn = document.getElementById('login-btn');
        const logoutBtn = document.getElementById('logout-btn');
        const profileDiv = document.getElementById('user-profile');
        const balanceSection = document.getElementById('user-balance-section');
        const balanceDisplay = document.getElementById('user-atom-balance');
        const topUpButton = document.getElementById('top-up-button');
        const userAvatar = document.getElementById('user-avatar');
        const userName = document.getElementById('user-name');

        // Управление видимостью элементов в шапке
        if (loginBtn) loginBtn.style.display = isAuthenticated ? 'none' : 'block';
        if (logoutBtn) logoutBtn.style.display = isAuthenticated ? 'block' : 'none';
        if (profileDiv) profileDiv.style.display = isAuthenticated ? 'flex' : 'none';
        if (balanceSection) balanceSection.style.display = isAuthenticated ? 'flex' : 'none';
        if (topUpButton) topUpButton.style.display = isAuthenticated ? 'inline-block' : 'none';

        if (isAuthenticated) {
            // Получаем данные пользователя
            // Используем { cacheMode: 'off' } чтобы получить самые свежие данные, включая баланс, который мог измениться
            // Это важно, если Action не всегда мгновенно обновляет токен
             const user = await auth0Client.getUser({ cacheMode: 'off' }); // Запрос свежих данных
            // Если не использовать { cacheMode: 'off' }, может потребоваться получить новый ID токен:
            // const claims = await auth0Client.getIdTokenClaims();
            // const user = await auth0Client.getUser(); // основные данные из кеша
            // userAtomBalance = claims[`${namespace}atom_balance`] ?? 0; // баланс из свежих claims

            console.log('Auth0: Пользователь аутентифицирован:', user);

            if (userAvatar) userAvatar.src = user.picture || 'assets/images/default-avatar.png'; // Fallback avatar
            if (userName) userName.textContent = user.name || user.nickname || user.email || 'User';

            // Получаем баланс из пользовательского claim в ID токене (предпочтительно)
            // или из app_metadata (может быть менее актуальным, если не обновлять сессию)
            userAtomBalance = user[`${namespace}atom_balance`] ?? user.app_metadata?.atom_balance ?? 0;
            // Убедимся, что баланс - это число
            userAtomBalance = parseInt(userAtomBalance, 10);
            if (isNaN(userAtomBalance)) userAtomBalance = 0;

            console.log(`Auth0: Баланс пользователя получен = ${userAtomBalance}`);

            if (balanceDisplay) balanceDisplay.textContent = userAtomBalance;

        } else {
            console.log('Auth0: Пользователь НЕ аутентифицирован.');
            userAtomBalance = 0; // Сбрасываем баланс
        }

         // *** ВЫЗЫВАЕМ ОБНОВЛЕНИЕ СОСТОЯНИЯ ВСЕХ КНОПОК СКАЧИВАНИЯ ***
         // Это нужно сделать после того, как isAuthenticated и userAtomBalance установлены
         await updateDownloadButtonsState();

    } catch (err) {
        console.error("Auth0: Ошибка при обновлении UI:", err);
         // В случае ошибки скрываем связанные с пользователем элементы
         if (document.getElementById('login-btn')) document.getElementById('login-btn').style.display = 'block';
         if (document.getElementById('logout-btn')) document.getElementById('logout-btn').style.display = 'none';
         if (document.getElementById('user-profile')) document.getElementById('user-profile').style.display = 'none';
         if (document.getElementById('user-balance-section')) document.getElementById('user-balance-section').style.display = 'none';
         if (document.getElementById('top-up-button')) document.getElementById('top-up-button').style.display = 'none';

         userAtomBalance = 0; // Сбрасываем баланс при ошибке
         // Обновляем кнопки даже при ошибке, чтобы показать "Download"
         await updateDownloadButtonsState();
    }
};

// Функция для ВХОДА
const login = async () => {
    if (!auth0Client) {
        console.error("Auth0: Клиент не инициализирован для входа.");
        alert('Ошибка инициализации аутентификации. Попробуйте обновить страницу.');
        return;
    }
    console.log("Auth0: Перенаправление на страницу входа...");
    try {
        await auth0Client.loginWithRedirect({
            appState: { targetUrl: window.location.pathname + window.location.search + window.location.hash } // Сохраняем текущий URL для возврата
        });
    } catch (err) {
         console.error("Auth0: Ошибка при попытке входа:", err);
         alert(`Ошибка входа: ${err.message || err}`);
    }
};

// Функция для ВЫХОДА
const logout = () => {
    if (!auth0Client) {
        console.error("Auth0: Клиент не инициализирован для выхода.");
        return;
    }
    console.log("Auth0: Выход из системы...");
    try {
        auth0Client.logout({
            logoutParams: {
                returnTo: auth0ReturnToUrl
            }
        });
    } catch (err) {
         console.error("Auth0: Ошибка при попытке выхода:", err);
         alert(`Ошибка выхода: ${err.message || err}`);
    }
};

// Функция обработки редиректа с Auth0 (запускается на странице /callback)
const handleRedirectCallback = async () => {
    if (!auth0Client) {
        console.error("Auth0: Клиент не инициализирован для обработки callback.");
        // Попытаться перенаправить на главную?
        // window.location.pathname = '/';
        return;
    }
    console.log("Auth0: Обработка callback...");
    let targetUrl = '/'; // URL по умолчанию для перенаправления после успешного входа

    try {
        // Парсим параметры из URL перед тем, как Auth0 их удалит
        const urlParams = new URLSearchParams(window.location.search);
        const stateParam = urlParams.get('state');
        const codeParam = urlParams.get('code');
        const errorParam = urlParams.get('error');
        const errorDescParam = urlParams.get('error_description');

        if (errorParam) {
             console.error(`Auth0 Callback Ошибка: ${errorParam} - ${errorDescParam}`);
             alert(`Ошибка входа: ${errorDescParam || errorParam}`);
             // Не вызываем handleRedirectCallback, просто убираем параметры и обновляем UI
        } else if (codeParam && stateParam) {
             console.log("Auth0: Найдены code и state, обрабатываем редирект...");
             const result = await auth0Client.handleRedirectCallback();
             console.log("Auth0: Callback успешно обработан.", result);
             // Получаем URL, на который пользователь хотел перейти до логина (если он был сохранен)
             targetUrl = result?.appState?.targetUrl || '/';
        } else {
            console.log("Auth0: Параметры code/state/error не найдены в URL, пропускаем handleRedirectCallback.");
            // Это может быть просто заход на /callback без параметров, не ошибка
        }

    } catch (error) {
        console.error("Auth0: Ошибка обработки callback:", error);
        alert(`Ошибка обработки входа: ${error.message || error}`);
        // targetUrl останется '/'
    } finally {
        console.log(`Auth0: Callback обработан (или пропущен). Перенаправление на: ${targetUrl}`);
        // Убираем параметры code/state/error из URL и перенаправляем пользователя
        // Использование replaceState безопаснее, чем прямое изменение pathname,
        // но если мы хотим перенаправить пользователя, лучше использовать window.location.replace
        // window.history.replaceState({}, document.title, targetUrl);
        window.location.replace(targetUrl); // Перенаправляем пользователя на нужную страницу

        // Обновление UI и кнопок произойдет на новой странице при ее загрузке (в window.onload)
        // Нет необходимости вызывать updateUI здесь, так как страница все равно перезагрузится/перенаправится.
    }
};

// --- Обработчик клика на кнопку скачивания ---
const handleDownloadClick = async (event) => {
    const button = event.target.closest('button.sound-action-button');
    if (!button) return;

    // Находим родительский элемент с данными (pak_name)
    // Ищем сначала ближайший .sound-item, затем проверяем данные модалки, если кнопка там
    let soundDataSourceElement = button.closest('.sound-item[data-sound-pak-name]');
    if (!soundDataSourceElement) {
         const modalContent = button.closest('.modal-content[data-source-item-id]');
         const sourceId = modalContent?.dataset?.sourceItemId;
         if(sourceId) {
             soundDataSourceElement = document.querySelector(`.sound-item[data-sound-pak-name="${sourceId}"]`);
             // console.log(`Ищем источник данных для модалки по ID: ${sourceId}, найден:`, soundDataSourceElement);
         }
    }

    if (!soundDataSourceElement) {
        console.error("Не удалось найти источник данных data-sound-pak-name для кнопки:", button);
        alert('Ошибка: Не удалось получить данные о звуке для скачивания.');
        await updateSingleDownloadButtonState(button); // Восстановить исходное состояние кнопки
        return;
    }

    const fileName = soundDataSourceElement.dataset.soundPakName;
    const cost = parseInt(button.dataset.cost, 10); // Стоимость берем с самой кнопки

    if (!fileName) { // Дополнительная проверка, хотя data-sound-pak-name искали выше
        console.error("Атрибут data-sound-pak-name пуст или не найден в элементе:", soundDataSourceElement);
        alert('Ошибка: Не удалось определить файл для скачивания.');
        await updateSingleDownloadButtonState(button);
        return;
    }
    if (isNaN(cost)) {
        console.error("Атрибут data-cost не найден или не является числом на кнопке:", button);
        alert('Ошибка: Не удалось определить стоимость скачивания.');
        await updateSingleDownloadButtonState(button);
        return;
    }

    // Проверка баланса на клиенте (предварительная)
    if (userAtomBalance < cost) {
        alert(`Недостаточно атомов. Нужно: ${cost}, у вас: ${userAtomBalance}. Пополните баланс!`);
        const topUpBtn = document.getElementById('top-up-button');
        if(topUpBtn) {
            topUpBtn.focus();
            topUpBtn.style.outline = '2px solid gold'; // Подсветка
            setTimeout(() => { if(topUpBtn) topUpBtn.style.outline = ''; }, 2500);
        }
        // Не меняем состояние кнопки, т.к. баланс не изменился
        return;
    }

    // Блокируем кнопку и показываем индикатор загрузки
    button.disabled = true;
    button.style.cursor = 'wait';
    const originalText = button.textContent;
    button.textContent = 'Loading...';

    let token;
    try {
        console.log(`Попытка получить токен для скачивания ${fileName}`);
        // Получаем токен доступа. Если настроен audience, он будет для API. Иначе - ID токен.
        token = await auth0Client.getTokenSilently({
             // authorizationParams: {
             //   audience: 'YOUR_API_IDENTIFIER' // Укажите, если функция защищена как API
             // },
             // cacheMode: 'off' // Можно раскомментировать, чтобы точно получить свежий токен (но может быть медленнее)
        });
        console.log(`Токен получен.`); // Не выводить сам токен в лог!

    } catch (error) {
         console.error('Ошибка получения токена:', error);
         if (error.error === 'login_required' || error.error === 'consent_required') {
             alert('Требуется повторный вход для выполнения действия. Пожалуйста, войдите снова.');
             // Можно инициировать логин
             // await login();
         } else {
             alert('Ошибка авторизации при подготовке к скачиванию. Попробуйте обновить страницу и повторить.');
         }
         // Восстанавливаем кнопку в исходное состояние на основе текущего баланса
         await updateSingleDownloadButtonState(button);
         return; // Прерываем выполнение
    }

    try {
        // Формируем URL к серверной функции
        const downloadUrl = `/api/download?file=${encodeURIComponent(fileName)}&cost=${cost}`;
        console.log(`Вызов серверной функции: ${downloadUrl}`);

        // Выполняем запрос к серверной функции
        const response = await fetch(downloadUrl, {
            method: 'GET', // Указываем метод явно
            headers: {
                'Authorization': `Bearer ${token}` // Отправляем токен
            },
             redirect: 'manual' // ОЧЕНЬ ВАЖНО: НЕ следовать за редиректом автоматически
        });

        console.log(`Ответ сервера: ${response.status} ${response.statusText}`);

        // Анализируем ответ от /api/download
        if (response.status === 302) {
             // УСПЕХ: Сервер подтвердил операцию и дал редирект на скачивание
             console.log('Получен редирект 302 (Ожидаемый успех). Обновляем баланс локально и UI.');

             // 1. Обновляем баланс ЛОКАЛЬНО (на клиенте) НЕМЕДЛЕННО
             userAtomBalance -= cost;
             // 2. Обновляем отображение баланса в шапке
             const balanceDisplay = document.getElementById('user-atom-balance');
             if(balanceDisplay) balanceDisplay.textContent = userAtomBalance;

             // 3. Обновляем состояние ВСЕХ кнопок скачивания, так как баланс изменился
             // Это важно, чтобы другие кнопки тоже отразили новый баланс
             await updateDownloadButtonsState(); // Используем общую функцию обновления

             // 4. Получаем URL для скачивания из заголовка Location
             const redirectUrl = response.headers.get('Location');
             if (redirectUrl) {
                 console.log(`Перенаправление браузера на: ${redirectUrl}`);
                 // Инициируем скачивание файла переходом по URL
                 window.location.href = redirectUrl;
                 // После этого страница может перезагрузиться, или просто начнется скачивание.
                 // Кнопка останется в состоянии, установленном updateDownloadButtonsState
                 // (вероятно, снова "Download", если баланса хватает на еще)
             } else {
                 console.error("Сервер вернул 302, но не предоставил заголовок Location.");
                 alert("Ошибка скачивания: сервер не указал адрес файла.");
                 // Восстанавливаем кнопку и другие кнопки на основе (уже уменьшенного) баланса
                 await updateDownloadButtonsState();
             }

        } else {
             // Обработка ОШИБОК от нашей серверной функции (/api/download)
             let errorMessage = `Ошибка скачивания (${response.status}).`;
             let errorBody = null;
             try {
                 errorBody = await response.text(); // Пытаемся прочитать текст ошибки от сервера
                 console.error(`Ошибка сервера (${response.status}): ${errorBody}`);
             } catch (e) {
                  console.error(`Ошибка сервера (${response.status}), не удалось прочитать тело ответа.`);
             }

             if (response.status === 401) { // Unauthorized
                 errorMessage = 'Ошибка авторизации на сервере. Попробуйте перезайти.';
             } else if (response.status === 403) { // Forbidden
                 errorMessage = errorBody || 'Доступ запрещен сервером.';
             } else if (response.status === 402) { // Payment Required (нестандартный, но используем для баланса)
                  errorMessage = errorBody || 'Недостаточно атомов (проверка на сервере). Баланс мог измениться.';
                  // Стоит обновить UI полностью, чтобы получить актуальный баланс с сервера
                  await updateUI(); // Перезапросит данные пользователя и обновит всё
             } else if (response.status === 404) { // Not Found
                  errorMessage = errorBody || 'Файл не найден на сервере.';
             } else if (response.status === 400) { // Bad Request
                  errorMessage = errorBody || `Неверный запрос (${response.status}).`;
             } else if (response.status >= 500) { // Server Error
                  errorMessage = errorBody || `Внутренняя ошибка сервера (${response.status}). Попробуйте позже.`;
             } else if (errorBody) {
                  errorMessage += ` ${errorBody}`; // Добавляем текст ошибки от сервера
             }

             alert(errorMessage);
             // Восстанавливаем кнопки на основе текущего (неизменившегося) баланса
             // Если была ошибка 402 и вызвали updateUI, кнопки обновятся там.
             // Иначе обновляем здесь.
             if (response.status !== 402) {
                 await updateDownloadButtonsState();
             }
             // Если кнопка все еще заблокирована после обновления, разблокируем ее явно
             const currentButtonState = document.querySelector(`[data-sound-id="${button.dataset.soundId}"]`) || button;
             if (currentButtonState.disabled && currentButtonState.textContent === 'Loading...') {
                 await updateSingleDownloadButtonState(currentButtonState); // Повторное обновление конкретной кнопки
             }
        }

    } catch (networkError) {
        // Ошибка сети или CORS при запросе к /api/download
        console.error('Сетевая ошибка при вызове /api/download:', networkError);
        alert('Сетевая ошибка при попытке скачивания. Проверьте соединение и попробуйте снова.');
        // Восстанавливаем кнопку и остальные на основе текущего баланса
        await updateDownloadButtonsState();
         // Если кнопка все еще заблокирована после обновления, разблокируем ее явно
         const currentButtonState = document.querySelector(`[data-sound-id="${button.dataset.soundId}"]`) || button;
         if (currentButtonState.disabled && currentButtonState.textContent === 'Loading...') {
             await updateSingleDownloadButtonState(currentButtonState); // Повторное обновление конкретной кнопки
         }
    }
    // finally не нужен, т.к. состояние кнопки управляется через updateDownloadButtonsState/updateSingleDownloadButtonState
};
// --- Конец функции handleDownloadClick ---


// --- Основная логика при загрузке окна ---
window.onload = async () => {
    console.log("Auth0: Страница загружена, инициализация...");
    await configureClient(); // Пытаемся сконфигурировать клиент

    if (!auth0Client) {
         console.error("Auth0: Не удалось инициализировать клиент. Функционал входа/выхода/скачивания недоступен.");
         // Попытка обновить кнопки в состояние "Download", даже если клиент не создан
         await updateDownloadButtonsState();
         // Скрыть элементы, требующие логина
         if (document.getElementById('logout-btn')) document.getElementById('logout-btn').style.display = 'none';
         if (document.getElementById('user-profile')) document.getElementById('user-profile').style.display = 'none';
         if (document.getElementById('user-balance-section')) document.getElementById('user-balance-section').style.display = 'none';
         if (document.getElementById('top-up-button')) document.getElementById('top-up-button').style.display = 'none';
         if (document.getElementById('login-btn')) document.getElementById('login-btn').style.display = 'block'; // Показать кнопку входа
         return; // Прерываем дальнейшую инициализацию, связанную с Auth0
    }

    // Назначаем обработчики на кнопки Вход/Выход/Пополнить
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const topUpButton = document.getElementById('top-up-button');

    if (loginBtn) {
        loginBtn.addEventListener('click', login);
        console.log("Auth0: Обработчик на кнопку ВХОДА добавлен.");
    } else { console.warn("Auth0: Кнопка #login-btn не найдена."); }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
         console.log("Auth0: Обработчик на кнопку ВЫХОДА добавлен.");
    } else { console.warn("Auth0: Кнопка #logout-btn не найдена."); }

    if (topUpButton) {
        topUpButton.addEventListener('click', () => {
            // TODO: Реализовать логику пополнения баланса
            alert('Функция пополнения баланса в разработке.');
            console.log('Кнопка "Пополнить" нажата (функционал не реализован).');
        });
        console.log("Auth0: Обработчик на кнопку 'Пополнить' добавлен.");
    } else { console.warn("Auth0: Кнопка #top-up-button не найдена."); }


    // Проверяем, является ли текущая страница результатом редиректа с Auth0
    const query = window.location.search;
    // Редирект может быть и на корень ('/') с параметрами
    const isCallbackQuery = query.includes("code=") && query.includes("state=");
    const isCallbackError = query.includes("error=") && query.includes("state=");
    // Явная проверка пути '/callback' тоже полезна, если он используется
    const isCallbackPath = window.location.pathname.includes('/callback');

    if (isCallbackQuery || isCallbackError || isCallbackPath) {
        console.log("Auth0: Обнаружен callback (по пути или параметрам). Запускаем обработку...");
        await handleRedirectCallback(); // Обработает редирект и перенаправит пользователя
        // updateUI и updateDownloadButtonsState НЕ вызываются здесь, т.к. страница будет перенаправлена
    } else {
        console.log("Auth0: Не callback. Проверяем сессию и обновляем UI...");
        // Проверяем наличие сессии без полного редиректа
        try {
            // Попытка тихого логина (если есть активная сессия в Auth0)
            // Это полезно, если пользователь открыл новую вкладку
            // await auth0Client.getTokenSilently(); // Эта строка может быть излишней, если isAuthenticated() работает надежно
        } catch (error) {
            if (error.error !== 'login_required') {
                console.warn("Auth0: Ошибка при проверке сессии:", error);
            } else {
                 console.log("Auth0: Активная сессия не найдена (login_required).");
            }
        }
        // Обновляем UI на основе текущего состояния аутентификации
        await updateUI(); // updateDownloadButtonsState вызовется внутри updateUI
    }

    console.log("Auth0: Инициализация завершена.");
};
