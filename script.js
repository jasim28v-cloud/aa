import { auth, db, ref, push, set, onValue, update, get, child, CLOUD_NAME, UPLOAD_PRESET } from './firebase-config.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

// ========== المتغيرات العامة ==========
let currentUser = null;
let currentUserData = null;
let allUsers = {};
let allVideos = [];
let allSounds = {};
let isMuted = true;
let viewingProfileUserId = null;
let selectedVideoFile = null;
let popularHashtags = ['تيك_توك', 'ترند', 'اكسبلور', 'فن', 'موسيقى', 'ضحك', 'رياضة', 'طبخ', 'سفر', 'تحدي'];
let currentChatUserId = null;

// ========== إعدادات الأدمن ==========
const ADMIN_EMAILS = ['jasim28v@gmail.com'];
let isAdmin = false;

// ========== مصادقة ==========
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
        if (error.code === 'auth/user-not-found') msg.innerText = 'لا يوجد حساب بهذا البريد';
        else if (error.code === 'auth/wrong-password') msg.innerText = 'كلمة المرور غير صحيحة';
        else msg.innerText = 'حدث خطأ: ' + error.message;
    }
};

window.register = async function() {
    const username = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPass').value;
    const msg = document.getElementById('regMsg');
    if (!username || !email || !password) { msg.innerText = 'املأ جميع الحقول'; return; }
    if (password.length < 6) { msg.innerText = 'كلمة المرور 6 أحرف على الأقل'; return; }
    msg.innerText = 'جاري إنشاء الحساب...';
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await set(ref(db, `users/${userCredential.user.uid}`), {
            username, email, bio: '', avatarUrl: '', coverUrl: '', followers: {}, following: {}, totalLikes: 0, xp: 0, level: 1, createdAt: Date.now()
        });
        msg.innerText = '';
    } catch (error) {
        if (error.code === 'auth/email-already-in-use') msg.innerText = 'البريد الإلكتروني مستخدم بالفعل';
        else msg.innerText = 'حدث خطأ: ' + error.message;
    }
};

window.logout = function() { signOut(auth); location.reload(); };

// ========== تحميل البيانات ==========
async function loadUserData() {
    const snap = await get(child(ref(db), `users/${currentUser.uid}`));
    if (snap.exists()) currentUserData = { uid: currentUser.uid, ...snap.val() };
    updateXPBar();
}
onValue(ref(db, 'users'), (s) => { allUsers = s.val() || {}; });

// ========== نظام XP والمستويات ==========
async function addXP(amount) {
    if (!currentUserData) return;
    let newXP = (currentUserData.xp || 0) + amount;
    let newLevel = currentUserData.level || 1;
    while (newXP >= newLevel * 500) {
        newXP -= newLevel * 500;
        newLevel++;
    }
    await update(ref(db, `users/${currentUser.uid}`), { xp: newXP, level: newLevel });
    currentUserData.xp = newXP;
    currentUserData.level = newLevel;
    updateXPBar();
}

function updateXPBar() {
    if (!currentUserData) return;
    const level = currentUserData.level || 1;
    const xp = currentUserData.xp || 0;
    const xpNeeded = level * 500;
    const percent = (xp / xpNeeded) * 100;
    const xpBar = document.getElementById('xpFill');
    if (xpBar) xpBar.style.width = `${percent}%`;
    const levelEl = document.getElementById('profileLevel');
    if (levelEl) levelEl.innerText = level;
}

