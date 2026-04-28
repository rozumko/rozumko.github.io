import {
  auth, db,
  signInAnonymously,
  doc, getDoc
} from '../../services/firebase.js';

const SESSION_KEY = 'rozumko_student_code';

// Спочатку підписуємось анонімно, потім читаємо код.
// Rules вимагають request.auth != null — без цього читання заблоковане.
export async function validateStudentCode(code) {
  const normalised = code.trim().toUpperCase();

  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }

  const snap = await getDoc(doc(db, 'students', normalised));
  if (!snap.exists()) throw new Error('Код не знайдено. Перевір і спробуй ще раз.');

  const data = snap.data();
  if (!data.isActive) throw new Error('Цей код деактивовано. Зверніться до вчителя.');

  sessionStorage.setItem(SESSION_KEY, normalised);
  return data; // { code, grade, classId, teacherUid, isActive, retryAllowed }
}

export function getStoredStudentCode() {
  return sessionStorage.getItem(SESSION_KEY);
}

export function clearStudentSession() {
  sessionStorage.removeItem(SESSION_KEY);
}
