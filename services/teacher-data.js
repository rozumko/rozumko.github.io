import {
  db, auth,
  doc, getDoc, setDoc, updateDoc, getDocs,
  collection, query, where, serverTimestamp
} from './firebase.js';

const CODE_WORDS = [
  'КІТ','ПЕС','ЛИС','БИК','ЛЕВ','БОБ','ЖУК','РАК','ВУЖ','ВІЛ',
  'ВОВК','ОРЕЛ','ЛОСЬ','КРУК','СОВА','ЩУКА','КРАБ','РИСЬ','КІНЬ','ЇЖАК','ГАВА','ВЕПР'
];

function randomCode() {
  const word = CODE_WORDS[Math.floor(Math.random() * CODE_WORDS.length)];
  const num = Math.floor(Math.random() * 900) + 100; // 100–999
  return `${word}${num}`;
}

async function isCodeTaken(code) {
  const snap = await getDoc(doc(db, 'students', code));
  return snap.exists();
}

async function generateUniqueCode() {
  let code, attempts = 0;
  do {
    code = randomCode();
    attempts++;
    if (attempts > 50) throw new Error('Не вдалося згенерувати унікальний код. Спробуй ще раз.');
  } while (await isCodeTaken(code));
  return code;
}

function teacherUid() {
  const user = auth.currentUser;
  if (!user) throw new Error('Не авторизовано.');
  return user.uid;
}

// --- Класи ---

export async function createClass(name, grade) {
  const uid = teacherUid();
  const classId = `${uid}_${Date.now()}`;
  const profileRef = doc(db, 'users', uid);
  const snap = await getDoc(profileRef);
  const classes = snap.data().classes || [];
  classes.push({ id: classId, name, grade: Number(grade) });
  await updateDoc(profileRef, { classes, updatedAt: serverTimestamp() });
  return classId;
}

export async function getTeacherProfile() {
  const snap = await getDoc(doc(db, 'users', teacherUid()));
  return snap.data(); // { classes: [...], email, school }
}

// --- Коди учнів ---

export async function generateStudentCodes(classId, grade, count) {
  const uid = teacherUid();
  const codes = [];
  for (let i = 0; i < count; i++) {
    const code = await generateUniqueCode();
    await setDoc(doc(db, 'students', code), {
      code,
      grade: Number(grade),
      classId,
      teacherUid: uid,
      isActive: true,
      retryAllowed: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    codes.push(code);
  }
  return codes;
}

export async function getStudentsByClass(classId) {
  const q = query(collection(db, 'students'), where('classId', '==', classId));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data());
}

export async function toggleStudentActive(code, isActive) {
  await updateDoc(doc(db, 'students', code), { isActive, updatedAt: serverTimestamp() });
}

// --- Результати ---

export async function getMyResults() {
  const q = query(collection(db, 'olympiad_results'), where('teacherUid', '==', teacherUid()));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data());
}
