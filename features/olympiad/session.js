import {
  db, auth,
  doc, getDoc, setDoc, updateDoc, serverTimestamp,
  collection, query, where, getDocs, runTransaction
} from '../../services/firebase.js';

// Знайти активну олімпіадну подію для класу учня
export async function findActiveEvent(grade) {
  const now = new Date();
  const q = query(collection(db, 'olympiad_events'), where('status', '==', 'active'));
  const snap = await getDocs(q);
  for (const d of snap.docs) {
    const ev = d.data();
    const from = ev.activeFrom?.toDate?.() ?? new Date(0);
    const to = ev.activeTo?.toDate?.() ?? new Date(9999, 0);
    if (now >= from && now <= to) return { id: d.id, ...ev };
  }
  return null;
}

// Перевірити стан сесії учня для події
export async function checkSession(studentCode, eventId) {
  const ref = doc(db, 'olympiad_sessions', `${studentCode}_${eventId}`);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data(); // { status: 'started'|'completed'|'blocked', ... }
}

// Створити або поновити сесію атомарно через транзакцію
export async function startSession(studentCode, eventId, teacherUid, grade) {
  const sessionId = `${studentCode}_${eventId}`;
  const sessionRef = doc(db, 'olympiad_sessions', sessionId);
  const uid = auth.currentUser?.uid ?? null;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(sessionRef);
    const existing = snap.exists() ? snap.data() : null;

    if (existing?.status === 'completed' && !existing?.retryAllowed) {
      throw new Error('Ти вже пройшов цю олімпіаду. Повторна спроба не дозволена.');
    }
    if (existing?.status === 'blocked') {
      throw new Error('Доступ до олімпіади заблоковано. Зверніться до вчителя.');
    }

    tx.set(sessionRef, {
      eventId,
      studentCode,
      teacherUid,
      grade,
      startedAt: serverTimestamp(),
      finishedAt: null,
      status: 'started',
      attemptCount: (existing?.attemptCount ?? 0) + 1,
      lastAnonymousUid: uid,
      retryAllowed: existing?.retryAllowed ?? false
    });
  });

  return sessionId;
}

// Завершити сесію
export async function finishSession(sessionId) {
  await updateDoc(doc(db, 'olympiad_sessions', sessionId), {
    status: 'completed',
    finishedAt: serverTimestamp()
  });
}
