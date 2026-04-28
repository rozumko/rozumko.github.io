import {
  auth, db,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  doc, getDoc, setDoc, serverTimestamp
} from '../../services/firebase.js';

export async function loginTeacher(email, password) {
  const { user } = await signInWithEmailAndPassword(auth, email, password);
  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists() || snap.data().role !== 'teacher') {
    await signOut(auth);
    throw new Error('Акаунт вчителя не знайдено.');
  }
  return { user, profile: snap.data() };
}

export async function registerTeacher(email, password, school) {
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, 'users', user.uid), {
    role: 'teacher',
    email,
    school: school || '',
    classes: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return user;
}

export async function logoutTeacher() {
  await signOut(auth);
}

export function onTeacherAuthChanged(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) { callback(null); return; }
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists() && snap.data().role === 'teacher') {
      callback(user, snap.data());
    } else {
      callback(null);
    }
  });
}
