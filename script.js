// Импорт Firebase
import { 
    auth, 
    db, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    collection,
    addDoc,
    getDocs,
    doc,
    setDoc,
    onSnapshot,
    query,
    where
} from './firebase.js';

// Импорт модуля настроек чата
import { 
    openChatSettings, 
    closeChatSettings, 
    handleWallpaperUpload, 
    resetWallpaper,
    loadChatWallpapers,
    applyCurrentChatWallpaper,
    initializeChatSettings,
    applyChatWallpaper,
    setCurrentUser,
    setCurrentChat
} from './chatSettings.js';

// Глобальные переменные
let currentUser = null;
let isLoggedIn = false;
let allUsers = []; // Все пользователи в системе
let currentChat = null; // Текущий активный чат
let activeCall = null; // Активный звонок
let callTimer = null; // Таймер звонка
let callStartTime = null; // Время начала звонка
let currentMode = 'login'; // Текущий режим: 'login' или 'register'
let selectedMessage = null; // Выбранное сообщение для контекстного меню
let pinnedChats = []; // Закрепленные чаты
let pinnedMessages = {}; // Закрепленные сообщения по чатам {chatId: messageId}
let currentPinnedMessage = null; // Текущее закрепленное сообщение
let isSendingMessage = false; // Блокировка спама отправки
// Список известных игр/приложений (минимальный офлайн-словарь)
const KNOWN_APPS = new Set([
    'CS2','Counter-Strike 2','Dota 2','Minecraft','Valorant','Fortnite','League of Legends','GTA V','PUBG','Apex Legends','Rust','Roblox','Genshin Impact',
    'Discord','Steam','Chrome','Google Chrome','Firefox','Microsoft Edge','Safari','Opera','OBS Studio','Spotify','Telegram','Visual Studio Code','VS Code'
]);

// Глобальная переменная для состояния звука
let soundEnabled = true;

// Глобальные переменные для обоев чата
let chatWallpapers = {}; // {chatId: wallpaperUrl}
let longPressTimer = null;
let isLongPress = false;

// Функция воспроизведения звука уведомления
function playMessageSound(senderId = null) {
    if (!soundEnabled) return; // Не воспроизводим звук если он отключен
    
    // Проверяем, что страница не в фокусе или пользователь не в активном чате
    const isPageActive = !document.hidden && document.hasFocus();
    const isInActiveChat = currentChat && 
        (senderId === currentChat.id) &&
        !document.getElementById('userChat').classList.contains('hidden');
    
    // Воспроизводим звук только если страница не в фокусе или не в активном чате
    if (!isPageActive || !isInActiveChat) {
        try {
            const audio = document.getElementById('messageSound');
            if (audio) {
                audio.volume = 0.3; // Устанавливаем громкость на 30%
                audio.currentTime = 0; // Сбрасываем время воспроизведения
                audio.play().catch(() => {
                    // Тихо игнорируем ошибки воспроизведения звука
                });
            }
        } catch (error) {
            // Тихо игнорируем ошибки воспроизведения звука
        }
    }
}

// Функция переключения звука
function toggleSound() {
    soundEnabled = !soundEnabled;
    
    // Обновляем состояние кнопок звука
    const soundButton = document.getElementById('soundButton');
    const soundButtonList = document.getElementById('soundButtonList');
    
    const updateSoundButton = (button) => {
        if (button) {
            if (soundEnabled) {
                button.textContent = '🔊';
                button.classList.remove('muted');
                button.title = 'Звук уведомлений (включен)';
            } else {
                button.textContent = '🔇';
                button.classList.add('muted');
                button.title = 'Звук уведомлений (выключен)';
            }
        }
    };
    
    updateSoundButton(soundButton);
    updateSoundButton(soundButtonList);
    
    // Сохраняем настройку в localStorage
    localStorage.setItem('soundEnabled', soundEnabled);
}

// Функция загрузки настроек звука
function loadSoundSettings() {
    const savedSoundSetting = localStorage.getItem('soundEnabled');
    if (savedSoundSetting !== null) {
        soundEnabled = JSON.parse(savedSoundSetting);
    }
    
    // Обновляем состояние кнопок звука
    const soundButton = document.getElementById('soundButton');
    const soundButtonList = document.getElementById('soundButtonList');
    
    const updateSoundButton = (button) => {
        if (button) {
            if (soundEnabled) {
                button.textContent = '🔊';
                button.classList.remove('muted');
                button.title = 'Звук уведомлений (включен)';
            } else {
                button.textContent = '🔇';
                button.classList.add('muted');
                button.title = 'Звук уведомлений (выключен)';
            }
        }
    };
    
    updateSoundButton(soundButton);
    updateSoundButton(soundButtonList);
}







// Анимация точек загрузки
function animateLoadingDots() {
    const loadingDots = document.getElementById('loadingDots');
    let dots = '';
    let dotCount = 0;
    
    const interval = setInterval(() => {
        dots = 'Загрузка' + '.'.repeat(dotCount);
        loadingDots.textContent = dots;
        dotCount = (dotCount + 1) % 4;
    }, 500);
    
    return interval;
}

// Скрыть экран загрузки
function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    loadingScreen.classList.add('hidden');
}

// Проверить премиум статус пользователя
function isPremiumUser(username) {
    return username === '2bekind';
}

// Добавить премиум индикатор к аватару
function addPremiumIndicator(avatarElement, username = null) {
    if (!avatarElement) return;
    
    // Проверяем, есть ли уже индикатор
    const existingIndicator = avatarElement.parentElement.querySelector('.premium-indicator');
    if (existingIndicator) return;
    
    // Получаем имя пользователя
    let targetUsername = username;
    if (!targetUsername) {
        targetUsername = getUsernameFromAvatar(avatarElement);
    }
    
    if (!isPremiumUser(targetUsername)) return;
    
    // Создаем индикатор
    const indicator = document.createElement('div');
    indicator.className = 'premium-indicator';
    
    // Убеждаемся, что родительский элемент имеет position: relative
    const parentElement = avatarElement.parentElement;
    parentElement.style.position = 'relative';
    
    // Добавляем индикатор к родительскому элементу аватара
    parentElement.appendChild(indicator);
}

// Получить имя пользователя из аватара (вспомогательная функция)
function getUsernameFromAvatar(avatarElement) {
    // Пытаемся найти имя пользователя в ближайших элементах
    const chatUserName = avatarElement.closest('.chat-user-info')?.querySelector('#chatUserName');
    if (chatUserName) return chatUserName.textContent;
    
    const searchResultUsername = avatarElement.closest('.search-result-item')?.querySelector('.search-result-username');
    if (searchResultUsername) return searchResultUsername.textContent;
    
    const chatItemUsername = avatarElement.closest('.chat-item')?.querySelector('.chat-item-username');
    if (chatItemUsername) return chatItemUsername.textContent;
    
    const userProfileUsername = avatarElement.closest('.user-profile-modal')?.querySelector('#userProfileUsername');
    if (userProfileUsername) return userProfileUsername.textContent;
    
    // Если не найдено, возвращаем null
    return null;
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Запускаем анимацию точек
        const loadingInterval = animateLoadingDots();
        
        // Загружаем всех пользователей из Firebase
        await loadAllUsersFromFirebase();
        
        // Настраиваем слушатель изменений в реальном времени
        setupRealtimeUsersListener();
        
        // Проверяем, есть ли сохраненный пользователь
        const savedUser = localStorage.getItem('astralesUser');
        if (savedUser) {
            currentUser = JSON.parse(savedUser);
            isLoggedIn = true;
            
            // Устанавливаем текущего пользователя в модуле настроек
            setCurrentUser(currentUser);
            
            hideLoadingScreen();
            showChatList();
        } else {
            hideLoadingScreen();
            showLoginForm();
        }
        
        // Настраиваем отслеживание видимости страницы
        setupPageVisibilityTracking();
        
        // Загружаем настройки звука
        loadSoundSettings();
        
        // Останавливаем анимацию точек
        clearInterval(loadingInterval);
        
        // Добавляем новые инициализации
        setupLongPressHandlers();
        setupMobileAutoRefresh();
        // Загружаем обои до инициализации настроек, чтобы кэш был готов
        await loadChatWallpapers();
        
        // Инициализируем настройки чата
        initializeChatSettings();
        
        // Очищаем старые файлы при запуске
        cleanupOldFiles();
        
    } catch (error) {
        console.error('Ошибка при инициализации:', error);
        hideLoadingScreen();
    }
});

// Загрузка всех пользователей из Firebase
async function loadAllUsersFromFirebase() {
    try {
        console.log('Загружаем пользователей из Firebase...');
        const usersSnapshot = await getDocs(collection(db, "users"));
        allUsers = [];
        
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            allUsers.push({
                id: doc.id,
                username: userData.username,
                avatar: userData.avatar || null,
                online: userData.online || false,
                lastSeen: userData.lastSeen || null,
                selectedFrame: userData.selectedFrame || null,
                bio: userData.bio || null,
                activity: userData.activity || null
            });
        });
        
        console.log('Загружено пользователей:', allUsers.length);
        
        // Сохраняем в localStorage для кэширования
        localStorage.setItem('astralesAllUsers', JSON.stringify(allUsers));
    } catch (error) {
        console.error('Ошибка при загрузке пользователей:', error);
        // Если не удалось загрузить из Firebase, используем localStorage
        const savedUsers = localStorage.getItem('astralesAllUsers');
        if (savedUsers) {
            allUsers = JSON.parse(savedUsers);
        } else {
            allUsers = [];
        }
    }
}

// Настройка слушателя изменений пользователей в реальном времени
function setupRealtimeUsersListener() {
    try {
        // Слушатель изменений пользователей
        onSnapshot(collection(db, "users"), (snapshot) => {
            console.log('Обновление списка пользователей в реальном времени...');
            allUsers = [];
            
            snapshot.forEach(doc => {
                const userData = doc.data();
                allUsers.push({
                    id: doc.id,
                    username: userData.username,
                    avatar: userData.avatar || null,
                    online: userData.online || false,
                    lastSeen: userData.lastSeen || null,
                    selectedFrame: userData.selectedFrame || null,
                    bio: userData.bio || null,
                    activity: userData.activity || null
                });
            });
            
            console.log('Обновлено пользователей:', allUsers.length);
            
            // Сохраняем в localStorage
            localStorage.setItem('astralesAllUsers', JSON.stringify(allUsers));
            
            // Обновляем интерфейс, если пользователь находится в списке чатов
            if (isLoggedIn && document.getElementById('chatList').classList.contains('hidden') === false) {
                updateChatsList();
            }
        });
        
        // Слушатель изменений чатов
        onSnapshot(collection(db, "chats"), (snapshot) => {
            console.log('Обновление чатов в реальном времени...');
            
            // Обновляем интерфейс, если пользователь находится в списке чатов
            if (isLoggedIn && document.getElementById('chatList').classList.contains('hidden') === false) {
                updateChatsList();
            }
        });
        
        // Слушатель новых сообщений
        onSnapshot(collection(db, "messages"), (snapshot) => {
            console.log('Новые сообщения в реальном времени...');
            
            snapshot.docChanges().forEach((change) => {
                const messageData = change.doc.data();
                
                // Если это новое сообщение и мы получатель
                if (change.type === 'added' && messageData.receiverId === currentUser.id) {
                    // Воспроизводим звук уведомления
                    playMessageSound(messageData.senderId);
                }
            });
            
            // Если пользователь находится в чате, обновляем сообщения
            if (isLoggedIn && currentChat && document.getElementById('userChat').classList.contains('hidden') === false) {
                loadChatMessages(currentChat.id);
            }
            
            // Обновляем список чатов, если пользователь находится в списке чатов
            if (isLoggedIn && document.getElementById('chatList').classList.contains('hidden') === false) {
                updateChatsList();
            }
        });
        
        // Слушатель звонков
        onSnapshot(collection(db, "calls"), (snapshot) => {
            console.log('Новые звонки в реальном времени...');
            
            snapshot.docChanges().forEach((change) => {
                const callData = change.doc.data();
                
                // Если это новый звонок и мы получатель
                if (change.type === 'added' && callData.receiverId === currentUser.id && callData.status === 'outgoing') {
                    showIncomingCall(callData);
                }
                
                // Если звонок принят
                if (change.type === 'modified' && callData.status === 'active') {
                    if (callData.callerId === currentUser.id || callData.receiverId === currentUser.id) {
                        showActiveCall(callData);
                    }
                }
                
                // Если звонок завершен
                if (change.type === 'modified' && callData.status === 'ended') {
                    if (callData.callerId === currentUser.id || callData.receiverId === currentUser.id) {
                        endCall();
                    }
                }
            });
        });
        
        // Слушатель закрепленных сообщений
        onSnapshot(collection(db, "pinnedMessages"), (snapshot) => {
            console.log('Изменения в закрепленных сообщениях...');
            
            snapshot.docChanges().forEach((change) => {
                const pinnedData = change.doc.data();
                
                // Если это касается текущего чата
                if (currentChat && pinnedData.chatId === getChatId(currentUser.id, currentChat.id)) {
                    if (pinnedData.messageId) {
                        currentPinnedMessage = pinnedData;
                        updatePinnedMessageDisplay();
                    } else {
                        currentPinnedMessage = null;
                        hidePinnedMessageDisplay();
                    }
                }
            });
        });
        
    } catch (error) {
        console.error('Ошибка при настройке слушателя пользователей:', error);
    }
}

