// ========== الإعدادات العامة ==========
let currentUser = null;
let currentUserData = null;
let currentVideoId = null;
let currentShareUrl = null;
let allUsers = {};
let allVideos = [];
let allStories = [];
let isMuted = true;
let currentFeed = 'forYou';
let currentChatUserId = null;
let selectedVideoFile = null;

// ========== دوال المصادقة الحديثة ==========
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
    if (!email || !password) { msg.innerText = '⚠️ الرجاء ملء جميع الحقول'; return; }
    msg.innerText = '🔄 جاري تسجيل الدخول...';
    try {
        await auth.signInWithEmailAndPassword(email, password);
        msg.innerText = '';
    } catch (error) {
        if (error.code === 'auth/user-not-found') msg.innerText = '❌ لا يوجد حساب';
        else if (error.code === 'auth/wrong-password') msg.innerText = '❌ كلمة المرور غير صحيحة';
        else msg.innerText = '❌ حدث خطأ';
    }
}

async function register() {
    const username = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPass').value;
    const msg = document.getElementById('regMsg');
    if (!username || !email || !password) { msg.innerText = '⚠️ املأ جميع الحقول'; return; }
    if (password.length < 6) { msg.innerText = '⚠️ كلمة المرور 6 أحرف على الأقل'; return; }
    msg.innerText = '🔄 جاري إنشاء الحساب...';
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        await db.ref(`users/${userCredential.user.uid}`).set({
            username, email, bio: '', avatarUrl: '', followers: {}, following: {}, points: 0, totalLikes: 0, createdAt: Date.now()
        });
        msg.innerText = '';
    } catch (error) {
        if (error.code === 'auth/email-already-in-use') msg.innerText = '❌ البريد مستخدم';
        else msg.innerText = '❌ حدث خطأ';
    }
}

function logout() { auth.signOut(); location.reload(); }

// ========== تحميل البيانات ==========
async function loadUserData() { const snap = await db.ref(`users/${currentUser.uid}`).get(); if (snap.exists()) currentUserData = { uid: currentUser.uid, ...snap.val() }; }
db.ref('users').on('value', s => { allUsers = s.val() || {}; renderStories(); });

// ========== القصص (Stories) ==========
async function renderStories() {
    if (!currentUserData) return;
    const container = document.getElementById('storiesRow');
    if (!container) return;
    const followingIds = Object.keys(currentUserData.following || {});
    let storiesData = [];
    for (let uid of followingIds) {
        const storiesSnap = await db.ref(`stories/${uid}`).once('value');
        const userStories = storiesSnap.val() || {};
        const now = Date.now();
        for (let [id, story] of Object.entries(userStories)) {
            if (story.expiry > now) storiesData.push({ uid, storyId: id, ...story, username: allUsers[uid]?.username });
        }
    }
    storiesData.sort((a,b) => a.timestamp - b.timestamp);
    container.innerHTML = storiesData.map(s => `
        <div class="story-item" onclick="viewStory('${s.uid}', '${s.storyId}')">
            <div class="story-ring"><div class="story-ring inner">${s.mediaType === 'image' ? `<img src="${s.url}">` : `<video src="${s.url}" style="width:100%;height:100%;object-fit:cover"></video>`}</div></div>
            <div class="story-name">@${s.username?.substring(0,10) || 'user'}</div>
        </div>
    `).join('');
    if (container.innerHTML === '') container.innerHTML = '<div class="text-center text-gray-400 text-sm py-2">لا توجد قصص حالياً</div>';
}

