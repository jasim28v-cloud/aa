// Firebase Configuration (Modern)
const firebaseConfig = {
    apiKey: "AIzaSyDr5RBcJ9gcHTdElXxazcEWMBoTYzC_CaU",
    authDomain: "foxe-3f428.firebaseapp.com",
    databaseURL: "https://foxe-3f428-default-rtdb.firebaseio.com",
    projectId: "foxe-3f428",
    storageBucket: "foxe-3f428.firebasestorage.app",
    messagingSenderId: "763563407239",
    appId: "1:763563407239:web:4e558a73bffb5e6e1e8522",
    measurementId: "G-E7ZVVZ5HPV"
};

// Initialize Firebase (Compat version for simplicity)
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
const storage = firebase.storage();

// Cloudinary Settings
const CLOUD_NAME = 'dnmpmysk6';
const UPLOAD_PRESET = 'rsxdfdgw';

// Admin Emails (Edit this with your email)
const ADMIN_EMAILS = ['admin@example.com']; // <--- CHANGE TO YOUR EMAIL

console.log('✅ SHΔDØW Modern System Ready');