// Принудительное обновление списка пользователей
async function refreshUsersList() {
    try {
        console.log('Принудительное обновление списка пользователей...');
        await loadAllUsersFromFirebase();
        
        // Обновляем интерфейс, если пользователь находится в списке чатов
        if (isLoggedIn && document.getElementById('chatList').classList.contains('hidden') === false) {
            updateChatsList();
        }
        
        // Показываем уведомление
        alert('Список пользователей обновлен!');
    } catch (error) {
        console.error('Ошибка при обновлении списка пользователей:', error);
        alert('Ошибка при обновлении списка пользователей');
    }
}

// Получить аватар пользователя (с дефолтным значением)
function getUserAvatar(user) {
    if (user && user.avatar) {
        return user.avatar;
    }
    // Возвращаем дефолтный аватар (человечек)
    return getDefaultAvatar();
}

// Получить дефолтный аватар (человечек)
function getDefaultAvatar() {
    return "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiM0NDQ0NDQiLz4KPHBhdGggZD0iTTIwIDEwQzIyLjA5IDEwIDI0IDExLjkxIDI0IDE0QzI0IDE2LjA5IDIyLjA5IDE4IDIwIDE4QzE3LjkxIDE4IDE2IDE2LjA5IDE2IDE0QzE2IDExLjkxIDE3LjkxIDEwIDIwIDEwWiIgZmlsbD0iI0ZGRkZGRiIvPgo8cGF0aCBkPSJNMjAgMjBDMTYuNjkgMjAgMTQgMjIuNjkgMTQgMjZIMjZDMjYgMjIuNjkgMjMuMzEgMjAgMjAgMjBaIiBmaWxsPSIjRkZGRkZGIi8+Cjwvc3ZnPgo=";
}

// Форматирование времени в Москве (MSK), только часы:минуты
function formatMoscowTime(timestamp) {
    if (!timestamp) return '';
    try {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' });
    } catch (_) {
        return '';
    }
}

function getLastSeenText(user) {
    if (user && user.online) return 'В сети';
    const last = user && user.lastSeen;
    if (last) {
        const diff = Date.now() - last;
        const oneDay = 24 * 60 * 60 * 1000;
        if (diff >= oneDay) {
            return 'Был(а) недавно';
        }
        const t = formatMoscowTime(last);
        return t ? `Был(а) в ${t}` : 'Был(а) недавно';
    }
    return 'Был(а) недавно';
}

// Нормализация названий игр/приложений
const ACTIVITY_ALIASES = {
    'counter-strike 2': 'CS2',
    'counter strike 2': 'CS2',
    'cs2': 'CS2',
    'google chrome': 'Chrome',
    'chrome': 'Chrome',
    'firefox': 'Firefox',
    'edge': 'Microsoft Edge',
    'microsoft edge': 'Microsoft Edge',
    'obs': 'OBS Studio',
    'obs studio': 'OBS Studio',
    'vscode': 'Visual Studio Code',
    'visual studio code': 'Visual Studio Code',
    'lol': 'League of Legends',
    'league of legends': 'League of Legends',
    'gta 5': 'GTA V',
    'gta v': 'GTA V',
    'genshin': 'Genshin Impact'
};

function normalizeActivityName(name) {
    if (!name) return '';
    const key = String(name).trim().toLowerCase();
    return ACTIVITY_ALIASES[key] || name;
}

function getPresenceText(user) {
    if (user && user.activity) {
        return `Сидит в ${normalizeActivityName(user.activity)}`;
    }
    return getLastSeenText(user);
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

// Принудительно обновить все аватары в интерфейсе
async function forceUpdateAllAvatars() {
    // Обновляем основной аватар в хедере
    updateUserAvatar();
    
    // Обновляем аватар в модалке профиля
    const modalAvatar = document.getElementById('modalAvatar');
    if (modalAvatar) {
        if (currentUser && currentUser.avatar) {
            modalAvatar.src = currentUser.avatar + '?t=' + Date.now();
        } else {
            modalAvatar.src = getDefaultAvatar() + '?t=' + Date.now();
        }
    }
    
    // Небольшая задержка для завершения обновления
    await new Promise(resolve => setTimeout(resolve, 500));
}

// Сохранить пользователя в общий список
async function saveUserToAllUsers(user) {
    const userIndex = allUsers.findIndex(u => u.id === user.id);
    if (userIndex !== -1) {
        // Обновляем существующего пользователя
        allUsers[userIndex] = { ...user };
    } else {
        // Добавляем нового пользователя
        allUsers.push({ ...user });
    }
    
    // Сохраняем в localStorage
    localStorage.setItem('astralesAllUsers', JSON.stringify(allUsers));
    
            // Также обновляем в Firebase (если это не новый пользователь)
        if (user.id) {
            try {
                await setDoc(doc(db, "users", user.id), {
                    username: user.username,
                    avatar: user.avatar,
                    online: user.online,
                    lastSeen: Date.now(),
                    selectedFrame: user.selectedFrame,
                    bio: user.bio
                }, { merge: true });
            } catch (error) {
                console.error('Ошибка при сохранении пользователя в Firebase:', error);
            }
        }
}

// Открыть модальное окно профиля пользователя
function openUserProfileModal() {
    if (!currentChat) return;
    
    const modal = document.getElementById('userProfileModal');
    const avatar = document.getElementById('userProfileAvatar');
    const username = document.getElementById('userProfileUsername');
    const statusIndicator = document.getElementById('userProfileStatusIndicator');
    const statusText = document.getElementById('userProfileStatusText');
    const bioContainer = document.getElementById('userProfileBio');
    
    // Заполняем данные пользователя
    avatar.src = getUserAvatar(currentChat);
    username.textContent = currentChat.username;
    
    // Устанавливаем статус и рамку
    const userProfileAvatar = avatar.parentElement;
    
    // Удаляем все классы статуса
    statusIndicator.classList.remove('online', 'offline');
    
    // Проверяем, есть ли у пользователя выбранная рамка
    if (currentChat.selectedFrame) {
        userProfileAvatar.classList.add(currentChat.selectedFrame);
    }
    
    if (currentChat.online) {
        statusIndicator.className = 'status-indicator online';
        statusText.textContent = getPresenceText(currentChat);
    } else {
        statusIndicator.className = 'status-indicator offline';
        statusText.textContent = getPresenceText(currentChat);
    }
    
    // Отображаем описание профиля
    if (currentChat.bio && currentChat.bio.trim()) {
        bioContainer.innerHTML = `<p>${currentChat.bio}</p>`;
        bioContainer.classList.remove('empty');
    } else {
        bioContainer.innerHTML = '<p class="empty">Описание не указано</p>';
        bioContainer.classList.add('empty');
    }
    
    // Добавляем премиум индикатор если нужно
    if (isPremiumUser(currentChat.username)) {
        addPremiumIndicator(avatar, currentChat.username);
    }
    
    // Обновляем статус
    if (currentChat.online) {
        statusIndicator.className = 'status-indicator online';
        statusText.textContent = 'В сети';
    } else {
        statusIndicator.className = 'status-indicator offline';
        statusText.textContent = 'Не в сети';
    }

    // Действия
    const msgBtn = document.getElementById('profileActionMessage');
    const callBtn = document.getElementById('profileActionCall');
    const pinBtn = document.getElementById('profileActionPin');
    if (msgBtn) msgBtn.onclick = () => { modal.classList.add('hidden'); };
    if (callBtn) callBtn.onclick = () => { modal.classList.add('hidden'); makeCall(); };
    if (pinBtn) {
        const isPinned = Array.isArray(pinnedChats) && pinnedChats.includes(currentChat.id);
        pinBtn.textContent = isPinned ? 'Открепить чат' : 'Закрепить чат';
        pinBtn.onclick = () => {
            // имитируем клик по контекстному действию
            if (!pinnedChats.includes(currentChat.id)) {
                pinnedChats.push(currentChat.id);
            } else {
                pinnedChats = pinnedChats.filter(id => id !== currentChat.id);
            }
            localStorage.setItem('pinnedChats', JSON.stringify(pinnedChats));
            updateChatsList();
            pinBtn.textContent = pinnedChats.includes(currentChat.id) ? 'Открепить чат' : 'Закрепить чат';
        };
    }

    // Показываем модальное окно
    modal.classList.remove('hidden');
}

// Закрыть модальное окно профиля пользователя
function closeUserProfileModal() {
    document.getElementById('userProfileModal').classList.add('hidden');
}

// Переключение режимов входа/регистрации
function switchMode(mode) {
    currentMode = mode;
    
    // Обновляем активную кнопку
    document.getElementById('loginModeBtn').classList.toggle('active', mode === 'login');
    document.getElementById('registerModeBtn').classList.toggle('active', mode === 'register');
    
    // Показываем/скрываем соответствующие формы
    document.getElementById('loginFormElement').classList.toggle('hidden', mode !== 'login');
    document.getElementById('registerFormElement').classList.toggle('hidden', mode !== 'register');
    
    // Обновляем текст кнопки
    document.getElementById('submitBtn').textContent = mode === 'login' ? 'Войти' : 'Зарегистрироваться';
    
    // Скрываем сообщение об ошибке
    hideErrorMessage();
    
    // Очищаем поля ввода
    clearFormFields();
}

// Очистка полей формы
function clearFormFields() {
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('regUsername').value = '';
    document.getElementById('regPassword').value = '';
    document.getElementById('confirmPassword').value = '';
}

// Скрытие сообщения об ошибке
function hideErrorMessage() {
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.classList.add('hidden');
    errorMessage.textContent = '';
}

// Показать сообщение об ошибке
function showErrorMessage(message) {
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
}

// Обработка входа
async function handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    try {
        const cred = await signInWithEmailAndPassword(auth, username + "@astrales.com", password);
        
        // Получаем данные пользователя из Firestore
        const userDoc = await getDocs(collection(db, "users"));
        const userData = userDoc.docs.find(doc => doc.data().username === username);
        
        if (userData) {
            const userDataObj = userData.data();
            currentUser = {
                id: cred.user.uid,
                username: username,
                avatar: userDataObj.avatar || null,
                online: true,
                lastSeen: null,
                selectedFrame: userDataObj.selectedFrame || null,
                bio: userDataObj.bio || null,
                activity: userDataObj.activity || null
            };
            
            // Устанавливаем текущего пользователя в модуле настроек
            setCurrentUser(currentUser);
            
            // Сохраняем в localStorage
            localStorage.setItem('astralesUser', JSON.stringify(currentUser));
            isLoggedIn = true;
            
            // Обновляем статус онлайн в Firestore
            await setDoc(doc(db, "users", cred.user.uid), {
                ...userDataObj,
                online: true,
                lastSeen: Date.now()
            }, { merge: true });
            
            // Обновляем пользователя в локальном списке
            const userIndex = allUsers.findIndex(u => u.id === cred.user.uid);
            if (userIndex !== -1) {
                allUsers[userIndex] = { ...currentUser };
            } else {
                allUsers.push({ ...currentUser });
            }
            localStorage.setItem('astralesAllUsers', JSON.stringify(allUsers));
            
            showChatList();
        } else {
            showErrorMessage('Пользователь не найден');
        }
    } catch (err) {
        showErrorMessage('Хмм, такого аккаунта нету, может вы что то перепутали?');
    }
}