async function addStory(mediaFile, type) {
    if (!currentUser) return;
    const fd = new FormData(); fd.append('file', mediaFile); fd.append('upload_preset', UPLOAD_PRESET);
    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${type === 'image' ? 'image' : 'video'}/upload`;
    const res = await fetch(url, { method: 'POST', body: fd });
    const data = await res.json();
    await db.ref(`stories/${currentUser.uid}`).push({
        url: data.secure_url, mediaType: type, timestamp: Date.now(), expiry: Date.now() + 86400000
    });
    renderStories();
}

// ========== نظام النقاط ==========
async function addPoints(userId, points, reason) {
    const userRef = db.ref(`users/${userId}`);
    const snap = await userRef.get();
    const currentPoints = snap.val()?.points || 0;
    await userRef.update({ points: currentPoints + points });
    await db.ref(`points_log/${userId}`).push({ points, reason, timestamp: Date.now() });
}

async function getLeaderboard() {
    const usersSnap = await db.ref('users').once('value');
    const users = usersSnap.val() || {};
    const sorted = Object.entries(users).sort((a,b) => (b[1].points||0) - (a[1].points||0)).slice(0,10);
    return sorted.map(([uid, u], i) => ({ rank: i+1, username: u.username, points: u.points||0 }));
}

// ========== الإبلاغ عن المحتوى ==========
async function reportContent(contentType, contentId, reason) {
    if (!currentUser) { alert('يجب تسجيل الدخول للإبلاغ'); return; }
    await db.ref('reports').push({
        reporterId: currentUser.uid, reporterName: currentUserData?.username,
        contentType, contentId, reason, timestamp: Date.now(), status: 'pending'
    });
    alert('✅ تم الإبلاغ، سيتم مراجعته من قبل الإدارة');
}

// ========== إشعارات المتصفح ==========
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission();
    }
}

async function sendBrowserNotification(title, body, icon) {
    if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: icon || '/favicon.ico' });
    }
}

// ========== وضع الضيف ==========
let isGuestMode = false;
function enableGuestMode() {
    isGuestMode = true;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    currentUser = null;
    currentUserData = null;
    loadGuestVideos();
}

async function loadGuestVideos() {
    const snap = await db.ref('videos').once('value');
    const data = snap.val() || {};
    allVideos = Object.keys(data).map(k => ({ id: k, ...data[k] }));
    allVideos.sort((a,b) => (b.timestamp||0) - (a.timestamp||0));
    renderVideosGuest();
}

function renderVideosGuest() {
    const container = document.getElementById('videosContainer');
    container.innerHTML = '';
    allVideos.forEach(video => {
        const user = allUsers[video.sender] || { username: video.senderName || 'user', avatarUrl: '' };
        const avatarHtml = (user.avatarUrl && user.avatarUrl !== '') ? `<img src="${user.avatarUrl}">` : (user.username?.charAt(0)?.toUpperCase() || '👤');
        const div = document.createElement('div'); div.className = 'video-item';
        div.innerHTML = `
            <video loop playsinline muted data-src="${video.url}" poster="${video.thumbnail || ''}"></video>
            <div class="video-info"><div class="author-info"><div class="author-avatar" onclick="promptLogin()">${avatarHtml}</div><div class="author-name"><span onclick="promptLogin()">@${user.username}</span></div></div><div class="video-caption">${video.description || ''}</div></div>
            <div class="side-actions"><button class="side-btn" onclick="toggleGlobalMute()"><i class="fas ${isMuted ? 'fa-volume-mute' : 'fa-volume-up'}"></i></button><button class="side-btn" onclick="promptLogin()"><i class="fas fa-heart"></i><span class="count">${video.likes || 0}</span></button><button class="side-btn" onclick="promptLogin()"><i class="fas fa-comment"></i></button><button class="side-btn" onclick="openShare('${video.url}')"><i class="fas fa-share"></i></button></div>
        `;
        container.appendChild(div);
    });
    initVideoObserver();
}

function promptLogin() { alert('🔐 يرجى تسجيل الدخول للتفاعل مع المحتوى'); }

// ========== عرض الفيديوهات ==========
db.ref('videos').on('value', (s) => {
    const data = s.val();
    if (!data) { allVideos = []; renderVideos(); return; }
    allVideos = Object.keys(data).map(k => ({ id: k, ...data[k] }));
    allVideos.sort((a,b) => (b.timestamp||0) - (a.timestamp||0));
    if (!isGuestMode && currentUser) renderVideos();
});

function renderVideos() {
    if (isGuestMode) return;
    const container = document.getElementById('videosContainer');
    if (!container) return;
    container.innerHTML = '';
    let filteredVideos = currentFeed === 'forYou' ? allVideos : allVideos.filter(v => currentUserData?.following?.[v.sender]);
    if (filteredVideos.length === 0) { container.innerHTML = '<div class="loading"><div class="spinner"></div><span>' + (currentFeed === 'forYou' ? 'لا توجد فيديوهات' : 'تابع مستخدمين لرؤية فيديوهاتهم') + '</span></div>'; return; }
    filteredVideos.forEach(video => {
        const isLiked = video.likedBy && video.likedBy[currentUser?.uid];
        const user = allUsers[video.sender] || { username: video.senderName || 'user', avatarUrl: '' };
        const isFollowing = currentUserData?.following && currentUserData.following[video.sender];
        const commentsCount = video.comments ? Object.keys(video.comments).length : 0;
        const avatarHtml = (user.avatarUrl && user.avatarUrl !== '') ? `<img src="${user.avatarUrl}">` : (user.username?.charAt(0)?.toUpperCase() || '👤');
        const div = document.createElement('div'); div.className = 'video-item';
        div.innerHTML = `
            <video loop playsinline muted data-src="${video.url}" poster="${video.thumbnail || ''}"></video>
            <div class="video-info"><div class="author-info"><div class="author-avatar" onclick="viewProfile('${video.sender}')">${avatarHtml}</div><div class="author-name"><span onclick="viewProfile('${video.sender}')">@${user.username}</span>${currentUser?.uid !== video.sender ? `<button class="follow-btn" onclick="toggleFollow('${video.sender}', this)">${isFollowing ? 'متابع' : 'متابعة'}</button>` : ''}<button class="follow-btn" style="background:#444" onclick="reportContent('video','${video.id}','محتوى غير مناسب')"><i class="fas fa-flag"></i></button></div></div><div class="video-caption">${video.description || ''}</div><div class="video-music" onclick="searchBySound('${video.music || 'Original Sound'}')"><i class="fas fa-music"></i> ${video.music || 'Original Sound'}</div></div>
            <div class="side-actions"><button class="side-btn" onclick="toggleGlobalMute()"><i class="fas ${isMuted ? 'fa-volume-mute' : 'fa-volume-up'}"></i></button><button class="side-btn like-btn ${isLiked ? 'active' : ''}" onclick="toggleLike('${video.id}', this)"><i class="fas fa-heart"></i><span class="count">${video.likes || 0}</span></button><button class="side-btn" onclick="openComments('${video.id}')"><i class="fas fa-comment"></i><span class="count">${commentsCount}</span></button><button class="side-btn" onclick="openShare('${video.url}')"><i class="fas fa-share"></i></button></div>
        `;
        const videoEl = div.querySelector('video');
        videoEl.addEventListener('dblclick', (e) => { e.stopPropagation(); const likeBtn = div.querySelector('.like-btn'); if (likeBtn) { toggleLike(video.id, likeBtn); showHeartAnimation(e.clientX, e.clientY); } });
        container.appendChild(div);
    });
    initVideoObserver();
}

function initVideoObserver() {
    const observer = new IntersectionObserver((entries) => { entries.forEach(entry => { const video = entry.target.querySelector('video'); if (entry.isIntersecting) { if (!video.src) video.src = video.dataset.src; video.muted = isMuted; video.play().catch(() => {}); } else video.pause(); }); }, { threshold: 0.65 });
    document.querySelectorAll('.video-item').forEach(seg => observer.observe(seg));
}

function toggleGlobalMute() { isMuted = !isMuted; document.querySelectorAll('video').forEach(v => v.muted = isMuted); const btns = document.querySelectorAll('.side-actions .side-btn:first-child i'); btns.forEach(btn => btn.className = isMuted ? 'fas fa-volume-mute' : 'fas fa-volume-up'); }
function switchFeed(feed) { currentFeed = feed; document.querySelectorAll('.top-tab').forEach(t => t.classList.remove('active')); event.target.classList.add('active'); renderVideos(); }
function showHeartAnimation(x, y) { const heart = document.createElement('div'); heart.className = 'heart-animation'; heart.innerHTML = '❤️'; heart.style.left = (x - 40) + 'px'; heart.style.top = (y - 40) + 'px'; document.body.appendChild(heart); setTimeout(() => heart.remove(), 800); }

// ========== الإعجاب والمتابعة والنقاط ==========
async function toggleLike(videoId, btn) {
    if (!currentUser) { promptLogin(); return; }
    const videoRef = db.ref(`videos/${videoId}`); const snap = await videoRef.get(); const video = snap.val();
    if (!video) return;
    let likes = video.likes || 0; let likedBy = video.likedBy || {};
    if (likedBy[currentUser.uid]) { likes--; delete likedBy[currentUser.uid]; }
    else { likes++; likedBy[currentUser.uid] = true; await addPoints(video.sender, 1, 'إعجاب على فيديو'); await addNotification(video.sender, 'like', currentUser.uid); }
    await videoRef.update({ likes, likedBy });
    btn.classList.toggle('active'); const countSpan = btn.querySelector('.count'); if (countSpan) countSpan.innerText = likes;
}

async function toggleFollow(userId, btn) {
    if (!currentUser || currentUser.uid === userId) return;
    const userRef = db.ref(`users/${currentUser.uid}/following/${userId}`);
    const targetRef = db.ref(`users/${userId}/followers/${currentUser.uid}`);
    const snap = await userRef.get();
    if (snap.exists()) { await userRef.remove(); await targetRef.remove(); btn.innerText = 'متابعة'; await addNotification(userId, 'unfollow', currentUser.uid); }
    else { await userRef.set(true); await targetRef.set(true); btn.innerText = 'متابع'; await addPoints(currentUser.uid, 5, 'متابعة جديدة'); await addNotification(userId, 'follow', currentUser.uid); }
    if (viewingProfileUserId === userId) await loadProfileData(userId);
}

// ========== التعليقات والإشعارات ==========
async function openComments(videoId) { currentVideoId = videoId; const panel = document.getElementById('commentsPanel'); const snap = await db.ref(`videos/${videoId}/comments`).get(); const comments = snap.val() || {}; const container = document.getElementById('commentsList'); container.innerHTML = ''; Object.values(comments).reverse().forEach(c => { const user = allUsers[c.userId] || { username: c.username || 'user', avatarUrl: '' }; const avatarHtml = (user.avatarUrl && user.avatarUrl !== '') ? `<img src="${user.avatarUrl}" class="w-10 h-10 rounded-full">` : `<div class="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center">${user.username?.charAt(0)?.toUpperCase()}</div>`; container.innerHTML += `<div class="flex gap-3 mb-4"><div>${avatarHtml}</div><div><div class="font-bold">@${user.username}</div><div class="text-sm">${c.text}</div><button class="text-xs text-gray-400 mt-1" onclick="reportContent('comment','${c.id}','تعليق مسيء')"><i class="fas fa-flag"></i> إبلاغ</button></div></div>`; }); panel.classList.add('open'); }
function closeComments() { document.getElementById('commentsPanel').classList.remove('open'); }
async function addComment() { const input = document.getElementById('commentInput'); if (!input.value.trim() || !currentVideoId) return; await db.ref(`videos/${currentVideoId}/comments`).push({ userId: currentUser.uid, username: currentUserData?.username, text: input.value, timestamp: Date.now() }); await addPoints(currentUser.uid, 2, 'تعليق'); input.value = ''; openComments(currentVideoId); }

async function addNotification(targetUserId, type, fromUserId) { if (targetUserId === fromUserId) return; const fromUser = allUsers[fromUserId] || { username: 'مستخدم' }; const messages = { like: 'أعجب بفيديو الخاص بك', comment: 'علق على فيديو الخاص بك', follow: 'بدأ بمتابعتك', unfollow: 'توقف عن متابعتك' }; await db.ref(`notifications/${targetUserId}`).push({ type, fromUserId, fromUsername: fromUser.username, message: messages[type], timestamp: Date.now(), read: false }); if (Notification.permission === 'granted') sendBrowserNotification(`@${fromUser.username}`, messages[type], '/icon.png'); }

// ========== رفع الفيديو ==========
function openUploadPanel() { document.getElementById('uploadPanel').classList.add('open'); }
function closeUploadPanel() { document.getElementById('uploadPanel').classList.remove('open'); selectedVideoFile = null; document.getElementById('videoPreview').style.display = 'none'; document.querySelector('.preview-placeholder').style.display = 'block'; document.getElementById('videoDescription').value = ''; document.getElementById('videoMusic').value = ''; document.getElementById('videoFileInput').value = ''; }
function previewVideo(file) { if (!file) return; selectedVideoFile = file; const reader = new FileReader(); reader.onload = function(e) { const videoPreview = document.getElementById('videoPreview'); videoPreview.src = e.target.result; videoPreview.style.display = 'block'; document.querySelector('.preview-placeholder').style.display = 'none'; }; reader.readAsDataURL(file); }
async function uploadVideo() { if (!selectedVideoFile) { alert('اختر فيديو أولاً'); return; } const description = document.getElementById('videoDescription').value; const music = document.getElementById('videoMusic').value || 'Original Sound'; const fd = new FormData(); fd.append('file', selectedVideoFile); fd.append('upload_preset', UPLOAD_PRESET); fd.append('resource_type', 'video'); const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`, { method: 'POST', body: fd }); const result = await res.json(); await db.ref('videos/').push({ url: result.secure_url, thumbnail: result.secure_url.replace('.mp4', '.jpg'), description, music, sender: currentUser.uid, senderName: currentUserData?.username, likes: 0, likedBy: {}, comments: {}, timestamp: Date.now() }); await addPoints(currentUser.uid, 10, 'رفع فيديو'); alert('✅ تم الرفع بنجاح'); closeUploadPanel(); renderVideos(); }

