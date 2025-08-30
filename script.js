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
let selectedChatUser = null; // Выбранный пользователь для контекстного меню чата
let pinnedChats = []; // Закрепленные чаты
let pinnedMessages = {}; // Закрепленные сообщения по чатам {chatId: messageId}
let currentPinnedMessage = null; // Текущее закрепленное сообщение



// Инициализация приложения
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Загружаем всех пользователей из Firebase
        await loadAllUsersFromFirebase();
        
        // Настраиваем слушатель изменений в реальном времени
        setupRealtimeUsersListener();
        
        // Проверяем, есть ли сохраненный пользователь
        const savedUser = localStorage.getItem('astralesUser');
        if (savedUser) {
            currentUser = JSON.parse(savedUser);
            isLoggedIn = true;
            showChatList();
        }
        
        // Настраиваем отслеживание видимости страницы
        setupPageVisibilityTracking();
    } catch (error) {
        console.error('Ошибка при инициализации:', error);
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
                selectedFrame: userData.selectedFrame || null
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
                    selectedFrame: userData.selectedFrame || null
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
    
    // Устанавливаем статус и рамку
    const userProfileAvatar = avatar.parentElement;
    
    // Удаляем все классы статуса
    userProfileAvatar.classList.remove('bunny-frame');
    statusIndicator.classList.remove('online', 'offline');
    
    // Проверяем, есть ли у пользователя выбранная рамка
    if (currentChat.selectedFrame) {
        userProfileAvatar.classList.add(currentChat.selectedFrame);
    }
    
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
                online: true,
                lastSeen: null,
                selectedFrame: userDataObj.selectedFrame || null
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
    
    // Добавляем выбранную рамку если есть
    const currentAvatarContainer = modalAvatar.parentElement;
    if (currentUser.selectedFrame) {
        currentAvatarContainer.classList.add(currentUser.selectedFrame);
    } else {
        currentAvatarContainer.classList.remove('bunny-frame');
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
    const profileAvatar = userAvatar.parentElement;
    
    if (currentUser && currentUser.avatar) {
        userAvatar.src = currentUser.avatar;
    } else {
        userAvatar.src = getDefaultAvatar();
    }
    
    // Добавляем выбранную рамку если есть
    if (currentUser && currentUser.selectedFrame) {
        profileAvatar.classList.add(currentUser.selectedFrame);
    } else {
        // Удаляем только если у пользователя нет выбранной рамки
        profileAvatar.classList.remove('bunny-frame');
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
    
    // Добавляем класс рамки если есть
    if (user.selectedFrame) {
        div.classList.add(user.selectedFrame);
    }
    
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
    chatUserAvatar.classList.remove('online', 'offline', 'bunny-frame');
    
    // Проверяем, есть ли у пользователя выбранная рамка
    if (user.selectedFrame) {
        chatUserAvatar.classList.add(user.selectedFrame);
    } else if (user.online) {
        chatUserAvatar.classList.add('online');
        onlineStatus.textContent = 'В сети';
        onlineStatus.classList.remove('offline');
    } else {
        chatUserAvatar.classList.add('offline');
        onlineStatus.textContent = 'Не в сети';
        onlineStatus.classList.add('offline');
    }
    
    // Загружаем закрепленное сообщение
    const chatId = getChatId(currentUser.id, user.id);
    await loadPinnedMessage(chatId);
    
    // Загружаем сообщения чата
    await loadChatMessages(user.id);
}

// Вернуться к списку чатов
function backToChats() {
    document.getElementById('userChat').classList.add('hidden');
    document.getElementById('chatList').classList.remove('hidden');
    currentChat = null;
}

// Загрузить сообщения чата
async function loadChatMessages(userId) {
    const chatMessages = document.getElementById('chatMessages');
    const chatId = getChatId(currentUser.id, userId);
    
    try {
        // Загружаем сообщения из Firebase
        const messagesSnapshot = await getDocs(collection(db, "messages"));
        const firebaseMessages = [];
        
        messagesSnapshot.forEach(doc => {
            const messageData = doc.data();
            if (messageData.chatId === chatId) {
                firebaseMessages.push({
                    id: messageData.messageId,
                    text: messageData.text,
                    senderId: messageData.senderId,
                    receiverId: messageData.receiverId,
                    timestamp: messageData.timestamp,
                    type: messageData.type || 'text',
                    imageData: messageData.imageData,
                    fileData: messageData.fileData,
                    fileName: messageData.fileName,
                    fileType: messageData.fileType,
                    fileSize: messageData.fileSize
                });
            }
        });
        
        // Сортируем сообщения по времени
        firebaseMessages.sort((a, b) => a.timestamp - b.timestamp);
        
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

// Обработка нажатия клавиши в поле сообщения
function handleMessageKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

// Отправить сообщение
async function sendMessage() {
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
        
        try {
            // Сохраняем сообщение в Firebase
            await saveMessageToFirebase(message);
            
            // Очищаем поле ввода
            messageInput.value = '';
            
            // Обновляем список чатов
            updateChatsList();
        } catch (error) {
            console.error('Ошибка при отправке сообщения:', error);
        }
    }
}

// Сохранить сообщение в Firebase
async function saveMessageToFirebase(message) {
    try {
        const chatId = getChatId(message.senderId, message.receiverId);
        
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
            messageData.fileData = message.fileData;
            messageData.mimeType = message.mimeType;
            
            // Для изображений добавляем imageData для совместимости
            if (message.type === 'image') {
                messageData.imageData = message.imageData || message.fileData;
            }
        }
        
        await addDoc(collection(db, "messages"), messageData);
        
        // Обновляем или создаем запись в коллекции chats
        await setDoc(doc(db, "chats", chatId), {
            participants: [message.senderId, message.receiverId].sort(),
            lastMessage: lastMessageText,
            lastMessageTime: message.timestamp,
            lastMessageSender: message.senderId,
            updatedAt: Date.now()
        }, { merge: true });
        
    } catch (error) {
        console.error('Ошибка при сохранении сообщения в Firebase:', error);
        throw error;
    }
}

// Сохранить сообщение локально
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
    
    statusText = chat.user.online ? 'В сети' : 'Не в сети';
    
    // Определяем текст последнего сообщения
    let lastMessageText = chat.lastMessage || '';
    
    const isPinned = pinnedChats.includes(chat.user.id);
    
    div.innerHTML = `
        <img src="${avatar}" alt="${chat.user.username}" class="chat-item-avatar ${avatarClass}">
        <div class="chat-item-info">
            <div class="chat-item-username">
                ${chat.user.username}
                ${isPinned ? '<span class="pin-icon">📌</span>' : ''}
            </div>
            <div class="chat-item-last-message">${lastMessageText}</div>
        </div>
    `;
    
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
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file && currentChat) {
        const reader = new FileReader();
        reader.onload = async function(e) {
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
            
            try {
                // Сохраняем сообщение в Firebase
                await saveMessageToFirebase(message);
                
                // Очищаем input файла
                event.target.value = '';
                
                // Обновляем список чатов
                updateChatsList();
            } catch (error) {
                console.error('Ошибка при отправке файла:', error);
            }
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

// Показать контекстное меню чата
function showChatContextMenu(event, user) {
    event.preventDefault();
    
    // Скрываем существующее контекстное меню
    hideChatContextMenu();
    
    const contextMenu = document.getElementById('chatContextMenu');
    const isPinned = pinnedChats.includes(user.id);
    
    // Обновляем текст кнопки закрепления
    const pinButton = contextMenu.querySelector('.pin-chat-btn');
    pinButton.textContent = isPinned ? 'Открепить чат' : 'Закрепить чат';
    
    // Показываем контекстное меню
    contextMenu.style.display = 'block';
    contextMenu.style.left = event.pageX - 10 + 'px';
    contextMenu.style.top = event.pageY - 10 + 'px';
    
    // Сохраняем выбранного пользователя
    selectedChatUser = user;
    
    // Добавляем обработчик клика вне меню для его скрытия
    document.addEventListener('click', hideChatContextMenu);
}

// Скрыть контекстное меню чата
function hideChatContextMenu() {
    const contextMenu = document.getElementById('chatContextMenu');
    contextMenu.style.display = 'none';
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
    if (!selectedChatUser) return;
    
    const userIndex = pinnedChats.indexOf(selectedChatUser.id);
    
    if (userIndex === -1) {
        // Закрепляем чат
        pinnedChats.push(selectedChatUser.id);
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
            online: online,
            lastSeen: online ? null : Date.now()
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
