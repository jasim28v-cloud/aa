// ========== إعدادات الأدمن ==========
const ADMIN_EMAILS = ['jasim28v@gmail.com'];
let isAdmin = false;

// ========== المتغيرات العامة ==========
let currentUser = null;
let currentUserData = null;
let allUsers = {};
let allPosts = [];
let allStories = [];
let currentChatUserId = null;
let selectedPostFile = null;
let currentView = 'feed';

// ========== مصادقة ==========
function switchAuth(type) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    document.getElementById(type + 'Form').classList.add('active');
}

async function login() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const msg = document.getElementById('loginMsg');
    if (!email || !password) { msg.innerText = 'الرجاء ملء جميع الحقول'; return; }
    msg.innerText = 'جاري تسجيل الدخول...';
    try {
        await auth.signInWithEmailAndPassword(email, password);
        msg.innerText = '';
    } catch (error) {
        if (error.code === 'auth/user-not-found') msg.innerText = 'لا يوجد حساب بهذا البريد';
        else if (error.code === 'auth/wrong-password') msg.innerText = 'كلمة المرور غير صحيحة';
        else msg.innerText = 'حدث خطأ: ' + error.message;
    }
}

async function register() {
    const username = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPass').value;
    const msg = document.getElementById('regMsg');
    if (!username || !email || !password) { msg.innerText = 'املأ جميع الحقول'; return; }
    if (password.length < 6) { msg.innerText = 'كلمة المرور 6 أحرف على الأقل'; return; }
    msg.innerText = 'جاري إنشاء الحساب...';
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        await db.ref(`users/${userCredential.user.uid}`).set({
            username, email, bio: '. لا أعلم ، ولا اهتم .', avatarUrl: '', coverUrl: '', followers: {}, following: {}, createdAt: Date.now()
        });
        msg.innerText = '';
    } catch (error) {
        if (error.code === 'auth/email-already-in-use') msg.innerText = 'البريد الإلكتروني مستخدم بالفعل';
        else msg.innerText = 'حدث خطأ: ' + error.message;
    }
}

function logout() { auth.signOut(); location.reload(); }

// ========== تحميل البيانات ==========
async function loadUserData() {
    const snap = await db.ref(`users/${currentUser.uid}`).get();
    if (snap.exists()) currentUserData = { uid: currentUser.uid, ...snap.val() };
}
db.ref('users').on('value', s => { allUsers = s.val() || {}; });

// ========== المنشورات ==========
db.ref('posts').on('value', (s) => {
    const data = s.val();
    if (!data) { allPosts = []; renderFeed(); renderReels(); renderProfile(); return; }
    allPosts = [];
    Object.keys(data).forEach(key => allPosts.push({ id: key, ...data[key] }));
    allPosts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderFeed();
    renderReels();
    renderProfile();
});

// ========== القصص ==========
db.ref('stories').on('value', async (s) => {
    const data = s.val();
    const now = Date.now();
    const activeStories = [];
    if (data) {
        Object.keys(data).forEach(key => {
            const story = data[key];
            if (story.timestamp && (now - story.timestamp) < 24*60*60*1000) activeStories.push({ id: key, ...story });
        });
    }
    renderStories(activeStories);
});

