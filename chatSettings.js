// Файл для управления настройками чата
import { db, doc, setDoc, collection, getDocs } from './firebase.js';
import { getUserAvatar, getDefaultAvatar } from './avatarManager.js';

// Глобальные переменные для настроек чата
let chatWallpapers = {}; // {combinedChatId: wallpaperUrl}
let currentChat = null;
let currentUser = null; // Добавляем переменную для текущего пользователя

// Вспомогательная функция: единый идентификатор чата для пары пользователей
function getCombinedChatId(userAId, userBId) {
    if (!userAId || !userBId) return null;
    return [userAId, userBId].sort().join('_');
}

// Функция открытия настроек чата
export function openChatSettings(chat, allUsers) {
    currentChat = chat;
    
    if (!currentChat) {
        console.error('Нет активного чата');
        return;
    }
    
    // Загружаем информацию о собеседнике
    const partner = allUsers.find(user => user.id === currentChat.id);
    if (partner) {
        const avatarElement = document.getElementById('chatSettingsAvatar');
        const usernameElement = document.getElementById('chatSettingsUsername');
        const statusElement = document.getElementById('chatSettingsStatus');
        
        if (avatarElement) {
            avatarElement.onerror = () => {
                avatarElement.src = getDefaultAvatar();
            };
            avatarElement.src = getUserAvatar(partner);
        }
        if (usernameElement) usernameElement.textContent = partner.username;
        if (statusElement) statusElement.textContent = partner.online ? 'В сети' : 'Не в сети';
    }
    
    // Загружаем текущие обои
    loadCurrentWallpaper();
    
    // Показываем модальное окно
    const modal = document.getElementById('chatSettingsModal');
    if (modal) {
        modal.classList.remove('hidden');
        
        // Добавляем обработчик клика на backdrop для закрытия
        const backdrop = modal.querySelector('.modal-backdrop');
        if (backdrop) {
            backdrop.onclick = closeChatSettings;
        }
    }
    
    console.log('Настройки чата открыты');
}

// Функция закрытия настроек чата
export function closeChatSettings() {
    const modal = document.getElementById('chatSettingsModal');
    if (modal) {
        modal.classList.add('hidden');
    }
    console.log('Настройки чата закрыты');
}

// Функция загрузки текущих обоев
function loadCurrentWallpaper() {
    if (!currentChat) return;
    
    // Предпочитаем объединенный chatId, но поддерживаем старый ключ по partnerId
    const combinedId = getCombinedChatId(currentUser?.id, currentChat.id);
    const wallpaperUrl = chatWallpapers[combinedId] ?? chatWallpapers[currentChat.id];
    updateWallpaperPreview(wallpaperUrl);
}

// Функция обновления предварительного просмотра обоев
function updateWallpaperPreview(wallpaperUrl) {
    const currentWallpaper = document.getElementById('currentWallpaper');
    if (currentWallpaper) {
        currentWallpaper.src = wallpaperUrl || '';
        currentWallpaper.style.display = wallpaperUrl ? 'block' : 'none';
    }
}

// Функция загрузки файла обоев
export async function handleWallpaperUpload(event) {
    if (!currentChat) return;
    
    const file = event.target.files[0];
    if (!file) return;
    
    // Проверяем тип файла
    if (!file.type.startsWith('image/')) {
        alert('Пожалуйста, выберите изображение');
        return;
    }
    
    // Проверяем размер файла (максимум 5MB)
    if (file.size > 5 * 1024 * 1024) {
        alert('Размер файла не должен превышать 5MB');
        return;
    }
    
    try {
        const reader = new FileReader();
        reader.onload = async function(e) {
            const wallpaperUrl = e.target.result;
            
            // Сохраняем обои в Firebase
            await saveChatWallpaper(currentChat.id, wallpaperUrl);
            
            // Применяем обои к чату
            applyChatWallpaper(currentChat.id, wallpaperUrl);
            
            // Обновляем предварительный просмотр
            updateWallpaperPreview(wallpaperUrl);
            
            console.log('Обои чата обновлены');
        };
        reader.readAsDataURL(file);
    } catch (error) {
        console.error('Ошибка при загрузке обоев:', error);
        alert('Ошибка при загрузке обоев');
    }
}

// Функция сохранения обоев в Firebase
async function saveChatWallpaper(partnerId, wallpaperUrl) {
    try {
        const combinedId = getCombinedChatId(currentUser?.uid || currentUser?.id, partnerId) || partnerId;
        const wallpaperRef = doc(db, "chatWallpapers", combinedId);
        await setDoc(wallpaperRef, {
            wallpaperUrl: wallpaperUrl,
            updatedAt: Date.now(),
            updatedBy: currentUser?.uid || 'unknown'
        });
        
        // Обновляем локальное состояние
        chatWallpapers[combinedId] = wallpaperUrl;
        // Удаляем возможный старый ключ по partnerId (для обратной совместимости)
        delete chatWallpapers[partnerId];
        localStorage.setItem('chatWallpapers', JSON.stringify(chatWallpapers));
        
        console.log('Обои сохранены в Firebase');
    } catch (error) {
        console.error('Ошибка при сохранении обоев:', error);
        throw error;
    }
}