// Обработка регистрации
async function handleRegister(event) {
    event.preventDefault();

    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (password !== confirmPassword) {
        showErrorMessage('Пароли не совпадают');
        return;
    }

    if (password.length < 6) {
        showErrorMessage('Пароль должен содержать минимум 6 символов');
        return;
    }

    try {
        const cred = await createUserWithEmailAndPassword(auth, username + "@astrales.com", password);
        
        // Создаем объект пользователя
        const newUser = {
            id: cred.user.uid,
            username: username,
            avatar: null,
            online: true,
            bio: null
        };
        
        // Сохраняем в Firestore
        await setDoc(doc(db, "users", cred.user.uid), {
            username: username,
            online: true,
            bio: null,
            created: Date.now()
        });
        
        // Добавляем в локальный список пользователей
        allUsers.push(newUser);
        localStorage.setItem('astralesAllUsers', JSON.stringify(allUsers));

        alert("Регистрация успешна! Теперь войдите.");
        switchMode('login');
    } catch (err) {
        showErrorMessage(err.message);
    }
}

// Показать список чатов
async function showChatList() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('chatList').classList.remove('hidden');
    document.getElementById('userChat').classList.add('hidden');
    
    // Обновляем аватар в интерфейсе
    updateUserAvatar();
    
    // Принудительно обновляем список пользователей из Firebase
    await loadAllUsersFromFirebase();
    
    // Обновляем список чатов
    updateChatsList();
}

// Показать форму входа
function showLoginForm() {
    document.getElementById('chatList').classList.add('hidden');
    document.getElementById('userChat').classList.add('hidden');
    document.getElementById('loginForm').classList.remove('hidden');
    
    // Сбрасываем режим на вход
    switchMode('login');
}

// Выход из аккаунта
async function handleLogout() {
    // Устанавливаем статус оффлайн перед выходом
    if (currentUser) {
        await setUserOnlineStatus(false);
    }
    
    // Очищаем данные текущего пользователя
    currentUser = null;
    isLoggedIn = false;
    
    // Устанавливаем текущего пользователя в модуле настроек
    setCurrentUser(null);
    
    // Удаляем пользователя из localStorage
    localStorage.removeItem('astralesUser');
    
    // Скрываем меню профиля
    document.getElementById('profileMenu').classList.add('hidden');
    
    // Показываем форму входа
    showLoginForm();
}

// Переключение меню профиля
function toggleProfileMenu() {
    const profileMenu = document.getElementById('profileMenu');
    profileMenu.classList.toggle('hidden');
}

// Открыть настройки профиля
function openProfileSettings() {
    const modal = document.getElementById('profileModal');
    const modalAvatar = document.getElementById('modalAvatar');
    const usernameInput = document.getElementById('newUsername');
    const bioInput = document.getElementById('newBio');
    const bioCounter = document.getElementById('bioCounter');
    const heroUsername = document.getElementById('profileHeroUsername');
    const heroBio = document.getElementById('profileHeroBio');
    const activityInput = document.getElementById('newActivity');
    
    // Заполняем текущими данными
    if (currentUser.avatar) {
        modalAvatar.src = currentUser.avatar;
    } else {
        modalAvatar.src = getDefaultAvatar();
    }
    
    // Добавляем выбранную рамку если есть
    const currentAvatarContainer = modalAvatar.parentElement;
    if (currentUser.selectedFrame) {
        currentAvatarContainer.classList.add(currentUser.selectedFrame);
    }
    
    usernameInput.value = currentUser.username;
    bioInput.value = currentUser.bio || '';
    bioCounter.textContent = (currentUser.bio || '').length;
    if (heroUsername) heroUsername.textContent = '@' + currentUser.username;
    if (heroBio) heroBio.textContent = currentUser.bio || 'Описание не указано';
    if (activityInput) activityInput.value = currentUser.activity || '';
    
    // Добавляем премиум индикатор если нужно
    if (isPremiumUser(currentUser.username)) {
        addPremiumIndicator(modalAvatar, currentUser.username);
    }
    
    // Показываем модальное окно
    modal.classList.remove('hidden');
    
    // Скрываем меню профиля
    document.getElementById('profileMenu').classList.add('hidden');
}

// Закрыть настройки профиля
function closeProfileSettings() {
    document.getElementById('profileModal').classList.add('hidden');
}

// Обработка загрузки аватара
async function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (file) {
        // Показываем экран загрузки
        showAvatarLoading();
        
        const reader = new FileReader();
        reader.onload = async function(e) {
            const avatarData = e.target.result;
            
            try {
                // Обновляем аватар в модальном окне с принудительным обновлением
                const modalAvatar = document.getElementById('modalAvatar');
                if (modalAvatar) {
                    modalAvatar.src = avatarData + '?t=' + Date.now();
                }
                
                // Сохраняем аватар в пользователе
                currentUser.avatar = avatarData;
                
                // Сохраняем аватар в Firestore
                await setDoc(doc(db, "users", currentUser.id), {
                    username: currentUser.username,
                    avatar: avatarData,
                    online: currentUser.online,
                    lastSeen: Date.now(),
                    selectedFrame: currentUser.selectedFrame,
                    bio: currentUser.bio,
                    activity: currentUser.activity
                }, { merge: true });
                
                // Обновляем localStorage текущего пользователя
                localStorage.setItem('astralesUser', JSON.stringify(currentUser));
                
                // Обновляем в общем списке пользователей
                saveUserToAllUsers(currentUser);
                
                // Принудительно обновляем все аватары
                await forceUpdateAllAvatars();
                
                // Скрываем экран загрузки
                hideAvatarLoading();
            } catch (error) {
                hideAvatarLoading();
                alert('Ошибка при сохранении аватара: ' + error.message);
            }
        };
        reader.readAsDataURL(file);
    }
}

// Удалить аватар: вернуть дефолтный
async function deleteAvatar() {
    if (!currentUser) return;
    
    // Показываем экран загрузки
    showAvatarLoading();
    
    try {
        const defaultAvatar = getDefaultAvatar();
        // Обновляем локально
        currentUser.avatar = null;
        
        // Применяем в модалке с принудительным обновлением
        const modalAvatar = document.getElementById('modalAvatar');
        if (modalAvatar) {
            modalAvatar.src = defaultAvatar + '?t=' + Date.now();
        }
        
        // Сохраняем в Firestore
        await setDoc(doc(db, "users", currentUser.id), {
            username: currentUser.username,
            avatar: null,
            online: currentUser.online,
            lastSeen: Date.now(),
            selectedFrame: currentUser.selectedFrame,
            bio: currentUser.bio,
            activity: currentUser.activity
        }, { merge: true });
        
        // Обновляем localStorage и UI
        localStorage.setItem('astralesUser', JSON.stringify(currentUser));
        saveUserToAllUsers(currentUser);
        
        // Принудительно обновляем все аватары
        await forceUpdateAllAvatars();
        
        // Скрываем экран загрузки
        hideAvatarLoading();
    } catch (e) {
        console.error('Ошибка при удалении аватара:', e);
        hideAvatarLoading();
        alert('Не удалось удалить аватар');
    }
}

// Сохранение изменений профиля
async function saveProfileChanges() {
    const newUsername = document.getElementById('newUsername').value.trim();
    const newBio = document.getElementById('newBio').value.trim();
    const newActivity = (document.getElementById('newActivity')?.value || '').trim();
    
    if (newUsername && newUsername !== currentUser.username) {
        // Проверяем, не занято ли имя пользователя
        if (isUsernameTaken(newUsername)) {
            alert('Это имя пользователя уже занято. Выберите другое.');
            return;
        }
        
        // Обновляем имя пользователя
        currentUser.username = newUsername;
    }
    
    // Обновляем описание
    currentUser.bio = newBio || null;
    // Обновляем активность
    currentUser.activity = newActivity || null;
    
    try {
        // Сохраняем изменения в Firestore
        await setDoc(doc(db, "users", currentUser.id), {
            username: currentUser.username,
            avatar: currentUser.avatar,
            online: currentUser.online,
            lastSeen: Date.now(),
            bio: currentUser.bio,
            activity: currentUser.activity
        }, { merge: true });
        
        // Обновляем localStorage
        localStorage.setItem('astralesUser', JSON.stringify(currentUser));
        
        // Обновляем в общем списке пользователей
        saveUserToAllUsers(currentUser);
        
        // Обновляем интерфейс
        updateUserAvatar();
        
        // Закрываем модальное окно
        closeProfileSettings();
    } catch (error) {
        alert('Ошибка при сохранении профиля: ' + error.message);
    }
}

// Проверка, занято ли имя пользователя
function isUsernameTaken(username) {
    return allUsers.some(u => u.username === username && u.id !== currentUser.id);
}

// Обновление аватара пользователя в интерфейсе
function updateUserAvatar() {
    const userAvatar = document.getElementById('userAvatar');
    const profileAvatar = userAvatar.parentElement;
    
    if (currentUser && currentUser.avatar) {
        userAvatar.src = currentUser.avatar + '?t=' + Date.now();
    } else {
        userAvatar.src = getDefaultAvatar() + '?t=' + Date.now();
    }
    
    // Добавляем выбранную рамку если есть
    if (currentUser && currentUser.selectedFrame) {
        profileAvatar.classList.add(currentUser.selectedFrame);
    }
    
    // Добавляем премиум индикатор если нужно
    if (currentUser && isPremiumUser(currentUser.username)) {
        addPremiumIndicator(userAvatar, currentUser.username);
    }
}

// Обработка поиска
function handleSearch(event) {
    const raw = event.target.value.trim();
    // Поддержка ввода с @
    const query = (raw.startsWith('@') ? raw.slice(1) : raw).toLowerCase();
    if (query.length === 0) {
        hideSearchResults();
        return;
    }
    // Строгое совпадение юзернейма (без подсказок по одной букве)
    const searchResults = allUsers.filter(user => 
        user.username && user.username.toLowerCase() === query && user.id !== currentUser.id
    );
    showSearchResults(searchResults);
}

// Показать результаты поиска
function showSearchResults(results) {
    const searchResults = document.getElementById('searchResults');
    const searchResultsList = document.getElementById('searchResultsList');
    
    searchResultsList.innerHTML = '';
    
    if (results.length === 0) {
        searchResultsList.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">Пользователи не найдены</p>';
    } else {
        results.forEach(user => {
            const resultItem = createSearchResultItem(user);
            searchResultsList.appendChild(resultItem);
        });
    }
    
    searchResults.classList.remove('hidden');
}

// Скрыть результаты поиска
function hideSearchResults() {
    document.getElementById('searchResults').classList.add('hidden');
}

// Закрыть результаты поиска
function closeSearchResults() {
    hideSearchResults();
    document.getElementById('searchInput').value = '';
}

// Создать элемент результата поиска
function createSearchResultItem(user) {
    const div = document.createElement('div');
    div.className = 'search-result-item';
    
    // Добавляем класс рамки если есть
    if (user.selectedFrame) {
        div.classList.add(user.selectedFrame);
    }
    
    // Используем аватар пользователя или дефолтный
    const avatar = getUserAvatar(user);
    
    div.innerHTML = `
        <div class="avatar-container" style="position: relative;">
            <img src="${avatar}" alt="${user.username}" class="search-result-avatar">
        </div>
        <div class="search-result-info">
            <div class="search-result-username">${user.username}</div>
        </div>
        <div class="search-result-actions">
            <button class="action-button view-profile-btn" onclick="viewUserProfile('${user.id}')">
                Профиль
            </button>
            <button class="action-button message-btn" onclick="openChatWithUser('${user.id}')">
                Написать
            </button>
        </div>
    `;
    
    // Добавляем премиум индикатор если нужно
    const avatarImg = div.querySelector('.search-result-avatar');
    if (isPremiumUser(user.username)) {
        addPremiumIndicator(avatarImg, user.username);
    }
    
    return div;
}

// Просмотр профиля пользователя
function viewUserProfile(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (user) {
        alert(`Профиль пользователя ${user.username}\nСтатус: ${user.online ? 'В сети' : 'Не в сети'}`);
    }
}

// Открыть чат с пользователем
async function openChatWithUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (user) {
        currentChat = user;
        await openUserChat(user);
        hideSearchResults();
    }
}

