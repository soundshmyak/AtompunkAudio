let auth0Client = null;
let userAtomBalance = 0;
// !!! ВАЖНО: УБЕДИТЕСЬ, ЧТО ЭТОТ NAMESPACE ТОЧНО СОВПАДАЕТ С НАСТРОЙКОЙ В ACTION AUTH0 !!
const namespace = 'https://noise.pw/claims/'; // <-- ПРОВЕРЬТЕ И ИЗМЕНИТЕ ПРИ НЕОБХОДИМОСТИ

// --- Конфигурация Auth0 ---
const auth0Domain = 'dev-bj0zepm87lwu8wov.us.auth0.com';
const auth0ClientId = 'jXNsNNd0J1kRRItKlhmoR7eSz6f47DxA';
const auth0CallbackUrl = window.location.origin + '/callback';
const auth0ReturnToUrl = window.location.origin;
// --- ВАЖНО: Укажите Identifier вашего API из Auth0, если ваша Netlify функция его проверяет ---
const auth0ApiAudience = 'https://api.noise.pw/download'; // <-- ЗАМЕНИТЕ НА ВАШ ИЛИ ЗАКОММЕНТИРУЙТЕ, ЕСЛИ НЕ ИСПОЛЬЗУЕТСЯ

// --- Функция инициализации клиента Auth0 ---
const configureClient = async () => {
    try {
        console.log("Auth0: Конфигурирую клиент...");
        auth0Client = await auth0.createAuth0Client({
            domain: auth0Domain,
            clientId: auth0ClientId,
            authorizationParams: {
                redirect_uri: auth0CallbackUrl,
                // *** РАСКОММЕНТИРУЙТЕ audience, ЕСЛИ ВАША API-ФУНКЦИЯ ЕГО ПРОВЕРЯЕТ ***
                 audience: auth0ApiAudience
                // scope: 'openid profile email offline_access' // Добавьте offline_access если нужны refresh токены
            },
             cacheLocation: 'localstorage' // Сохранение сессии между вкладками
        });
        console.log("Auth0: Клиент сконфигурирован.");
    } catch (err) {
        console.error("Auth0: Ошибка конфигурации клиента:", err);
        alert("Не удалось инициализировать систему аутентификации. Пожалуйста, обновите страницу или попробуйте позже.");
        // Можно добавить более специфичную обработку ошибок, если нужно
    }
};

// --- Функция для обновления состояния ОДНОЙ кнопки скачивания ---
const updateSingleDownloadButtonState = async (button) => {
    if (!button || !(button instanceof Element)) { // Добавлена проверка типа
        // console.warn("updateSingleDownloadButtonState: Передан невалидный элемент кнопки.");
        return;
    }

    // Получаем актуальный статус аутентификации.
    // Используем auth0Client?.isAuthenticated() для безопасности, если клиент еще не готов
    const isAuthenticated = await auth0Client?.isAuthenticated();

    // Сбрасываем предыдущие обработчики и состояние
    button.onclick = null;
    button.disabled = false;
    button.style.cursor = 'pointer';

    const cost = parseInt(button.dataset.cost, 10);
    const soundId = button.dataset.soundId || button.closest('[data-sound-pak-name]')?.dataset?.soundPakName || 'unknown';

    if (isNaN(cost)) {
        console.warn(`Кнопка для soundId=${soundId} без data-cost или с неверным значением:`, button);
        button.textContent = 'Error Cost';
        button.disabled = true;
        button.style.cursor = 'not-allowed';
        return;
    }

    if (!auth0Client || !isAuthenticated) {
        // Не залогинен или клиент не готов
        button.textContent = 'Download'; // Текст для незалогиненного пользователя
        button.onclick = () => {
            if (auth0Client) {
                console.log(`Кнопка Download (не залогинен) нажата, редирект на логин/регистрацию.`);
                auth0Client.loginWithRedirect({
                    authorizationParams: { screen_hint: 'signup' }, // Предлагаем регистрацию
                    appState: { targetUrl: window.location.pathname + window.location.search + window.location.hash } // Сохраняем текущий URL
                });
            } else {
                alert('Ошибка инициализации аутентификации. Попробуйте обновить страницу.');
            }
        };
    } else {
        // Залогинен
        // Используем ГЛОБАЛЬНЫЙ userAtomBalance, который обновляется в updateUI
        if (userAtomBalance >= cost) {
            button.textContent = `Download (${cost} a.)`;
            button.onclick = handleDownloadClick; // Назначаем глобальный обработчик скачивания
        } else {
            button.textContent = `Need ${cost} a.`;
            button.disabled = true;
            button.style.cursor = 'not-allowed';
        }
    }
    // console.log(`Кнопка обновлена: ID=${soundId}, Text=${button.textContent}, Disabled=${button.disabled}`);
};
// --- Делаем функцию доступной глобально ---
window.updateSingleDownloadButtonState = updateSingleDownloadButtonState;


