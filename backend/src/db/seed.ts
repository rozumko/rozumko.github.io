import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { db } from './index.js'
import { questions } from './schema.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const raw = readFileSync(join(__dirname, '../../../scripts/questions.json'), 'utf8')
const data = JSON.parse(raw)

await db.insert(questions).values(data).onConflictDoNothing()

console.log(`Seeded ${data.length} questions.`)
process.exit(0)
