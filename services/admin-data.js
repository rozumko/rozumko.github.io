import { db, collection, query, where, getDocs } from './firebase.js';

export async function getAllTeachers() {
  const q = query(collection(db, 'users'), where('role', '==', 'teacher'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}