// --- Функция для обновления состояния ВСЕХ кнопок скачивания ---
const updateDownloadButtonsState = async () => {
    // console.log(`updateDownloadButtonsState: Обновление всех кнопок...`);
    const buttons = document.querySelectorAll('.sound-action-button');
    if (buttons.length === 0) {
        return; // Нечего обновлять
    }
    // Преобразуем NodeList в массив и обновляем каждую кнопку
    await Promise.all(Array.from(buttons).map(button => updateSingleDownloadButtonState(button)));
    // console.log(`updateDownloadButtonsState: Обновление ${buttons.length} кнопок завершено.`);
};
// --- Делаем функцию доступной глобально ---
window.updateDownloadButtonsState = updateDownloadButtonsState;


// Функция для обновления интерфейса шапки и глобального баланса
const updateUI = async () => {
    if (!auth0Client) {
         console.warn("Auth0: Клиент еще не сконфигурирован для обновления UI.");
         await updateDownloadButtonsState(); // Показать кнопки "Download"
         return;
    }
    console.log("Auth0: Обновляю UI шапки...");
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
            // Получаем данные пользователя. { cacheMode: 'off' } может помочь получить свежие claim'ы.
            const user = await auth0Client.getUser({ cacheMode: 'off' });
            console.log('Auth0: Пользователь аутентифицирован:', user);

            if (userAvatar) userAvatar.src = user.picture || 'assets/images/default-avatar.png'; // Fallback
            if (userName) userName.textContent = user.name || user.nickname || user.email || 'User';

            // Получаем баланс из claim (предпочтительно) или app_metadata
            userAtomBalance = user[`${namespace}atom_balance`] ?? user.app_metadata?.atom_balance ?? 0;
            userAtomBalance = parseInt(userAtomBalance, 10); // Преобразуем в число
            if (isNaN(userAtomBalance)) userAtomBalance = 0; // Обработка NaN

            console.log(`Auth0: Баланс пользователя получен = ${userAtomBalance}`);

            if (balanceDisplay) balanceDisplay.textContent = userAtomBalance;

        } else {
            console.log('Auth0: Пользователь НЕ аутентифицирован.');
            userAtomBalance = 0; // Сбрасываем глобальный баланс
        }

         // *** ВЫЗЫВАЕМ ОБНОВЛЕНИЕ СОСТОЯНИЯ ВСЕХ КНОПОК СКАЧИВАНИЯ ***
         await updateDownloadButtonsState();

    } catch (err) {
        console.error("Auth0: Ошибка при обновлении UI:", err);
         // Скрываем элементы пользователя при ошибке
         if (document.getElementById('login-btn')) document.getElementById('login-btn').style.display = 'block';
         if (document.getElementById('logout-btn')) document.getElementById('logout-btn').style.display = 'none';
         if (document.getElementById('user-profile')) document.getElementById('user-profile').style.display = 'none';
         // ... и т.д. для других элементов ...

         userAtomBalance = 0; // Сбрасываем баланс
         await updateDownloadButtonsState(); // Обновляем кнопки в состояние "Download"
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
            // Передаем текущий URL, чтобы вернуться сюда после логина
            appState: { targetUrl: window.location.pathname + window.location.search + window.location.hash }
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
        // Очищаем данные сессии перед выходом (на всякий случай)
        localStorage.removeItem(`@@auth0spajs@@::${auth0ClientId}::@@user@@`); // Пример ключа кеша пользователя
        auth0Client.logout({
            logoutParams: {
                returnTo: auth0ReturnToUrl // Куда вернуться после выхода
            }
        });
    } catch (err) {
         console.error("Auth0: Ошибка при попытке выхода:", err);
         alert(`Ошибка выхода: ${err.message || err}`);
    }
};

