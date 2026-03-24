import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyAI1pcRi6Luw-mn1T8TbSXwFbAZFmXb2Tg",
  authDomain: "frazley.firebaseapp.com",
  projectId: "frazley",
  storageBucket: "frazley.firebasestorage.app",
  messagingSenderId: "154493230771",
  appId: "1:154493230771:web:83fdb3be11383a66dfdac6",
  measurementId: "G-39WL031TPW",
  databaseURL: "https://frazley-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
