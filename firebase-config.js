// Firebase Configuration - استخدم هذه الإعدادات الجديدة
const firebaseConfig = {
    apiKey: "AIzaSyBMKBnXRZ2mL5C2FYRih6NSpBIbebYeTBI",
    authDomain: "porn-dc411.firebaseapp.com",
    databaseURL: "https://porn-dc411-default-rtdb.firebaseio.com",
    projectId: "porn-dc411",
    storageBucket: "porn-dc411.firebasestorage.app",
    messagingSenderId: "344117985586",
    appId: "1:344117985586:web:d1064a4fd269983174572b",
    measurementId: "G-CZ6E0V68WZ"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

// Cloudinary Configuration - استخدم هذه الإعدادات
const CLOUD_NAME = 'dnillsbmi';
const UPLOAD_PRESET = 'ekxzvogb';

console.log('✅ ECHO Platform Ready');