// ========== الملف الشخصي ==========
let viewingProfileUserId = null;
async function viewProfile(userId) { viewingProfileUserId = userId; await loadProfileData(userId); document.getElementById('profilePanel').classList.add('open'); }
async function loadProfileData(userId) { const userSnap = await db.ref(`users/${userId}`).get(); const user = userSnap.val(); if (!user) return; document.getElementById('profileAvatarDisplay').innerHTML = user.avatarUrl ? `<img src="${user.avatarUrl}">` : (user.username?.charAt(0)?.toUpperCase() || '👤'); document.getElementById('profileNameDisplay').innerText = user.username || 'مستخدم'; document.getElementById('profileBioDisplay').innerText = user.bio || ''; document.getElementById('profilePoints').innerText = user.points || 0; const userVideos = allVideos.filter(v => v.sender === userId); const container = document.getElementById('profileVideosList'); container.innerHTML = ''; userVideos.forEach(v => { const thumb = document.createElement('div'); thumb.className = 'aspect-[9/16] bg-gray-800 rounded flex items-center justify-center cursor-pointer'; thumb.innerHTML = '<i class="fas fa-play text-2xl"></i>'; thumb.onclick = () => window.open(v.url, '_blank'); container.appendChild(thumb); }); const actionsDiv = document.getElementById('profileActions'); actionsDiv.innerHTML = ''; if (userId === currentUser?.uid) { actionsDiv.innerHTML = `<button class="bg-white/20 px-6 py-2 rounded-full" onclick="openEditProfile()">تعديل الملف</button><button class="bg-white/20 px-6 py-2 rounded-full" onclick="logout()">تسجيل خروج</button>`; if (ADMIN_EMAILS.includes(currentUser.email)) actionsDiv.innerHTML += `<button class="bg-red-500/30 px-6 py-2 rounded-full" onclick="showAdminPanel()">لوحة الأدمن</button>`; } else { const isFollowing = currentUserData?.following && currentUserData.following[userId]; actionsDiv.innerHTML = `<button class="bg-[#ff2a5e] px-6 py-2 rounded-full" onclick="toggleFollow('${userId}', this)">${isFollowing ? 'متابع' : 'متابعة'}</button><button class="bg-white/20 px-6 py-2 rounded-full" onclick="openPrivateChat('${userId}')"><i class="fas fa-envelope"></i> رسالة</button>`; } }
function closeProfile() { document.getElementById('profilePanel').classList.remove('open'); viewingProfileUserId = null; }
function openMyProfile() { if (currentUser) viewProfile(currentUser.uid); }