// ========== عرض الفيد (Feed) ==========
function renderFeed() {
    const container = document.getElementById('feedPage');
    if (!container) return;
    container.innerHTML = '';
    if (allPosts.length === 0) {
        container.innerHTML = '<div class="loading">✨ لا توجد منشورات بعد</div>';
        return;
    }
    const feedPosts = allPosts.slice(0, 10);
    feedPosts.forEach(post => {
        const user = allUsers[post.sender] || { username: post.senderName || 'user', avatarUrl: '' };
        const isLiked = post.likedBy && post.likedBy[currentUser?.uid];
        const commentsCount = post.comments ? Object.keys(post.comments).length : 0;
        const mediaHtml = post.mediaType === 'video' 
            ? `<video class="post-media" controls><source src="${post.mediaUrl}" type="video/mp4"></video>`
            : `<img class="post-media" src="${post.mediaUrl}" alt="post">`;
        const div = document.createElement('div');
        div.className = 'post-card';
        div.innerHTML = `
            <div class="post-header">
                <div class="post-avatar" onclick="viewProfile('${post.sender}')">${user.avatarUrl ? `<img src="${user.avatarUrl}">` : (user.username?.charAt(0) || '👤')}</div>
                <div class="post-user-info">
                    <div class="post-username" onclick="viewProfile('${post.sender}')">${user.username}</div>
                    <div class="post-location">${post.location || ''}</div>
                </div>
            </div>
            ${mediaHtml}
            <div class="post-actions">
                <div class="actions-left">
                    <button class="action-btn like-btn ${isLiked ? 'active' : ''}" onclick="toggleLikePost('${post.id}', this)"><i class="fas fa-heart"></i><span class="action-count">${post.likes || 0}</span></button>
                    <button class="action-btn" onclick="openCommentsPost('${post.id}')"><i class="fas fa-comment"></i><span class="action-count">${commentsCount}</span></button>
                    <button class="action-btn" onclick="sharePost('${post.mediaUrl}')"><i class="fas fa-paper-plane"></i></button>
                </div>
                <button class="action-btn" onclick="savePost('${post.id}')"><i class="fas fa-bookmark"></i></button>
            </div>
            <div class="post-caption">
                <strong>${user.username}</strong> ${post.caption || ''}
                <div class="post-time">${new Date(post.timestamp).toLocaleString()}</div>
            </div>
        `;
        container.appendChild(div);
    });
}

// ========== عرض الريلز ==========
function renderReels() {
    const container = document.getElementById('reelsPage');
    if (!container) return;
    container.innerHTML = '';
    if (allPosts.length === 0) {
        container.innerHTML = '<div class="loading">🎬 لا توجد فيديوهات بعد</div>';
        return;
    }
    const reelsPosts = allPosts.filter(p => p.mediaType === 'video').slice(0, 10);
    reelsPosts.forEach(post => {
        const user = allUsers[post.sender] || { username: post.senderName || 'user', avatarUrl: '' };
        const isLiked = post.likedBy && post.likedBy[currentUser?.uid];
        const commentsCount = post.comments ? Object.keys(post.comments).length : 0;
        const div = document.createElement('div');
        div.className = 'reel-item';
        div.innerHTML = `
            <video class="reel-video" loop playsinline muted data-src="${post.mediaUrl}" poster="${post.thumbnail || ''}"></video>
            <div class="reel-overlay">
                <div class="reel-author">
                    <div class="reel-avatar" onclick="viewProfile('${post.sender}')">${user.avatarUrl ? `<img src="${user.avatarUrl}">` : (user.username?.charAt(0) || '👤')}</div>
                    <div class="reel-username" onclick="viewProfile('${post.sender}')">${user.username}</div>
                    ${currentUser?.uid !== post.sender ? `<button class="follow-reel-btn" onclick="toggleFollow('${post.sender}', this)">متابعة</button>` : ''}
                </div>
                <div class="reel-caption">${post.caption || ''}</div>
                <div class="reel-music"><i class="fas fa-music"></i> ${post.music || 'Original Sound'}</div>
            </div>
            <div class="reel-side-actions">
                <button class="reel-action like-btn ${isLiked ? 'active' : ''}" onclick="toggleLikePost('${post.id}', this)"><i class="fas fa-heart"></i><span>${post.likes || 0}</span></button>
                <button class="reel-action" onclick="openCommentsPost('${post.id}')"><i class="fas fa-comment"></i><span>${commentsCount}</span></button>
                <button class="reel-action" onclick="sharePost('${post.mediaUrl}')"><i class="fas fa-paper-plane"></i></button>
                <button class="reel-action" onclick="savePost('${post.id}')"><i class="fas fa-bookmark"></i></button>
            </div>
        `;
        const video = div.querySelector('video');
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    if (!video.src) video.src = video.dataset.src;
                    video.play().catch(() => {});
                } else {
                    video.pause();
                }
            });
        }, { threshold: 0.5 });
        observer.observe(video);
        container.appendChild(div);
    });
}