// ========== هاشتاقات وإشارات ==========
function addHashtagsAndMentions(text) {
    if (!text) return '';
    text = text.replace(/#(\w+)/g, '<span class="hashtag" onclick="searchHashtag(\'$1\')">#$1</span>');
    text = text.replace(/@(\w+)/g, '<span class="mention" onclick="searchUser(\'$1\')">@$1</span>');
    return text;
}

window.searchHashtag = function(tag) {
    document.getElementById('searchInput').value = '#' + tag;
    openSearch();
    searchAll();
};

window.searchUser = function(username) {
    document.getElementById('searchInput').value = username;
    openSearch();
    searchAll();
};

window.showSuggestions = function() {
    const textarea = document.getElementById('videoDescription');
    const suggestionsDiv = document.getElementById('suggestions');
    const text = textarea.value;
    const lastWord = text.split(' ').pop();
    suggestionsDiv.innerHTML = '';
    if (lastWord.startsWith('#')) {
        const searchTerm = lastWord.substring(1).toLowerCase();
        const filtered = popularHashtags.filter(h => h.includes(searchTerm));
        filtered.forEach(h => {
            const span = document.createElement('span');
            span.className = 'bg-[#ec489a]/20 text-[#ec489a] px-3 py-1 rounded-full text-sm cursor-pointer';
            span.innerText = '#' + h;
            span.onclick = () => insertSuggestion('#' + h);
            suggestionsDiv.appendChild(span);
        });
    } else if (lastWord.startsWith('@') && allUsers) {
        const searchTerm = lastWord.substring(1).toLowerCase();
        const filtered = Object.values(allUsers).filter(u => u.username?.toLowerCase().includes(searchTerm) && u.uid !== currentUser?.uid);
        filtered.forEach(u => {
            const span = document.createElement('span');
            span.className = 'bg-[#06b6d4]/20 text-[#06b6d4] px-3 py-1 rounded-full text-sm cursor-pointer';
            span.innerText = '@' + u.username;
            span.onclick = () => insertSuggestion('@' + u.username);
            suggestionsDiv.appendChild(span);
        });
    }
};

function insertSuggestion(suggestion) {
    const textarea = document.getElementById('videoDescription');
    const text = textarea.value;
    const lastWord = text.split(' ').pop();
    const newText = text.substring(0, text.length - lastWord.length) + suggestion + ' ';
    textarea.value = newText;
    textarea.focus();
    document.getElementById('suggestions').innerHTML = '';
}

// ========== عرض الفيديوهات ==========
onValue(ref(db, 'videos'), (s) => {
    const data = s.val();
    if (!data) { allVideos = []; renderVideos(); return; }
    allVideos = [];
    Object.keys(data).forEach(key => allVideos.push({ id: key, ...data[key] }));
    allVideos.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderVideos();
    updateTrendingSounds();
});

function renderVideos() {
    const container = document.getElementById('videosContainer');
    if (!container) return;
    container.innerHTML = '';
    if (allVideos.length === 0) {
        container.innerHTML = '<div class="loading"><div class="spinner"></div><span>لا توجد فيديوهات بعد</span></div>';
        return;
    }
    allVideos.forEach(video => {
        const isLiked = video.likedBy && video.likedBy[currentUser?.uid];
        const user = allUsers[video.sender] || { username: video.senderName || 'user', avatarUrl: '' };
        const isFollowing = currentUserData?.following && currentUserData.following[video.sender];
        const commentsCount = video.comments ? Object.keys(video.comments).length : 0;
        const caption = addHashtagsAndMentions(video.description || '');
        const avatarHtml = (user.avatarUrl && user.avatarUrl !== '') ? `<img src="${user.avatarUrl}">` : (user.username?.charAt(0)?.toUpperCase() || '👤');
        const div = document.createElement('div');
        div.className = 'video-item';
        div.innerHTML = `
            <video loop playsinline muted data-src="${video.url}" poster="${video.thumbnail || ''}"></video>
            <div class="watermark"><i class="fas fa-heart"></i> TikToki</div>
            <div class="video-info">
                <div class="author-info">
                    <div class="author-avatar" onclick="viewProfile('${video.sender}')">${avatarHtml}</div>
                    <div class="author-name">
                        <span onclick="viewProfile('${video.sender}')">@${user.username}</span>
                        ${currentUser?.uid !== video.sender ? `<button class="follow-btn" onclick="toggleFollow('${video.sender}', this)">${isFollowing ? 'متابع' : 'متابعة'}</button>` : ''}
                    </div>
                </div>
                <div class="video-caption">${caption}</div>
                <div class="video-music" onclick="searchBySound('${video.music || 'Original Sound'}')"><i class="fas fa-music"></i> ${video.music || 'Original Sound'}</div>
            </div>
            <div class="side-actions">
                <button class="side-btn" onclick="toggleGlobalMute()"><i class="fas ${isMuted ? 'fa-volume-mute' : 'fa-volume-up'}"></i></button>
                <button class="side-btn like-btn ${isLiked ? 'active' : ''}" onclick="toggleLike('${video.id}', this)"><i class="fas fa-heart"></i><span class="count">${video.likes || 0}</span></button>
                <button class="side-btn" onclick="openComments('${video.id}')"><i class="fas fa-comment"></i><span class="count">${commentsCount}</span></button>
                <button class="side-btn" onclick="shareVideo('${video.url}')"><i class="fas fa-share"></i></button>
                <button class="side-btn" onclick="saveToFavorites('${video.id}')"><i class="fas fa-bookmark"></i></button>
                <button class="side-btn" onclick="downloadVideo('${video.url}')"><i class="fas fa-download"></i></button>
            </div>
        `;
        const videoEl = div.querySelector('video');
        videoEl.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            const likeBtn = div.querySelector('.like-btn');
            if (likeBtn) { toggleLike(video.id, likeBtn); showHeartAnimation(e.clientX, e.clientY); }
        });
        container.appendChild(div);
    });
    initVideoObserver();
}

