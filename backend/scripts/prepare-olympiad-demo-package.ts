// One-time, repeatable migration for the four authored demo variants per grade.
// It adds the delivery contract, slot metadata and internally generated visual
// stimuli without changing answer keys except for the documented content fixes.

import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import {
  getOlympiadDemoBlueprint,
  olympiadDemoBlueprintVersion,
} from '../src/lib/olympiad-demo-blueprints.js'

type JsonQuestion = Record<string, unknown> & {
  type: string
  grade: number
  q: string
  options?: string[]
  correct?: number
  answer?: string | number
  code?: string | null
  given?: string[]
  items?: string[]
  correctOrder?: number[]
  pairs?: Array<{ left: string; right: string }>
}

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const authoredDir = join(repoRoot, 'temp/authored')
const imageDir = join(repoRoot, 'public/images/olympiad-demo/v1')
const visualSlots: Record<number, Set<number>> = {
  1: new Set([2, 3, 8]),
  2: new Set([2, 4, 6, 8]),
  3: new Set([3, 4, 6, 10]),
  4: new Set([3, 4, 5, 8]),
}

const baseSeconds: Record<string, number> = {
  choice: 55,
  truefalse: 45,
  sequence: 70,
  sort: 90,
  match: 90,
  input: 90,
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, character => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  })[character]!)
}

function visualLines(question: JsonQuestion): string[] {
  if (question.code) return question.code.split('\n').slice(0, 7)
  if (question.given?.length) return [question.given.join('   ')]
  if (question.pairs?.length) return question.pairs.map(pair => pair.left)
  return [question.q]
}

function writeStimulusSvg(grade: number, slotNumber: number, variant: string, question: JsonQuestion): string {
  const filename = `g${grade}-s${String(slotNumber).padStart(2, '0')}-${variant}.svg`
  const lines = visualLines(question)
  const lineHeight = 36
  const startY = Math.max(95, 180 - ((lines.length - 1) * lineHeight) / 2)
  const text = lines.map((line, index) =>
    `<text x="360" y="${startY + index * lineHeight}" text-anchor="middle" class="data">${escapeXml(line)}</text>`,
  ).join('\n  ')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="360" viewBox="0 0 720 360" role="img">
  <rect width="720" height="360" rx="28" fill="#f5f3ff"/>
  <rect x="28" y="28" width="664" height="304" rx="22" fill="#fff" stroke="#7c3aed" stroke-width="4"/>
  <text x="52" y="69" class="label">Дані завдання</text>
  ${text}
  <style>
    .label { font: 600 22px system-ui, sans-serif; fill: #6d28d9; }
    .data { font: 600 27px system-ui, sans-serif; fill: #1f2937; }
  </style>
</svg>
`
  writeFileSync(join(imageDir, filename), svg, 'utf8')
  return `/images/olympiad-demo/v1/${filename}`
}

function applyContentFixes(grade: number, variant: string, slotNumber: number, question: JsonQuestion): void {
  if (grade === 1 && slotNumber === 4 && question.options) {
    const names = question.options.filter(option => !option.startsWith('Неможливо')).slice(0, 3)
    if (!question.q.startsWith('У черзі стоять')) {
      question.q = `У черзі стоять ${names.join(', ')}. ${question.q}`
    }
  }
  if (grade === 1 && slotNumber === 8 && question.type === 'input') {
    const answer = Number(question.answer)
    const variants: Record<string, number[]> = {
      A: [5, 6, 8, 9],
      B: [2, 4, 1, 6],
      C: [6, 8, 9, 5],
      D: [6, 4, 8, 5],
    }
    question.type = 'choice'
    question.options = variants[variant]!.map(String)
    question.correct = variants[variant]!.indexOf(answer)
    delete question.answer
    delete question.inputType
  }
  if (grade === 1 && slotNumber === 6 && Array.isArray(question.items) && question.items.length === 4) {
    question.items = [question.items[0], question.items[1], question.items[3]]
    question.correctOrder = [0, 1, 2]
  }
  if (grade === 1 && slotNumber === 10 && Array.isArray(question.items) && question.items.length === 4) {
    const keep = variant === 'A' ? [0, 2, 3] : [0, 1, 3]
    question.items = keep.map(index => question.items![index])
    question.correctOrder = [0, 1, 2]
  }
  if (grade === 3 && variant === 'D' && slotNumber === 9 && question.pairs) {
    question.pairs[0] = { left: 'Закріпити', right: 'Відкріпити' }
  }
  if (grade === 4 && variant === 'C' && slotNumber === 1 && question.options) {
    question.options[2] = '«Вихід» і зелений знак «EXIT»'
  }
  if (grade === 4 && variant === 'A' && slotNumber === 12) {
    question.q = 'Посилання ШІ відкривається й веде на офіційне джерело. Це одна з ознак, що відповідь можна перевірити.'
    question.correct = 0
  }
  if (grade === 4 && variant === 'C' && slotNumber === 12) {
    question.q = 'Реалістичне фото, створене ШІ, потрібно перевіряти за надійними джерелами.'
    question.correct = 0
  }
  if (grade === 4 && (slotNumber === 2 || slotNumber === 6) && question.pairs && question.pairs.length > 3) {
    question.pairs = question.pairs.slice(0, 3)
  }
}

mkdirSync(imageDir, { recursive: true })

let questionsUpdated = 0
let imagesWritten = 0
for (const grade of [1, 2, 3, 4]) {
  const blueprint = getOlympiadDemoBlueprint(grade)
  for (const variant of ['A', 'B', 'C', 'D']) {
    const file = join(authoredDir, `g${grade}_demo_set_${variant}.json`)
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { questions: JsonQuestion[] }
    if (parsed.questions.length !== 12) throw new Error(`${file}: expected 12 questions`)

    parsed.questions.forEach((question, index) => {
      const slotNumber = index + 1
      const slot = blueprint[index]!
      applyContentFixes(grade, variant, slotNumber, question)
      if (
        question.type !== slot.type
        || question.grade !== grade
        || question.track !== slot.track
        || question.topic !== slot.topic
        || question.difficulty !== slot.difficulty
        || question.progressionBand !== slot.progressionBand
      ) throw new Error(`${file} #${slotNumber}: content does not match ${slot.id}`)

      Object.assign(question, {
        purpose: 'olympiad-demo',
        isOlympiad: false,
        channels: ['olympiad_training'],
        slotId: slot.id,
        blueprintVersion: olympiadDemoBlueprintVersion(grade),
        templateId: slot.id,
        variantLabel: variant,
        estimatedSeconds: (baseSeconds[question.type] ?? 60) + (slot.difficulty === 'hard' ? 15 : 0),
      })

      if (visualSlots[grade]?.has(slotNumber)) {
        question.img = writeStimulusSvg(grade, slotNumber, variant, question)
        question.imageAlt = `Візуальні дані до завдання ${slotNumber} для ${grade} класу.`
        question.imageRole = 'essential'
        question.imageSource = 'Rozumko original generated diagram'
        question.imageLicense = 'Proprietary educational asset'
        imagesWritten++
      } else {
        question.img = null
        question.imageAlt = null
        delete question.imageRole
        delete question.imageSource
        delete question.imageLicense
      }
      questionsUpdated++
    })
    writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
  }
}

console.log(`Updated ${questionsUpdated} questions and wrote ${imagesWritten} SVG stimuli.`)
