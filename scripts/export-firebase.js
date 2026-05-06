import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { writeFileSync } from 'fs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const serviceAccount = require(process.env.KEY_PATH)

initializeApp({ credential: cert(serviceAccount) })

const db = getFirestore()

const snap = await db.collection('olympiad_questions').get()

const questions = snap.docs.map(doc => {
  const d = doc.data()
  return {
    firebase_id: doc.id,
    q: d.q ?? '',
    code: d.code ?? null,
    options: Array.isArray(d.a) ? d.a : [],
    correct: d.correct,
    explanation: d.explanation ?? null,
    difficulty: d.difficulty ?? null,
    grade: d.grade ?? null,
    subject: d.subject ?? null,
    is_olympiad: d.isOlympiad ?? false,
    created_at: d.createdAt?.toDate().toISOString() ?? null,
    updated_at: d.updatedAt?.toDate().toISOString() ?? null,
  }
})

writeFileSync('scripts/questions.json', JSON.stringify(questions, null, 2), 'utf8')
console.log(`Exported ${questions.length} questions → scripts/questions.json`)
