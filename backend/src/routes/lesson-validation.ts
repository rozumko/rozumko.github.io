// Валідація мікро-уроків для адмін-CRUD (fail-closed: биті поля — помилка,
// а не мовчазне відкидання, як у клієнтського normalizeLesson: автор має
// побачити проблему в редакторі, дитина — ніколи).

export interface LessonCardInput {
  title?: string
  text: string
  image?: string
  imageAlt?: string
}

export interface LessonCheckQuestionInput {
  question: string
  options: string[]
  correct: number
  explanation?: string
}

export interface LessonContentInput {
  title: string
  cards: LessonCardInput[]
  videoUrl?: string | null
  checkQuestions: LessonCheckQuestionInput[]
}

export const LESSON_STATUSES = ['draft', 'published', 'archived'] as const
export type LessonStatus = (typeof LESSON_STATUSES)[number]

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const MAX_SLUG = 64
const MAX_TITLE = 200
const MAX_TEXT = 2000
const MAX_CARDS = 12
const MAX_QUESTIONS = 5
const MAX_OPTIONS = 6

function fail(message: string): never {
  throw new Error(message)
}

function optionalTrimmed(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') fail(`${field} має бути рядком`)
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (trimmed.length > max) fail(`${field}: не більше ${max} символів`)
  return trimmed
}

function requiredTrimmed(value: unknown, field: string, max: number): string {
  const out = optionalTrimmed(value, field, max)
  if (!out) fail(`${field} — обовʼязкове поле`)
  return out
}

/** Лише https або відносний шлях (напр. /lessons/assets/x.svg). */
function normalizeMediaUrl(value: unknown, field: string): string | undefined {
  const raw = optionalTrimmed(value, field, 500)
  if (!raw) return undefined
  if (raw.startsWith('/') || raw.startsWith('./')) return raw
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    fail(`${field}: невалідний URL`)
  }
  if (parsed.protocol !== 'https:') fail(`${field}: дозволено лише https або відносний шлях`)
  return raw
}

export function normalizeLessonSlug(raw: unknown): string {
  const slug = requiredTrimmed(raw, 'id уроку', MAX_SLUG)
  if (!SLUG_RE.test(slug)) fail('id уроку: лише малі латинські літери, цифри та дефіси')
  return slug
}

export function normalizeLessonStatus(raw: unknown): LessonStatus {
  if (typeof raw === 'string' && (LESSON_STATUSES as readonly string[]).includes(raw)) {
    return raw as LessonStatus
  }
  fail('Невідомий статус уроку')
}

function normalizeCard(raw: unknown, index: number): LessonCardInput {
  if (typeof raw !== 'object' || raw === null) fail(`Картка ${index + 1}: невалідний формат`)
  const card = raw as Record<string, unknown>
  const out: LessonCardInput = {
    text: requiredTrimmed(card.text, `Картка ${index + 1}: текст`, MAX_TEXT),
  }
  const title = optionalTrimmed(card.title, `Картка ${index + 1}: заголовок`, MAX_TITLE)
  if (title) out.title = title
  const image = normalizeMediaUrl(card.image, `Картка ${index + 1}: картинка`)
  if (image) {
    out.image = image
    const imageAlt = optionalTrimmed(card.imageAlt, `Картка ${index + 1}: alt-текст`, MAX_TITLE)
    if (imageAlt) out.imageAlt = imageAlt
  }
  return out
}

function normalizeCheckQuestion(raw: unknown, index: number): LessonCheckQuestionInput {
  if (typeof raw !== 'object' || raw === null) fail(`Питання ${index + 1}: невалідний формат`)
  const q = raw as Record<string, unknown>
  const question = requiredTrimmed(q.question, `Питання ${index + 1}: текст`, MAX_TEXT)
  if (!Array.isArray(q.options)) fail(`Питання ${index + 1}: options має бути списком`)
  if (q.options.length < 2 || q.options.length > MAX_OPTIONS) {
    fail(`Питання ${index + 1}: від 2 до ${MAX_OPTIONS} варіантів`)
  }
  const options = q.options.map((option, optIndex) =>
    requiredTrimmed(option, `Питання ${index + 1}, варіант ${optIndex + 1}`, MAX_TITLE))
  if (!Number.isInteger(q.correct) || (q.correct as number) < 0 || (q.correct as number) >= options.length) {
    fail(`Питання ${index + 1}: correct має вказувати на існуючий варіант`)
  }
  const out: LessonCheckQuestionInput = { question, options, correct: q.correct as number }
  const explanation = optionalTrimmed(q.explanation, `Питання ${index + 1}: пояснення`, MAX_TEXT)
  if (explanation) out.explanation = explanation
  return out
}

/** Контент уроку (без id/status): спільна форма для create і update. */
export function normalizeLessonContent(raw: unknown): LessonContentInput {
  if (typeof raw !== 'object' || raw === null) fail('Невалідне тіло запиту')
  const body = raw as Record<string, unknown>

  if (!Array.isArray(body.cards)) fail('cards має бути списком')
  if (body.cards.length < 1 || body.cards.length > MAX_CARDS) {
    fail(`Урок має містити від 1 до ${MAX_CARDS} карток`)
  }
  if (!Array.isArray(body.checkQuestions)) fail('checkQuestions має бути списком')
  if (body.checkQuestions.length > MAX_QUESTIONS) {
    fail(`Не більше ${MAX_QUESTIONS} перевірочних питань`)
  }

  const content: LessonContentInput = {
    title: requiredTrimmed(body.title, 'Назва уроку', MAX_TITLE),
    cards: body.cards.map(normalizeCard),
    checkQuestions: body.checkQuestions.map(normalizeCheckQuestion),
  }
  const videoUrl = normalizeMediaUrl(body.videoUrl, 'videoUrl')
  content.videoUrl = videoUrl ?? null
  return content
}

/** Зміна контенту (не метаданих) вимагає підняття version — щоб результати
 * дітей інтерпретувались проти правильної редакції уроку. */
export function lessonContentChanged(prev: LessonContentInput, next: LessonContentInput): boolean {
  return JSON.stringify(prev) !== JSON.stringify(next)
}
