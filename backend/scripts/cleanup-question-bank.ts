// Разова чистка practice-банку за педагогічним аудитом 2026-07-08.
//
// Що робить:
//   1. Видаляє точні дублікати стемів у межах класу (лишає перший примірник)
//      та між класами (лишає молодший клас), плюс явний список зламаних питань.
//   2. Застосовує точкові виправлення (хибні ключі, артефакти генерації в
//      поясненнях, «Рівлик», русизми, topic=null, перекваліфікація grade/difficulty).
//   3. З --shuffle перемішує варіанти всіх choice practice-питань (рендерер не
//      перемішує, у банку перекіс ключа в позицію B).
//   4. Друкує матрицю покриття track/topic × grade після змін.
//
// Ідентифікатори беруться з поточного бандла public/questions/grade-*.json
// (id у бандлі = id у БД). Перед видаленням перевіряються FK-посилання
// (event_questions, attempt_questions, school_session_questions, school_answers) —
// питання, на які хтось посилається, не видаляються, лише попередження.
//
// Запуск:  cd backend && npx tsx scripts/cleanup-question-bank.ts --dry-run
//          cd backend && npx tsx scripts/cleanup-question-bank.ts --shuffle

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { eq, inArray, sql } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import {
  questions, eventQuestions, attemptQuestions, schoolSessionQuestions, schoolAnswers,
} from '../src/db/schema.js'
import { TOPICS_BY_TRACK } from '../src/lib/taxonomy.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DRY_RUN = process.argv.includes('--dry-run')
const SHUFFLE = process.argv.includes('--shuffle')

interface BundleQ {
  id: string; q: string; code: string | null; type: string
  options: unknown; correct: number | null; explanation: string | null
  difficulty: string | null; track: string; topic: string | null; grade: number
}

