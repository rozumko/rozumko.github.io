// Validates authored micro-lesson JSON before DB import — no DB I/O.
// Delegates to authored-lessons.ts (shared with import-authored-lessons.ts).
//
//   cd backend
//   npx tsx scripts/validate-lessons.ts                         # all *.json in temp/authored-lessons
//   npx tsx scripts/validate-lessons.ts ../temp/authored-lessons/lessons.example.json
//
// Exit code 0 = OK, 1 = validation errors.

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { loadLessonFiles, validateAuthoredLesson, duplicateIds } from './authored-lessons.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_DIR = join(__dirname, '../../temp/authored-lessons')

const args = process.argv.slice(2)
const targets = args.length ? args : [DEFAULT_DIR]
const { loaded, errors: structural } = loadLessonFiles(targets)

const errors = [...structural]
for (const { file, index, lesson } of loaded) errors.push(...validateAuthoredLesson(file, index, lesson))
for (const id of duplicateIds(loaded)) errors.push(`повторюваний id уроку: «${id}»`)

if (loaded.length === 0 && structural.length === 0) { console.error('Не знайдено жодного .json'); process.exit(1) }

if (errors.length) {
  console.error(`\nЗнайдено ${errors.length} помилок:\n`)
  for (const e of errors) console.error('  ✗ ' + e)
  process.exit(1)
}
console.log(`OK — ${loaded.length} уроків валідні.`)
process.exit(0)
