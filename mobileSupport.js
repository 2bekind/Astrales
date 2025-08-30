// Мобильная поддержка: долгое нажатие по сообщениям для открытия контекстного меню

let longPressTimer = null;
let isLongPressActive = false;

function getMessageFromElement(messageElement) {
    if (!messageElement) return null;
    const id = messageElement.getAttribute('data-message-id') || null;
    const senderId = messageElement.dataset.senderId || null;
    const text = messageElement.dataset.text || '';
    return { id, senderId, text };
}

export function initializeMobileSupport(showMenuCallback, options = {}) {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (!isMobile) return; // Ничего не делаем на десктопе

    const pressDelayMs = options.pressDelayMs ?? 600;

    function handleTouchStart(event) {
        const messageItem = event.target.closest('.message-item');
        if (!messageItem) return;

        // Отключаем стандартное выделение и всплывающее меню текста
        // Не блокируем скролл — только долгий тап
        longPressTimer = setTimeout(() => {
            isLongPressActive = true;
            messageItem.classList.add('long-press');
            const minimalMessage = getMessageFromElement(messageItem);
            if (minimalMessage && typeof showMenuCallback === 'function') {
                showMenuCallback(event, minimalMessage);
            }
        }, pressDelayMs);
    }

    function handleTouchEnd(event) {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        if (isLongPressActive) {
            isLongPressActive = false;
            const messageItem = event.target.closest('.message-item');
            if (messageItem) {
                messageItem.classList.remove('long-press');
            }
            event.preventDefault();
        }
    }

    function handleTouchMove() {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        if (isLongPressActive) {
            isLongPressActive = false;
        }
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
}