function showHeartAnimation(x, y) {
    const heart = document.createElement('div');
    heart.className = 'heart-animation';
    heart.innerHTML = '❤️';
    heart.style.left = (x - 40) + 'px';
    heart.style.top = (y - 40) + 'px';
    document.body.appendChild(heart);
    setTimeout(() => heart.remove(), 800);
}

function initVideoObserver() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const video = entry.target.querySelector('video');
            if (entry.isIntersecting) {
                if (!video.src) video.src = video.dataset.src;
                video.muted = isMuted;
                video.play().catch(() => {});
            } else {
                video.pause();
            }
        });
    }, { threshold: 0.65 });
    document.querySelectorAll('.video-item').forEach(seg => observer.observe(seg));
}

window.toggleGlobalMute = function() {
    isMuted = !isMuted;
    document.querySelectorAll('video').forEach(v => v.muted = isMuted);
    const icon = document.getElementById('globalMuteIcon');
    if (icon) icon.className = isMuted ? 'fas fa-volume-mute' : 'fas fa-volume-up';
};

// ========== الإعجاب ==========
window.toggleLike = async function(videoId, btn) {
    if (!currentUser) return;
    const videoRef = ref(db, `videos/${videoId}`);
    const snap = await get(videoRef);
    const video = snap.val();
    let likes = video.likes || 0;
    let likedBy = video.likedBy || {};
    if (likedBy[currentUser.uid]) {
        likes--; delete likedBy[currentUser.uid];
    } else {
        likes++; likedBy[currentUser.uid] = true;
        await addXP(5);
        await addNotification(video.sender, 'like', currentUser.uid);
    }
    await update(videoRef, { likes, likedBy });
    btn.classList.toggle('active');
    const countSpan = btn.querySelector('.count');
    if (countSpan) countSpan.innerText = likes;
};

// ========== المتابعة ==========
window.toggleFollow = async function(userId, btn) {
    if (!currentUser || currentUser.uid === userId) return;
    const userRef = ref(db, `users/${currentUser.uid}/following/${userId}`);
    const targetRef = ref(db, `users/${userId}/followers/${currentUser.uid}`);
    const snap = await get(userRef);
    if (snap.exists()) {
        await set(userRef, null); await set(targetRef, null); btn.innerText = 'متابعة';
        await addXP(5);
        await addNotification(userId, 'unfollow', currentUser.uid);
    } else {
        await set(userRef, true); await set(targetRef, true); btn.innerText = 'متابع';
        await addXP(10);
        await addNotification(userId, 'follow', currentUser.uid);
    }
};

// ========== التعليقات ==========
window.openComments = async function(videoId) {
    const comment = prompt("أضف تعليقاً:");
    if (comment && comment.trim()) {
        await push(ref(db, `videos/${videoId}/comments`), {
            userId: currentUser.uid,
            username: currentUserData?.username,
            text: comment,
            timestamp: Date.now(),
            replies: {}
        });
        await addXP(3);
        const video = allVideos.find(v => v.id === videoId);
        if (video && video.sender !== currentUser.uid) await addNotification(video.sender, 'comment', currentUser.uid);
        renderVideos();
    }
};

