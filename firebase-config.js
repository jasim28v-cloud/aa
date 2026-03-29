// firebase-config.js (الإصدار الحديث - الأنسب لك)
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAxtEkrEgl0C9djPkxKKX-sENtOzPEbHB8",
  authDomain: "tope-e5350.firebaseapp.com",
  databaseURL: "https://tope-e5350-default-rtdb.firebaseio.com/",
  projectId: "tope-e5350",
  storageBucket: "tope-e5350.firebasestorage.app",
  messagingSenderId: "187788115549",
  appId: "1:187788115549:web:5012a1053d2ff7dced97b4",
  measurementId: "G-V1XM95PMQC"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const storage = getStorage(app);

const CLOUD_NAME = 'dnmpmysk6';
const UPLOAD_PRESET = 'rsxdfdgw';

console.log('✅ SHΔDØW System Ready');

export { auth, db, storage, CLOUD_NAME, UPLOAD_PRESET };
