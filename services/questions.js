import {
  db,
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, serverTimestamp
} from './firebase.js';

const COL = 'olympiad_questions';

// Всі питання з фільтрами
export async function getQuestions({ grade, isOlympiad, difficulty } = {}) {
  const constraints = [];
  if (grade !== undefined)        constraints.push(where('grade', '==', grade));
  if (isOlympiad !== undefined)   constraints.push(where('isOlympiad', '==', isOlympiad));
  if (difficulty)                 constraints.push(where('difficulty', '==', difficulty));
  const snap = await getDocs(query(collection(db, COL), ...constraints));
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  // Сортуємо на клієнті — без потреби у складеному індексі
  return docs.sort((a, b) => (a.grade - b.grade) || (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
}

// Питання для квізу (grade + режим)
export async function getQuizQuestions(grade, isOlympiad) {
  const snap = await getDocs(query(
    collection(db, COL),
    where('grade', '==', grade),
    where('isOlympiad', '==', isOlympiad)
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createQuestion(data) {
  return addDoc(collection(db, COL), {
    q: data.q,
    code: data.code || null,
    a: data.a,
    correct: data.correct,
    explanation: data.explanation || '',
    grade: Number(data.grade),
    difficulty: data.difficulty || 'medium',
    subject: 'informatics',
    isOlympiad: Boolean(data.isOlympiad),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateQuestion(id, data) {
  await updateDoc(doc(db, COL, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteQuestion(id) {
  await deleteDoc(doc(db, COL, id));
}

export async function duplicateQuestion(q) {
  const { id, createdAt, updatedAt, ...data } = q;
  return createQuestion({ ...data, q: data.q + ' (копія)' });
}

