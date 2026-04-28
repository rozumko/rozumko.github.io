import {
  db,
  doc, setDoc, serverTimestamp
} from '../../services/firebase.js';

export async function saveOlympiadResult({ eventId, studentCode, teacherUid, grade, score, totalQuestions, timeSpentSeconds, penalizedCount, sessionId }) {
  const resultId = `${studentCode}_${eventId}_${Date.now()}`;
  await setDoc(doc(db, 'olympiad_results', resultId), {
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
  return resultId;
}