// ========== مشاركة وتنزيل ==========
window.shareVideo = function(url) {
    if (navigator.share) navigator.share({ title: 'TikToki', url });
    else { navigator.clipboard.writeText(url); alert('✅ تم نسخ الرابط'); addXP(5); }
};

window.downloadVideo = function(url) {
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tiktoki_video.mp4';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    addXP(2);
};

window.saveToFavorites = async function(videoId) {
    const favRef = ref(db, `users/${currentUser.uid}/favorites/${videoId}`);
    const snap = await get(favRef);
    if (snap.exists()) {
        await set(favRef, null);
        alert('❌ تمت إزالة من المفضلة');
    } else {
        await set(favRef, true);
        alert('✅ تمت إضافة إلى المفضلة');
        addXP(3);
    }
};

// ========== الأصوات الشائعة ==========
function updateTrendingSounds() {
    const sounds = {};
    allVideos.forEach(v => { if (v.music) sounds[v.music] = (sounds[v.music] || 0) + 1; });
    allSounds = sounds;
    renderSoundsList();
}

function renderSoundsList() {
    const container = document.getElementById('soundsList');
    if (!container) return;
    const sorted = Object.entries(allSounds).sort((a, b) => b[1] - a[1]);
    container.innerHTML = sorted.map(([name, count]) => `
        <div class="sound-item" onclick="searchBySound('${name}')">
            <i class="fas fa-music text-[#ec489a] text-2xl"></i>
            <div class="flex-1"><div class="font-bold">${name}</div><div class="text-sm text-gray-400">${count} فيديو</div></div>
        </div>
    `).join('');
}

window.searchBySound = function(soundName) {
    document.getElementById('searchInput').value = soundName;
    openSearch();
    searchAll();
};

