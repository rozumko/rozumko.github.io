import {
  db,
  collection, getDocs, doc, setDoc, updateDoc,
  query, where, serverTimestamp
} from './firebase.js';

function eventId(title) {
  return title
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-zа-яіїєґ0-9-]/gu, '')
    .slice(0, 40) + '-' + Date.now();
}

export async function createEvent({ title, subject, activeFrom, activeTo, questionsCount, timeMinutes, allowRetry }) {
  const id = eventId(title);
  await setDoc(doc(db, 'olympiad_events', id), {
    title,
    subject,
    activeFrom: new Date(activeFrom),
    activeTo: new Date(activeTo),
    questionsCount: Number(questionsCount),
    timeMinutes: Number(timeMinutes),
    allowRetry: Boolean(allowRetry),
    status: 'draft',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return id;
}

export async function getAllEvents() {
  const snap = await getDocs(collection(db, 'olympiad_events'));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
}

export async function setEventStatus(eventId, status) {
  await updateDoc(doc(db, 'olympiad_events', eventId), {
    status,
    updatedAt: serverTimestamp()
  });
}