// Функция применения обоев к чату
export function applyChatWallpaper(chatId, wallpaperUrl) {
    const chatMessages = document.getElementById('chatMessages');
    const userChat = document.getElementById('userChat');
    
    if (chatMessages && userChat) {
        if (wallpaperUrl) {
            // Применяем обои к контейнеру сообщений
            chatMessages.style.backgroundImage = `url(${wallpaperUrl})`;
            chatMessages.style.backgroundSize = 'cover';
            chatMessages.style.backgroundPosition = 'center';
            chatMessages.style.backgroundRepeat = 'no-repeat';
            chatMessages.style.backgroundAttachment = 'fixed';
            
            // Также применяем к основному контейнеру чата
            userChat.style.backgroundImage = `url(${wallpaperUrl})`;
            userChat.style.backgroundSize = 'cover';
            userChat.style.backgroundPosition = 'center';
            userChat.style.backgroundRepeat = 'no-repeat';
            userChat.style.backgroundAttachment = 'fixed';
        } else {
            // Убираем обои
            chatMessages.style.backgroundImage = 'none';
            userChat.style.backgroundImage = 'none';
        }
    }
}

// Функция сброса обоев
export async function resetWallpaper() {
    if (!currentChat) return;
    
    try {
        // Удаляем обои из Firebase
        const combinedId = getCombinedChatId(currentUser?.uid || currentUser?.id, currentChat.id) || currentChat.id;
        const wallpaperRef = doc(db, "chatWallpapers", combinedId);
        await setDoc(wallpaperRef, {
            wallpaperUrl: null,
            updatedAt: Date.now(),
            updatedBy: currentUser?.uid || 'unknown'
        });
        
        // Обновляем локальное состояние
        delete chatWallpapers[combinedId];
        // Также удаляем возможный старый ключ по partnerId
        delete chatWallpapers[currentChat.id];
        localStorage.setItem('chatWallpapers', JSON.stringify(chatWallpapers));
        
        // Убираем обои из чата
        applyChatWallpaper(currentChat.id, null);
        
        // Обновляем предварительный просмотр
        updateWallpaperPreview(null);
        
        console.log('Обои чата сброшены');
    } catch (error) {
        console.error('Ошибка при сбросе обоев:', error);
        alert('Ошибка при сбросе обоев');
    }
}

// Функция загрузки всех обоев чата
export async function loadChatWallpapers() {
    try {
        const savedWallpapers = localStorage.getItem('chatWallpapers');
        if (savedWallpapers) {
            chatWallpapers = JSON.parse(savedWallpapers);
        }
        
        // Загружаем обои из Firebase для всех чатов
        const wallpaperSnapshot = await getDocs(collection(db, "chatWallpapers"));
        wallpaperSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.wallpaperUrl) {
                chatWallpapers[doc.id] = data.wallpaperUrl;
            }
        });
        
        localStorage.setItem('chatWallpapers', JSON.stringify(chatWallpapers));
        console.log('Обои чатов загружены');
    } catch (error) {
        console.error('Ошибка при загрузке обоев:', error);
    }
}

// Функция применения обоев для текущего чата
export function applyCurrentChatWallpaper() {
    if (!currentChat) {
        applyChatWallpaper(null, null);
        updateWallpaperPreview(null);
        return;
    }
    const combinedId = getCombinedChatId(currentUser?.uid || currentUser?.id, currentChat.id);
    const wallpaper = chatWallpapers[combinedId] ?? chatWallpapers[currentChat.id]; // fallback для старых ключей
    if (wallpaper) {
        applyChatWallpaper(currentChat.id, wallpaper);
        updateWallpaperPreview(wallpaper);
    } else {
        applyChatWallpaper(null, null);
        updateWallpaperPreview(null);
    }
}

// Функция инициализации настроек чата
export function initializeChatSettings() {
    // Загружаем обои при инициализации
    loadChatWallpapers();
    
    // Добавляем обработчики событий
    document.addEventListener('DOMContentLoaded', () => {
        // Обработчик для кнопки закрытия
        const closeButton = document.querySelector('#chatSettingsModal .close-button');
        if (closeButton) {
            closeButton.onclick = closeChatSettings;
        }
        
        // Обработчик для backdrop
        const backdrop = document.querySelector('#chatSettingsModal .modal-backdrop');
        if (backdrop) {
            backdrop.onclick = closeChatSettings;
        }
        
        // Обработчик для загрузки обоев
        const wallpaperUpload = document.getElementById('wallpaperUpload');
        if (wallpaperUpload) {
            wallpaperUpload.onchange = handleWallpaperUpload;
        }
        
        // Обработчик для сброса обоев
        const resetButton = document.querySelector('.reset-wallpaper-button');
        if (resetButton) {
            resetButton.onclick = resetWallpaper;
        }
    });
    
    console.log('Настройки чата инициализированы');
}

// Функция для установки текущего пользователя
export function setCurrentUser(user) {
    currentUser = user;
}

// Функция для установки текущего активного чата из основного приложения
export function setCurrentChat(chat) {
    currentChat = chat || null;
}

// Экспортируем переменные для использования в других модулях
export { chatWallpapers, currentChat };
