// Avatar Manager - Модуль для управления аватарами пользователей
import { auth, db, doc, setDoc, updateDoc } from './firebase.js';

// Глобальные переменные
let currentUser = null;
let isProcessing = false;

// Инициализация модуля
export function initializeAvatarManager(user) {
    currentUser = user;
    console.log('Avatar Manager инициализирован для пользователя:', user?.username);
}

// Основная функция смены аватара
export async function changeAvatar() {
    // Функция смены аватара отключена
    console.log('Смена аватара отключена');
    return;
}

// Обработка выбранного файла аватара
async function processAvatarFile(file) {
    try {
        // Проверяем размер файла (максимум 5MB)
        if (file.size > 5 * 1024 * 1024) {
            showAvatarError('Файл слишком большой. Максимальный размер: 5MB');
            return;
        }

        // Проверяем тип файла
        if (!file.type.startsWith('image/')) {
            showAvatarError('Выберите изображение');
            return;
        }

        // Конвертируем файл в base64
        const base64 = await fileToBase64(file);
        
        // Обновляем аватар пользователя
        await updateUserAvatar(base64);
        
        // Обновляем интерфейс
        updateAvatarInUI(base64);
        
        showAvatarSuccess('Аватар успешно обновлен!');

    } catch (error) {
        console.error('Ошибка при обработке файла:', error);
        showAvatarError('Ошибка при обработке изображения');
    }
}

// Конвертация файла в base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Обновление аватара в базе данных
async function updateUserAvatar(avatarData) {
    try {
        // Обновляем в Firebase
        const userRef = doc(db, "users", currentUser.id);
        await updateDoc(userRef, {
            avatar: avatarData,
            lastUpdated: Date.now()
        });

        // Обновляем локальные данные пользователя
        currentUser.avatar = avatarData;
        
        // Сохраняем в localStorage
        localStorage.setItem('astralesUser', JSON.stringify(currentUser));
        localStorage.setItem('astralesUserAvatar', avatarData);
        
        // Обновляем в общем списке пользователей (если есть доступ к allUsers)
        if (window.allUsers) {
            const userIndex = window.allUsers.findIndex(u => u.id === currentUser.id);
            if (userIndex !== -1) {
                window.allUsers[userIndex].avatar = avatarData;
                localStorage.setItem('astralesAllUsers', JSON.stringify(window.allUsers));
            }
        }

        console.log('Аватар обновлен в базе данных');

    } catch (error) {
        console.error('Ошибка при обновлении аватара в базе данных:', error);
        throw error;
    }
}

// Обновление аватара в интерфейсе
function updateAvatarInUI(avatarData) {
    // Функция для безопасного обновления аватара
    const updateAvatar = (imgElement) => {
        if (imgElement) {
            imgElement.onerror = () => {
                // Тихо используем дефолтный аватар при ошибке
                imgElement.src = getDefaultAvatar();
            };
            imgElement.src = avatarData;
        }
    };

    // Обновляем аватар в профиле
    updateAvatar(document.getElementById('userAvatar'));

    // Обновляем аватар в модальном окне профиля
    updateAvatar(document.getElementById('modalAvatar'));

    // Обновляем аватар в списке чатов (если есть)
    updateAvatar(document.querySelector('.profile-avatar img'));

    // Обновляем аватар в чате (если мы в чате) - сохраняем обработчики клика
    const chatUserAvatar = document.getElementById('chatUserAvatar');
    if (chatUserAvatar) {
        const originalOnClick = chatUserAvatar.onclick;
        const originalCursor = chatUserAvatar.style.cursor;
        const originalTitle = chatUserAvatar.title;
        
        updateAvatar(chatUserAvatar);
        
        // Восстанавливаем обработчики клика
        if (originalOnClick) {
            chatUserAvatar.onclick = originalOnClick;
        }
        if (originalCursor) {
            chatUserAvatar.style.cursor = originalCursor;
        }
        if (originalTitle) {
            chatUserAvatar.title = originalTitle;
        }
    }

    // Обновляем аватар в модальном окне профиля пользователя (если открыто)
    updateAvatar(document.getElementById('userProfileAvatar'));

    console.log('Аватар обновлен в интерфейсе');
}

// Показать экран загрузки аватара
function showAvatarLoading() {
    const loadingScreen = document.getElementById('avatarLoadingScreen');
    if (loadingScreen) {
        loadingScreen.classList.remove('hidden');
    }
}

// Скрыть экран загрузки аватара
function hideAvatarLoading() {
    const loadingScreen = document.getElementById('avatarLoadingScreen');
    if (loadingScreen) {
        loadingScreen.classList.add('hidden');
    }
}

// Показать уведомление об ошибке
function showAvatarError(message) {
    // Создаем уведомление об ошибке
    const notification = document.createElement('div');
    notification.className = 'avatar-notification error';
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">❌</span>
            <span class="notification-text">${message}</span>
        </div>
    `;
    
    showNotification(notification);
}

// Показать уведомление об успехе
function showAvatarSuccess(message) {
    // Создаем уведомление об успехе
    const notification = document.createElement('div');
    notification.className = 'avatar-notification success';
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">✅</span>
            <span class="notification-text">${message}</span>
        </div>
    `;
    
    showNotification(notification);
}

// Показать уведомление
function showNotification(notification) {
    // Добавляем стили для уведомления
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--background-color, #1a1a1a);
        border: 1px solid var(--border-color, #333);
        border-radius: 8px;
        padding: 12px 16px;
        color: var(--text-color, #fff);
        font-size: 14px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        animation: slideIn 0.3s ease-out;
    `;

    // Добавляем в DOM
    document.body.appendChild(notification);

    // Удаляем через 3 секунды
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                if (notification.parentNode) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }
    }, 3000);
}

// Функция для получения текущего пользователя
export function getCurrentUser() {
    return currentUser;
}

// Функция для проверки статуса обработки
export function isAvatarProcessing() {
    return isProcessing;
}

// Функция для получения аватара пользователя
export function getUserAvatar(user) {
    // Возвращаем новое изображение профиля
    return getDefaultAvatar();
}

// Функция для получения аватара по умолчанию
export function getDefaultAvatar() {
    return 'images/PorfilePic.png';
}

// Функция для установки пользователя в модуле аватаров
export function setAvatarUser(user) {
    currentUser = user;
}

// Добавляем CSS анимации для уведомлений
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .avatar-notification.error {
        border-color: #ff4444;
        background: rgba(255, 68, 68, 0.1);
    }
    
    .avatar-notification.success {
        border-color: #44ff44;
        background: rgba(68, 255, 68, 0.1);
    }
    
    .notification-content {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    
    .notification-icon {
        font-size: 16px;
    }
    
    .notification-text {
        font-weight: 500;
    }
`;
document.head.appendChild(style);