// Функция обработки редиректа с Auth0
const handleRedirectCallback = async () => {
    if (!auth0Client) {
        console.error("Auth0: Клиент не инициализирован для обработки callback.");
        window.location.replace('/'); // Перенаправляем на главную при ошибке
        return;
    }
    console.log("Auth0: Обработка callback...");
    let targetUrl = '/'; // URL по умолчанию

    try {
        const urlParams = new URLSearchParams(window.location.search);
        const stateParam = urlParams.get('state');
        const codeParam = urlParams.get('code');
        const errorParam = urlParams.get('error');
        const errorDescParam = urlParams.get('error_description');

        if (errorParam) {
             console.error(`Auth0 Callback Ошибка: ${errorParam} - ${errorDescParam}`);
             alert(`Ошибка входа: ${errorDescParam || errorParam}`);
             // Убираем параметры ошибки из URL и остаемся на текущей странице (или идем на главную)
             window.history.replaceState({}, document.title, window.location.pathname.replace('/callback', ''));
             await updateUI(); // Обновить UI, чтобы показать кнопку логина
             return; // Прерываем дальнейшую обработку
        }

        if (codeParam && stateParam) {
             console.log("Auth0: Найдены code и state, обрабатываем редирект...");
             const result = await auth0Client.handleRedirectCallback();
             console.log("Auth0: Callback успешно обработан.", result);
             targetUrl = result?.appState?.targetUrl || '/'; // Получаем URL для возврата
        } else {
            console.log("Auth0: Параметры code/state не найдены в URL, возможно прямой заход на /callback.");
            // Ничего не делаем, просто перенаправим на главную
        }

    } catch (error) {
        console.error("Auth0: Ошибка обработки callback:", error);
        alert(`Ошибка обработки входа: ${error.message || error}`);
        // targetUrl останется '/'
    } finally {
        // Перенаправляем пользователя на целевую страницу ПОСЛЕ обработки callback
        console.log(`Auth0: Callback обработан. Перенаправление на: ${targetUrl}`);
        window.location.replace(targetUrl);
        // Обновление UI произойдет на новой странице при ее загрузке
    }
};

// --- Обработчик клика на кнопку скачивания ---
const handleDownloadClick = async (event) => {
    const button = event.target.closest('button.sound-action-button');
    if (!button) return;

    // --- Поиск источника данных (как в предыдущем варианте) ---
    let soundDataSourceElement = button.closest('.sound-item[data-sound-pak-name]');
    if (!soundDataSourceElement) {
         const modalContent = button.closest('.modal-content[data-source-item-id]');
         const sourceId = modalContent?.dataset?.sourceItemId;
         if(sourceId) {
             soundDataSourceElement = document.querySelector(`.sound-item[data-sound-pak-name="${sourceId}"]`);
         }
    }

    if (!soundDataSourceElement) { /* ... обработка ошибки ... */ await updateSingleDownloadButtonState(button); return; }
    const fileName = soundDataSourceElement.dataset.soundPakName;
    const cost = parseInt(button.dataset.cost, 10);
    if (!fileName) { /* ... обработка ошибки ... */ await updateSingleDownloadButtonState(button); return; }
    if (isNaN(cost)) { /* ... обработка ошибки ... */ await updateSingleDownloadButtonState(button); return; }

    // --- Предварительная проверка баланса на клиенте ---
    if (userAtomBalance < cost) { /* ... alert, подсветка кнопки "Пополнить" ... */ return; }

    // --- Блокировка кнопки ---
    button.disabled = true;
    button.style.cursor = 'wait';
    const originalText = button.textContent; // Сохраняем текст для восстановления при ошибке
    button.textContent = 'Loading...';

    let token;
    try {
        // --- Получение токена ---
        console.log(`Попытка получить токен для скачивания ${fileName}`);
        token = await auth0Client.getTokenSilently({
             authorizationParams: {
               // *** РАСКОММЕНТИРУЙТЕ И УКАЖИТЕ ВАШ AUDIENCE, ЕСЛИ НУЖНО ***
                audience: auth0ApiAudience
             },
             // cacheMode: 'off' // Можно использовать для получения свежего токена
        });
        console.log(`Токен получен.`);

    } catch (error) {
         // --- Обработка ошибки получения токена ---
         console.error('Ошибка получения токена:', error);
         if (error.error === 'login_required' || error.error === 'consent_required') {
             alert('Требуется повторный вход для выполнения действия.');
         } else {
             alert('Ошибка авторизации при подготовке к скачиванию.');
         }
         await updateSingleDownloadButtonState(button); // Восстановить кнопку
         return;
    }

    try {
        // --- Вызов серверной функции ---
        const downloadUrl = `/api/download?file=${encodeURIComponent(fileName)}&cost=${cost}`;
        console.log(`Вызов серверной функции: ${downloadUrl}`);
        const response = await fetch(downloadUrl, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
            redirect: 'manual' // Важно!
        });
        console.log(`Ответ сервера: ${response.status} ${response.statusText}`);

        // --- Обработка ответа сервера ---
        if (response.status === 302) {
            // УСПЕХ
            console.log('Получен редирект 302 (Успех). Обновляем баланс и UI.');
            userAtomBalance -= cost; // Обновляем баланс локально
            if (document.getElementById('user-atom-balance')) {
                 document.getElementById('user-atom-balance').textContent = userAtomBalance; // Обновляем шапку
            }
            await updateDownloadButtonsState(); // Обновляем все кнопки

            const redirectUrl = response.headers.get('Location');
            if (redirectUrl) {
                console.log(`Перенаправление браузера на: ${redirectUrl}`);
                window.location.href = redirectUrl; // Инициируем скачивание
            } else {
                 console.error("Сервер вернул 302 без Location.");
                 alert("Ошибка скачивания: не получен адрес файла.");
                 await updateDownloadButtonsState(); // Восстановить кнопки
            }
        } else {
            // ОШИБКА от /api/download
            let errorMessage = `Ошибка скачивания (${response.status}).`;
            let errorBody = await response.text().catch(() => null); // Безопасно читаем тело
            console.error(`Ошибка сервера (${response.status}): ${errorBody || 'Тело ответа пустое'}`);

            // Формируем сообщение для пользователя
            if (response.status === 401) errorMessage = 'Ошибка авторизации (токен не принят сервером).';
            else if (response.status === 403) errorMessage = errorBody || 'Доступ запрещен сервером.';
            else if (response.status === 402) errorMessage = errorBody || 'Недостаточно атомов (проверка сервера).';
            else if (response.status === 404) errorMessage = errorBody || 'Файл не найден на сервере.';
            else if (response.status === 400) errorMessage = errorBody || `Неверный запрос (${response.status}).`;
            else if (response.status >= 500) errorMessage = `Внутренняя ошибка сервера (${response.status}). Попробуйте позже.`;
            else if (errorBody) errorMessage += ` ${errorBody}`;

            alert(errorMessage);
            // Восстанавливаем состояние кнопок по текущему (неизмененному) балансу
            await updateDownloadButtonsState();
             // Дополнительно проверим конкретно эту кнопку, если она все еще "Loading"
             if (button.disabled && button.textContent === 'Loading...') {
                await updateSingleDownloadButtonState(button);
             }
        }

    } catch (networkError) {
        // --- Обработка сетевой ошибки ---
        console.error('Сетевая ошибка при вызове /api/download:', networkError);
        alert('Сетевая ошибка при попытке скачивания. Проверьте соединение.');
        // Восстанавливаем кнопки
        await updateDownloadButtonsState();
         if (button.disabled && button.textContent === 'Loading...') {
            await updateSingleDownloadButtonState(button);
         }
    }
};
// --- Конец функции handleDownloadClick ---


