// Centralized Firebase initialization and re-exports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, setPersistence, browserLocalPersistence,
  GoogleAuthProvider, signInWithPopup, signInWithCustomToken, signInAnonymously,
  sendEmailVerification
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, increment, onSnapshot
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let app, auth, db;
let isFirebaseActive = false;

async function initFirebase(config){
  try{
    app = initializeApp(config);
    auth = getAuth(app);
    db = getFirestore(app);
    await setPersistence(auth, browserLocalPersistence);
    isFirebaseActive = true;
  }catch(error){
    console.warn('Firebase initialization failed:', error?.message || error);
    isFirebaseActive = false;
  }
}

export {
  app, auth, db, isFirebaseActive,
  initFirebase,
  // auth exports
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, setPersistence, browserLocalPersistence,
  GoogleAuthProvider, signInWithPopup, signInWithCustomToken, signInAnonymously,
  sendEmailVerification,
  // firestore exports
  doc, getDoc, setDoc, updateDoc, increment, onSnapshot
};
