import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { db } from './index.js'
import { questionRevisions, questions } from './schema.js'
import { questionSnapshot } from '../routes/question-editorial.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const raw = readFileSync(join(__dirname, '../../../scripts/questions.json'), 'utf8')
const data = (JSON.parse(raw) as Record<string, unknown>[]).map(question => ({
  ...question,
  channels: question.isOlympiad === true ? [] : ['class_game', 'path', 'olympiad_training'],
  editorialStatus: 'published' as const,
  publishedAt: new Date(),
}))

const inserted = await db.insert(questions).values(data as any).onConflictDoNothing().returning()
if (inserted.length) {
  await db.insert(questionRevisions).values(inserted.map(question => ({
    questionId: question.id,
    editVersion: question.editVersion,
    action: 'create',
    snapshot: questionSnapshot(question),
  })))
}

console.log(`Seeded ${inserted.length} questions.`)
process.exit(0)