// Открыть чат пользователя
async function openUserChat(user) {
    document.getElementById('chatList').classList.add('hidden');
    document.getElementById('userChat').classList.remove('hidden');
    
    // Заполняем информацию о пользователе
    document.getElementById('chatUserName').textContent = user.username;
    
    // Используем аватар пользователя или дефолтный
    const chatUserAvatar = document.getElementById('chatUserAvatar');
    chatUserAvatar.src = getUserAvatar(user);
    
    // Добавляем классы для статуса онлайн или admin
    const onlineStatus = document.querySelector('.online-status');
    
    // Удаляем все классы статуса
    chatUserAvatar.classList.remove('online', 'offline');
    
    // Проверяем, есть ли у пользователя выбранная рамка
    if (user.selectedFrame) {
        chatUserAvatar.classList.add(user.selectedFrame);
    } else if (user.online) {
        chatUserAvatar.classList.add('online');
        onlineStatus.textContent = getPresenceText(user);
        onlineStatus.classList.remove('offline');
    } else {
        chatUserAvatar.classList.add('offline');
        onlineStatus.textContent = getPresenceText(user);
        onlineStatus.classList.add('offline');
    }
    
    // Сообщаем модулю настроек чатов какой чат активен
    setCurrentChat(user);

    // Загружаем закрепленное сообщение
    const chatId = getChatId(currentUser.id, user.id);
    await loadPinnedMessage(chatId);
    
    // Загружаем сообщения чата
    await loadChatMessages(user.id);
    
    // Добавляем премиум индикатор если нужно
    if (isPremiumUser(user.username)) {
        addPremiumIndicator(chatUserAvatar, user.username);
    }
    
    // Загружаем настройки звука для кнопки в чате
    loadSoundSettings();
    
    // Применяем обои для чата
    applyCurrentChatWallpaper();
}

// Вернуться к списку чатов
function backToChats() {
    document.getElementById('userChat').classList.add('hidden');
    document.getElementById('chatList').classList.remove('hidden');
    currentChat = null;
}

// Загрузить сообщения чата
async function loadChatMessages(userId) {
    console.log('loadChatMessages вызвана для пользователя:', userId);
    const chatMessages = document.getElementById('chatMessages');
    const chatId = getChatId(currentUser.id, userId);
    console.log('Chat ID:', chatId);
    
    try {
        // Загружаем сообщения из Firebase
        const messagesSnapshot = await getDocs(collection(db, "messages"));
        const firebaseMessages = [];
        
        messagesSnapshot.forEach(doc => {
            const messageData = doc.data();
            if (messageData.chatId === chatId) {
                const message = {
                    id: messageData.messageId,
                    text: messageData.text,
                    senderId: messageData.senderId,
                    receiverId: messageData.receiverId,
                    timestamp: messageData.timestamp,
                    type: messageData.type || 'text',
                    fileName: messageData.fileName,
                    fileType: messageData.fileType,
                    fileSize: messageData.fileSize
                };
                
                // Загружаем файл из localStorage если есть
                if (messageData.fileKey) {
                    const fileData = getFileByKey(messageData.fileKey);
                    if (fileData) {
                        message.fileData = fileData;
                        if (message.type === 'image') {
                            message.imageData = fileData;
                        }
                    }
                }
                
                firebaseMessages.push(message);
            }
        });
        
        // Сортируем сообщения по времени
        firebaseMessages.sort((a, b) => a.timestamp - b.timestamp);
        
        console.log('Загружено сообщений из Firebase:', firebaseMessages.length);
        console.log('Сообщения с файлами:', firebaseMessages.filter(m => m.type === 'file' || m.type === 'image'));
        
        // Сохраняем в localStorage для кэширования
        localStorage.setItem(`chat_${chatId}`, JSON.stringify(firebaseMessages));
        
        // Получаем список скрытых сообщений для текущего пользователя
        const hiddenMessagesKey = `hidden_${currentUser.id}_${chatId}`;
        const hiddenMessages = JSON.parse(localStorage.getItem(hiddenMessagesKey)) || [];
        
        // Фильтруем сообщения, убирая скрытые
        const visibleMessages = firebaseMessages.filter(message => !hiddenMessages.includes(message.id));
        
        if (visibleMessages.length === 0) {
            chatMessages.innerHTML = '<div class="empty-chat"><p>Пока что тут пустоватенько, может надо написать?</p></div>';
        } else {
            displayMessages(visibleMessages);
        }
        
    } catch (error) {
        console.error('Ошибка при загрузке сообщений из Firebase:', error);
        
        // Fallback к localStorage
        const messages = JSON.parse(localStorage.getItem(`chat_${chatId}`)) || [];
        
        // Загружаем файлы из localStorage для каждого сообщения
        messages.forEach(message => {
            if (message.type === 'file' || message.type === 'image') {
                const fileKey = `file_${message.id}`;
                const fileData = getFileByKey(fileKey);
                if (fileData) {
                    message.fileData = fileData;
                    if (message.type === 'image') {
                        message.imageData = fileData;
                    }
                }
            }
        });
        
        // Получаем список скрытых сообщений для текущего пользователя
        const hiddenMessagesKey = `hidden_${currentUser.id}_${chatId}`;
        const hiddenMessages = JSON.parse(localStorage.getItem(hiddenMessagesKey)) || [];
        
        // Фильтруем сообщения, убирая скрытые
        const visibleMessages = messages.filter(message => !hiddenMessages.includes(message.id));
        
        if (visibleMessages.length === 0) {
            chatMessages.innerHTML = '<div class="empty-chat"><p>Пока что тут пустоватенько, может надо написать?</p></div>';
        } else {
            displayMessages(visibleMessages);
        }
    }
}

