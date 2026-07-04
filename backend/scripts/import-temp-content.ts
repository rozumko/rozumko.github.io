// Одноразовий імпорт напрацювань із temp/ у банк питань.
//
// Джерела:
//   temp/ct_quiz/questions.js       → track computational-thinking (70 питань, 2–4 кл.)
//   temp/alt_cs/index.html          → track informatics (тести 1–4 кл.)
//   temp/ai_basics/questions.json   → track ai-basics (48 питань, 1–4 кл.)
//
// Запуск:  cd backend && npx tsx scripts/import-temp-content.ts --dry-run   (без БД)
//          cd backend && npx tsx scripts/import-temp-content.ts             (пише в БД)
//
// Ідемпотентність: перед вставкою перевіряється точний збіг тексту питання
// (q + grade) серед тренувальних питань — повторний запуск не створює дублів.
// Всі імпортовані питання: isOlympiad=false. Походження — у meta.source.

import { createRequire } from 'module'
import { readFileSync, readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import vm from 'vm'
import type { NewQuestion } from '../src/db/schema.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const DRY_RUN = process.argv.includes('--dry-run')

// ── ct_quiz → computational-thinking ─────────────────────────────────────────

// Корені conceptKey з ct_quiz → слаги docs/content-taxonomy.md.
// Extension-концепти (uzahalnennia, testuvannia, …) у таксономії відсутні:
// такі питання імпортуються з topic=null, оригінал лишається в meta.
const CT_ROOT_MAP: Record<string, string> = {
  'alhorytmy':      'algorithms',
  'dekompozytsiia': 'decomposition',
  'abstrahuvannia': 'abstraction',
  'rozpiznavannia': 'patterns',
  'povtorennia':    'repetition',
  'lohichne':       'logic',
  'efektyvnist':    'efficiency',
  'klasyfikatsiia': 'classification',
  'nalahodzhennia': 'debugging',
}

const CT_DIFFICULTY_MAP: Record<string, string> = {
  foundational: 'easy',
  developing:   'medium',
  advanced:     'hard',
}

interface CtQuizItem {
  id: string; q: string; options: string[]; correct: number; explanation: string
  concept: string; conceptKey: string; conceptLabel: string; skill?: string
  difficulty: string; progressionBand: string; isCore: boolean
  reviewStatus: string; distractorQuality: string
}

function loadCtQuiz(): NewQuestion[] {
  const { questionBank } = require('../../temp/ct_quiz/questions.js') as {
    questionBank: Record<string, CtQuizItem[]>
  }
  const rows: NewQuestion[] = []
  for (const [grade, items] of Object.entries(questionBank)) {
    for (const item of items) {
      const root = item.conceptKey.split('-')[0]
      const slug = CT_ROOT_MAP[root] ?? null
      if (!slug) console.warn(`  [ct_quiz ${item.id}] extension-концепт «${item.conceptKey}» → topic=null`)
      rows.push({
        q:           item.q,
        type:        'choice',
        options:     item.options,
        correct:     item.correct,
        explanation: item.explanation,
        difficulty:  CT_DIFFICULTY_MAP[item.difficulty] ?? 'medium',
        track:       'computational-thinking',
        topic:       slug,
        conceptKey:  slug,
        progressionBand: item.progressionBand as NewQuestion['progressionBand'],
        grade:       Number(grade),
        isOlympiad:  false,
        meta: {
          source: 'ct_quiz',
          sourceId: item.id,
          conceptKey: item.conceptKey,
          conceptLabel: item.conceptLabel,
          isCore: item.isCore,
          reviewStatus: item.reviewStatus,
          distractorQuality: item.distractorQuality,
        },
      })
    }
  }
  return rows
}

// ── alt_cs → informatics ─────────────────────────────────────────────────────

const ALT_CS_TOPIC_MAP: Record<string, string> = {
  'Комп’ютер та його складові': 'computer-systems',
  "Комп'ютер та його складові":      'computer-systems',
  'Інформація та повідомлення':      'information',
  'Алгоритми та виконавці':          'algorithms-programming',
  'Безпека в Інтернеті':             'digital-safety',
}

interface AltCsQuestion { q: string; a: string[]; c: number; ex?: string }
interface AltCsTopic { id: string; title: string; questions: AltCsQuestion[] }
interface AltCsGrade { title: string; topics: AltCsTopic[] }

/** Витягає `const db = {...}` з index.html brace-match'ем і виконує у пісочниці. */
function loadAltCsDb(): Record<string, AltCsGrade> {
  const html = readFileSync(join(__dirname, '../../temp/alt_cs/index.html'), 'utf8')
  const start = html.indexOf('const db = {')
  if (start === -1) throw new Error('alt_cs: не знайдено `const db = {`')
  const objStart = html.indexOf('{', start)
  let depth = 0
  let end = -1
  for (let i = objStart; i < html.length; i++) {
    const ch = html[i]
    if (ch === '{') depth++
    else if (ch === '}') { depth--; if (depth === 0) { end = i + 1; break } }
  }
  if (end === -1) throw new Error('alt_cs: незбалансовані дужки в об’єкті db')
  return vm.runInNewContext(`(${html.slice(objStart, end)})`) as Record<string, AltCsGrade>
}

/** Перемішує варіанти, зберігаючи позицію правильної відповіді. */
function shuffleOptions(a: string[], c: number): { options: string[]; correct: number } {
  const indexed = a.map((text, i) => ({ text, isCorrect: i === c }))
  for (let i = indexed.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[indexed[i], indexed[j]] = [indexed[j], indexed[i]]
  }
  return {
    options: indexed.map(o => o.text),
    correct: indexed.findIndex(o => o.isCorrect),
  }
}

function loadAltCs(): NewQuestion[] {
  const db = loadAltCsDb()
  const rows: NewQuestion[] = []
  for (const [grade, gradeData] of Object.entries(db)) {
    for (const topic of gradeData.topics ?? []) {
      const slug = ALT_CS_TOPIC_MAP[topic.title] ?? null
      if (!slug) console.warn(`  [alt_cs] невідома тема «${topic.title}» → topic=null`)
      for (const item of topic.questions ?? []) {
        const { options, correct } = shuffleOptions(item.a, item.c)
        rows.push({
          q:           item.q,
          type:        'choice',
          options,
          correct,
          explanation: item.ex ?? null,
          difficulty:  Number(grade) <= 2 ? 'easy' : 'medium',
          track:       'informatics',
          topic:       slug,
          conceptKey:  null,
          progressionBand: 'recognize',
          grade:       Number(grade),
          isOlympiad:  false,
          meta: { source: 'alt_cs', topicId: topic.id, topicTitle: topic.title },
        })
      }
    }
  }
  return rows
}

// ── ai_basics → ai-basics ────────────────────────────────────────────────────

interface AiBasicsQuestion {
  grade: number; topic: string; difficulty: string; progressionBand: string
  q: string; options: string[]; correct: number; explanation: string
}

function loadAiBasics(): NewQuestion[] {
  // Усі файли questions*.json у теці — щоб нові порції додавались файлами.
  const dir = join(__dirname, '../../temp/ai_basics')
  const files = readdirSync(dir).filter(f => /^questions.*\.json$/.test(f)).sort()
  const items: AiBasicsQuestion[] = files.flatMap(f =>
    (JSON.parse(readFileSync(join(dir, f), 'utf8')) as { questions: AiBasicsQuestion[] }).questions
  )
  return items.map(item => {
    const { options, correct } = shuffleOptions(item.options, item.correct)
    return {
      q:           item.q,
      type:        'choice' as const,
      options,
      correct,
      explanation: item.explanation,
      difficulty:  item.difficulty,
      track:       'ai-basics' as const,
      topic:       item.topic,
      conceptKey:  null,
      progressionBand: item.progressionBand as NewQuestion['progressionBand'],
      grade:       item.grade,
      isOlympiad:  false,
      meta: { source: 'ai_basics' },
    }
  })
}

// ── Main ─────────────────────────────────────────────────────────────────────

const ctRows  = loadCtQuiz()
const altRows = loadAltCs()
const aiRows  = loadAiBasics()
const all = [...ctRows, ...altRows, ...aiRows]

console.log(`ct_quiz:   ${ctRows.length} питань (2–4 кл., computational-thinking)`)
console.log(`alt_cs:    ${altRows.length} питань (1–4 кл., informatics)`)
console.log(`ai_basics: ${aiRows.length} питань (1–4 кл., ai-basics)`)

const byTopic = new Map<string, number>()
for (const r of all) byTopic.set(`${r.track}/${r.topic ?? '∅'}`, (byTopic.get(`${r.track}/${r.topic ?? '∅'}`) ?? 0) + 1)
for (const [key, n] of [...byTopic.entries()].sort()) console.log(`  ${key}: ${n}`)

if (DRY_RUN) {
  console.log('\n--dry-run: у БД нічого не записано.')
  process.exit(0)
}

const { db } = await import('../src/db/index.js')
const { questions } = await import('../src/db/schema.js')
const { eq } = await import('drizzle-orm')

const existing = await db
  .select({ q: questions.q, grade: questions.grade })
  .from(questions)
  .where(eq(questions.isOlympiad, false))
const seen = new Set(existing.map(r => `${r.grade}::${r.q.trim()}`))

let inserted = 0
let skipped = 0
for (const row of all) {
  const key = `${row.grade}::${row.q.trim()}`
  if (seen.has(key)) { skipped++; continue }
  await db.insert(questions).values(row)
  seen.add(key)
  inserted++
}

console.log(`\nВставлено: ${inserted}, пропущено (вже існують): ${skipped}`)
process.exit(0)
