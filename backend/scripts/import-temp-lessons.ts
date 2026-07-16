// Import the temp/new_lessons authoring project into micro_lessons as drafts.
//
// Every imported lesson lands as an editorial draft: quiz explanations in the
// source are often teacher-facing, so an administrator must review and adapt
// the text in the admin lessons tab before publishing. The import never
// touches existing lesson ids and validates everything fail-closed before the
// first database write.
//
// Run:  cd backend && npx tsx scripts/import-temp-lessons.ts --dry-run   (no DB writes)
//       cd backend && npx tsx scripts/import-temp-lessons.ts             (writes drafts)

import { readdirSync } from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, join } from 'path'
import { normalizeLessonContent, normalizeLessonSlug, type LessonContentInput } from '../src/routes/lesson-validation.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LESSONS_DIR = join(__dirname, '../../temp/new_lessons/js/lessons')
const dryRun = process.argv.includes('--dry-run')

interface SourceSectionCard { title?: string; text?: string }
interface SourceSection {
  title?: string
  intro?: string
  cards?: SourceSectionCard[]
  bullets?: string[]
}
interface SourceQuizQuestion {
  type?: string
  question?: string
  options?: string[]
  answer?: string | string[]
  explanation?: string
}
interface SourceLesson {
  id?: string
  title?: string
  studentHook?: string
  sections?: SourceSection[]
  quiz?: { questions?: SourceQuizQuestion[] }
}

function sectionCard(section: SourceSection): { title?: string; text: string } {
  const parts: string[] = []
  if (section.intro) parts.push(section.intro.trim())
  for (const card of section.cards ?? []) {
    if (!card.text) continue
    parts.push(card.title ? `${card.title.trim()}: ${card.text.trim()}` : card.text.trim())
  }
  for (const bullet of section.bullets ?? []) parts.push(`• ${bullet.trim()}`)
  return { ...(section.title ? { title: section.title.trim() } : {}), text: parts.join('\n') }
}

function lessonContent(source: SourceLesson): LessonContentInput {
  const cards: Array<{ title?: string; text: string }> = []
  if (source.studentHook) cards.push({ title: 'Про що цей урок', text: source.studentHook.trim() })
  for (const section of source.sections ?? []) cards.push(sectionCard(section))

  const checkQuestions = (source.quiz?.questions ?? [])
    .filter(question => question.type === 'single' && typeof question.answer === 'string')
    .slice(0, 5)
    .map(question => {
      const options = question.options ?? []
      const correct = options.indexOf(question.answer as string)
      if (correct === -1) throw new Error(`«${source.id}»: answer «${question.answer}» відсутній серед options`)
      return {
        question: question.question ?? '',
        options,
        correct,
        ...(question.explanation ? { explanation: question.explanation } : {}),
      }
    })

  return normalizeLessonContent({ title: source.title, cards, checkQuestions })
}

const files = readdirSync(LESSONS_DIR).filter(file => file.endsWith('.js') && file !== 'catalog.js')
const prepared: Array<{ id: string; content: LessonContentInput }> = []
const errors: string[] = []

for (const file of files.sort()) {
  try {
    const module = await import(pathToFileURL(join(LESSONS_DIR, file)).href) as Record<string, unknown>
    const source = Object.values(module).find((value): value is SourceLesson =>
      typeof value === 'object' && value !== null && 'id' in value && 'sections' in value)
    if (!source) throw new Error('файл не експортує обʼєкт уроку')
    const id = normalizeLessonSlug(source.id)
    const content = lessonContent(source)
    prepared.push({ id, content })
    console.log(`${id}: карток ${content.cards.length}, питань ${content.checkQuestions.length}`)
  } catch (error) {
    errors.push(`${file}: ${(error as Error).message}`)
  }
}

if (errors.length) {
  console.error(`\nІмпорт зупинено — ${errors.length} уроків не пройшли валідацію:`)
  for (const error of errors) console.error(`  ${error}`)
  process.exit(1)
}

if (dryRun) {
  console.log(`\n[dry-run] Готово до імпорту: ${prepared.length} уроків. Записів у БД не зроблено.`)
  process.exit(0)
}

const { db } = await import('../src/db/index.js')
const { microLessons, microLessonRevisions } = await import('../src/db/schema.js')
const { lessonRevisionSnapshot } = await import('../src/routes/lesson-editorial.js')
const { inArray } = await import('drizzle-orm')

const existing = new Set((await db.select({ id: microLessons.id }).from(microLessons)
  .where(inArray(microLessons.id, prepared.map(lesson => lesson.id)))).map(row => row.id))

let imported = 0
for (const lesson of prepared) {
  if (existing.has(lesson.id)) {
    console.log(`${lesson.id}: вже існує — пропущено`)
    continue
  }
  await db.transaction(async tx => {
    const [row] = await tx.insert(microLessons).values({
      id: lesson.id,
      title: lesson.content.title,
      cards: lesson.content.cards,
      videoUrl: lesson.content.videoUrl ?? null,
      checkQuestions: lesson.content.checkQuestions,
      status: 'draft',
      createdBy: 'import-temp-lessons',
      updatedBy: 'import-temp-lessons',
    }).returning()
    await tx.insert(microLessonRevisions).values({
      lessonId: row.id, editVersion: row.editVersion, action: 'create',
      snapshot: lessonRevisionSnapshot(row), changedBy: 'import-temp-lessons',
    })
  })
  imported++
}

console.log(`\nІмпортовано чернеток: ${imported}; пропущено існуючих: ${existing.size}.`)
process.exit(0)