// ========== البحث المتقدم ==========
window.openSearch = function() { document.getElementById('searchPanel').classList.add('open'); };
window.closeSearch = function() { document.getElementById('searchPanel').classList.remove('open'); };
window.searchAll = function() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const resultsDiv = document.getElementById('searchResults');
    if (!query) { resultsDiv.innerHTML = ''; return; }
    const users = Object.values(allUsers).filter(u => u.username?.toLowerCase().includes(query));
    const videos = allVideos.filter(v => v.description?.toLowerCase().includes(query) || v.music?.toLowerCase().includes(query));
    const hashtags = [...new Set(allVideos.flatMap(v => (v.description?.match(/#\w+/g) || []).filter(h => h.toLowerCase().includes(query))))];
    resultsDiv.innerHTML = `
        ${users.length ? `<div class="mb-4"><h4 class="text-pink-500 mb-2">👥 مستخدمين</h4>${users.map(u => `<div class="search-result" onclick="viewProfile('${u.uid}')"><div class="w-10 h-10 rounded-full bg-gradient-to-r from-pink-500 to-cyan-500 flex items-center justify-center">${u.avatarUrl ? `<img src="${u.avatarUrl}">` : (u.username?.charAt(0) || 'U')}</div><div>@${u.username}</div></div>`).join('')}</div>` : ''}
        ${hashtags.length ? `<div class="mb-4"><h4 class="text-cyan-500 mb-2"># هاشتاقات</h4>${hashtags.map(h => `<div class="search-result" onclick="searchHashtag('${h.substring(1)}')"><i class="fas fa-hashtag"></i><div>${h}</div></div>`).join('')}</div>` : ''}
        ${videos.length ? `<div><h4 class="text-pink-500 mb-2">🎬 فيديوهات</h4>${videos.map(v => `<div class="search-result" onclick="window.open('${v.url}','_blank')"><i class="fas fa-video"></i><div>${v.description?.substring(0, 40)}</div></div>`).join('')}</div>` : ''}
    `;
};

// ========== الإشعارات ==========
async function addNotification(targetUserId, type, fromUserId) {
    if (targetUserId === fromUserId) return;
    const fromUser = allUsers[fromUserId] || { username: 'مستخدم' };
    const messages = { like: 'أعجب بفيديو الخاص بك', comment: 'علق على فيديو الخاص بك', follow: 'بدأ بمتابعتك', unfollow: 'توقف عن متابعتك' };
    await push(ref(db, `notifications/${targetUserId}`), { type, fromUserId, fromUsername: fromUser.username, message: messages[type], timestamp: Date.now(), read: false });
}

window.openNotifications = async function() {
    const panel = document.getElementById('notificationsPanel');
    const snap = await get(child(ref(db), `notifications/${currentUser.uid}`));
    const notifs = snap.val() || {};
    const container = document.getElementById('notificationsList');
    container.innerHTML = '';
    Object.values(notifs).reverse().forEach(n => {
        container.innerHTML += `<div class="notification-item"><i class="fas ${n.type === 'like' ? 'fa-heart text-pink-500' : n.type === 'comment' ? 'fa-comment text-cyan-500' : 'fa-user-plus text-green-500'}"></i><div><div>${n.fromUsername}</div><div class="text-sm text-gray-400">${n.message}</div></div></div>`;
        if (!n.read) update(ref(db, `notifications/${currentUser.uid}/${Object.keys(notifs).find(k => notifs[k] === n)}`), { read: true });
    });
    panel.classList.add('open');
};
window.closeNotifications = function() { document.getElementById('notificationsPanel').classList.remove('open'); };

// ========== الدردشة الخاصة ==========
function getChatId(uid1, uid2) { return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`; }

window.openMessages = function() { openConversations(); };
window.openConversations = async function() {
    const panel = document.getElementById('conversationsPanel');
    const container = document.getElementById('conversationsList');
    const userId = currentUser.uid;
    const convSnap = await get(child(ref(db), `private_chats/${userId}`));
    const conversations = convSnap.val() || {};
    container.innerHTML = '';
    for (const [otherId, convData] of Object.entries(conversations)) {
        const otherUser = allUsers[otherId];
        if (!otherUser) continue;
        const lastMsg = convData.lastMessage || '';
        container.innerHTML += `<div class="conversation-item" onclick="openPrivateChat('${otherId}')"><div class="w-12 h-12 rounded-full bg-gradient-to-r from-pink-500 to-cyan-500 flex items-center justify-center">${otherUser.avatarUrl ? `<img src="${otherUser.avatarUrl}">` : (otherUser.username?.charAt(0) || 'U')}</div><div><div class="font-bold">${otherUser.username}</div><div class="text-sm text-gray-400">${lastMsg.substring(0, 30)}</div></div></div>`;
    }
    if (container.innerHTML === '') container.innerHTML = '<div class="text-center text-gray-500 py-10">لا توجد محادثات بعد</div>';
    panel.classList.add('open');
};
window.closeConversations = function() { document.getElementById('conversationsPanel').classList.remove('open'); };

window.openPrivateChat = async function(otherUserId) {
    currentChatUserId = otherUserId;
    const user = allUsers[otherUserId];
    document.getElementById('chatUserName').innerText = user?.username || 'مستخدم';
    document.getElementById('chatAvatar').innerHTML = user?.avatarUrl ? `<img src="${user.avatarUrl}">` : (user?.username?.charAt(0) || 'U');
    await loadPrivateMessages(otherUserId);
    document.getElementById('chatPanel').classList.add('open');
    closeConversations();
};
window.closeChat = function() { document.getElementById('chatPanel').classList.remove('open'); currentChatUserId = null; };

async function loadPrivateMessages(otherUserId) {
    const container = document.getElementById('chatMessages');
    container.innerHTML = '<div class="text-center text-gray-500 py-10">جاري التحميل...</div>';
    const chatId = getChatId(currentUser.uid, otherUserId);
    const messagesSnap = await get(child(ref(db), `private_messages/${chatId}`));
    const messages = messagesSnap.val() || {};
    container.innerHTML = '';
    const sorted = Object.entries(messages).sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (const [id, msg] of sorted) {
        const isSent = msg.senderId === currentUser.uid;
        const time = new Date(msg.timestamp).toLocaleTimeString();
        let content = '';
        if (msg.type === 'text') content = `<div class="message-bubble ${isSent ? 'sent' : 'received'}">${msg.text}</div>`;
        else if (msg.type === 'image') content = `<img src="${msg.imageUrl}" class="message-image" onclick="window.open('${msg.imageUrl}')">`;
        container.innerHTML += `<div class="chat-message ${isSent ? 'sent' : 'received'}"><div>${content}<div class="text-[10px] opacity-50 mt-1">${time}</div></div></div>`;
    }
    if (container.innerHTML === '') container.innerHTML = '<div class="text-center text-gray-500 py-10">لا توجد رسائل بعد</div>';
    container.scrollTop = container.scrollHeight;
}

window.sendChatMessage = async function() {
    const input = document.getElementById('chatMessageInput');
    const text = input.value.trim();
    if (!text || !currentChatUserId) return;
    const chatId = getChatId(currentUser.uid, currentChatUserId);
    await push(ref(db, `private_messages/${chatId}`), { senderId: currentUser.uid, senderName: currentUserData?.username, text, type: 'text', timestamp: Date.now() });
    await set(ref(db, `private_chats/${currentUser.uid}/${currentChatUserId}`), { lastMessage: text, lastTimestamp: Date.now(), withUser: currentChatUserId });
    await set(ref(db, `private_chats/${currentChatUserId}/${currentUser.uid}`), { lastMessage: text, lastTimestamp: Date.now(), withUser: currentUser.uid });
    input.value = '';
    await loadPrivateMessages(currentChatUserId);
};

window.sendChatImage = async function(input) {
    const file = input.files[0];
    if (!file || !currentChatUserId) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', UPLOAD_PRESET);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    const chatId = getChatId(currentUser.uid, currentChatUserId);
    await push(ref(db, `private_messages/${chatId}`), { senderId: currentUser.uid, senderName: currentUserData?.username, imageUrl: data.secure_url, type: 'image', timestamp: Date.now() });
    await set(ref(db, `private_chats/${currentUser.uid}/${currentChatUserId}`), { lastMessage: '📷 صورة', lastTimestamp: Date.now(), withUser: currentChatUserId });
    await set(ref(db, `private_chats/${currentChatUserId}/${currentUser.uid}`), { lastMessage: '📷 صورة', lastTimestamp: Date.now(), withUser: currentUser.uid });
    input.value = '';
    await loadPrivateMessages(currentChatUserId);
};

// ========== الملف الشخصي ==========
window.viewProfile = async function(userId) {
    if (!userId) return;
    viewingProfileUserId = userId;
    await loadProfileData(userId);
    document.getElementById('profilePanel').classList.add('open');
};

async function loadProfileData(userId) {
    const userSnap = await get(child(ref(db), `users/${userId}`));
    const user = userSnap.val();
    if (!user) return;
    const coverEl = document.getElementById('profileCover');
    if (user.coverUrl) coverEl.style.background = `url(${user.coverUrl}) center/cover`;
    else coverEl.style.background = 'linear-gradient(135deg, #ec489a, #06b6d4)';
    const avatarEl = document.getElementById('profileAvatarDisplay');
    avatarEl.innerHTML = user.avatarUrl ? `<img src="${user.avatarUrl}">` : (user.username?.charAt(0)?.toUpperCase() || '👤');
    document.getElementById('profileNameDisplay').innerText = user.username;
    document.getElementById('profileBioDisplay').innerText = user.bio || '';
    const userVideos = allVideos.filter(v => v.sender === userId);
    document.getElementById('profileFollowing').innerText = Object.keys(user.following || {}).length;
    document.getElementById('profileFollowers').innerText = Object.keys(user.followers || {}).length;
    const totalLikes = userVideos.reduce((sum, v) => sum + (v.likes || 0), 0);
    document.getElementById('profileLikes').innerText = totalLikes;
    const level = user.level || 1;
    document.getElementById('profileLevel').innerText = level;
    const container = document.getElementById('profileVideosList');
    container.innerHTML = '';
    if (userVideos.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-400 py-10">لا توجد فيديوهات بعد</div>';
    } else {
        userVideos.forEach(v => {
            const thumb = document.createElement('div');
            thumb.className = 'video-thumb';
            thumb.innerHTML = `<i class="fas fa-play text-2xl"></i><div class="views">${v.views || 0} مشاهدات</div>`;
            thumb.onclick = () => window.open(v.url, '_blank');
            container.appendChild(thumb);
        });
    }
    const actionsDiv = document.getElementById('profileActions');
    actionsDiv.innerHTML = '';
    if (userId === currentUser?.uid) {
        actionsDiv.innerHTML = `<button class="edit-profile-btn" onclick="openEditProfile()">تعديل الملف</button><button class="logout-btn" onclick="logout()">تسجيل خروج</button>`;
        if (isAdmin) {
            actionsDiv.innerHTML += `<div class="admin-panel mt-4 p-4 bg-pink-500/10 rounded-xl border border-pink-500/30"><h4 class="text-pink-500 font-bold">لوحة تحكم الأدمن</h4><div class="grid grid-cols-2 gap-2 mt-2"><div>👥 ${Object.keys(allUsers).length} مستخدم</div><div>🎬 ${allVideos.length} فيديو</div></div><button onclick="adminDeleteAll()" class="bg-red-500/30 p-2 rounded mt-2 w-full">حذف جميع الفيديوهات</button></div>`;
        }
    } else {
        const isFollowing = currentUserData?.following && currentUserData.following[userId];
        actionsDiv.innerHTML = `<button class="follow-btn" onclick="toggleFollow('${userId}', this)">${isFollowing ? 'متابع' : 'متابعة'}</button><button class="message-btn" onclick="openPrivateChat('${userId}')"><i class="fas fa-envelope"></i> رسالة</button>`;
    }
}

window.openMyProfile = function() { if (currentUser) viewProfile(currentUser.uid); };
window.closeProfile = function() { document.getElementById('profilePanel').classList.remove('open'); viewingProfileUserId = null; };
window.openEditProfile = function() {
    document.getElementById('editUsername').value = currentUserData?.username || '';
    document.getElementById('editBio').value = currentUserData?.bio || '';
    const editAvatar = document.getElementById('editAvatarDisplay');
    if (currentUserData?.avatarUrl) editAvatar.innerHTML = `<img src="${currentUserData.avatarUrl}">`;
    else editAvatar.innerHTML = currentUserData?.username?.charAt(0)?.toUpperCase() || '👤';
    const coverPreview = document.getElementById('coverPreview');
    if (currentUserData?.coverUrl) coverPreview.src = currentUserData.coverUrl;
    document.getElementById('editProfilePanel').classList.add('open');
};
window.closeEditProfile = function() { document.getElementById('editProfilePanel').classList.remove('open'); };
window.saveProfile = async function() {
    const newUsername = document.getElementById('editUsername').value;
    const newBio = document.getElementById('editBio').value;
    await update(ref(db, `users/${currentUser.uid}`), { username: newUsername, bio: newBio });
    currentUserData.username = newUsername;
    currentUserData.bio = newBio;
    closeEditProfile();
    if (viewingProfileUserId === currentUser.uid) await loadProfileData(currentUser.uid);
    renderVideos();
};
window.changeAvatar = function() { document.getElementById('avatarInput').click(); };
window.uploadAvatar = async function(input) {
    const file = input.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', UPLOAD_PRESET);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    await update(ref(db, `users/${currentUser.uid}`), { avatarUrl: data.secure_url });
    currentUserData.avatarUrl = data.secure_url;
    if (viewingProfileUserId === currentUser.uid) await loadProfileData(currentUser.uid);
    renderVideos();
};
window.uploadCover = async function(input) {
    const file = input.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', UPLOAD_PRESET);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    await update(ref(db, `users/${currentUser.uid}`), { coverUrl: data.secure_url });
    currentUserData.coverUrl = data.secure_url;
    const preview = document.getElementById('coverPreview');
    if (preview) preview.src = data.secure_url;
    if (viewingProfileUserId === currentUser.uid) await loadProfileData(currentUser.uid);
};

// ========== رفع الفيديو ==========
window.openUploadPanel = function() {
    document.getElementById('uploadPanel').classList.add('open');
    resetUploadForm();
};
window.closeUploadPanel = function() {
    document.getElementById('uploadPanel').classList.remove('open');
    resetUploadForm();
};
function resetUploadForm() {
    selectedVideoFile = null;
    document.getElementById('videoPreview').style.display = 'none';
    document.querySelector('.preview-placeholder').style.display = 'block';
    document.getElementById('videoDescription').value = '';
    document.getElementById('videoMusic').value = '';
    document.getElementById('uploadProgressBar').style.display = 'none';
    document.getElementById('uploadStatus').innerHTML = '';
    document.getElementById('uploadSubmitBtn').disabled = false;
    document.getElementById('videoFileInput').value = '';
}
window.selectVideoFile = function(input) {
    const file = input.files[0];
    if (file && file.type.startsWith('video/')) {
        if (file.size > 100 * 1024 * 1024) {
            alert('حجم الفيديو يجب أن يكون أقل من 100MB');
            return;
        }
        selectedVideoFile = file;
        const reader = new FileReader();
        reader.onload = function(e) {
            const videoPreview = document.getElementById('videoPreview');
            videoPreview.src = e.target.result;
            videoPreview.style.display = 'block';
            document.querySelector('.preview-placeholder').style.display = 'none';
        };
        reader.readAsDataURL(file);
    } else {
        alert('الرجاء اختيار ملف فيديو صحيح');
    }
};
window.uploadVideo = async function() {
    if (!selectedVideoFile) { alert('الرجاء اختيار فيديو'); return; }
    const description = document.getElementById('videoDescription').value;
    const music = document.getElementById('videoMusic').value || 'Original Sound';
    const progressBar = document.getElementById('uploadProgressBar');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const statusDiv = document.getElementById('uploadStatus');
    const submitBtn = document.getElementById('uploadSubmitBtn');
    progressBar.style.display = 'block';
    submitBtn.disabled = true;
    statusDiv.innerHTML = '';
    progressFill.style.width = '0%';
    progressText.innerText = '0%';
    try {
        const fd = new FormData();
        fd.append('file', selectedVideoFile);
        fd.append('upload_preset', UPLOAD_PRESET);
        fd.append('resource_type', 'video');
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`);
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                progressFill.style.width = `${percent}%`;
                progressText.innerText = `${percent}%`;
            }
        };
        const response = await new Promise((resolve, reject) => {
            xhr.onload = () => resolve(xhr);
            xhr.onerror = () => reject(xhr);
            xhr.send(fd);
        });
        const result = JSON.parse(response.responseText);
        await push(ref(db, 'videos'), {
            url: result.secure_url,
            thumbnail: result.secure_url.replace('.mp4', '.jpg'),
            description: description,
            music: music,
            sender: currentUser.uid,
            senderName: currentUserData?.username,
            likes: 0,
            likedBy: {},
            comments: {},
            views: 0,
            timestamp: Date.now()
        });
        await addXP(150);
        statusDiv.innerHTML = '✅ تم رفع الفيديو بنجاح!';
        statusDiv.style.color = '#4caf50';
        setTimeout(() => {
            closeUploadPanel();
            renderVideos();
        }, 1500);
    } catch (error) {
        statusDiv.innerHTML = '❌ فشل الرفع: ' + error.message;
        statusDiv.style.color = '#ff4444';
        progressBar.style.display = 'none';
        submitBtn.disabled = false;
    }
};

// ========== الأصوات ==========
window.openSounds = function() { document.getElementById('soundsPanel').classList.add('open'); };
window.closeSounds = function() { document.getElementById('soundsPanel').classList.remove('open'); };

// ========== التنقل ==========
window.switchTab = function(tab) {
    document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
    event.target.closest('.nav-item').classList.add('active');
    if (tab === 'home') {
        document.getElementById('uploadPanel').classList.remove('open');
        document.getElementById('profilePanel').classList.remove('open');
        document.getElementById('chatPanel').classList.remove('open');
        document.getElementById('conversationsPanel').classList.remove('open');
    }
    if (tab === 'profile') openMyProfile();
};

// ========== مراقبة المستخدم ==========
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        await loadUserData();
        if (ADMIN_EMAILS.includes(currentUser.email)) isAdmin = true;
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        const presenceRef = ref(db, `presence/${user.uid}`);
        set(presenceRef, true);
        onValue(ref(db, '.info/connected'), (snap) => { if (snap.val() === true) set(presenceRef, true); });
    } else {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
    }
});

console.log('✅ TikToki Ready');
