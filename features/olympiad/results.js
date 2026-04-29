import {
  db,
  collection, addDoc, serverTimestamp
} from '../../services/firebase.js';

export async function saveOlympiadResult({ eventId, studentCode, teacherUid, grade, score, totalQuestions, timeSpentSeconds, penalizedCount, sessionId }) {
  const ref = await addDoc(collection(db, 'olympiad_results'), {
    eventId,
    studentCode,
    teacherUid,
    grade,
    score,
    totalQuestions,
    timeSpentSeconds,
    penalizedCount: penalizedCount ?? 0,
    mode: 'olympiad',
    completedAt: serverTimestamp(),
    sessionId
  });
  return ref.id;
}
