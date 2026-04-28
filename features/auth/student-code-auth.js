import {
  auth, db,
  signInAnonymously,
  doc, getDoc
} from '../../services/firebase.js';

const SESSION_KEY = 'rozumko_student_code';

export async function validateStudentCode(code) {
  const normalised = code.trim().toUpperCase();
  const snap = await getDoc(doc(db, 'students', normalised));
  if (!snap.exists()) throw new Error('Код не знайдено. Перевір і спробуй ще раз.');
  const data = snap.data();
  if (!data.isActive) throw new Error('Цей код деактивовано. Зверніться до вчителя.');
  return data; // { code, grade, classId, teacherUid, isActive, retryAllowed }
}

export async function startAnonymousSession(studentCode) {
  const { user } = await signInAnonymously(auth);
  sessionStorage.setItem(SESSION_KEY, studentCode.trim().toUpperCase());
  return user;
}

export function getStoredStudentCode() {
  return sessionStorage.getItem(SESSION_KEY);
}

export function clearStudentSession() {
  sessionStorage.removeItem(SESSION_KEY);
}
