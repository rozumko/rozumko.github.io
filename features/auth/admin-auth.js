import {
  auth, db,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  doc, getDoc
} from '../../services/firebase.js';

async function assertAdminRole(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists() || snap.data().role !== 'admin') {
    await signOut(auth);
    throw new Error('Доступ заборонено: недостатньо прав.');
  }
}

export async function loginAdmin(email, password) {
  const { user } = await signInWithEmailAndPassword(auth, email, password);
  await assertAdminRole(user.uid);
  return user;
}

export async function logoutAdmin() {
  await signOut(auth);
}

export function onAdminAuthChanged(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) { callback(null); return; }
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists() && snap.data().role === 'admin') {
      callback(user);
    } else {
      callback(null);
    }
  });
}
