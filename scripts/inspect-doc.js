import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const sa = require(process.env.KEY_PATH)
initializeApp({ credential: cert(sa) })
const db = getFirestore()
const snap = await db.collection('olympiad_questions').limit(1).get()
const d = snap.docs[0].data()
console.log(JSON.stringify(d, null, 2))
