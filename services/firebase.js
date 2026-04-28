import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, setPersistence, browserLocalPersistence,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, addDoc,
  collection, getDocs, query, where, serverTimestamp, getCountFromServer
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBxvkEj2auwfCRe9SZu3Nq_5clLtnVsV0M",
  authDomain: "rozumko-c36ad.firebaseapp.com",
  projectId: "rozumko-c36ad",
  storageBucket: "rozumko-c36ad.firebasestorage.app",
  messagingSenderId: "620063981068",
  appId: "1:620063981068:web:0d3517e19f3859ba657829"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

await setPersistence(auth, browserLocalPersistence);

export {
  auth, db,
  // auth
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, signInAnonymously,
  // firestore
  doc, getDoc, setDoc, updateDoc, addDoc,
  collection, getDocs, query, where, serverTimestamp, getCountFromServer
};
