import { auth, db, ref, push, set, onValue, update, get, child, CLOUD_NAME, UPLOAD_PRESET } from './firebase-config.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

// ========== إعدادات الأدمن ==========
const ADMIN_EMAILS = ['jasim28v@gmail.com'];
let isAdmin = false;

// ========== المتغيرات العامة ==========
let currentUser = null;
let currentUserData = null;
let allUsers = {};
let allVideos = [];
let isMuted = true;
let viewingProfileUserId = null;
let selectedVideoFile = null;
let popularHashtags = ['تيك_توك', 'ترند', 'اكسبلور', 'فن', 'موسيقى', 'ضحك', 'رياضة', 'طبخ', 'سفر', 'تحدي'];

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
            username, email, bio: '', avatarUrl: '', followers: {}, following: {}, totalLikes: 0, createdAt: Date.now()
        });
        msg.innerText = '';
    } catch (error) {
        if (error.code === 'auth/email-already-in-use') msg.innerText = 'البريد الإلكتروني مستخدم بالفعل';
        else msg.innerText = 'حدث خطأ: ' + error.message;
    }
};

window.logout = function() { signOut(auth); location.reload(); };

// ========== التحقق من الأدمن ==========
function checkAdminStatus() {
    if (currentUser && ADMIN_EMAILS.includes(currentUser.email)) {
        isAdmin = true;
        return true;
    }
    isAdmin = false;
    return false;
}

// ========== تحميل البيانات ==========
async function loadUserData() {
    const snap = await get(child(ref(db), `users/${currentUser.uid}`));
    if (snap.exists()) currentUserData = { uid: currentUser.uid, ...snap.val() };
}
onValue(ref(db, 'users'), (s) => { allUsers = s.val() || {}; });