// Отобразить сообщения
function displayMessages(messages) {
    console.log('displayMessages вызвана с сообщениями:', messages);
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = '';
    
    messages.forEach(message => {
        console.log('Создаем элемент для сообщения:', message);
        const messageDiv = createMessageElement(message);
        chatMessages.appendChild(messageDiv);
    });
    
    // Прокручиваем к последнему сообщению
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Создать элемент сообщения
function createMessageElement(message) {
    const div = document.createElement('div');
    div.className = `message ${message.senderId === currentUser.id ? 'sent' : 'received'}`;
    div.setAttribute('data-message-id', message.id); // Добавляем ID сообщения для поиска
    
    const time = new Date(message.timestamp).toLocaleTimeString('ru-RU', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    // Определяем статус сообщения (для отправленных сообщений)
    let statusHtml = '';
    if (message.senderId === currentUser.id) {
        statusHtml = '<span class="message-status">✓✓</span>';
    }
    
    // Создаем содержимое сообщения в зависимости от типа
    let messageContent = '';
    if (message.type === 'image') {
        console.log('Создаем элемент для изображения:', message);
        messageContent = `
            <div class="message-image">
                <img src="${message.imageData}" alt="Изображение" onclick="openImageModal('${message.imageData}')">
            </div>
        `;
    } else if (message.type === 'file') {
        console.log('Создаем элемент для файла:', message);
        // Определяем иконку для типа файла
        const fileIcon = getFileIcon(message.fileType);
        
        // Дополнительная информация для аудио файлов
        let additionalInfo = '';
        if (message.fileType === 'audio' && message.audioDuration) {
            const minutes = Math.floor(message.audioDuration / 60);
            const seconds = message.audioDuration % 60;
            additionalInfo = `<div class="file-duration">${minutes}:${seconds.toString().padStart(2, '0')}</div>`;
        }
        
        messageContent = `
            <div class="message-file">
                <div class="file-icon">${fileIcon}</div>
                <div class="file-info">
                    <div class="file-name">${message.fileName}</div>
                    <div class="file-size">${formatFileSize(message.fileSize)}</div>
                    ${additionalInfo}
                </div>
                <div class="file-actions">
                    ${message.fileType === 'audio' ? `
                        <button class="file-play-btn" onclick="playAudioFile('${message.fileData}')" title="Воспроизвести">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M8 5V19L19 12L8 5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </button>
                    ` : ''}
                    <a href="${message.fileData}" download="${message.fileName}" class="file-download-btn" title="Скачать файл">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M7 10L12 15L17 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M12 15V3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </a>
                </div>
            </div>
        `;
    } else {
        messageContent = message.text;
    }
    
    div.innerHTML = `
        <div class="message-content">
            ${messageContent}
            <div class="message-time">
                ${time}
                ${statusHtml}
            </div>
        </div>
    `;
    
    // Добавляем обработчик правого клика для своих сообщений
    if (message.senderId === currentUser.id) {
        div.addEventListener('contextmenu', (event) => showMessageContextMenu(event, message));
        
        // Добавляем класс для мобильных устройств
        div.classList.add('message-item');
    }
    
    return div;
}



// Получить пользователя по ID
function getUserById(userId) {
    return allUsers.find(user => user.id === userId);
}

// Получить иконку для типа файла
function getFileIcon(fileType) {
    switch (fileType) {
        case 'image':
            return '📷';
        case 'document':
            return '📄';
        case 'archive':
            return '📦';
        case 'audio':
            return '🎵';
        case 'video':
            return '🎬';
        default:
            return '📎';
    }
}

// Воспроизвести аудио файл
function playAudioFile(audioData) {
    const audio = new Audio(audioData);
    
    // Останавливаем предыдущий аудио если он играет
    if (window.currentAudio) {
        window.currentAudio.pause();
        window.currentAudio.currentTime = 0;
    }
    
    window.currentAudio = audio;
    
    audio.play().catch(() => {
        // Тихо игнорируем ошибки воспроизведения аудио
        // alert('Не удалось воспроизвести аудио файл');
    });
    
    // Показываем уведомление о воспроизведении
    showAudioPlayNotification();
}

// Показать уведомление о воспроизведении аудио
function showAudioPlayNotification() {
    const notification = document.createElement('div');
    notification.className = 'audio-play-notification';
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">🎵</span>
            <span class="notification-text">Воспроизводится аудио файл</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Анимация появления
    setTimeout(() => notification.classList.add('show'), 10);
    
    // Автоматическое скрытие через 2 секунды
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}

// Обработка нажатия клавиши в поле сообщения
function handleMessageKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

// Отправить сообщение
async function sendMessage() {
    if (isSendingMessage) return;
    const messageInput = document.getElementById('messageInput');
    const messageText = messageInput.value.trim();
    if (!messageText || !currentChat) return;

    // Мгновенно очищаем инпут и блокируем отправку/кнопку
    messageInput.value = '';
    isSendingMessage = true;
    const sendBtn = document.querySelector('.send-button');
    if (sendBtn) sendBtn.disabled = true;

    const message = {
        id: Date.now().toString(),
        text: messageText,
        type: 'text', // Явно указываем тип сообщения
        senderId: currentUser.id,
        receiverId: currentChat.id,
        timestamp: Date.now()
    };

    try {
        await saveMessageToFirebase(message);
        updateChatsList();
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isMobile) {
            setTimeout(() => { refreshChatMessages(); }, 800);
        }
    } catch (error) {
        console.error('Ошибка при отправке сообщения:', error);
    } finally {
        // Небольшой анти-спам троттлинг
        setTimeout(() => {
            isSendingMessage = false;
            if (sendBtn) sendBtn.disabled = false;
        }, 300);
    }
}

// Сохранить сообщение в Firebase
async function saveMessageToFirebase(message) {
    console.log('saveMessageToFirebase вызвана с сообщением:', message);
    try {
        const chatId = getChatId(message.senderId, message.receiverId);
        console.log('Chat ID:', chatId);
        
        // Определяем текст для последнего сообщения в чате
        let lastMessageText = '';
        if (message.type === 'image') {
            lastMessageText = '🖼️ Изображение';
        } else if (message.type === 'file') {
            lastMessageText = `📎 ${message.fileName}`;
        } else {
            lastMessageText = message.text || '';
        }
        
        // Сохраняем сообщение в коллекцию messages
        const messageData = {
            chatId: chatId,
            messageId: message.id,
            text: message.text,
            senderId: message.senderId,
            receiverId: message.receiverId,
            timestamp: message.timestamp,
            type: message.type || 'text',
            createdAt: Date.now()
        };
        
        // Добавляем данные файла если это файл или изображение
        if (message.type === 'image' || message.type === 'file') {
            messageData.fileName = message.fileName;
            messageData.fileSize = message.fileSize;
            messageData.fileType = message.fileType;
            messageData.mimeType = message.mimeType;
            
            // Сохраняем файл локально и добавляем ссылку
            const fileKey = `file_${message.id}`;
            localStorage.setItem(fileKey, message.fileData);
            messageData.fileKey = fileKey;
            
            // Для изображений добавляем imageData для совместимости
            if (message.type === 'image') {
                messageData.imageKey = fileKey;
            }
        }
        
        console.log('Сохраняем сообщение в Firebase...');
        await addDoc(collection(db, "messages"), messageData);
        console.log('Сообщение сохранено в коллекции messages');
        
        // Обновляем или создаем запись в коллекции chats
        console.log('Обновляем запись в коллекции chats...');
        await setDoc(doc(db, "chats", chatId), {
            participants: [message.senderId, message.receiverId].sort(),
            lastMessage: lastMessageText,
            lastMessageTime: message.timestamp,
            lastMessageSender: message.senderId,
            updatedAt: Date.now()
        }, { merge: true });
        console.log('Запись в коллекции chats обновлена');
        
    } catch (error) {
        console.error('Ошибка при сохранении сообщения в Firebase:', error);
        throw error;
    }
}

// Сохранить сообщение локально
function saveMessage(message) {
    const chatId = getChatId(message.senderId, message.receiverId);
    const messages = JSON.parse(localStorage.getItem(`chat_${chatId}`)) || [];
    
    // Если это файл, сохраняем его отдельно
    if (message.type === 'file' || message.type === 'image') {
        const fileKey = `file_${message.id}`;
        try {
            localStorage.setItem(fileKey, message.fileData);
        } catch (error) {
            console.error('Ошибка при сохранении файла в localStorage:', error);
            // Если localStorage переполнен, очищаем старые файлы и пробуем снова
            cleanupOldFiles();
            try {
                localStorage.setItem(fileKey, message.fileData);
            } catch (error2) {
                console.error('Не удалось сохранить файл даже после очистки:', error2);
                alert('Не удалось сохранить файл. Возможно, он слишком большой.');
                return;
            }
        }
        
        // Создаем копию сообщения без fileData для экономии места
        const messageCopy = { ...message };
        delete messageCopy.fileData;
        if (message.type === 'image') {
            delete messageCopy.imageData;
        }
        messages.push(messageCopy);
    } else {
        messages.push(message);
    }
    
    localStorage.setItem(`chat_${chatId}`, JSON.stringify(messages));
}

// Добавить сообщение в чат
function addMessageToChat(message) {
    const chatMessages = document.getElementById('chatMessages');
    
    // Убираем пустое состояние
    const emptyChat = chatMessages.querySelector('.empty-chat');
    if (emptyChat) {
        emptyChat.remove();
    }
    
    const messageDiv = createMessageElement(message);
    chatMessages.appendChild(messageDiv);
    
    // Прокручиваем к последнему сообщению
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Получить ID чата
function getChatId(user1Id, user2Id) {
    return [user1Id, user2Id].sort().join('_');
}

// Обновить список чатов
async function updateChatsList() {
    const chatsList = document.getElementById('chatsList');
    
    try {
        // Получаем все чаты текущего пользователя
        const userChats = await getAllUserChats();
        
        if (userChats.length === 0) {
            chatsList.innerHTML = '<div class="empty-state"><p class="empty-text">Здесь как то пустовато...</p></div>';
        } else {
            chatsList.innerHTML = '';
            userChats.forEach(chat => {
                const chatItem = createChatItem(chat);
                chatsList.appendChild(chatItem);
            });
        }
    } catch (error) {
        console.error('Ошибка при обновлении списка чатов:', error);
        chatsList.innerHTML = '<div class="empty-state"><p class="empty-text">Ошибка загрузки чатов</p></div>';
    }
}

// Получить все чаты пользователя
async function getAllUserChats() {
    const chats = [];
    const chatIds = new Set();
    
    try {
        // Загружаем чаты из Firebase
        const chatsSnapshot = await getDocs(collection(db, "chats"));
        
        chatsSnapshot.forEach(doc => {
            const chatData = doc.data();
            
            // Проверяем, участвует ли текущий пользователь в этом чате
            if (chatData.participants && chatData.participants.includes(currentUser.id)) {
                const otherUserId = chatData.participants.find(id => id !== currentUser.id);
                
                if (otherUserId && !chatIds.has(otherUserId)) {
                    const otherUser = allUsers.find(u => u.id === otherUserId);
                    if (otherUser) {
                        chatIds.add(otherUserId);
                        chats.push({
                            user: otherUser,
                            lastMessage: chatData.lastMessage || '',
                            lastMessageTime: chatData.lastMessageTime || 0,
                            lastMessageSender: chatData.lastMessageSender || '',
                            unreadCount: 0 // Можно добавить подсчет непрочитанных
                        });
                    }
                }
            }
        });
        
        // Загружаем закрепленные чаты из localStorage
        const savedPinnedChats = localStorage.getItem('pinnedChats');
        if (savedPinnedChats) {
            pinnedChats = JSON.parse(savedPinnedChats);
        }
        
        // Сортируем чаты: сначала закрепленные, затем по времени последнего сообщения
        chats.sort((a, b) => {
            const aPinned = pinnedChats.includes(a.user.id);
            const bPinned = pinnedChats.includes(b.user.id);
            
            if (aPinned && !bPinned) return -1;
            if (!aPinned && bPinned) return 1;
            
            return b.lastMessageTime - a.lastMessageTime;
        });
        
    } catch (error) {
        console.error('Ошибка при загрузке чатов из Firebase:', error);
        
        // Fallback к локальному хранилищу
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('chat_')) {
                const messages = JSON.parse(localStorage.getItem(key)) || [];
                
                if (messages.length > 0) {
                    // Находим сообщения с участием текущего пользователя
                    const userMessage = messages.find(m => 
                        m.senderId === currentUser.id || m.receiverId === currentUser.id
                    );
                    
                    if (userMessage) {
                        const otherUserId = userMessage.senderId === currentUser.id ? 
                            userMessage.receiverId : userMessage.senderId;
                        
                        if (!chatIds.has(otherUserId)) {
                            const otherUser = allUsers.find(u => u.id === otherUserId);
                            if (otherUser) {
                                chatIds.add(otherUserId);
                                
                                // Получаем последнее сообщение
                                const lastMessage = messages[messages.length - 1];
                                chats.push({
                                    user: otherUser,
                                    lastMessage: lastMessage.text || '',
                                    lastMessageTime: lastMessage.timestamp || 0,
                                    lastMessageSender: lastMessage.senderId || '',
                                    unreadCount: 0
                                });
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Сортируем чаты по времени последнего сообщения
    chats.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
    
    return chats;
}

// Создать элемент чата
function createChatItem(chat) {
    const div = document.createElement('div');
    div.className = 'chat-item';
    div.onclick = () => openChatWithUser(chat.user.id);
    
    // Используем аватар пользователя или дефолтный
    const avatar = getUserAvatar(chat.user);
    
    // Добавляем классы для статуса онлайн
    let avatarClass = '';
    let statusText = '';
    
    // Проверяем, есть ли у пользователя выбранная рамка
    if (chat.user.selectedFrame) {
        avatarClass = chat.user.selectedFrame;
    } else {
        avatarClass = chat.user.online ? 'online' : 'offline';
    }
    
    statusText = getPresenceText(chat.user);
    
    // Определяем текст последнего сообщения
    let lastMessageText = chat.lastMessage || '';
    
    const isPinned = pinnedChats.includes(chat.user.id);
    
    div.innerHTML = `
        <div class="avatar-container" style="position: relative;">
            <img src="${avatar}" alt="${chat.user.username}" class="chat-item-avatar ${avatarClass}" data-user-id="${chat.user.id}">
        </div>
        <div class="chat-item-info">
            <div class="chat-item-username">
                <span class="username-pill">@${chat.user.username}</span>
                ${isPinned ? '<span class="pin-icon">📌</span>' : ''}
            </div>
            <div class="chat-item-last-message">${lastMessageText || '&nbsp;'}</div>
        </div>
    `;
    
    // Добавляем премиум индикатор если нужно
    const avatarImg = div.querySelector('.chat-item-avatar');
    if (isPremiumUser(chat.user.username)) {
        addPremiumIndicator(avatarImg, chat.user.username);
    }
    
    // Добавляем обработчик правого клика для контекстного меню
    div.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        showChatContextMenu(event, chat.user);
    });
    
    return div;
}

// Звонки
async function makeCall() {
    if (!currentChat) return;
    
    try {
        // Создаем запись о звонке в Firebase
        const callId = Date.now().toString();
        await setDoc(doc(db, "calls", callId), {
            callId: callId,
            callerId: currentUser.id,
            callerName: currentUser.username,
            receiverId: currentChat.id,
            receiverName: currentChat.username,
            status: 'outgoing', // outgoing, incoming, active, ended
            timestamp: Date.now(),
            createdAt: Date.now()
        });
        
        // Показываем модальное окно исходящего звонка
        const modal = document.getElementById('outgoingCallModal');
        const avatar = document.getElementById('outgoingCallAvatar');
        const username = document.getElementById('outgoingCallName');
        
        // Заполняем данные пользователя
        avatar.src = getUserAvatar(currentChat);
        username.textContent = currentChat.username;
        
        // Добавляем премиум индикатор если нужно
        if (isPremiumUser(currentChat.username)) {
            addPremiumIndicator(avatar, currentChat.username);
        }
        
        // Показываем модальное окно
        modal.classList.remove('hidden');
        
        console.log(`Звонок пользователю ${currentChat.username}...`);
        
    } catch (error) {
        console.error('Ошибка при создании звонка:', error);
        alert('Ошибка при создании звонка');
    }
}

// Отменить исходящий звонок
function cancelOutgoingCall() {
    document.getElementById('outgoingCallModal').classList.add('hidden');
}

// Показать входящий звонок
function showIncomingCall(callData) {
    const modal = document.getElementById('incomingCallModal');
    const avatar = document.getElementById('callerAvatar');
    const name = document.getElementById('callerName');
    const username = document.getElementById('callerUsername');
    
    // Находим данные звонящего
    const caller = allUsers.find(u => u.id === callData.callerId);
    if (caller) {
        avatar.src = getUserAvatar(caller);
        name.textContent = caller.username;
        username.textContent = caller.username;
        
        // Добавляем премиум индикатор если нужно
        if (isPremiumUser(caller.username)) {
            addPremiumIndicator(avatar, caller.username);
        }
    }
    
    // Сохраняем данные звонка
    activeCall = callData;
    
    // Показываем модальное окно
    modal.classList.remove('hidden');
    
    // Автоматически завершаем звонок через 30 секунд, если не принят
    setTimeout(() => {
        if (activeCall && activeCall.status === 'outgoing') {
            declineCall();
        }
    }, 30000);
}

// Принять звонок
async function acceptCall() {
    if (!activeCall) return;
    
    try {
        // Обновляем статус звонка в Firebase
        await setDoc(doc(db, "calls", activeCall.callId), {
            ...activeCall,
            status: 'active',
            answeredAt: Date.now()
        }, { merge: true });
        
        document.getElementById('incomingCallModal').classList.add('hidden');
        document.getElementById('activeCallModal').classList.remove('hidden');
        
        // Начинаем таймер звонка
        startCallTimer();
        
    } catch (error) {
        console.error('Ошибка при принятии звонка:', error);
    }
}

// Показать активный звонок
function showActiveCall(callData) {
    const modal = document.getElementById('activeCallModal');
    const avatar = document.getElementById('activeCallAvatar');
    const name = document.getElementById('activeCallName');
    
    // Определяем собеседника
    const otherUserId = callData.callerId === currentUser.id ? callData.receiverId : callData.callerId;
    const otherUser = allUsers.find(u => u.id === otherUserId);
    
    if (otherUser) {
        avatar.src = getUserAvatar(otherUser);
        name.textContent = otherUser.username;
        
        // Добавляем премиум индикатор если нужно
        if (isPremiumUser(otherUser.username)) {
            addPremiumIndicator(avatar, otherUser.username);
        }
    }
    
    // Показываем модальное окно
    modal.classList.remove('hidden');
    
    // Начинаем таймер звонка
    startCallTimer();
}

// Отклонить звонок
async function declineCall() {
    if (!activeCall) return;
    
    try {
        // Обновляем статус звонка в Firebase
        await setDoc(doc(db, "calls", activeCall.callId), {
            ...activeCall,
            status: 'ended',
            endedAt: Date.now(),
            endedBy: currentUser.id
        }, { merge: true });
        
        document.getElementById('incomingCallModal').classList.add('hidden');
        activeCall = null;
        
    } catch (error) {
        console.error('Ошибка при отклонении звонка:', error);
    }
}

// Завершить звонок
async function endCall() {
    if (!activeCall) return;
    
    try {
        // Обновляем статус звонка в Firebase
        await setDoc(doc(db, "calls", activeCall.callId), {
            ...activeCall,
            status: 'ended',
            endedAt: Date.now(),
            endedBy: currentUser.id
        }, { merge: true });
        
        document.getElementById('activeCallModal').classList.add('hidden');
        if (callTimer) {
            clearInterval(callTimer);
            callTimer = null;
        }
        activeCall = null;
        
    } catch (error) {
        console.error('Ошибка при завершении звонка:', error);
    }
}



// Начать таймер звонка
function startCallTimer() {
    callStartTime = Date.now();
    callTimer = setInterval(() => {
        const elapsed = Date.now() - callStartTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        
        document.getElementById('callTimer').textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}

// Открыть диалог выбора изображения
function openImageUpload() {
    document.getElementById('imageUpload').click();
}

// Открыть меню выбора типа файла
function openFileUploadMenu() {
    console.log('openFileUploadMenu вызвана');
    
    // Проверяем, есть ли активный чат
    if (!currentChat) {
        alert('Сначала выберите чат для отправки файла');
        return;
    }
    
    // Создаем модальное окно для выбора типа файла
    const modal = document.createElement('div');
    modal.className = 'file-upload-modal';
    modal.innerHTML = `
        <div class="file-upload-content">
            <div class="file-upload-header">
                <h3>Выберите тип файла</h3>
                <button class="close-button" onclick="closeFileUploadMenu()">×</button>
            </div>
            <div class="file-upload-options">
                <div class="file-option" onclick="selectFileType('image')">
                    <div class="file-option-icon">🖼️</div>
                    <div class="file-option-text">
                        <div class="file-option-title">Фото/Изображение</div>
                        <div class="file-option-desc">JPG, PNG, GIF, WebP</div>
                    </div>
                </div>
                <div class="file-option" onclick="selectFileType('audio')">
                    <div class="file-option-icon">🎵</div>
                    <div class="file-option-text">
                        <div class="file-option-title">Аудио файл</div>
                        <div class="file-option-desc">MP3, WAV, OGG, FLAC</div>
                    </div>
                </div>
                <div class="file-option" onclick="selectFileType('video')">
                    <div class="file-option-icon">🎬</div>
                    <div class="file-option-text">
                        <div class="file-option-title">Видео файл</div>
                        <div class="file-option-desc">MP4, AVI, MKV, MOV</div>
                    </div>
                </div>
                <div class="file-option" onclick="selectFileType('document')">
                    <div class="file-option-icon">📄</div>
                    <div class="file-option-text">
                        <div class="file-option-title">Документ</div>
                        <div class="file-option-desc">PDF, DOC, TXT, RTF</div>
                    </div>
                </div>
                <div class="file-option" onclick="selectFileType('archive')">
                    <div class="file-option-icon">📦</div>
                    <div class="file-option-text">
                        <div class="file-option-title">Архив</div>
                        <div class="file-option-desc">ZIP, RAR, 7Z, TAR</div>
                    </div>
                </div>
                <div class="file-option" onclick="selectFileType('any')">
                    <div class="file-option-icon">📁</div>
                    <div class="file-option-text">
                        <div class="file-option-title">Любой файл</div>
                        <div class="file-option-desc">Все типы файлов</div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Анимация появления
    setTimeout(() => modal.classList.add('show'), 10);
}

// Закрыть меню выбора файла
function closeFileUploadMenu() {
    const modal = document.querySelector('.file-upload-modal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    }
}

// Выбрать тип файла
function selectFileType(type) {
    console.log('selectFileType вызвана с типом:', type);
    closeFileUploadMenu();
    
    let inputId = 'imageUpload';
    switch (type) {
        case 'image':
            inputId = 'imageUpload';
            break;
        case 'audio':
            inputId = 'audioUpload';
            break;
        case 'video':
            inputId = 'videoUpload';
            break;
        case 'document':
            inputId = 'documentUpload';
            break;
        case 'archive':
            inputId = 'archiveUpload';
            break;
        case 'any':
        default:
            inputId = 'imageUpload';
            break;
    }
    
    console.log('Кликаем по input с ID:', inputId);
    document.getElementById(inputId).click();
}

// Обработка загрузки файлов для отправки
async function handleFileUpload(event) {
    console.log('handleFileUpload вызвана');
    const file = event.target.files[0];
    console.log('Выбранный файл:', file);
    console.log('Текущий чат:', currentChat);
    
    if (file && currentChat) {
        console.log('Файл и чат найдены, начинаем обработку');
        // Проверяем размер файла (максимум 50MB)
        const maxSize = 50 * 1024 * 1024; // 50MB
        if (file.size > maxSize) {
            alert('Файл слишком большой. Максимальный размер: 50MB');
            event.target.value = '';
            return;
        }
        
        const reader = new FileReader();
        reader.onload = async function(e) {
            console.log('Файл прочитан, начинаем создание сообщения');
            const fileData = e.target.result;
            
            // Определяем тип файла
            const fileType = getFileType(file);
            console.log('Тип файла:', fileType);
            
            // Проверяем размер файла для сохранения в localStorage
            const maxLocalStorageSize = 5 * 1024 * 1024; // 5MB
            if (file.size > maxLocalStorageSize) {
                alert('Файл слишком большой для отправки. Максимальный размер: 5MB');
                event.target.value = '';
                return;
            }
            
            // Проверяем доступное место в localStorage
            const estimatedSize = file.size * 1.37; // base64 увеличивает размер примерно на 37%
            const localStorageSize = JSON.stringify(localStorage).length;
            const maxLocalStorage = 5 * 1024 * 1024; // 5MB лимит localStorage
            
            if (localStorageSize + estimatedSize > maxLocalStorage) {
                // Очищаем старые файлы
                cleanupOldFiles();
                
                // Проверяем снова после очистки
                const localStorageSizeAfterCleanup = JSON.stringify(localStorage).length;
                if (localStorageSizeAfterCleanup + estimatedSize > maxLocalStorage) {
                    alert('Недостаточно места для сохранения файла. Попробуйте удалить старые файлы или выбрать файл меньшего размера.');
                    event.target.value = '';
                    return;
                }
            }
            
            // Создаем сообщение с файлом
            const message = {
                id: Date.now().toString(),
                type: fileType === 'image' ? 'image' : 'file',
                text: '', // Добавляем пустое поле text для совместимости
                fileName: file.name,
                fileSize: file.size,
                fileType: fileType,
                fileData: fileData,
                mimeType: file.type,
                senderId: currentUser.id,
                receiverId: currentChat.id,
                timestamp: Date.now(),
                senderName: currentUser.username
            };
            console.log('Сообщение создано:', message);
            
            // Если это изображение, добавляем imageData для совместимости
            if (fileType === 'image') {
                message.imageData = fileData;
            }
            
            // Если это аудио, добавляем информацию о длительности
            if (fileType === 'audio') {
                message.audioDuration = await getAudioDuration(file);
            }
            
            try {
                console.log('Начинаем сохранение в Firebase');
                // Сохраняем сообщение в Firebase
                await saveMessageToFirebase(message);
                console.log('Сообщение сохранено в Firebase');
                
                // Очищаем input файла
                event.target.value = '';
                
                // Обновляем список чатов
                updateChatsList();
                
                // Показываем уведомление об успешной отправке
                showFileUploadSuccess(file.name);
                console.log('Файл успешно отправлен:', file.name);
                
                // Очищаем старые файлы
                cleanupOldFiles();
            } catch (error) {
                console.error('Ошибка при отправке файла:', error);
                alert('Ошибка при отправке файла: ' + error.message);
            }
        };
        
        reader.onerror = function() {
            alert('Ошибка при чтении файла');
            event.target.value = '';
        };
        
        reader.readAsDataURL(file);
    }
}

// Получить длительность аудио файла
function getAudioDuration(file) {
    return new Promise((resolve) => {
        const audio = new Audio();
        audio.preload = 'metadata';
        
        audio.onloadedmetadata = function() {
            resolve(Math.round(audio.duration));
        };
        
        audio.onerror = function() {
            // Тихо игнорируем ошибки загрузки метаданных
            resolve(null);
        };
        
        audio.src = URL.createObjectURL(file);
    });
}

// Показать уведомление об успешной отправке файла
function showFileUploadSuccess(fileName) {
    const notification = document.createElement('div');
    notification.className = 'file-upload-notification';
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">✅</span>
            <span class="notification-text">Файл "${fileName}" отправлен</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Анимация появления
    setTimeout(() => notification.classList.add('show'), 10);
    
    // Автоматическое скрытие через 3 секунды
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Определить тип файла по расширению
function getFileType(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    
    // Изображения
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'tif'].includes(extension)) {
        return 'image';
    }
    
    // Документы
    if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'xls', 'xlsx', 'ppt', 'pptx', 'csv'].includes(extension)) {
        return 'document';
    }
    
    // Архивы
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'lzma'].includes(extension)) {
        return 'archive';
    }
    
    // Аудио
    if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'wma', 'm4a', 'opus', 'amr', 'mid', 'midi'].includes(extension)) {
        return 'audio';
    }
    
    // Видео
    if (['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'm4v', '3gp', 'ogv', 'ts', 'mts'].includes(extension)) {
        return 'video';
    }
    
    // Другие файлы
    return 'other';
}

// Форматировать размер файла
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Б';
    
    const k = 1024;
    const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Открыть изображение в полном размере
function openImageModal(imageData) {
    // Создаем модальное окно для просмотра изображения
    const modal = document.createElement('div');
    modal.className = 'modal image-modal';
    modal.style.display = 'flex';
    
    modal.innerHTML = `
        <div class="modal-content image-modal-content">
            <div class="image-modal-header">
                <button class="close-button" onclick="this.closest('.image-modal').remove()">×</button>
            </div>
            <div class="image-modal-body">
                <img src="${imageData}" alt="Изображение" class="full-size-image">
            </div>
        </div>
    `;
    
    // Добавляем модальное окно на страницу
    document.body.appendChild(modal);
    
    // Закрытие по клику вне изображения
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });
    
    // Закрытие по Escape
    document.addEventListener('keydown', function closeOnEscape(e) {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', closeOnEscape);
        }
    });
}



// Закрытие модального окна при клике вне его
document.addEventListener('click', function(event) {
    const modal = document.getElementById('profileModal');
    const userProfileModal = document.getElementById('userProfileModal');
    const incomingCallModal = document.getElementById('incomingCallModal');
    const outgoingCallModal = document.getElementById('outgoingCallModal');
    const activeCallModal = document.getElementById('activeCallModal');
    const profileMenu = document.getElementById('profileMenu');
    const profileAvatar = document.querySelector('.profile-avatar');
    
    // Закрытие модального окна настроек профиля
    if (modal && !modal.classList.contains('hidden')) {
        if (event.target === modal) {
            closeProfileSettings();
        }
    }
    
    // Закрытие модального окна профиля пользователя
    if (userProfileModal && !userProfileModal.classList.contains('hidden')) {
        if (event.target === userProfileModal) {
            closeUserProfileModal();
        }
    }
    
    // Закрытие модального окна входящего звонка
    if (incomingCallModal && !incomingCallModal.classList.contains('hidden')) {
        if (event.target === incomingCallModal) {
            declineCall();
        }
    }
    
    // Закрытие модального окна исходящего звонка
    if (outgoingCallModal && !outgoingCallModal.classList.contains('hidden')) {
        if (event.target === outgoingCallModal) {
            cancelOutgoingCall();
        }
    }
    
    // Закрытие модального окна активного звонка
    if (activeCallModal && !activeCallModal.classList.contains('hidden')) {
        if (event.target === activeCallModal) {
            // Не закрываем активный звонок при клике вне окна
            return;
        }
    }
    
    // Закрытие меню профиля
    if (profileMenu && !profileMenu.classList.contains('hidden')) {
        if (!profileAvatar.contains(event.target) && !profileMenu.contains(event.target)) {
            profileMenu.classList.add('hidden');
        }
    }
});

// Обработка клавиши Escape
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        // Закрываем модальные окна
        closeProfileSettings();
        closeUserProfileModal();
        
        // Закрываем модальные окна звонков
        document.getElementById('incomingCallModal').classList.add('hidden');
        document.getElementById('outgoingCallModal').classList.add('hidden');
        
        // Закрываем меню профиля
        document.getElementById('profileMenu').classList.add('hidden');
        
        // Закрываем результаты поиска
        hideSearchResults();
        
        // Закрываем контекстное меню сообщений
        hideMessageContextMenu();
    }
});

// Функция для проверки доступности имени пользователя (заглушка)
function checkUsernameAvailability(username) {
    // В реальном приложении здесь был бы запрос к серверу
    return new Promise((resolve) => {
        setTimeout(() => {
            // Имитируем проверку - случайно возвращаем доступность
            const isAvailable = Math.random() > 0.3; // 70% шанс что имя доступно
            resolve(isAvailable);
        }, 500);
    });
}

// Функции для контекстного меню сообщений
function showMessageContextMenu(event, message) {
    event.preventDefault();
    
    // Показываем контекстное меню только для своих сообщений
    if (message.senderId !== currentUser.id) {
        return;
    }
    
    selectedMessage = message;
    const contextMenu = document.getElementById('messageContextMenu');
    
    // Определяем тип события для мобильных устройств
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isTouchEvent = event.type === 'touchstart' || event.type === 'touchend';
    
    // Получаем размеры меню и экрана
    const menuWidth = 180; // Ширина меню из CSS
    const menuHeight = 80; // Примерная высота меню
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    
    // Вычисляем позицию с учетом границ экрана
    let left, top;
    
    if (isMobile && isTouchEvent) {
        // Для мобильных устройств используем координаты касания
        const touch = event.touches ? event.touches[0] : event.changedTouches[0];
        left = touch.clientX;
        top = touch.clientY;
    } else {
        // Для десктопа используем координаты мыши
        left = event.pageX;
        top = event.pageY;
    }
    
    // Если меню выходит за правый край, смещаем влево
    if (left + menuWidth > screenWidth) {
        left = left - menuWidth;
    }
    
    // Если меню выходит за нижний край, смещаем вверх
    if (top + menuHeight > screenHeight) {
        top = top - menuHeight;
    }
    
    // Позиционируем меню
    contextMenu.style.left = left + 'px';
    contextMenu.style.top = top + 'px';
    contextMenu.classList.remove('hidden');
    
    // Добавляем обработчик для скрытия меню при клике вне его
    setTimeout(() => {
        document.addEventListener('click', hideMessageContextMenu);
        if (isMobile) {
            document.addEventListener('touchstart', hideMessageContextMenu);
        }
    }, 100);
}

function hideMessageContextMenu() {
    const contextMenu = document.getElementById('messageContextMenu');
    contextMenu.classList.add('hidden');
    selectedMessage = null;
    document.removeEventListener('click', hideMessageContextMenu);
    document.removeEventListener('touchstart', hideMessageContextMenu);
}

// Показать модальное окно очистки чатов
function showClearChatsModal() {
    const modal = document.getElementById('clearChatsModal');
    modal.classList.remove('hidden');
}

// Закрыть модальное окно очистки чатов
function closeClearChatsModal() {
    const modal = document.getElementById('clearChatsModal');
    modal.classList.add('hidden');
}

// Подтвердить очистку всех чатов
function confirmClearAllChats() {
    if (currentUser) {
        // Получаем все чаты текущего пользователя
        const userChats = getAllUserChats(currentUser.id);
        
        // Удаляем все чаты из localStorage
        userChats.forEach(chatId => {
            localStorage.removeItem(`chat_${chatId}`);
            localStorage.removeItem(`hidden_${currentUser.id}_${chatId}`);
        });
        
        // Обновляем отображение чатов
        updateChatsList();
        
        // Закрываем модальное окно
        closeClearChatsModal();
        
        // Если находимся в чате, возвращаемся к списку чатов
        if (currentChat) {
            backToChats();
        }
    }
}

function deleteMessageForMe() {
    if (!selectedMessage || !currentChat) return;
    
    const chatId = getChatId(currentUser.id, currentChat.id);
    
    // Синхронизируем удаление (только для себя)
    syncMessageDeletion(selectedMessage.id, chatId, false);
    
    // Находим элемент сообщения на странице и применяем эффект испарения
    const messageElement = document.querySelector(`[data-message-id="${selectedMessage.id}"]`);
    if (messageElement) {
        messageElement.classList.add('fade-out');
        
        // После завершения анимации обновляем отображение
        setTimeout(() => {
            loadChatMessages(currentChat.id);
        }, 500);
    } else {
        // Если элемент не найден, обновляем сразу
        loadChatMessages(currentChat.id);
    }
    
    hideMessageContextMenu();
}

function deleteMessageForEveryone() {
    if (!selectedMessage || !currentChat) return;
    
    const chatId = getChatId(currentUser.id, currentChat.id);
    const messages = JSON.parse(localStorage.getItem(`chat_${chatId}`)) || [];
    
    // Удаляем сообщение из массива
    const messageIndex = messages.findIndex(m => m.id === selectedMessage.id);
    if (messageIndex !== -1) {
        messages.splice(messageIndex, 1);
        localStorage.setItem(`chat_${chatId}`, JSON.stringify(messages));
        
        // Синхронизируем удаление (для всех)
        syncMessageDeletion(selectedMessage.id, chatId, true);
        
        // Находим элемент сообщения на странице и применяем эффект испарения
        const messageElement = document.querySelector(`[data-message-id="${selectedMessage.id}"]`);
        if (messageElement) {
            messageElement.classList.add('fade-out');
            
            // После завершения анимации обновляем отображение
            setTimeout(() => {
                displayMessages(messages);
                updateChatsList();
            }, 500);
        } else {
            // Если элемент не найден, обновляем сразу
            displayMessages(messages);
            updateChatsList();
        }
    }
    
    hideMessageContextMenu();
}

// Показать контекстное меню чата
function showChatContextMenu(event, user) {
    event.preventDefault();
    
    // Скрываем существующее контекстное меню
    hideChatContextMenu();
    
    const contextMenu = document.getElementById('chatContextMenu');
    const isPinned = pinnedChats.includes(user.id);
    
    // Сохраняем ID пользователя в dataset
    contextMenu.dataset.userId = user.id;
    
    // Обновляем текст кнопки закрепления
    const pinButton = contextMenu.querySelector('.pin-chat-btn');
    pinButton.textContent = isPinned ? 'Открепить чат' : 'Закрепить чат';
    
    // Показываем контекстное меню
    contextMenu.style.display = 'block';
    contextMenu.style.left = event.pageX - 10 + 'px';
    contextMenu.style.top = event.pageY - 10 + 'px';
    
    // Добавляем обработчик клика вне меню для его скрытия
    document.addEventListener('click', hideChatContextMenu);
}

// Скрыть контекстное меню чата
function hideChatContextMenu() {
    const contextMenu = document.getElementById('chatContextMenu');
    contextMenu.style.display = 'none';
    delete contextMenu.dataset.userId;
    document.removeEventListener('click', hideChatContextMenu);
}

// Закрепить сообщение
async function pinMessage() {
    if (!selectedMessage || !currentChat) return;
    
    try {
        const chatId = getChatId(currentUser.id, currentChat.id);
        
        // Сохраняем закрепленное сообщение в Firebase
        await setDoc(doc(db, "pinnedMessages", chatId), {
            chatId: chatId,
            messageId: selectedMessage.id,
            messageText: selectedMessage.text,
            senderId: selectedMessage.senderId,
            senderName: selectedMessage.senderName || getUserById(selectedMessage.senderId)?.username || 'Неизвестный',
            timestamp: Date.now(),
            createdAt: Date.now()
        });
        
        // Обновляем локальное состояние
        pinnedMessages[chatId] = selectedMessage.id;
        localStorage.setItem('pinnedMessages', JSON.stringify(pinnedMessages));
        
        // Обновляем отображение закрепленного сообщения
        updatePinnedMessageDisplay();
        
        // Скрываем контекстное меню
        hideMessageContextMenu();
        
    } catch (error) {
        console.error('Ошибка при закреплении сообщения:', error);
    }
}

// Открепить сообщение
async function unpinMessage(event) {
    event.stopPropagation();
    if (!currentChat) return;
    
    try {
        const chatId = getChatId(currentUser.id, currentChat.id);
        
        // Удаляем закрепленное сообщение из Firebase
        await setDoc(doc(db, "pinnedMessages", chatId), {
            chatId: chatId,
            messageId: null,
            timestamp: Date.now()
        });
        
        // Обновляем локальное состояние
        delete pinnedMessages[chatId];
        localStorage.setItem('pinnedMessages', JSON.stringify(pinnedMessages));
        
        // Скрываем отображение закрепленного сообщения
        hidePinnedMessageDisplay();
        
    } catch (error) {
        console.error('Ошибка при откреплении сообщения:', error);
    }
}

// Обновить отображение закрепленного сообщения
function updatePinnedMessageDisplay() {
    if (!currentChat || !currentPinnedMessage) {
        hidePinnedMessageDisplay();
        return;
    }
    
    const container = document.getElementById('pinnedMessageContainer');
    const senderElement = document.getElementById('pinnedSender');
    const textElement = document.getElementById('pinnedText');
    
    senderElement.textContent = currentPinnedMessage.senderName;
    
    // Обрезаем текст если он слишком длинный
    const maxLength = 50;
    const text = currentPinnedMessage.messageText;
    textElement.textContent = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    
    container.classList.remove('hidden');
}

// Скрыть отображение закрепленного сообщения
function hidePinnedMessageDisplay() {
    const container = document.getElementById('pinnedMessageContainer');
    container.classList.add('hidden');
}

// Прокрутить к закрепленному сообщению
function scrollToPinnedMessage() {
    if (!currentPinnedMessage) return;
    
    const messageElement = document.querySelector(`[data-message-id="${currentPinnedMessage.messageId}"]`);
    if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Добавляем подсветку
        messageElement.style.backgroundColor = '#0088cc20';
        setTimeout(() => {
            messageElement.style.backgroundColor = '';
        }, 2000);
    }
}

// Загрузить закрепленное сообщение для чата
async function loadPinnedMessage(chatId) {
    try {
        const pinnedDoc = await getDocs(query(collection(db, "pinnedMessages"), where("chatId", "==", chatId)));
        
        if (!pinnedDoc.empty) {
            const pinnedData = pinnedDoc.docs[0].data();
            if (pinnedData.messageId) {
                currentPinnedMessage = pinnedData;
                updatePinnedMessageDisplay();
                return;
            }
        }
        
        // Если нет закрепленного сообщения
        currentPinnedMessage = null;
        hidePinnedMessageDisplay();
        
    } catch (error) {
        console.error('Ошибка при загрузке закрепленного сообщения:', error);
        currentPinnedMessage = null;
        hidePinnedMessageDisplay();
    }
}

// Закрепить/открепить чат
function togglePinChat() {
    // Получаем пользователя из контекстного меню
    const contextMenu = document.getElementById('chatContextMenu');
    if (!contextMenu || !contextMenu.dataset.userId) return;
    
    const userId = contextMenu.dataset.userId;
    const userIndex = pinnedChats.indexOf(userId);
    
    if (userIndex === -1) {
        // Закрепляем чат
        pinnedChats.push(userId);
    } else {
        // Открепляем чат
        pinnedChats.splice(userIndex, 1);
    }
    
    // Сохраняем в localStorage
    localStorage.setItem('pinnedChats', JSON.stringify(pinnedChats));
    
    // Обновляем список чатов
    updateChatsList();
    
    // Скрываем контекстное меню
    hideChatContextMenu();
}

// Открыть модальное окно ELIXIUM
function openElixiumModal() {
    const modal = document.getElementById('elixiumModal');
    modal.classList.remove('hidden');
}

// Закрыть модальное окно ELIXIUM
function closeElixiumModal() {
    const modal = document.getElementById('elixiumModal');
    modal.classList.add('hidden');
}

// Приобрести ELIXIUM
function purchaseElixium() {
    window.open('https://t.me/astralesapp', '_blank');
}

// Функция для синхронизации удаления сообщений между пользователями
function syncMessageDeletion(messageId, chatId, deleteForAll = false) {
    if (deleteForAll) {
        // Если удаляем для всех, очищаем все списки скрытых сообщений
        const allUsersInChat = [currentUser.id, currentChat.id];
        allUsersInChat.forEach(userId => {
            const hiddenMessagesKey = `hidden_${userId}_${chatId}`;
            let hiddenMessages = JSON.parse(localStorage.getItem(hiddenMessagesKey)) || [];
            hiddenMessages = hiddenMessages.filter(id => id !== messageId);
            localStorage.setItem(hiddenMessagesKey, JSON.stringify(hiddenMessages));
        });
    } else {
        // Если удаляем только для себя, добавляем в список скрытых
        const hiddenMessagesKey = `hidden_${currentUser.id}_${chatId}`;
        let hiddenMessages = JSON.parse(localStorage.getItem(hiddenMessagesKey)) || [];
        if (!hiddenMessages.includes(messageId)) {
            hiddenMessages.push(messageId);
            localStorage.setItem(hiddenMessagesKey, JSON.stringify(hiddenMessages));
        }
    }
}

// Экспорт функций для использования в HTML
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.switchMode = switchMode;
window.handleLogout = handleLogout;
window.toggleProfileMenu = toggleProfileMenu;
window.openProfileSettings = openProfileSettings;
window.closeProfileSettings = closeProfileSettings;
window.openUserProfileModal = openUserProfileModal;
window.closeUserProfileModal = closeUserProfileModal;
window.handleAvatarUpload = handleAvatarUpload;
window.deleteAvatar = deleteAvatar;
window.saveProfileChanges = saveProfileChanges;
window.handleSearch = handleSearch;
window.closeSearchResults = closeSearchResults;
window.viewUserProfile = viewUserProfile;
window.openChatWithUser = openChatWithUser;
window.backToChats = backToChats;
window.handleMessageKeyPress = handleMessageKeyPress;
window.sendMessage = sendMessage;
window.makeCall = makeCall;
window.cancelOutgoingCall = cancelOutgoingCall;
window.acceptCall = acceptCall;
window.declineCall = declineCall;
window.endCall = endCall;

window.openImageUpload = openImageUpload;
window.openFileUploadMenu = openFileUploadMenu;
window.closeFileUploadMenu = closeFileUploadMenu;
window.selectFileType = selectFileType;
window.handleFileUpload = handleFileUpload;
window.playAudioFile = playAudioFile;
window.openImageModal = openImageModal;
window.showMessageContextMenu = showMessageContextMenu;
window.deleteMessageForMe = deleteMessageForMe;
window.deleteMessageForEveryone = deleteMessageForEveryone;
window.syncMessageDeletion = syncMessageDeletion;
window.showChatContextMenu = showChatContextMenu;
window.hideChatContextMenu = hideChatContextMenu;
window.togglePinChat = togglePinChat;
window.pinMessage = pinMessage;
window.unpinMessage = unpinMessage;
window.scrollToPinnedMessage = scrollToPinnedMessage;
window.openImageUpload = openImageUpload;
window.openElixiumModal = openElixiumModal;
window.closeElixiumModal = closeElixiumModal;
window.purchaseElixium = purchaseElixium;
window.openFramesModal = openFramesModal;
window.closeFramesModal = closeFramesModal;
window.selectFrame = selectFrame;
window.toggleSound = toggleSound;
window.updateBioCounter = updateBioCounter;

// Функция обновления счетчика символов в описании
function updateBioCounter() {
    const bioInput = document.getElementById('newBio');
    const bioCounter = document.getElementById('bioCounter');
    
    if (bioInput && bioCounter) {
        const length = bioInput.value.length;
        bioCounter.textContent = length;
        
        // Меняем цвет счетчика если превышен лимит
        if (length > 200) {
            bioCounter.style.color = '#ff4444';
        } else {
            bioCounter.style.color = '#888';
        }
    }
}

// Функции для работы с рамками
function openFramesModal() {
    const modal = document.getElementById('framesModal');
    modal.classList.remove('hidden');
    
    // Показываем текущую выбранную рамку
    updateFramesModalSelection();
}

function closeFramesModal() {
    const modal = document.getElementById('framesModal');
    modal.classList.add('hidden');
}

function updateFramesModalSelection() {
    const frameItems = document.querySelectorAll('.frame-item');
    frameItems.forEach(item => {
        item.classList.remove('selected');
    });
    
    if (currentUser && currentUser.selectedFrame) {
        const selectedItem = document.querySelector(`[onclick="selectFrame('${currentUser.selectedFrame}')"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }
    } else {
        const noFrameItem = document.querySelector('[onclick="selectFrame(\'none\')"]');
        if (noFrameItem) {
            noFrameItem.classList.add('selected');
        }
    }
}

async function selectFrame(frameType) {
    if (!currentUser) return;
    
    try {
        // Обновляем рамку в Firebase
        const userRef = doc(db, "users", currentUser.id);
        await setDoc(userRef, {
            selectedFrame: frameType === 'none' ? null : frameType
        }, { merge: true });
        
        // Обновляем локальное состояние
        currentUser.selectedFrame = frameType === 'none' ? null : frameType;
        localStorage.setItem('astralesUser', JSON.stringify(currentUser));
        
        // Обновляем интерфейс
        updateUserAvatar();
        updateChatsList();
        
        // Обновляем выделение в модальном окне
        updateFramesModalSelection();
        
        console.log(`Рамка изменена на: ${frameType}`);
    } catch (error) {
        console.error('Ошибка при изменении рамки:', error);
    }
}

// Функции для отслеживания онлайн/оффлайн статуса
function setupPageVisibilityTracking() {
    // Отслеживаем видимость страницы
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Отслеживаем закрытие страницы/вкладки
    window.addEventListener('beforeunload', handlePageUnload);
    
    // Отслеживаем фокус окна
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('blur', handleWindowBlur);
    
    // Устанавливаем статус онлайн при загрузке
    if (isLoggedIn && currentUser) {
        setUserOnlineStatus(true);
    }
}

function handleVisibilityChange() {
    if (isLoggedIn && currentUser) {
        if (document.hidden) {
            // Страница скрыта - устанавливаем оффлайн
            setUserOnlineStatus(false);
        } else {
            // Страница видна - устанавливаем онлайн
            setUserOnlineStatus(true);
        }
    }
}

function handlePageUnload() {
    if (isLoggedIn && currentUser) {
        // Устанавливаем оффлайн статус при закрытии
        setUserOnlineStatus(false);
    }
}

function handleWindowFocus() {
    if (isLoggedIn && currentUser) {
        // Окно получило фокус - устанавливаем онлайн
        setUserOnlineStatus(true);
        // Если открыт чат — гарантированно применяем обои после фокуса/перезагрузки
        if (currentChat) {
            setCurrentChat(currentChat);
            applyCurrentChatWallpaper();
        }
    }
}

function handleWindowBlur() {
    if (isLoggedIn && currentUser) {
        // Окно потеряло фокус - устанавливаем оффлайн
        setUserOnlineStatus(false);
    }
}

async function setUserOnlineStatus(online) {
    if (!currentUser) return;
    
    try {
        const userRef = doc(db, "users", currentUser.id);
        await setDoc(userRef, {
            username: currentUser.username,
            avatar: currentUser.avatar,
            online: online,
            lastSeen: online ? null : Date.now(),
            selectedFrame: currentUser.selectedFrame,
            bio: currentUser.bio
        }, { merge: true });
        
        // Обновляем локальное состояние
        currentUser.online = online;
        currentUser.lastSeen = online ? null : Date.now();
        localStorage.setItem('astralesUser', JSON.stringify(currentUser));
        
        console.log(`Пользователь ${currentUser.username} ${online ? 'онлайн' : 'оффлайн'}`);
    } catch (error) {
        console.error('Ошибка при обновлении статуса:', error);
    }
}

// Функция для долгого нажатия на мобильных устройствах
function setupLongPressHandlers() {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile) {
        // Добавляем обработчики для сообщений
        document.addEventListener('touchstart', handleTouchStart, { passive: false });
        document.addEventListener('touchend', handleTouchEnd, { passive: false });
        document.addEventListener('touchmove', handleTouchMove, { passive: false });
    }
}

function handleTouchStart(event) {
    const messageItem = event.target.closest('.message-item');
    if (!messageItem) return;
    
    longPressTimer = setTimeout(() => {
        isLongPress = true;
        messageItem.classList.add('long-press');
        showMessageContextMenu(event, messageItem);
    }, 1000);
}

function handleTouchEnd(event) {
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
    
    if (isLongPress) {
        isLongPress = false;
        const messageItem = event.target.closest('.message-item');
        if (messageItem) {
            messageItem.classList.remove('long-press');
        }
    }
}

function handleTouchMove(event) {
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
    
    if (isLongPress) {
        isLongPress = false;
        const messageItem = event.target.closest('.message-item');
        if (messageItem) {
            messageItem.classList.remove('long-press');
        }
    }
}

// Функции для управления обоями чата теперь находятся в chatSettings.js

// Функция автообновления для мобильных устройств
function setupMobileAutoRefresh() {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile) {
        // Автообновление каждые 5 секунд на мобильных устройствах
        setInterval(() => {
            if (isLoggedIn && currentChat) {
                refreshChatMessages();
            }
        }, 5000);
        
        // Обновление при возвращении в приложение
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && isLoggedIn && currentChat) {
                refreshChatMessages();
            }
        });
    }
}

// Функция обновления сообщений чата
async function refreshChatMessages() {
    if (!currentChat) return;
    
    try {
        // Обновляем сообщения
        await loadChatMessages(currentChat.id);
        
        // Обновляем список чатов
        await loadChatsList();
        
        console.log('Чат обновлен');
    } catch (error) {
        console.error('Ошибка при обновлении чата:', error);
    }
}

// Функция для получения файла по ключу
function getFileByKey(fileKey) {
    return localStorage.getItem(fileKey);
}

// Функция для очистки старых файлов из localStorage
function cleanupOldFiles() {
    const maxFiles = 100; // Максимальное количество файлов в localStorage
    const fileKeys = [];
    
    // Собираем все ключи файлов
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('file_')) {
            fileKeys.push(key);
        }
    }
    
    // Если файлов больше лимита, удаляем самые старые
    if (fileKeys.length > maxFiles) {
        fileKeys.sort(); // Сортируем по времени создания (ID содержит timestamp)
        const filesToRemove = fileKeys.slice(0, fileKeys.length - maxFiles);
        
        filesToRemove.forEach(key => {
            localStorage.removeItem(key);
            console.log('Удален старый файл:', key);
        });
    }
}

