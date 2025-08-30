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
    onSnapshot
} from './firebase.js';

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



// Инициализация приложения
document.addEventListener('DOMContentLoaded', async function() {
    // Загружаем всех пользователей из Firebase
    await loadAllUsersFromFirebase();
    
    // Проверяем, есть ли сохраненный пользователь
    const savedUser = localStorage.getItem('astralesUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        isLoggedIn = true;
        showChatList();
    }
});

// Загрузка всех пользователей из Firebase
async function loadAllUsersFromFirebase() {
    try {
        const usersSnapshot = await getDocs(collection(db, "users"));
        allUsers = [];
        
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            allUsers.push({
                id: doc.id,
                username: userData.username,
                avatar: userData.avatar || null,
                online: userData.online || false,
                lastSeen: userData.lastSeen || null
            });
        });
        
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
                lastSeen: Date.now()
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
    
    // Заполняем данные пользователя
    avatar.src = getUserAvatar(currentChat);
    username.textContent = currentChat.username;
    
    // Устанавливаем статус
    if (currentChat.online) {
        statusIndicator.className = 'status-indicator online';
        statusText.textContent = 'В сети';
    } else {
        statusIndicator.className = 'status-indicator offline';
        statusText.textContent = 'Не в сети';
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
                online: true
            };
            
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
            online: true
        };
        
        // Сохраняем в Firestore
        await setDoc(doc(db, "users", cred.user.uid), {
            username: username,
            online: true,
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
function showChatList() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('chatList').classList.remove('hidden');
    document.getElementById('userChat').classList.add('hidden');
    
    // Обновляем аватар в интерфейсе
    updateUserAvatar();
    
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
function handleLogout() {
    // Очищаем данные текущего пользователя
    currentUser = null;
    isLoggedIn = false;
    
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
    
    // Заполняем текущими данными
    if (currentUser.avatar) {
        modalAvatar.src = currentUser.avatar;
    } else {
        modalAvatar.src = getDefaultAvatar();
    }
    
    usernameInput.value = currentUser.username;
    
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
        const reader = new FileReader();
        reader.onload = async function(e) {
            const avatarData = e.target.result;
            
            // Обновляем аватар в модальном окне
            document.getElementById('modalAvatar').src = avatarData;
            
            // Сохраняем аватар в пользователе
            currentUser.avatar = avatarData;
            
            try {
                // Сохраняем аватар в Firestore
                await setDoc(doc(db, "users", currentUser.id), {
                    avatar: avatarData,
                    lastSeen: Date.now()
                }, { merge: true });
                
                // Обновляем localStorage текущего пользователя
                localStorage.setItem('astralesUser', JSON.stringify(currentUser));
                
                // Обновляем в общем списке пользователей
                saveUserToAllUsers(currentUser);
                
                // Обновляем аватар в интерфейсе
                updateUserAvatar();
                
                // Обновляем список чатов, чтобы показать новый аватар
                updateChatsList();
            } catch (error) {
                alert('Ошибка при сохранении аватара: ' + error.message);
            }
        };
        reader.readAsDataURL(file);
    }
}

// Сохранение изменений профиля
async function saveProfileChanges() {
    const newUsername = document.getElementById('newUsername').value.trim();
    
    if (newUsername && newUsername !== currentUser.username) {
        // Проверяем, не занято ли имя пользователя
        if (isUsernameTaken(newUsername)) {
            alert('Это имя пользователя уже занято. Выберите другое.');
            return;
        }
        
        // Обновляем имя пользователя
        currentUser.username = newUsername;
    }
    
    try {
        // Сохраняем изменения в Firestore
        await setDoc(doc(db, "users", currentUser.id), {
            username: currentUser.username,
            avatar: currentUser.avatar,
            online: currentUser.online,
            lastSeen: Date.now()
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
    if (currentUser && currentUser.avatar) {
        userAvatar.src = currentUser.avatar;
    } else {
        userAvatar.src = getDefaultAvatar();
    }
}

// Обработка поиска
function handleSearch(event) {
    const searchQuery = event.target.value.toLowerCase().trim();
    
    if (searchQuery.length > 0) {
        // Фильтруем пользователей по поисковому запросу
        const searchResults = allUsers.filter(user => 
            user.username.toLowerCase().includes(searchQuery) && 
            user.id !== currentUser.id
        );
        
        showSearchResults(searchResults);
    } else {
        hideSearchResults();
    }
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
    
    // Используем аватар пользователя или дефолтный
    const avatar = getUserAvatar(user);
    
    div.innerHTML = `
        <img src="${avatar}" alt="${user.username}" class="search-result-avatar">
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
function openChatWithUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (user) {
        currentChat = user;
        openUserChat(user);
        hideSearchResults();
    }
}

// Открыть чат пользователя
function openUserChat(user) {
    document.getElementById('chatList').classList.add('hidden');
    document.getElementById('userChat').classList.remove('hidden');
    
    // Заполняем информацию о пользователе
    document.getElementById('chatUserName').textContent = user.username;
    
    // Используем аватар пользователя или дефолтный
    const chatUserAvatar = document.getElementById('chatUserAvatar');
    chatUserAvatar.src = getUserAvatar(user);
    
    // Добавляем классы для статуса онлайн
    const onlineStatus = document.querySelector('.online-status');
    
    if (user.online) {
        chatUserAvatar.classList.add('online');
        chatUserAvatar.classList.remove('offline');
        onlineStatus.textContent = 'В сети';
        onlineStatus.classList.remove('offline');
    } else {
        chatUserAvatar.classList.add('offline');
        chatUserAvatar.classList.remove('online');
        onlineStatus.textContent = 'Не в сети';
        onlineStatus.classList.add('offline');
    }
    
    // Загружаем сообщения чата
    loadChatMessages(user.id);
}

// Вернуться к списку чатов
function backToChats() {
    document.getElementById('userChat').classList.add('hidden');
    document.getElementById('chatList').classList.remove('hidden');
    currentChat = null;
}

// Загрузить сообщения чата
function loadChatMessages(userId) {
    const chatMessages = document.getElementById('chatMessages');
    const chatId = getChatId(currentUser.id, userId);
    
    // Получаем сообщения из localStorage
    const messages = JSON.parse(localStorage.getItem(`chat_${chatId}`)) || [];
    
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

// Отобразить сообщения
function displayMessages(messages) {
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = '';
    
    messages.forEach(message => {
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
        messageContent = `
            <div class="message-image">
                <img src="${message.imageData}" alt="Изображение" onclick="openImageModal('${message.imageData}')">
            </div>
        `;
    } else if (message.type === 'file') {
        // Определяем иконку для типа файла
        const fileIcon = getFileIcon(message.fileType);
        
        messageContent = `
            <div class="message-file">
                <div class="file-icon">${fileIcon}</div>
                <div class="file-info">
                    <div class="file-name">${message.fileName}</div>
                    <div class="file-size">${formatFileSize(message.fileSize)}</div>
                </div>
                <a href="${message.fileData}" download="${message.fileName}" class="file-download-btn" title="Скачать файл">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M7 10L12 15L17 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M12 15V3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </a>
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
    }
    
    return div;
}



// Получить иконку для типа файла
function getFileIcon(fileType) {
    switch (fileType) {
        case 'image':
            return '🖼️';
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

// Обработка нажатия клавиши в поле сообщения
function handleMessageKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

// Отправить сообщение
function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const messageText = messageInput.value.trim();
    
    if (messageText && currentChat) {
        const message = {
            id: Date.now().toString(),
            text: messageText,
            senderId: currentUser.id,
            receiverId: currentChat.id,
            timestamp: Date.now()
        };
        
        // Сохраняем сообщение
        saveMessage(message);
        
        // Отображаем сообщение
        addMessageToChat(message);
        
        // Очищаем поле ввода
        messageInput.value = '';
        
        // Обновляем список чатов
        updateChatsList();
    }
}

// Сохранить сообщение
function saveMessage(message) {
    const chatId = getChatId(message.senderId, message.receiverId);
    const messages = JSON.parse(localStorage.getItem(`chat_${chatId}`)) || [];
    messages.push(message);
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
function updateChatsList() {
    const chatsList = document.getElementById('chatsList');
    
    // Получаем все чаты текущего пользователя
    const userChats = getAllUserChats();
    
    if (userChats.length === 0) {
        chatsList.innerHTML = '<div class="empty-state"><p class="empty-text">Здесь как то пустовато...</p></div>';
    } else {
        chatsList.innerHTML = '';
        userChats.forEach(chat => {
            const chatItem = createChatItem(chat);
            chatsList.appendChild(chatItem);
        });
    }
}

// Получить все чаты пользователя
function getAllUserChats() {
    const chats = [];
    const chatIds = new Set();
    
    // Проходим по всем ключам localStorage
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
                            // Получаем список скрытых сообщений для текущего пользователя
                            const hiddenMessagesKey = `hidden_${currentUser.id}_${key}`;
                            const hiddenMessages = JSON.parse(localStorage.getItem(hiddenMessagesKey)) || [];
                            
                            // Фильтруем сообщения, убирая скрытые
                            const visibleMessages = messages.filter(message => !hiddenMessages.includes(message.id));
                            
                            if (visibleMessages.length > 0) {
                                const lastMessage = visibleMessages[visibleMessages.length - 1];
                                chats.push({
                                    user: otherUser,
                                    lastMessage: lastMessage,
                                    unreadCount: visibleMessages.filter(m => 
                                        m.receiverId === currentUser.id && !m.read
                                    ).length
                                });
                                chatIds.add(otherUserId);
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Сортируем по времени последнего сообщения
    return chats.sort((a, b) => b.lastMessage.timestamp - a.lastMessage.timestamp);
}

// Создать элемент чата
function createChatItem(chat) {
    const div = document.createElement('div');
    div.className = 'chat-item';
    div.onclick = () => openChatWithUser(chat.user.id);
    
    // Используем аватар пользователя или дефолтный
    const avatar = getUserAvatar(chat.user);
    
    // Добавляем классы для статуса онлайн
    const avatarClass = chat.user.online ? 'online' : 'offline';
    
    // Определяем текст последнего сообщения
    let lastMessageText = '';
    if (chat.lastMessage.type === 'image') {
        lastMessageText = 'Изображение';
    } else if (chat.lastMessage.type === 'file') {
        lastMessageText = `Файл: ${chat.lastMessage.fileName}`;
    } else {
        lastMessageText = chat.lastMessage.text || '';
    }
    
    div.innerHTML = `
        <img src="${avatar}" alt="${chat.user.username}" class="chat-item-avatar ${avatarClass}">
        <div class="chat-item-info">
            <div class="chat-item-username">${chat.user.username}</div>
            <div class="chat-item-last-message">${lastMessageText}</div>
        </div>
    `;
    
    return div;
}

// Звонки
function makeCall() {
    if (!currentChat) return;
    
    // Показываем модальное окно исходящего звонка
    const modal = document.getElementById('outgoingCallModal');
    const avatar = document.getElementById('outgoingCallAvatar');
    const username = document.getElementById('outgoingCallName');
    
    // Заполняем данные пользователя
    avatar.src = getUserAvatar(currentChat);
    username.textContent = currentChat.username;
    
    // Показываем модальное окно
    modal.classList.remove('hidden');
    
    // Имитируем звонок - через 2 секунды показываем входящий звонок у собеседника
    setTimeout(() => {
        // В реальном приложении здесь был бы WebRTC вызов
        // Пока что просто показываем, что звонок идет
        console.log(`Звонок пользователю ${currentChat.username}...`);
    }, 2000);
}

// Отменить исходящий звонок
function cancelOutgoingCall() {
    document.getElementById('outgoingCallModal').classList.add('hidden');
}

// Принять звонок
function acceptCall() {
    document.getElementById('incomingCallModal').classList.add('hidden');
    document.getElementById('activeCallModal').classList.remove('hidden');
    
    // Начинаем таймер звонка
    startCallTimer();
}

// Отклонить звонок
function declineCall() {
    document.getElementById('incomingCallModal').classList.add('hidden');
    if (activeCall) {
        activeCall = null;
    }
}

// Завершить звонок
function endCall() {
    document.getElementById('activeCallModal').classList.add('hidden');
    if (callTimer) {
        clearInterval(callTimer);
        callTimer = null;
    }
    activeCall = null;
}

// Переключить микрофон
function toggleMute() {
    const muteButton = document.getElementById('muteButton');
    const isMuted = muteButton.querySelector('svg').classList.contains('muted');
    
    if (isMuted) {
        // Включаем микрофон
        muteButton.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 1A3 3 0 0 0 9 4V10A3 3 0 0 0 15 10V4A3 3 0 0 0 12 1Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M19 10V9A7 7 0 0 0 5 9V10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12 19V23" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M8 23H16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
    } else {
        // Отключаем микрофон
        muteButton.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="muted">
                <path d="M12 1A3 3 0 0 0 9 4V10A3 3 0 0 0 15 10V4A3 3 0 0 0 12 1Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M19 10V9A7 7 0 0 0 5 9V10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12 19V23" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M8 23H16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
    }
    // В реальном приложении здесь была бы логика отключения микрофона
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

// Обработка загрузки файлов для отправки
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file && currentChat) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const fileData = e.target.result;
            
            // Определяем тип файла
            const fileType = getFileType(file);
            
            // Создаем сообщение с файлом
            const message = {
                id: Date.now().toString(),
                type: fileType === 'image' ? 'image' : 'file', // Изображения остаются как image
                fileName: file.name,
                fileSize: file.size,
                fileType: fileType,
                fileData: fileData,
                mimeType: file.type,
                senderId: currentUser.id,
                receiverId: currentChat.id,
                timestamp: Date.now()
            };
            
            // Если это изображение, добавляем imageData для совместимости
            if (fileType === 'image') {
                message.imageData = fileData;
            }
            
            // Сохраняем сообщение
            saveMessage(message);
            
            // Отображаем сообщение
            addMessageToChat(message);
            
            // Обновляем список чатов
            updateChatsList();
            
            // Очищаем input файла
            event.target.value = '';
        };
        reader.readAsDataURL(file);
    }
}

// Определить тип файла по расширению
function getFileType(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    
    // Изображения
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(extension)) {
        return 'image';
    }
    
    // Документы
    if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'].includes(extension)) {
        return 'document';
    }
    
    // Архивы
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) {
        return 'archive';
    }
    
    // Аудио
    if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'wma'].includes(extension)) {
        return 'audio';
    }
    
    // Видео
    if (['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm'].includes(extension)) {
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
    
    // Получаем размеры меню и экрана
    const menuWidth = 180; // Ширина меню из CSS
    const menuHeight = 80; // Примерная высота меню
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    
    // Вычисляем позицию с учетом границ экрана
    let left = event.pageX;
    let top = event.pageY;
    
    // Если меню выходит за правый край, смещаем влево
    if (left + menuWidth > screenWidth) {
        left = event.pageX - menuWidth;
    }
    
    // Если меню выходит за нижний край, смещаем вверх
    if (top + menuHeight > screenHeight) {
        top = event.pageY - menuHeight;
    }
    
    // Позиционируем меню
    contextMenu.style.left = left + 'px';
    contextMenu.style.top = top + 'px';
    contextMenu.classList.remove('hidden');
    
    // Добавляем обработчик для скрытия меню при клике вне его
    setTimeout(() => {
        document.addEventListener('click', hideMessageContextMenu);
    }, 100);
}

function hideMessageContextMenu() {
    const contextMenu = document.getElementById('messageContextMenu');
    contextMenu.classList.add('hidden');
    selectedMessage = null;
    document.removeEventListener('click', hideMessageContextMenu);
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
window.toggleMute = toggleMute;
window.openImageUpload = openImageUpload;
window.handleFileUpload = handleFileUpload;
window.openImageModal = openImageModal;
window.showMessageContextMenu = showMessageContextMenu;
window.deleteMessageForMe = deleteMessageForMe;
window.deleteMessageForEveryone = deleteMessageForEveryone;
window.syncMessageDeletion = syncMessageDeletion;
