// START OF FILE main.js (ИЗМЕНЕННЫЙ)

// --- Логика для подсветки активного пункта навигации ---
document.addEventListener('DOMContentLoaded', function() {
  const navButtons = document.querySelectorAll('.popup-nav-item'); // Используем класс из popup
  const currentPageUrl = window.location.pathname;

  navButtons.forEach(button => {
    const buttonUrl = button.dataset.pageUrl;
    // Сравнение может потребовать уточнения (например, убрать / в конце)
    if (currentPageUrl === buttonUrl || currentPageUrl === buttonUrl + '/') {
      button.classList.add('active');
      // Можно добавить стиль для .popup-nav-item.active в CSS
    }

    // Убрали обработчик клика отсюда, он не нужен для подсветки
  });
});


// --- Логика для полноэкранного popup меню ---
function openFullscreenPopup() {
    const popup = document.getElementById("fullscreen-popup");
    if (popup) {
        popup.classList.add("popup-show");
        // Возможно, понадобится disableScroll() здесь, если он глобальный
        // disableScroll();
    }
}

function closeFullscreenPopup() {
    const popup = document.getElementById("fullscreen-popup");
    if (popup) {
        popup.classList.remove("popup-show");
        // enableScroll();
    }
}

// Навешиваем обработчик на кнопку-гамбургер (убедитесь, что у нее нет другого обработчика)
// Если кнопка уже имеет onclick="openFullscreenPopup()" в HTML, этот код не обязателен, но безопаснее добавить
document.addEventListener('DOMContentLoaded', function() {
    const popupButton = document.querySelector(".popup-button"); // Находим кнопку-гамбургер
    if (popupButton && !popupButton.onclick) { // Проверяем, нет ли уже inline обработчика
         popupButton.onclick = openFullscreenPopup;
    }
    // Обработчик для кнопки закрытия внутри попапа
    const closeButton = document.querySelector("#fullscreen-popup .popup-close-button");
    if (closeButton && !closeButton.onclick) {
         closeButton.onclick = closeFullscreenPopup;
    }
});


// --- Код для модального окна звуков #sound-modal УДАЛЕН ОТСЮДА ---
// Он находится в скрипте внутри sounds.html
// document.addEventListener('DOMContentLoaded', function() {
//     const modal = document.getElementById('sound-modal');
//     ... остальной код для sound-modal ...
// });

// --- Функции disableScroll/enableScroll УДАЛЕНЫ ОТСЮДА ---
// Они определены локально в скрипте sounds.html

// END OF FILE main.js (ИЗМЕНЕННЫЙ)