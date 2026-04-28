import { db, collection, query, where, getCountFromServer } from './firebase.js';

async function count(collectionName, ...constraints) {
  const q = constraints.length
    ? query(collection(db, collectionName), ...constraints)
    : collection(db, collectionName);
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

export async function loadAdminStats() {
  const [teachers, students, results, events] = await Promise.all([
    count('users', where('role', '==', 'teacher')),
    count('students'),
    count('olympiad_results'),
    count('olympiad_events', where('status', '==', 'active')),
  ]);
  return { teachers, students, results, events };
}
