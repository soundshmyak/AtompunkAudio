document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');
    const soundItems = document.querySelectorAll('.sound-item');
    const soundList = document.querySelector('.sound-list'); // Получаем контейнер для списка звуков
	const soundTitles = document.querySelectorAll('.sound-title-link');
    const modal = document.getElementById('sound-modal');
    let noResultsMessage = null; // Переменная для хранения сообщения "Ничего не найдено"

    function filterSounds() {
        const searchTerm = searchInput.value.toLowerCase();
        const selectedCategory = categoryFilter.value;
        let foundSounds = false; // Флаг, чтобы отслеживать, найдены ли звуки

        soundItems.forEach(item => {
            const title = item.dataset.soundTitle.toLowerCase();
            const tags = item.dataset.soundTags.toLowerCase(); // Получаем теги
            const extractedFrom = item.dataset.soundExtractedFrom.toLowerCase(); // Получаем LIBRARY
            const pakName = item.dataset.soundPakName.toLowerCase(); // Получаем FULL NAME
            const eventName = item.dataset.soundEventName.toLowerCase(); // Получаем EVENTS

            let isCategoryMatch = false;

            if (selectedCategory === 'all' || extractedFrom === selectedCategory) {
                isCategoryMatch = true;
            }

            // Проверяем, содержит ли поисковый запрос хотя бы одно из полей
            const isSearchMatch =
                title.includes(searchTerm) ||
                tags.includes(searchTerm) ||
                extractedFrom.includes(searchTerm) ||
                pakName.includes(searchTerm) ||
                eventName.includes(searchTerm);


            if (isCategoryMatch && isSearchMatch) {
                item.style.display = 'flex';
                foundSounds = true; // Indicate that at least one sound is found
            } else {
                item.style.display = 'none';
            }
        });

        // Удаляем предыдущее сообщение "Ничего не найдено", если есть
        if (noResultsMessage) {
            noResultsMessage.remove();
            noResultsMessage = null;
        }

        // Если не найдено ни одного звука и поисковая строка не пуста
        if (!foundSounds && searchTerm.trim() !== '') {
            noResultsMessage = document.createElement('p');
            noResultsMessage.textContent = 'Try using less specific searching parameters.';
            noResultsMessage.classList.add('no-results-message'); // Добавляем класс для стилизации
            soundList.appendChild(noResultsMessage);
        }
    }

    searchInput.addEventListener('input', filterSounds);
    categoryFilter.addEventListener('change', filterSounds);

    // Извлекаем все теги и устанавливаем их в селектор
     function extractAllCategories() {
        const categoriesSet = new Set();
        soundItems.forEach(item => {
            categoriesSet.add(item.dataset.soundExtractedFrom.trim().toLowerCase());
        });
        const uniqueCategories = Array.from(categoriesSet);
        // Очищаем текущий селектор и добавляем опцию "все"
        categoryFilter.innerHTML = '<option value="all">any</option>';
        uniqueCategories.forEach(category => {
                const option = document.createElement('option');
                option.value = category;
                option.textContent = category;
                categoryFilter.appendChild(option);
            });

        }
    extractAllCategories();
	filterSounds();

    soundTitles.forEach(titleElement => {
        titleElement.addEventListener('click', function() {
            // Останавливаем воспроизведение перед открытием модального окна
            stopCurrentlyPlaying();

            const soundItem = this.closest('.sound-item');
            const title = soundItem.dataset.soundTitle;
            //const tags = soundItem.dataset.soundTags.split(',');
            const audioPath = soundItem.dataset.soundPath;
            const hash = soundItem.dataset.soundHash;
            const extractedFrom = soundItem.dataset.soundExtractedFrom;
            const pakName = soundItem.dataset.soundPakName;
            const eventName = soundItem.dataset.soundEventName;

            modalTitle.textContent = "Sound Effect";
            modalAudio.src = audioPath;
            modalHash.textContent = hash;
            modalExtractedFrom.textContent = extractedFrom;
            modalPakName.textContent = pakName;
            modalEventName.textContent = eventName;

           // modalTagsContainer.innerHTML = '<p>EVENT TAGS (3):</p>';
            //tags.forEach(tag => {
           //     const span = document.createElement('span');
            //    span.textContent = tag.trim();
             //   modalTagsContainer.appendChild(span);
           // });
           disableScroll();
            modal.style.display = 'block';
        });
    });
});