// ========== عرض القصص ==========
function renderStories(stories) {
    const containers = document.querySelectorAll('.stories-row');
    if (!containers.length) return;
    containers.forEach(container => {
        container.innerHTML = '';
        if (stories.length === 0) {
            container.innerHTML = '<div class="text-gray-500 text-sm p-2">لا توجد قصص جديدة</div>';
            return;
        }
        stories.forEach(story => {
            const user = allUsers[story.sender] || { username: 'user', avatarUrl: '' };
            const div = document.createElement('div');
            div.className = 'story-item';
            div.onclick = () => window.open(story.mediaUrl, '_blank');
            div.innerHTML = `
                <div class="story-ring"><img class="story-avatar" src="${user.avatarUrl || 'https://via.placeholder.com/64'}" onerror="this.src='https://via.placeholder.com/64'"></div>
                <div class="story-name">${user.username}</div>
            `;
            container.appendChild(div);
        });
    });
}

// ========== رفع منشور ==========
function openCreatePage() {
    showPage('create');
}
document.getElementById('createPostFile')?.addEventListener('change', (e) => {
    selectedPostFile = e.target.files[0];
});
async function createPost() {
    if (!selectedPostFile) { alert('اختر صورة أو فيديو'); return; }
    const caption = document.querySelector('#createPage .create-caption')?.value || '';
    const statusDiv = document.getElementById('createPostStatus');
    statusDiv.innerHTML = '📤 جاري الرفع...';
    const fd = new FormData();
    fd.append('file', selectedPostFile);
    fd.append('upload_preset', UPLOAD_PRESET);
    const resourceType = selectedPostFile.type.startsWith('video/') ? 'video' : 'image';
    fd.append('resource_type', resourceType);
    try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`, { method: 'POST', body: fd });
        const data = await res.json();
        await db.ref('posts').push({
            mediaUrl: data.secure_url,
            mediaType: resourceType,
            caption: caption,
            sender: currentUser.uid,
            senderName: currentUserData?.username,
            likes: 0,
            likedBy: {},
            comments: {},
            views: Math.floor(Math.random() * 500000) + 1000,
            timestamp: Date.now()
        });
        statusDiv.innerHTML = '✅ تم النشر!';
        setTimeout(() => showPage('feed'), 1500);
    } catch (error) { statusDiv.innerHTML = '❌ فشل النشر: ' + error.message; }
}

// ========== التفاعلات ==========
async function toggleLikePost(postId, btn) {
    if (!currentUser) return;
    const postRef = db.ref(`posts/${postId}`);
    const snap = await postRef.get();
    const post = snap.val();
    let likes = post.likes || 0;
    let likedBy = post.likedBy || {};
    if (likedBy[currentUser.uid]) {
        likes--; delete likedBy[currentUser.uid];
    } else {
        likes++; likedBy[currentUser.uid] = true;
        await addNotification(post.sender, 'like', currentUser.uid);
    }
    await postRef.update({ likes, likedBy });
    btn.classList.toggle('active');
    const countSpan = btn.querySelector('span:last-child');
    if (countSpan) countSpan.innerText = likes;
}

async function openCommentsPost(postId) {
    const comment = prompt("أضف تعليقاً:");
    if (comment && comment.trim()) {
        await db.ref(`posts/${postId}/comments`).push({
            userId: currentUser.uid,
            username: currentUserData?.username,
            text: comment,
            timestamp: Date.now()
        });
        const post = allPosts.find(p => p.id === postId);
        if (post && post.sender !== currentUser.uid) await addNotification(post.sender, 'comment', currentUser.uid);
        renderFeed();
        renderReels();
    }
}

function sharePost(url) {
    if (navigator.share) navigator.share({ url });
    else { navigator.clipboard.writeText(url); alert('✅ تم نسخ الرابط'); }
}
function savePost(postId) { alert('تم حفظ المنشور (محاكاة)'); }

async function toggleFollow(userId, btn) {
    if (!currentUser || currentUser.uid === userId) return;
    const userRef = db.ref(`users/${currentUser.uid}/following/${userId}`);
    const targetRef = db.ref(`users/${userId}/followers/${currentUser.uid}`);
    const snap = await userRef.get();
    if (snap.exists()) {
        await userRef.remove(); await targetRef.remove(); btn.innerText = 'متابعة';
        await addNotification(userId, 'unfollow', currentUser.uid);
    } else {
        await userRef.set(true); await targetRef.set(true); btn.innerText = 'متابع';
        await addNotification(userId, 'follow', currentUser.uid);
    }
}

async function addNotification(targetUserId, type, fromUserId) {
    if (targetUserId === fromUserId) return;
    const fromUser = allUsers[fromUserId] || { username: 'مستخدم' };
    const messages = { like: 'أعجب بمنشورك', comment: 'علق على منشورك', follow: 'بدأ بمتابعتك', unfollow: 'توقف عن متابعتك' };
    await db.ref(`notifications/${targetUserId}`).push({ type, fromUserId, fromUsername: fromUser.username, message: messages[type], timestamp: Date.now(), read: false });
}

// ========== الملف الشخصي ==========
async function viewProfile(userId) {
    if (!userId) return;
    await loadProfileData(userId);
    showPage('profile');
}
async function loadProfileData(userId) {
    const userSnap = await db.ref(`users/${userId}`).get();
    const user = userSnap.val();
    if (!user) return;
    const avatarEl = document.getElementById('profileAvatarDisplay');
    if (avatarEl) avatarEl.innerHTML = user.avatarUrl ? `<img src="${user.avatarUrl}">` : (user.username?.charAt(0) || '👤');
    document.getElementById('profileNameDisplay').innerText = user.username;
    document.getElementById('profileBioDisplay').innerText = user.bio || '';
    const userPosts = allPosts.filter(p => p.sender === userId);
    document.getElementById('profilePosts').innerText = userPosts.length;
    document.getElementById('profileFollowers').innerText = Object.keys(user.followers || {}).length;
    document.getElementById('profileFollowing').innerText = Object.keys(user.following || {}).length;
    const grid = document.getElementById('profilePostsGrid');
    if (grid) {
        grid.innerHTML = userPosts.map(p => `
            <div class="post-grid-item" onclick="window.open('${p.mediaUrl}','_blank')">
                ${p.mediaType === 'video' ? `<video src="${p.mediaUrl}" style="width:100%;height:100%;object-fit:cover;"></video>` : `<img src="${p.mediaUrl}">`}
                <div class="post-views">${p.views ? (p.views > 1000 ? (p.views/1000).toFixed(1)+'ألف' : p.views) : '0'}</div>
            </div>
        `).join('');
    }
    const actionsDiv = document.getElementById('profileActions');
    if (actionsDiv) {
        if (userId === currentUser?.uid) {
            actionsDiv.innerHTML = `<button class="action-btn-primary" onclick="editProfile()">تعديل الملف</button><button class="action-btn-secondary" onclick="logout()">تسجيل خروج</button>`;
        } else {
            const isFollowing = currentUserData?.following && currentUserData.following[userId];
            actionsDiv.innerHTML = `<button class="action-btn-primary" onclick="toggleFollow('${userId}', this)">${isFollowing ? 'متابع' : 'متابعة'}</button><button class="action-btn-secondary" onclick="openPrivateChat('${userId}')"><i class="fas fa-envelope"></i> مراسلة</button>`;
        }
    }
}
function openMyProfile() { if (currentUser) viewProfile(currentUser.uid); }
function editProfile() { alert('ستتم إضافة تعديل الملف لاحقاً'); }

// ========== صفحة الرسائل ==========
function renderMessagesPage() {
    const container = document.getElementById('messagesPage');
    if (!container) return;
    const mockChats = [
        { id: 'user1', name: '🇮🇹🇪🇸🧡 تمت المشاهدة', avatar: '', lastActivity: 'منذ ٤٦ د', status: 'new', action: 'camera' },
        { id: 'user2', name: 'محمد الشيخ نشط', avatar: '', lastActivity: 'منذ ٣٤ د', status: 'active', action: 'call' },
        { id: 'user3', name: 'عبدالرحمن عبدالحي تمت المشاهدة', avatar: '', lastActivity: 'منذ ١٣ د', status: 'seen', action: 'camera' },
        { id: 'user4', name: 'السيد أبو العلا تمت المشاهدة', avatar: '', lastActivity: 'منذ ١٣ د', status: 'seen', action: 'camera' },
        { id: 'user5', name: 'zainab نشط', avatar: '', lastActivity: 'اليوم', status: 'active', action: 'camera' },
        { id: 'user6', name: 'الفائز نشط', avatar: '', lastActivity: 'منذ ٣ د', status: 'active', action: 'camera' }
    ];
    const stories = [
        { user: 'ملاحظتك', text: 'أجواء اليوم... مشاركة الموقع متوقعة', avatar: '' },
        { user: 'حنان أبو الوفا', text: 'وينك دبي اندومي', avatar: '' },
        { user: 'خريطة', text: 'يقوم Bull... بالمشاركة', avatar: '' },
        { user: 'Bullet Raj (Raxaul)', text: '', avatar: '' }
    ];
    let chatListHtml = '';
    mockChats.forEach(chat => {
        const statusDot = chat.status === 'new' ? '<span class="blue-dot"></span>' : '';
        const actionIcon = chat.action === 'camera' ? '<i class="fas fa-camera chat-action"></i>' : '<i class="fas fa-phone chat-action"></i>';
        chatListHtml += `
            <div class="chat-item" onclick="openPrivateChat('${chat.id}')">
                <div class="chat-avatar"><img src="https://via.placeholder.com/56/444" onerror="this.src='https://via.placeholder.com/56'"></div>
                <div class="chat-info">
                    <div class="chat-name">${chat.name} ${statusDot}</div>
                    <div class="chat-status">${chat.lastActivity}</div>
                </div>
                <div class="chat-action">${actionIcon}</div>
            </div>
        `;
    });
    container.innerHTML = `
        <div class="search-bar"><input type="text" class="search-input" placeholder="ابحث أو اطرح سؤالاً على Meta AI"></div>
        <div class="stories-row" id="messagesStoriesRow"></div>
        <div class="chat-tabs">
            <button class="chat-tab active" data-tab="primary">أساسي</button>
            <button class="chat-tab" data-tab="requests">الطلبات</button>
            <button class="chat-tab" data-tab="general">عام</button>
            <i class="fas fa-sliders-h filter-icon"></i>
        </div>
        <div class="chat-list">${chatListHtml}</div>
    `;
    const storiesContainer = document.getElementById('messagesStoriesRow');
    if (storiesContainer) {
        storiesContainer.innerHTML = stories.map(s => `
            <div class="story-item">
                <div class="story-ring"><img class="story-avatar" src="https://via.placeholder.com/64" onerror="this.src='https://via.placeholder.com/64'"></div>
                <div class="story-name">${s.user}</div>
                <div class="story-text">${s.text}</div>
            </div>
        `).join('');
    }
    document.querySelectorAll('.chat-tab').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
        };
    });
}

// ========== الدردشة الخاصة ==========
function getChatId(uid1, uid2) { return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`; }
async function openPrivateChat(otherUserId) {
    currentChatUserId = otherUserId;
    const user = allUsers[otherUserId];
    document.getElementById('chatUserName').innerText = `@${user?.username || 'مستخدم'}`;
    document.getElementById('chatAvatar').innerHTML = user?.avatarUrl ? `<img src="${user.avatarUrl}" class="w-full h-full rounded-full object-cover">` : (user?.username?.charAt(0) || '👤');
    await loadPrivateMessages(otherUserId);
    document.getElementById('chatPanel').classList.add('open');
}
function closeChatPanel() { document.getElementById('chatPanel').classList.remove('open'); currentChatUserId = null; }
async function loadPrivateMessages(otherUserId) {
    const container = document.getElementById('chatMessages');
    container.innerHTML = '<div class="text-center text-gray-500 py-10">جاري التحميل...</div>';
    const chatId = getChatId(currentUser.uid, otherUserId);
    const messagesSnap = await db.ref(`private_messages/${chatId}`).once('value');
    const messages = messagesSnap.val() || {};
    container.innerHTML = '';
    const sorted = Object.entries(messages).sort((a,b)=>a[1].timestamp-b[1].timestamp);
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
async function sendChatMessage() {
    const input = document.getElementById('chatMessageInput');
    const text = input.value.trim();
    if (!text || !currentChatUserId) return;
    const chatId = getChatId(currentUser.uid, currentChatUserId);
    await db.ref(`private_messages/${chatId}`).push({ senderId: currentUser.uid, senderName: currentUserData?.username, text, type: 'text', timestamp: Date.now() });
    await db.ref(`private_chats/${currentUser.uid}/${currentChatUserId}`).set({ lastMessage: text, lastTimestamp: Date.now(), withUser: currentChatUserId });
    await db.ref(`private_chats/${currentChatUserId}/${currentUser.uid}`).set({ lastMessage: text, lastTimestamp: Date.now(), withUser: currentUser.uid });
    input.value = '';
    await loadPrivateMessages(currentChatUserId);
}
async function sendChatImage(input) {
    const file = input.files[0];
    if (!file || !currentChatUserId) return;
    const fd = new FormData(); fd.append('file', file); fd.append('upload_preset', UPLOAD_PRESET);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    const chatId = getChatId(currentUser.uid, currentChatUserId);
    await db.ref(`private_messages/${chatId}`).push({ senderId: currentUser.uid, senderName: currentUserData?.username, imageUrl: data.secure_url, type: 'image', timestamp: Date.now() });
    await db.ref(`private_chats/${currentUser.uid}/${currentChatUserId}`).set({ lastMessage: '📷 صورة', lastTimestamp: Date.now(), withUser: currentChatUserId });
    await db.ref(`private_chats/${currentChatUserId}/${currentUser.uid}`).set({ lastMessage: '📷 صورة', lastTimestamp: Date.now(), withUser: currentUser.uid });
    input.value = '';
    await loadPrivateMessages(currentChatUserId);
}

// ========== التنقل بين الصفحات ==========
function showPage(page) {
    const pages = ['feed', 'reels', 'create', 'profile', 'messages'];
    pages.forEach(p => {
        const el = document.getElementById(p + 'Page');
        if (el) el.style.display = 'none';
    });
    document.getElementById(page + 'Page').style.display = 'block';
    updateTopBar(page);
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    if (page === 'feed') document.getElementById('navHome').classList.add('active');
    if (page === 'search') document.getElementById('navSearch').classList.add('active');
    if (page === 'create') document.getElementById('navCreate').classList.add('active');
    if (page === 'reels') document.getElementById('navReels').classList.add('active');
    if (page === 'profile') document.getElementById('navProfile').classList.add('active');
    if (page === 'messages') document.getElementById('navMessages')?.classList.add('active');
    
    if (page === 'profile') loadProfileData(currentUser.uid);
    if (page === 'messages') renderMessagesPage();
    if (page === 'create') {
        const createDiv = document.getElementById('createPage');
        if (createDiv.innerHTML === '') {
            createDiv.innerHTML = `
                <div class="create-post-area">
                    <div class="upload-media-area" onclick="document.getElementById('createPostFile').click()">
                        <i class="fas fa-cloud-upload-alt fa-3x"></i>
                        <p>اختر صورة أو فيديو</p>
                    </div>
                    <input type="file" id="createPostFile" accept="image/*,video/*" style="display:none">
                    <textarea class="create-caption" rows="3" placeholder="اكتب وصفاً... #هاشتاق"></textarea>
                    <button class="action-btn-primary w-full" onclick="createPost()">نشر</button>
                    <div id="createPostStatus"></div>
                </div>
            `;
            document.getElementById('createPostFile').addEventListener('change', (e) => { selectedPostFile = e.target.files[0]; });
        }
    }
    if (page === 'feed' && document.getElementById('feedPage').innerHTML === '') renderFeed();
    if (page === 'reels' && document.getElementById('reelsPage').innerHTML === '') renderReels();
}

function updateTopBar(page) {
    const topBar = document.getElementById('topBar');
    if (page === 'feed') {
        topBar.innerHTML = `
            <div class="top-bar-left"><i class="far fa-heart top-icon"></i></div>
            <div class="logo-text">instagrami</div>
            <div class="top-bar-right"><i class="fas fa-plus-square top-icon" onclick="showPage('create')"></i></div>
        `;
    } else if (page === 'reels') {
        topBar.innerHTML = `
            <div class="top-bar-left"><i class="fas fa-user-friends top-icon"></i></div>
            <div class="top-title">Reels</div>
            <div class="top-bar-right"><i class="fas fa-camera top-icon"></i></div>
        `;
    } else if (page === 'profile') {
        topBar.innerHTML = `
            <div class="top-bar-left"><i class="fas fa-plus top-icon"></i></div>
            <div class="top-title">${currentUserData?.username || ''}</div>
            <div class="top-bar-right"><i class="fas fa-bell top-icon"></i><i class="fas fa-bars top-icon"></i></div>
        `;
    } else if (page === 'messages') {
        topBar.innerHTML = `
            <div class="top-bar-left"><i class="fas fa-plus-circle top-icon"></i><i class="fas fa-chart-simple top-icon"></i></div>
            <div class="top-title">${currentUserData?.username || ''}</div>
            <div class="top-bar-right"><i class="fas fa-bars top-icon"></i></div>
        `;
    } else {
        topBar.innerHTML = `<div class="logo-text">instagrami</div><div class="top-icons"></div>`;
    }
}

// ========== تهيئة الصفحات ==========
function initPages() {
    const profileDiv = document.getElementById('profilePage');
    profileDiv.innerHTML = `
        <div class="profile-header">
            <div class="profile-avatar-large" id="profileAvatarDisplay" onclick="changeAvatar()">👤</div>
            <div class="profile-name" id="profileNameDisplay"></div>
            <div class="profile-bio" id="profileBioDisplay"></div>
            <div class="profile-stats">
                <div class="stat-item"><div class="stat-number" id="profilePosts">0</div><div class="stat-label">منشورات</div></div>
                <div class="stat-item"><div class="stat-number" id="profileFollowers">0</div><div class="stat-label">متابع</div></div>
                <div class="stat-item"><div class="stat-number" id="profileFollowing">0</div><div class="stat-label">يتابع</div></div>
            </div>
            <div id="profileActions" class="action-buttons"></div>
        </div>
        <div id="profilePostsGrid" class="posts-grid"></div>
    `;
    const createDiv = document.getElementById('createPage');
    createDiv.innerHTML = `
        <div class="create-post-area">
            <div class="upload-media-area" onclick="document.getElementById('createPostFile').click()">
                <i class="fas fa-cloud-upload-alt fa-3x"></i>
                <p>اختر صورة أو فيديو</p>
            </div>
            <input type="file" id="createPostFile" accept="image/*,video/*" style="display:none">
            <textarea class="create-caption" rows="3" placeholder="اكتب وصفاً... #هاشتاق"></textarea>
            <button class="action-btn-primary w-full" onclick="createPost()">نشر</button>
            <div id="createPostStatus"></div>
        </div>
    `;
    document.getElementById('createPostFile').addEventListener('change', (e) => { selectedPostFile = e.target.files[0]; });
}

// ========== مراقبة المستخدم ==========
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        await loadUserData();
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        initPages();
        showPage('feed');
    } else {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
    }
});

document.getElementById('navHome').addEventListener('click', () => showPage('feed'));
document.getElementById('navSearch').addEventListener('click', () => showPage('search'));
document.getElementById('navCreate').addEventListener('click', () => showPage('create'));
document.getElementById('navReels').addEventListener('click', () => showPage('reels'));
document.getElementById('navProfile').addEventListener('click', () => openMyProfile());

console.log('✅ instagrami Ready');
