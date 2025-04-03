// Файл: assets/js/auth.js

let auth0Client = null;

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
                // Если нужны доп. разрешения или API audience, добавьте здесь:
                // audience: 'YOUR_API_IDENTIFIER',
                // scope: 'openid profile email'
            }
        });
        console.log("Auth0: Клиент сконфигурирован.");
    } catch (err) {
        console.error("Auth0: Ошибка конфигурации клиента:", err);
    }
};

// Функция для обновления интерфейса (кнопки, информация о пользователе)
const updateUI = async () => {
    if (!auth0Client) {
         console.warn("Auth0: Клиент еще не сконфигурирован для обновления UI.");
         return;
    }
    console.log("Auth0: Обновляю UI...");
    try {
        const isAuthenticated = await auth0Client.isAuthenticated();
        const loginBtn = document.getElementById('login-btn');
        const logoutBtn = document.getElementById('logout-btn');
        const profileDiv = document.getElementById('user-profile');

        if (loginBtn) loginBtn.style.display = isAuthenticated ? 'none' : 'block';
        if (logoutBtn) logoutBtn.style.display = isAuthenticated ? 'block' : 'none';

        if (isAuthenticated) {
            const user = await auth0Client.getUser();
            console.log('Auth0: Пользователь аутентифицирован:', user);
            if (profileDiv && user) {
                profileDiv.innerHTML = `
                    <img src="${user.picture}" alt="Аватар" width="30" height="30" style="border-radius: 50%; vertical-align: middle; margin-right: 5px;">
                    <span style="vertical-align: middle;">${user.name || user.email}</span>
                `;
                profileDiv.style.display = 'inline-block'; // Или 'block' в зависимости от верстки
            }
        } else {
            console.log('Auth0: Пользователь НЕ аутентифицирован.');
            if (profileDiv) profileDiv.style.display = 'none';
        }
    } catch (err) {
        console.error("Auth0: Ошибка при обновлении UI:", err);
    }
};

// Функция для ВХОДА
const login = async () => {
    if (!auth0Client) return;
    console.log("Auth0: Перенаправление на страницу входа...");
    try {
        await auth0Client.loginWithRedirect();
    } catch (err) {
         console.error("Auth0: Ошибка при попытке входа:", err);
    }
};

// Функция для ВЫХОДА
const logout = () => {
    if (!auth0Client) return;
    console.log("Auth0: Выход из системы...");
    try {
        auth0Client.logout({
            logoutParams: {
                returnTo: auth0ReturnToUrl
            }
        });
    } catch (err) {
         console.error("Auth0: Ошибка при попытке выхода:", err);
    }
};

// Функция обработки редиректа с Auth0 (запускается на странице /callback)
const handleRedirectCallback = async () => {
    if (!auth0Client) return;
    console.log("Auth0: Обработка callback...");
    try {
        // Показываем индикатор загрузки (если есть)
        // document.getElementById('loading-indicator').style.display = 'block';

        await auth0Client.handleRedirectCallback();
        console.log("Auth0: Callback успешно обработан.");

        // Убираем параметры ?code=...&state=... из URL браузера
        window.history.replaceState({}, document.title, window.location.pathname.replace('callback/', '')); // Убираем /callback/ из пути

        // Можно перенаправить пользователя на главную или другую страницу
        // window.location.pathname = "/";
        // Или просто обновить UI на текущей (если это не просто страница /callback)

    } catch (error) {
        console.error("Auth0: Ошибка обработки callback:", error);
    } finally {
        // Скрываем индикатор загрузки
        // document.getElementById('loading-indicator').style.display = 'none';
        console.log("Auth0: Callback обработан, обновляем UI.");
        await updateUI(); // Обновляем интерфейс в любом случае
    }
};


// --- Основная логика при загрузке окна ---
window.onload = async () => {
    console.log("Auth0: Страница загружена, инициализация...");
    await configureClient(); // Ждем конфигурации клиента

    if (!auth0Client) {
         console.error("Auth0: Не удалось инициализировать клиент. Функционал входа/выхода не будет работать.");
         return; // Прерываем выполнение, если клиент не создан
    }

    // Навешиваем обработчики на кнопки (если они есть на странице)
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', login);
        console.log("Auth0: Обработчик на кнопку ВХОДА добавлен.");
    }
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
         console.log("Auth0: Обработчик на кнопку ВЫХОДА добавлен.");
    }

    // Проверяем, это страница callback после логина?
    const query = window.location.search;
    const isCallback = query.includes("code=") && query.includes("state=");
    const isCallbackPath = window.location.pathname.includes('/callback'); // Проверяем и путь

    if (isCallback || isCallbackPath) {
        await handleRedirectCallback();
    } else {
        // Если это не callback, просто проверяем статус аутентификации и обновляем UI
        await updateUI();
    }
};