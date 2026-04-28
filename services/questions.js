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

// Імпорт з JS-модулів (одноразово)
const JS_MODULES = {
  practice: {
    1: () => import('../data/questions/informatics/grade1.js'),
    2: () => import('../data/questions/informatics/grade2.js'),
    3: () => import('../data/questions/informatics/grade3.js'),
    4: () => import('../data/questions/informatics/grade4.js'),
  },
  olympiad: {
    1: () => import('../data/questions/informatics/grade1-olympiad.js'),
    2: () => import('../data/questions/informatics/grade2-olympiad.js'),
    3: () => import('../data/questions/informatics/grade3-olympiad.js'),
    4: () => import('../data/questions/informatics/grade4-olympiad.js'),
  }
};

export async function importFromJsFiles(onProgress) {
  let total = 0;
  for (const [mode, grades] of Object.entries(JS_MODULES)) {
    const isOlympiad = mode === 'olympiad';
    for (const [grade, loader] of Object.entries(grades)) {
      const { questions } = await loader();
      for (const q of questions) {
        await createQuestion({ ...q, grade: Number(grade), isOlympiad });
        total++;
        onProgress?.(total);
      }
    }
  }
  return total;
}
