import { auth, db, ref, push, set, onValue, update, get, child, CLOUD_NAME, UPLOAD_PRESET } from './firebase-config.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

// ========== المتغيرات العامة ==========
let currentUser = null;
let currentUserData = null;
let allUsers = {};
let allChats = [];
let currentChatId = null;
let currentChatUser = null;

// ========== المصادقة ==========
window.switchAuth = function(type) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    document.getElementById(type + 'Form').classList.add('active');
};

window.login = async function() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const msg = document.getElementById('loginMsg');
    if (!email || !password) { msg.innerText = 'الرجاء ملء جميع الحقول'; return; }
    msg.innerText = 'جاري تسجيل الدخول...';
    try {
        await signInWithEmailAndPassword(auth, email, password);
        msg.innerText = '';
    } catch (error) {
        msg.innerText = error.message;
    }
};

window.register = async function() {
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPass').value;
    const msg = document.getElementById('regMsg');
    if (!name || !email || !password) { msg.innerText = 'املأ جميع الحقول'; return; }
    if (password.length < 6) { msg.innerText = 'كلمة المرور 6 أحرف على الأقل'; return; }
    msg.innerText = 'جاري إنشاء الحساب...';
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await set(ref(db, `users/${userCredential.user.uid}`), {
            name, email, avatarUrl: '', online: true, createdAt: Date.now()
        });
        msg.innerText = '';
    } catch (error) {
        msg.innerText = error.message;
    }
};

window.logout = async function() {
    await signOut(auth);
    location.reload();
};

// ========== تحميل البيانات ==========
async function loadUserData() {
    const snap = await get(child(ref(db), `users/${currentUser.uid}`));
    if (snap.exists()) currentUserData = { uid: currentUser.uid, ...snap.val() };
}
onValue(ref(db, 'users'), (s) => {
    allUsers = s.val() || {};
    renderChatsList();
});

// ========== جلب المحادثات ==========
function getChatId(uid1, uid2) {
    return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
}

async function loadChats() {
    const chatsRef = ref(db, `chats`);
    onValue(chatsRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        allChats = [];
        Object.keys(data).forEach(chatId => {
            if (chatId.includes(currentUser.uid)) {
                allChats.push({ id: chatId, ...data[chatId] });
            }
        });
        renderChatsList();
    });
}

function renderChatsList() {
    const container = document.getElementById('chatsList');
    if (!container) return;
    container.innerHTML = '';
    allChats.forEach(chat => {
        const otherId = chat.id.replace(currentUser.uid, '').replace('_', '');
        const otherUser = allUsers[otherId];
        if (!otherUser) return;
        const lastMsg = chat.lastMessage || '';
        const lastTime = chat.lastTimestamp ? new Date(chat.lastTimestamp).toLocaleTimeString() : '';
        const div = document.createElement('div');
        div.className = `chat-item ${currentChatId === chat.id ? 'active' : ''}`;
        div.onclick = () => openChat(chat.id, otherId);
        div.innerHTML = `
            <div class="chat-avatar">${otherUser.avatarUrl ? `<img src="${otherUser.avatarUrl}">` : otherUser.name?.charAt(0) || 'U'}</div>
            <div class="chat-info">
                <div class="chat-name">${otherUser.name}</div>
                <div class="chat-last-msg">${lastMsg.substring(0, 30)}</div>
            </div>
            <div class="chat-time">${lastTime}</div>
        `;
        container.appendChild(div);
    });
    if (allChats.length === 0) container.innerHTML = '<div class="text-center text-gray-500 p-4">لا توجد محادثات</div>';
}

// ========== فتح محادثة ==========
async function openChat(chatId, otherId) {
    currentChatId = chatId;
    currentChatUser = allUsers[otherId];
    renderChatArea();
    await loadMessages(chatId);
}

function renderChatArea() {
    const container = document.getElementById('chatArea');
    if (!currentChatUser) {
        container.innerHTML = '<div class="empty-chat">اختر محادثة للبدء</div>';
        return;
    }
    container.innerHTML = `
        <div class="chat-header">
            <div class="chat-header-avatar">${currentChatUser.avatarUrl ? `<img src="${currentChatUser.avatarUrl}">` : currentChatUser.name?.charAt(0) || 'U'}</div>
            <div class="chat-header-info">
                <div class="chat-header-name">${currentChatUser.name}</div>
                <div class="chat-header-status">${currentChatUser.online ? 'متصل' : 'غير متصل'}</div>
            </div>
        </div>
        <div class="chat-messages" id="chatMessages"></div>
        <div class="chat-input-area">
            <button class="attach-btn" onclick="document.getElementById('chatImageInput').click()"><i class="fas fa-image"></i></button>
            <input type="file" id="chatImageInput" accept="image/*" style="display:none" onchange="sendChatImage(this)">
            <input type="text" id="messageInput" placeholder="اكتب رسالة...">
            <button class="send-btn" onclick="sendMessage()"><i class="fas fa-paper-plane"></i></button>
        </div>
    `;
}

async function loadMessages(chatId) {
    const messagesRef = ref(db, `messages/${chatId}`);
    onValue(messagesRef, (snapshot) => {
        const data = snapshot.val();
        const container = document.getElementById('chatMessages');
        if (!container) return;
        container.innerHTML = '';
        if (!data) return;
        const messages = Object.entries(data).sort((a,b) => a[1].timestamp - b[1].timestamp);
        messages.forEach(([id, msg]) => {
            const isSent = msg.senderId === currentUser.uid;
            const time = new Date(msg.timestamp).toLocaleTimeString();
            let content = '';
            if (msg.type === 'text') content = `<div class="message-bubble">${msg.text}</div>`;
            else if (msg.type === 'image') content = `<img src="${msg.imageUrl}" class="message-image" onclick="window.open('${msg.imageUrl}')">`;
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
            messageDiv.innerHTML = `
                <div>${content}<div class="message-time">${time}</div></div>
            `;
            container.appendChild(messageDiv);
        });
        container.scrollTop = container.scrollHeight;
    });
}

