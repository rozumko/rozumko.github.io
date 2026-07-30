// Validates authored question JSON before DB import — no DB I/O.
// Delegates all validation to authored-questions.ts (shared with import-authored.ts),
// so a passing file is guaranteed to import cleanly.
//
// Usage:
//   cd backend
//   npx tsx scripts/validate-questions.ts                       # all *.json in temp/authored
//   npx tsx scripts/validate-questions.ts ../temp/authored/questions.example.json
//   npx tsx scripts/validate-questions.ts ../temp/authored ../temp/other
//
// Exit code 0 = OK, 1 = validation errors (printed with file / index / field).

import { fileURLToPath } from 'url'
import { basename, dirname, join } from 'path'
import {
  loadFiles,
  validateAuthored,
  validateAuthoredDemoPackage,
  toNewQuestion,
} from './authored-questions.js'
import {
  analyzeOlympiadSet,
  type OlympiadQuestionForPolicy,
} from '../src/lib/olympiad-content-policy.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_DIR = join(__dirname, '../../temp/authored')

const args = process.argv.slice(2)
const targets = args.length ? args : [DEFAULT_DIR]
const { loaded, errors: structural } = loadFiles(targets)

const errors = [...structural]
for (const { file, index, q } of loaded) errors.push(...validateAuthored(file, index, q))
errors.push(...validateAuthoredDemoPackage(loaded))

const policyWarnings: string[] = []
const byFile = new Map<string, typeof loaded>()
for (const item of loaded.filter(item => item.q.purpose === 'olympiad-demo')) {
  byFile.set(item.file, [...(byFile.get(item.file) ?? []), item])
}
for (const [file, items] of byFile) {
  const questions = items.map(({ q, index }) => ({
    id: `authored-${basename(file)}-${index}`,
    ...toNewQuestion(q, file),
    editorialStatus: 'published',
  })) as unknown as OlympiadQuestionForPolicy[]
  const result = analyzeOlympiadSet(Number(items[0]?.q.grade), 'demo', questions)
  for (const issue of result.issues) {
    const message = `${basename(file)}: ${issue.message}`
    if (issue.severity === 'error') errors.push(message)
    else policyWarnings.push(message)
  }
}

if (loaded.length === 0 && structural.length === 0) { console.error('Не знайдено жодного .json'); process.exit(1) }

if (errors.length) {
  console.error(`\nЗнайдено ${errors.length} помилок:\n`)
  for (const e of errors) console.error('  ✗ ' + e)
  process.exit(1)
}
console.log(`OK — ${loaded.length} питань валідні.`)
if (policyWarnings.length) {
  console.log(`Policy warnings: ${policyWarnings.length}`)
  for (const warning of policyWarnings) console.log(`  ! ${warning}`)
}
process.exit(0)
