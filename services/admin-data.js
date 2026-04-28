import { db, collection, query, orderBy, getDocs, where } from './firebase.js';

export async function getAllTeachers() {
  const q = query(collection(db, 'users'), where('role', '==', 'teacher'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

export async function getAllResults() {
  const q = query(collection(db, 'olympiad_results'), orderBy('completedAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data());
}