// ========== لوحة الأدمن ==========
async function showAdminPanel() { if (!ADMIN_EMAILS.includes(currentUser.email)) return; const reportsSnap = await db.ref('reports').once('value'); const reports = reportsSnap.val() || {}; let html = '<div class="p-4"><h3 class="font-bold text-xl mb-4">🔧 لوحة الأدمن</h3><h4 class="font-bold mt-4">📢 التبليغات</h4>'; for (let [id, r] of Object.entries(reports)) { html += `<div class="bg-gray-800 p-3 rounded-lg mb-2"><div>👤 ${r.reporterName}</div><div>📄 ${r.contentType}: ${r.contentId}</div><div>✏️ ${r.reason}</div><button class="bg-red-500 px-3 py-1 rounded mt-2" onclick="resolveReport('${id}')">✅ معالجة</button></div>`; } html += '<h4 class="font-bold mt-4">🏆 لوحة المتصدرين</h4><div id="leaderboardList"></div></div>'; const panel = document.createElement('div'); panel.className = 'panel'; panel.id = 'adminPanel'; panel.innerHTML = `<div class="panel-header"><h3>لوحة التحكم</h3><button class="close-btn" onclick="closeAdminPanel()"><i class="fas fa-times"></i></button></div>${html}`; document.body.appendChild(panel); panel.classList.add('open'); const leaderboard = await getLeaderboard(); document.getElementById('leaderboardList').innerHTML = leaderboard.map(l => `<div class="flex justify-between p-2 border-b border-gray-700"><span>${l.rank}. ${l.username}</span><span class="text-[#ff2a5e]">${l.points} نقطة</span></div>`).join(''); }
function closeAdminPanel() { document.getElementById('adminPanel')?.remove(); }
async function resolveReport(reportId) { await db.ref(`reports/${reportId}`).remove(); alert('تمت معالجة التبليغ'); closeAdminPanel(); showAdminPanel(); }