// --- Основная логика при загрузке окна ---
window.onload = async () => {
    console.log("Auth0: Страница загружена, инициализация...");
    await configureClient(); // Пытаемся сконфигурировать клиент

    if (!auth0Client) {
         console.error("Auth0: Не удалось инициализировать клиент.");
         // Показываем только кнопку входа, скрываем остальное
         if (document.getElementById('login-btn')) document.getElementById('login-btn').style.display = 'block';
         if (document.getElementById('logout-btn')) document.getElementById('logout-btn').style.display = 'none';
         if (document.getElementById('user-profile')) document.getElementById('user-profile').style.display = 'none';
         await updateDownloadButtonsState(); // Установить кнопки в состояние "Download"
         return; // Прерываем
    }

    // Назначаем обработчики на кнопки Вход/Выход/Пополнить
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const topUpButton = document.getElementById('top-up-button');

    if (loginBtn) loginBtn.addEventListener('click', login);
    else console.warn("Auth0: Кнопка #login-btn не найдена.");
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
    else console.warn("Auth0: Кнопка #logout-btn не найдена.");
    if (topUpButton) topUpButton.addEventListener('click', () => { alert('Пополнение баланса в разработке.'); });
    else console.warn("Auth0: Кнопка #top-up-button не найдена.");


    // Проверяем, является ли текущая страница результатом редиректа с Auth0
    const query = window.location.search;
    const isCallbackQuery = query.includes("code=") && query.includes("state=");
    const isCallbackError = query.includes("error=") && query.includes("state=");
    const isCallbackPath = window.location.pathname === '/callback' || window.location.pathname === '/callback/'; // Точное сравнение пути

    if (isCallbackQuery || isCallbackError || isCallbackPath) {
        console.log("Auth0: Обнаружен callback. Запускаем обработку...");
        await handleRedirectCallback(); // Обработает редирект и перенаправит пользователя
    } else {
        console.log("Auth0: Не callback. Проверяем сессию и обновляем UI...");
        // Обновляем UI на основе текущего состояния аутентификации
        await updateUI(); // updateDownloadButtonsState вызовется внутри updateUI
    }

    console.log("Auth0: Инициализация завершена.");
};