// ========== هاشتاقات ==========
function addHashtags(text) {
    if (!text) return '';
    return text.replace(/#(\w+)/g, '<span class="hashtag" onclick="searchHashtag(\'$1\')">#$1</span>');
}
window.searchHashtag = function(tag) {
    alert(`البحث عن هاشتاق: #${tag}`);
};

window.showHashtagSuggestions = function() {
    const textarea = document.getElementById('videoDescription');
    const suggestionsDiv = document.getElementById('hashtagSuggestions');
    const text = textarea.value;
    const lastWord = text.split(' ').pop();
    if (lastWord.startsWith('#')) {
        const searchTerm = lastWord.substring(1).toLowerCase();
        const filtered = popularHashtags.filter(h => h.includes(searchTerm));
        if (filtered.length > 0) {
            suggestionsDiv.innerHTML = filtered.map(h => `<span class="bg-[#ec489a]/20 text-[#ec489a] px-3 py-1 rounded-full text-sm cursor-pointer" onclick="insertHashtag('${h}')">#${h}</span>`).join('');
        } else {
            suggestionsDiv.innerHTML = '';
        }
    } else {
        suggestionsDiv.innerHTML = '';
    }
};

window.insertHashtag = function(hashtag) {
    const textarea = document.getElementById('videoDescription');
    const text = textarea.value;
    const lastWord = text.split(' ').pop();
    const newText = text.substring(0, text.length - lastWord.length) + '#' + hashtag + ' ';
    textarea.value = newText;
    textarea.focus();
    document.getElementById('hashtagSuggestions').innerHTML = '';
};

// ========== عرض الفيديوهات ==========
onValue(ref(db, 'videos'), (s) => {
    const data = s.val();
    if (!data) { allVideos = []; renderVideos(); return; }
    allVideos = [];
    Object.keys(data).forEach(key => allVideos.push({ id: key, ...data[key] }));
    allVideos.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderVideos();
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
        const caption = addHashtags(video.description || '');
        const avatarHtml = (user.avatarUrl && user.avatarUrl !== '') ? `<img src="${user.avatarUrl}">` : (user.username?.charAt(0)?.toUpperCase() || '👤');
        const div = document.createElement('div');
        div.className = 'video-item';
        div.innerHTML = `
            <video loop playsinline muted data-src="${video.url}" poster="${video.thumbnail || ''}"></video>
            <div class="video-info">
                <div class="author-info">
                    <div class="author-avatar" onclick="viewProfile('${video.sender}')">${avatarHtml}</div>
                    <div class="author-name">
                        <span onclick="viewProfile('${video.sender}')">@${user.username}</span>
                        ${currentUser?.uid !== video.sender ? `<button class="follow-btn" onclick="toggleFollow('${video.sender}', this)">${isFollowing ? 'متابع' : 'متابعة'}</button>` : ''}
                    </div>
                </div>
                <div class="video-caption">${caption}</div>
                <div class="video-music"><i class="fas fa-music"></i> ${video.music || 'Original Sound'}</div>
            </div>
            <div class="side-actions">
                <button class="side-btn" onclick="toggleGlobalMute()"><i class="fas ${isMuted ? 'fa-volume-mute' : 'fa-volume-up'}"></i></button>
                <button class="side-btn like-btn ${isLiked ? 'active' : ''}" onclick="toggleLike('${video.id}', this)"><i class="fas fa-heart"></i><span class="count">${video.likes || 0}</span></button>
                <button class="side-btn" onclick="openComments('${video.id}')"><i class="fas fa-comment"></i><span class="count">${commentsCount}</span></button>
                <button class="side-btn" onclick="shareVideo('${video.url}')"><i class="fas fa-share"></i></button>
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
    const btns = document.querySelectorAll('.side-actions .side-btn:first-child i');
    btns.forEach(btn => btn.className = isMuted ? 'fas fa-volume-mute' : 'fas fa-volume-up');
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
        await addNotification(userId, 'unfollow', currentUser.uid);
    } else {
        await set(userRef, true); await set(targetRef, true); btn.innerText = 'متابع';
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
            timestamp: Date.now()
        });
        const video = allVideos.find(v => v.id === videoId);
        if (video && video.sender !== currentUser.uid) await addNotification(video.sender, 'comment', currentUser.uid);
        renderVideos();
    }
};

window.shareVideo = function(url) {
    if (navigator.share) navigator.share({ url });
    else { navigator.clipboard.writeText(url); alert('✅ تم نسخ الرابط'); }
};

// ========== الإشعارات ==========
async function addNotification(targetUserId, type, fromUserId) {
    if (targetUserId === fromUserId) return;
    const fromUser = allUsers[fromUserId] || { username: 'مستخدم' };
    const messages = { like: 'أعجب بفيديو الخاص بك', comment: 'علق على فيديو الخاص بك', follow: 'بدأ بمتابعتك', unfollow: 'توقف عن متابعتك' };
    await push(ref(db, `notifications/${targetUserId}`), { type, fromUserId, fromUsername: fromUser.username, message: messages[type], timestamp: Date.now(), read: false });
}

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
            timestamp: Date.now()
        });
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
    const avatarDisplay = document.getElementById('profileAvatarDisplay');
    avatarDisplay.innerHTML = user.avatarUrl ? `<img src="${user.avatarUrl}">` : (user.username?.charAt(0)?.toUpperCase() || '👤');
    document.getElementById('profileNameDisplay').innerText = user.username || 'مستخدم';
    document.getElementById('profileBioDisplay').innerText = user.bio || '';
    document.getElementById('profileFollowing').innerText = Object.keys(user.following || {}).length;
    document.getElementById('profileFollowers').innerText = Object.keys(user.followers || {}).length;
    const userVideos = allVideos.filter(v => v.sender === userId);
    const totalLikes = userVideos.reduce((sum, v) => sum + (v.likes || 0), 0);
    document.getElementById('profileLikes').innerText = totalLikes;
    const container = document.getElementById('profileVideosList');
    container.innerHTML = '';
    if (userVideos.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-400 py-10">لا توجد فيديوهات بعد</div>';
    } else {
        userVideos.forEach(v => {
            const thumb = document.createElement('div');
            thumb.className = 'video-thumb';
            thumb.innerHTML = '<i class="fas fa-play text-2xl"></i>';
            thumb.onclick = () => window.open(v.url, '_blank');
            container.appendChild(thumb);
        });
    }
    const actionsDiv = document.getElementById('profileActions');
    actionsDiv.innerHTML = '';
    if (userId === currentUser?.uid) {
        actionsDiv.innerHTML = `<button class="edit-profile-btn" onclick="openEditProfile()">تعديل الملف الشخصي</button><button class="logout-btn" onclick="logout()">تسجيل خروج</button>`;
        if (isAdmin) actionsDiv.innerHTML += '<div class="admin-panel mt-4 p-4 bg-pink-500/10 rounded-xl border border-pink-500/30"><h4 class="text-pink-500 font-bold">لوحة تحكم الأدمن</h4><p>إدارة المحتوى متاحة قريباً</p></div>';
    } else {
        const isFollowing = currentUserData?.following && currentUserData.following[userId];
        actionsDiv.innerHTML = `<button class="follow-btn" onclick="toggleFollow('${userId}', this)">${isFollowing ? 'متابع' : 'متابعة'}</button>`;
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

// ========== البحث ==========
window.openSearch = function() {
    const searchTerm = prompt("ابحث عن مستخدمين أو هاشتاقات:");
    if (searchTerm) alert(`نتائج البحث عن: ${searchTerm}`);
};

// ========== التنقل ==========
window.switchTab = function(tab) {
    document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
    event.target.closest('.nav-item').classList.add('active');
    if (tab === 'home') {
        document.getElementById('uploadPanel').classList.remove('open');
        document.getElementById('profilePanel').classList.remove('open');
    }
    if (tab === 'profile') openMyProfile();
};

// ========== مراقبة المستخدم ==========
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        await loadUserData();
        checkAdminStatus();
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