// ========== الدردشة الخاصة ==========
async function openConversations() { const panel = document.getElementById('conversationsPanel'); const container = document.getElementById('conversationsList'); const convSnap = await db.ref(`private_chats/${currentUser.uid}`).once('value'); const conversations = convSnap.val() || {}; container.innerHTML = ''; for (const [otherId, convData] of Object.entries(conversations)) { const otherUser = allUsers[otherId]; if (!otherUser) continue; container.innerHTML += `<div class="flex items-center gap-3 p-3 border-b border-gray-800 cursor-pointer" onclick="openPrivateChat('${otherId}')"><div class="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center">${otherUser.avatarUrl ? `<img src="${otherUser.avatarUrl}">` : otherUser.username?.charAt(0)}</div><div><div class="font-bold">@${otherUser.username}</div><div class="text-sm text-gray-400">${convData.lastMessage?.substring(0,30)}</div></div></div>`; } panel.classList.add('open'); }
function closeConversations() { document.getElementById('conversationsPanel').classList.remove('open'); }
async function openPrivateChat(otherUserId) { currentChatUserId = otherUserId; const user = allUsers[otherUserId]; document.getElementById('chatUserName').innerText = `@${user?.username}`; document.getElementById('chatAvatar').innerHTML = user?.avatarUrl ? `<img src="${user.avatarUrl}" class="w-full h-full rounded-full">` : user?.username?.charAt(0); await loadPrivateMessages(otherUserId); document.getElementById('privateChatPanel').classList.add('open'); closeConversations(); }
function closePrivateChat() { document.getElementById('privateChatPanel').classList.remove('open'); currentChatUserId = null; }
async function loadPrivateMessages(otherUserId) { const container = document.getElementById('privateMessagesList'); const chatId = getChatId(currentUser.uid, otherUserId); const messagesSnap = await db.ref(`private_messages/${chatId}`).once('value'); const messages = messagesSnap.val() || {}; container.innerHTML = ''; const sorted = Object.entries(messages).sort((a,b) => a[1].timestamp - b[1].timestamp); for (const [_, msg] of sorted) { const isSent = msg.senderId === currentUser.uid; container.innerHTML += `<div class="flex ${isSent ? 'justify-end' : 'justify-start'} mb-3"><div class="${isSent ? 'bg-[#ff2a5e]' : 'bg-gray-800'} rounded-2xl p-3 max-w-[75%]"><div>${msg.type === 'image' ? `<img src="${msg.imageUrl}" class="max-w-[200px] rounded-xl cursor-pointer" onclick="window.open('${msg.imageUrl}')">` : msg.text}</div><div class="text-xs opacity-50 mt-1">${new Date(msg.timestamp).toLocaleTimeString()}</div></div></div>`; } container.scrollTop = container.scrollHeight; }
async function sendPrivateMessage() { const input = document.getElementById('privateMessageInput'); const text = input.value.trim(); if (!text || !currentChatUserId) return; const chatId = getChatId(currentUser.uid, currentChatUserId); const message = { senderId: currentUser.uid, senderName: currentUserData?.username, text, type: 'text', timestamp: Date.now() }; await db.ref(`private_messages/${chatId}`).push(message); await db.ref(`private_chats/${currentUser.uid}/${currentChatUserId}`).set({ lastMessage: text, lastTimestamp: Date.now() }); await db.ref(`private_chats/${currentChatUserId}/${currentUser.uid}`).set({ lastMessage: text, lastTimestamp: Date.now() }); input.value = ''; await loadPrivateMessages(currentChatUserId); }
function getChatId(uid1, uid2) { return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`; }

// ========== البحث والأصوات والمشاركة ==========
function openSearch() { document.getElementById('searchPanel').classList.add('open'); }
function closeSearch() { document.getElementById('searchPanel').classList.remove('open'); }
function searchAll() { const query = document.getElementById('searchInput').value.toLowerCase(); const resultsDiv = document.getElementById('searchResults'); if (!query) { resultsDiv.innerHTML = ''; return; } const users = Object.values(allUsers).filter(u => u.username.toLowerCase().includes(query)); const videos = allVideos.filter(v => v.description?.toLowerCase().includes(query) || v.music?.toLowerCase().includes(query)); resultsDiv.innerHTML = `${users.length ? `<div class="mb-4"><h4 class="text-sm opacity-60 mb-2">👥 مستخدمين</h4>${users.map(u => `<div class="flex items-center gap-3 p-2 cursor-pointer" onclick="viewProfile('${u.uid}')"><div class="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">${u.avatarUrl ? `<img src="${u.avatarUrl}">` : u.username.charAt(0)}</div><div>@${u.username}</div></div>`).join('')}</div>` : ''}${videos.length ? `<div><h4 class="text-sm opacity-60 mb-2">🎬 فيديوهات</h4>${videos.map(v => `<div class="flex items-center gap-3 p-2 cursor-pointer" onclick="window.open('${v.url}','_blank')"><i class="fas fa-video"></i><div>${(v.description || 'فيديو').substring(0,40)}</div></div>`).join('')}</div>` : ''}`; }
function openSounds() { document.getElementById('soundsPanel').classList.add('open'); const soundsMap = {}; allVideos.forEach(v => { if (v.music) soundsMap[v.music] = (soundsMap[v.music] || 0) + 1; }); const soundsList = Object.entries(soundsMap).sort((a,b) => b[1]-a[1]); document.getElementById('soundsList').innerHTML = soundsList.map(([name, count]) => `<div class="flex items-center gap-3 p-3 border-b border-gray-800 cursor-pointer" onclick="searchBySound('${name}')"><i class="fas fa-music text-[#ff2a5e]"></i><div><div>${name}</div><div class="text-xs text-gray-400">${count} فيديو</div></div></div>`).join(''); }
function closeSounds() { document.getElementById('soundsPanel').classList.remove('open'); }
function searchBySound(sound) { document.getElementById('searchInput').value = sound; closeSounds(); openSearch(); searchAll(); }
function openShare(url) { currentShareUrl = url; document.getElementById('sharePanel').classList.add('open'); }
function closeShare() { document.getElementById('sharePanel').classList.remove('open'); }
function copyLink() { navigator.clipboard.writeText(currentShareUrl); const toast = document.getElementById('copyToast'); toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2000); closeShare(); }
function downloadVideo() { window.open(currentShareUrl, '_blank'); closeShare(); }

// ========== مراقبة المستخدم ==========
auth.onAuthStateChanged(async (user) => {
    if (user) { currentUser = user; await loadUserData(); isGuestMode = false; document.getElementById('loginScreen').style.display = 'none'; document.getElementById('mainApp').style.display = 'block'; requestNotificationPermission(); renderVideos(); renderStories(); } 
    else if (!isGuestMode) { document.getElementById('loginScreen').style.display = 'flex'; document.getElementById('mainApp').style.display = 'none'; }
});

// ========== تشغيل سريع ==========
function switchTab(tab) { if (tab === 'search') openSearch(); if (tab === 'home') { closeSearch(); closeProfile(); closeSounds(); closeUploadPanel(); } }
window.enableGuestMode = enableGuestMode;
console.log('✅ FOXE Modern System Loaded');