window.sendMessage = async function() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (!text || !currentChatId) return;
    const message = {
        senderId: currentUser.uid,
        senderName: currentUserData.name,
        text: text,
        type: 'text',
        timestamp: Date.now(),
        read: false
    };
    await push(ref(db, `messages/${currentChatId}`), message);
    await update(ref(db, `chats/${currentChatId}`), {
        lastMessage: text,
        lastTimestamp: Date.now()
    });
    input.value = '';
};

window.sendChatImage = async function(input) {
    const file = input.files[0];
    if (!file || !currentChatId) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', UPLOAD_PRESET);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    const message = {
        senderId: currentUser.uid,
        senderName: currentUserData.name,
        imageUrl: data.secure_url,
        type: 'image',
        timestamp: Date.now(),
        read: false
    };
    await push(ref(db, `messages/${currentChatId}`), message);
    await update(ref(db, `chats/${currentChatId}`), {
        lastMessage: '📷 صورة',
        lastTimestamp: Date.now()
    });
    input.value = '';
};

// ========== إنشاء محادثة جديدة ==========
window.openNewChat = function() {
    document.getElementById('newChatPanel').style.display = 'flex';
    document.getElementById('searchUserInput').value = '';
    document.getElementById('searchResults').innerHTML = '';
};
window.closeNewChat = function() {
    document.getElementById('newChatPanel').style.display = 'none';
};

document.getElementById('searchUserInput')?.addEventListener('input', async (e) => {
    const query = e.target.value.toLowerCase();
    const resultsDiv = document.getElementById('searchResults');
    if (!query) { resultsDiv.innerHTML = ''; return; }
    const users = Object.entries(allUsers).filter(([uid, u]) => 
        uid !== currentUser.uid && (u.email.toLowerCase().includes(query) || u.name.toLowerCase().includes(query))
    );
    resultsDiv.innerHTML = users.map(([uid, u]) => `
        <div class="user-result" onclick="startChat('${uid}')">
            <div class="w-10 h-10 rounded-full bg-[#2a9d8f] flex items-center justify-center">${u.name?.charAt(0) || 'U'}</div>
            <div>
                <div class="font-bold">${u.name}</div>
                <div class="text-sm text-gray-400">${u.email}</div>
            </div>
        </div>
    `).join('');
});

window.startChat = async function(otherId) {
    const chatId = getChatId(currentUser.uid, otherId);
    const chatRef = ref(db, `chats/${chatId}`);
    const snap = await get(chatRef);
    if (!snap.exists()) {
        await set(chatRef, {
            participants: { [currentUser.uid]: true, [otherId]: true },
            createdAt: Date.now()
        });
    }
    currentChatId = chatId;
    currentChatUser = allUsers[otherId];
    renderChatArea();
    loadMessages(chatId);
    closeNewChat();
    renderChatsList();
};

// ========== الملف الشخصي ==========
window.openProfilePanel = function() {
    document.getElementById('profileName').innerText = currentUserData?.name || '';
    document.getElementById('profileEmail').innerText = currentUserData?.email || '';
    const avatarEl = document.getElementById('profileAvatarLarge');
    if (currentUserData?.avatarUrl) avatarEl.innerHTML = `<img src="${currentUserData.avatarUrl}">`;
    else avatarEl.innerHTML = currentUserData?.name?.charAt(0) || '👤';
    document.getElementById('profilePanel').classList.add('open');
};
window.closeProfilePanel = function() {
    document.getElementById('profilePanel').classList.remove('open');
};
window.changeAvatar = function() {
    document.getElementById('avatarInput').click();
};
document.getElementById('avatarInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', UPLOAD_PRESET);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    await update(ref(db, `users/${currentUser.uid}`), { avatarUrl: data.secure_url });
    currentUserData.avatarUrl = data.secure_url;
    closeProfilePanel();
    renderChatsList();
    const avatarSmall = document.getElementById('profileAvatar');
    if (avatarSmall) avatarSmall.innerHTML = `<img src="${data.secure_url}">`;
});

// ========== مراقبة المستخدم ==========
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        await loadUserData();
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        const presenceRef = ref(db, `presence/${user.uid}`);
        set(presenceRef, true);
        onValue(ref(db, '.info/connected'), (snap) => {
            if (snap.val() === true) set(presenceRef, true);
        });
        loadChats();
    } else {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
    }
});

// إضافة حقل رفع الصورة
const avatarInput = document.createElement('input');
avatarInput.type = 'file';
avatarInput.accept = 'image/*';
avatarInput.id = 'avatarInput';
avatarInput.style.display = 'none';
document.body.appendChild(avatarInput);
avatarInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', UPLOAD_PRESET);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    await update(ref(db, `users/${currentUser.uid}`), { avatarUrl: data.secure_url });
    currentUserData.avatarUrl = data.secure_url;
    closeProfilePanel();
    renderChatsList();
    const avatarSmall = document.getElementById('profileAvatar');
    if (avatarSmall) avatarSmall.innerHTML = `<img src="${data.secure_url}">`;
});

console.log('✅ tlgrami Ready');