// Глобальные функции для доступа из HTML
window.openChatSettingsWrapper = function() {
    if (!currentChat) {
        console.error('Нет активного чата');
        return;
    }
    openChatSettings(currentChat, allUsers);
};

window.closeChatSettingsWrapper = function() {
    closeChatSettings();
};

window.handleWallpaperUpload = function(event) {
    handleWallpaperUpload(event);
};

window.resetWallpaper = function() {
    resetWallpaper();
};

// Обновляем функцию инициализации приложения
function initializeApp() {
    // ... existing initialization code ...
    
    // Добавляем новые инициализации
    setupLongPressHandlers();
    setupMobileAutoRefresh();
    loadChatWallpapers();
    
    // ... rest of initialization code ...
}

// Обновляем функцию открытия чата
function openChat(userId) {
    // ... existing code ...
    
    // Применяем обои для чата
    applyCurrentChatWallpaper();
    
    // ... rest of existing code ...
}

// Streamer Mode API
window.openStreamerModeModal = function() {
    const modal = document.getElementById('streamerModeModal');
    if (modal) modal.classList.remove('hidden');
};

window.closeStreamerModeModal = function() {
    const modal = document.getElementById('streamerModeModal');
    if (modal) modal.classList.add('hidden');
};

window.setStreamerMode = function(enabled) {
    try {
        if (enabled) {
            document.body.classList.add('streamer-mode');
            localStorage.setItem('astralesStreamerMode', 'true');
        } else {
            document.body.classList.remove('streamer-mode');
            localStorage.removeItem('astralesStreamerMode');
        }
    } finally {
        window.closeStreamerModeModal();
    }
};

// Применяем режим стримера при загрузке
document.addEventListener('DOMContentLoaded', () => {
    const enabled = localStorage.getItem('astralesStreamerMode') === 'true';
    if (enabled) {
        document.body.classList.add('streamer-mode');
    }
});
