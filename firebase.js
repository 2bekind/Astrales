// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyByFdEUhoAf2kaqYlg7IfRT7phzIfPFDWI",
  authDomain: "astrales.firebaseapp.com",
  projectId: "astrales",
  storageBucket: "astrales.firebasestorage.app",
  messagingSenderId: "3422037461",
  appId: "1:3422037461:web:c2659daa862bc13889495c"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);

// Export Firebase functions
export { createUserWithEmailAndPassword, signInWithEmailAndPassword };
export { collection, addDoc, getDocs, doc, setDoc, onSnapshot };