const bundle: Record<number, BundleQ[]> = {}
for (const g of [1, 2, 3, 4]) {
  bundle[g] = JSON.parse(
    readFileSync(join(__dirname, `../../public/questions/grade-${g}.json`), 'utf8'),
  ) as BundleQ[]
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
// Однаковий стем із різним кодом — різні питання, тому код входить у ключ
const dupKey = (q: BundleQ) => `${norm(q.q)}||${norm(q.code ?? '')}`
const stem = (q: BundleQ) => q.q.replace(/\s+/g, ' ').slice(0, 70)

// ── 1. Видалення ─────────────────────────────────────────────────────────────

const toDelete = new Map<string, string>() // id → причина

// Точні дублікати в межах класу: лишаємо перший
for (const g of [1, 2, 3, 4]) {
  const seen = new Map<string, number>()
  bundle[g].forEach((q, i) => {
    const key = dupKey(q)
    if (seen.has(key)) toDelete.set(q.id, `дубль у ${g} кл. (перший — #${seen.get(key)}): ${stem(q)}`)
    else seen.set(key, i)
  })
}

// Точні дублікати між класами: лишаємо копію в молодшому класі
const crossSeen = new Map<string, number>()
for (const g of [1, 2, 3, 4]) {
  for (const q of bundle[g]) {
    if (toDelete.has(q.id)) continue
    const key = dupKey(q)
    const firstGrade = crossSeen.get(key)
    if (firstGrade !== undefined && firstGrade !== g) {
      toDelete.set(q.id, `крос-дубль (${firstGrade} і ${g} кл.): ${stem(q)}`)
    } else if (firstGrade === undefined) {
      crossSeen.set(key, g)
    }
  }
}

// Явний список: зламані або безнадійно слабкі питання (аудит 2026-07-08)
const EXPLICIT_DELETE: Array<[number, number, string]> = [
  [1, 2,  'двозначне: «прямі ділянки» — геометрично 3, ключ 4, пояснення суперечить собі'],
  [1, 61, '«Що зображено на зображенні?» без зображення (code=null)'],
  [2, 1,  'майже-дубль #4 (людина vs програма: вигадування)'],
  [2, 34, 'майже-дубль #37 (ШІ відповів на домашку)'],
  [2, 46, 'майже-дубль #8 (доручити програмі перегляд картинок)'],
  [2, 62, '«Чи є сон джерелом інформації» — розмите, варіант «Не знаю»'],
  [4, 55, 'чиста арифметика без ЦТ-змісту (10−3 кульки)'],
  [4, 79, 'майже-дубль 2 кл. #79 (фрукти-абстракція), занадто просте для hard'],
]
for (const [g, i, reason] of EXPLICIT_DELETE) {
  const q = bundle[g][i]
  if (!q) throw new Error(`EXPLICIT_DELETE: немає питання ${g}#${i}`)
  toDelete.set(q.id, `${g}#${i}: ${reason}`)
}

// ── 2. Виправлення ───────────────────────────────────────────────────────────

type Patch = Partial<{
  q: string; code: string; options: unknown; correct: number | null
  explanation: string; difficulty: string; topic: string; conceptKey: string; grade: number
}>
const FIXES: Array<[number, number, string, Patch]> = [
  [1, 0, 'пояснення: Рівлик → Равлик', {
    explanation: 'Равлик іде вправо 3 кроки, повертає вниз і йде ще 3 кроки — утворюється кут, схожий на літеру Г.',
  }],
  [1, 3, 'пояснення: русизм «діла»', {
    explanation: 'Помічник добре нагадує, але справи роби сам.',
  }],
  [1, 8, 'жартівливі дистрактори → діагностичні', {
    q: 'Для чого натискають кнопку комп\'ютерної мишки?',
    options: ['Щоб обрати або відкрити те, на що вказує курсор', 'Щоб набрати текст', 'Щоб увімкнути звук', 'Щоб зарядити комп\'ютер'],
    correct: 0,
    explanation: 'Клік мишкою обирає об\'єкт або відкриває його. Текст набирають клавіатурою.',
  }],
  [1, 21, 'ХИБНИЙ КЛЮЧ: правильна відповідь «Вгору», не «Вправо»; артефакт у поясненні', {
    q: 'Равлик починає дивитися вгору та виконує: праворуч, вперед 5, ліворуч, вперед 3. Куди він дивиться в кінці?',
    correct: 0,
    explanation: 'Поворот праворуч: вгору → вправо. Вперед 5 — дивиться вправо. Поворот ліворуч: вправо → вгору. Команда «вперед» напрямок не змінює, тож у кінці Равлик дивиться вгору.',
  }],
  [1, 64, 'жартівливі дистрактори → діагностичні', {
    options: ['Рівно, з прямою спиною', 'Нахилившись близько до екрана', 'Лежачи на дивані', 'Як завгодно'],
    correct: 0,
    explanation: 'Пряма спина й відстань до екрана бережуть поставу та очі.',
  }],
  [1, 77, 'жартівливі дистрактори → діагностичні', {
    options: ['Ні — крихти й напої шкодять техніці', 'Так, якщо обережно', 'Так, будь-коли', 'Тільки коли ніхто не бачить'],
    correct: 0,
  }],
  [1, 109, 'арифметика (5+30+20=55) поза програмою 1 класу → 3 клас', {
    grade: 3, difficulty: 'medium',
  }],
  [2, 9, 'sort із нерозрізнюваними елементами «Вперед/Поворот ×2»', {
    q: 'Розстав кроки, щоб Равлик почав малювати квадрат.',
    options: { items: ['Намалювати першу сторону', 'Повернути праворуч', 'Намалювати другу сторону', 'Знову повернути праворуч'], correctOrder: [0, 1, 2, 3] },
    explanation: 'Сторони квадрата чергуються з поворотами: сторона → поворот → сторона → поворот.',
  }],
  [2, 40, 'два однакові дистрактори («Завжди»/«Так»); тема — безпека', {
    options: ['Ні — інформацію треба перевіряти', 'Так, якщо сайт виглядає гарно', 'Так, комп\'ютери не помиляються', 'Так, якщо текст довгий'],
    correct: 0,
    topic: 'digital-safety',
    explanation: 'В Інтернеті трапляються помилки та обман, тому важливу інформацію перевіряють у надійних джерелах.',
  }],
  [2, 77, 'стем: Рівлик → Равлик', {
    q: 'Равлик намалює квадрат з двома кольорами. Скільки сторін кожного кольору?',
  }],
  [3, 1, 'вкладені цикли позначені easy', { difficulty: 'medium' }],
  [3, 22, 'topic=null → debugging (тестування плану)', { topic: 'debugging', conceptKey: 'debugging' }],
  [3, 59, 'ХИБНИЙ КЛЮЧ: колір зберігається між ітераціями, синіх ліній було б 5; код переписано', {
    code: 'створити і = 1\nповторити 6 (\n  колір червоний\n  якщо (і == 2) (\n    колір синій\n  )\n  якщо (і == 4) (\n    колір синій\n  )\n  якщо (і == 6) (\n    колір синій\n  )\n  вперед 30\n  праворуч 60\n  і = і + 1\n)',
    explanation: 'На початку кожної ітерації колір стає червоним, а при і = 2, 4 і 6 змінюється на синій. Сині — 2-га, 4-та і 6-та лінії, разом 3.',
  }],
  [3, 69, 'topic=null → abstraction (узагальнення правила)', { topic: 'abstraction', conceptKey: 'abstraction' }],
  [3, 111, 'русизм «домашній адрес»', {
    options: ['свою домашню адресу', '«я не знаю»', 'порожній рядок', '«планети сонячної системи для дітей»'],
    correct: 3,
  }],
  [3, 123, 'артефакт самовиправлення в поясненні («... ні, ...»)', {
    explanation: 'Команда «н = н + н» щоразу подвоює значення: 2 → 4 → 8 → 16 → 32 → 64. Після 5 ітерацій н = 64.',
  }],
  [4, 3, 'topic=null → algorithms', { topic: 'algorithms', conceptKey: 'algorithms' }],
  [4, 11, 'topic=null → efficiency (порівняння стратегій)', { topic: 'efficiency', conceptKey: 'efficiency' }],
  [4, 13, 'вступ до «%» має йти перед задачами з % у 3 класі', { grade: 3 }],
  [4, 14, '«Ваше» → «Твоє» (єдина форма звертання)', {
    options: ['Всім відоме слово', 'Секретний ключ для входу', 'Твоє прізвище', 'Назва сайту'],
    correct: 1,
  }],
  [4, 16, '«Ваше» → «Твоє»', {
    options: ['Адреса будинку', 'Твоє ім\'я в системі', 'Секретний код', 'Номер телефону'],
    correct: 1,
  }],
  [4, 21, 'семантика передачі за посиланням суперечить Scratch-подібним мовам; переписано', {
    q: 'Яку відстань пройде Равлик після виконання програми?',
    code: 'процедура подвійний_крок (н) (\n  вперед н\n  вперед н\n)\n\nподвійний_крок(10)\nподвійний_крок(20)',
    options: ['30', '40', '60', '90'],
    correct: 2,
    explanation: 'Кожен виклик робить два кроки «вперед н»: подвійний_крок(10) — це 10+10=20, подвійний_крок(20) — це 20+20=40. Разом 20+40=60.',
  }],
  [4, 29, 'стем: Рівлик → Равлик', {
    q: 'Які лінії є ГОРИЗОНТАЛЬНИМИ (вправо або вліво)? Равлик починає вгору.',
  }],
  [4, 43, 'topic=null → abstraction (узагальнення)', { topic: 'abstraction', conceptKey: 'abstraction' }],
  [4, 57, 'topic=null → classification (фільтрація)', { topic: 'classification', conceptKey: 'classification' }],
  [4, 63, 'topic=null → abstraction (узагальнення)', { topic: 'abstraction', conceptKey: 'abstraction' }],
  [4, 64, 'topic=null → debugging (тестування плану)', { topic: 'debugging', conceptKey: 'debugging' }],
  [4, 70, 'topic=null → logic (рішення за умовою)', { topic: 'logic', conceptKey: 'logic' }],
  [4, 74, 'topic=null → efficiency (порівняння маршрутів)', { topic: 'efficiency', conceptKey: 'efficiency' }],
  [4, 90, 'тире замість дефіса; topic digital-safety → networks-internet', {
    q: 'Гугл (Google) — це…', topic: 'networks-internet',
  }],
  [4, 111, 'topic=null → decomposition (виділення підплану)', { topic: 'decomposition', conceptKey: 'decomposition' }],
  [4, 118, 'стем: Рівлик → Равлик', {
    q: 'Які лінії є ВЕРТИКАЛЬНИМИ (вгору або вниз)? Равлик починає вгору.',
  }],
]

// Виправлення не мають цілити у видалені питання; topic має пасувати track
for (const [g, i, why, patch] of FIXES) {
  const q = bundle[g][i]
  if (!q) throw new Error(`FIXES: немає питання ${g}#${i}`)
  if (toDelete.has(q.id)) throw new Error(`FIXES: ${g}#${i} одночасно у видаленні (${why})`)
  if (patch.topic) {
    const valid = TOPICS_BY_TRACK[q.track as keyof typeof TOPICS_BY_TRACK] ?? []
    if (!valid.includes(patch.topic)) throw new Error(`FIXES: topic «${patch.topic}» не пасує track «${q.track}» (${g}#${i})`)
  }
}

// ── Звіт плану ───────────────────────────────────────────────────────────────

console.log(`Видалення: ${toDelete.size}`)
for (const [, reason] of toDelete) console.log(`  − ${reason}`)
console.log(`\nВиправлення: ${FIXES.length}`)
for (const [g, i, why] of FIXES) console.log(`  ~ ${g}#${i}: ${why}`)

if (DRY_RUN) {
  console.log('\n--dry-run: у БД нічого не записано.')
  process.exit(0)
}

// ── FK-перевірка перед видаленням ────────────────────────────────────────────

const delIds = [...toDelete.keys()]
const referenced = new Set<string>()
for (const [table, col] of [
  [eventQuestions, eventQuestions.questionId],
  [attemptQuestions, attemptQuestions.questionId],
  [schoolSessionQuestions, schoolSessionQuestions.questionId],
  [schoolAnswers, schoolAnswers.questionId],
] as const) {
  const rows = await db.selectDistinct({ id: col }).from(table).where(inArray(col, delIds))
  for (const r of rows) referenced.add(r.id)
}

const deletable = delIds.filter(id => !referenced.has(id))
if (referenced.size > 0) {
  console.log(`\n⚠ Пропущено видалення (є FK-посилання, треба вирішити окремо): ${referenced.size}`)
  for (const id of referenced) console.log(`  ! ${toDelete.get(id)}`)
}
if (deletable.length > 0) {
  await db.delete(questions).where(inArray(questions.id, deletable))
}
console.log(`\nВидалено: ${deletable.length}`)

// ── Застосування виправлень ──────────────────────────────────────────────────

for (const [g, i, , patch] of FIXES) {
  await db.update(questions)
    .set({ ...patch as Record<string, unknown>, version: sql`version + 1`, updatedAt: new Date() })
    .where(eq(questions.id, bundle[g][i].id))
}
console.log(`Виправлено: ${FIXES.length}`)

// ── Перемішування варіантів choice ───────────────────────────────────────────

if (SHUFFLE) {
  const rows = await db
    .select({ id: questions.id, options: questions.options, correct: questions.correct })
    .from(questions)
    .where(sql`${questions.isOlympiad} = false and ${questions.type} = 'choice'`)
  let shuffled = 0
  for (const row of rows) {
    if (!Array.isArray(row.options) || row.correct == null) continue
    const indexed = (row.options as string[]).map((text, idx) => ({ text, isCorrect: idx === row.correct }))
    for (let i = indexed.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[indexed[i], indexed[j]] = [indexed[j], indexed[i]]
    }
    await db.update(questions)
      .set({
        options: indexed.map(o => o.text),
        correct: indexed.findIndex(o => o.isCorrect),
        version: sql`version + 1`,
        updatedAt: new Date(),
      })
      .where(eq(questions.id, row.id))
    shuffled++
  }
  console.log(`Перемішано варіанти: ${shuffled}`)
}

// ── Матриця покриття після змін ──────────────────────────────────────────────

const left = await db
  .select({ track: questions.track, topic: questions.topic, grade: questions.grade, type: questions.type })
  .from(questions)
  .where(eq(questions.isOlympiad, false))

const matrix = new Map<string, number[]>()
for (const r of left) {
  const key = `${r.track}/${r.topic ?? '∅'}`
  const arr = matrix.get(key) ?? [0, 0, 0, 0]
  if (r.grade && r.grade >= 1 && r.grade <= 4) arr[r.grade - 1]++
  matrix.set(key, arr)
}
console.log(`\nПокриття (grade 1..4), всього ${left.length}:`)
for (const [key, arr] of [...matrix.entries()].sort()) {
  console.log(`  ${key.padEnd(45)} ${arr.map(n => String(n).padStart(3)).join(' ')}`)
}
process.exit(0)
