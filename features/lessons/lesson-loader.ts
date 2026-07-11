import type { LessonCard, LessonCheckQuestion, MicroLesson } from './lesson-data.js'

// Завантаження мікро-уроків зі статичного бандла public/lessons/<id>.json.
// Роздається з GitHub Pages (без бекенду, без cold start); SW кешує
// network-first, тож офлайн віддається остання відома версія.
// Нормалізація fail-safe: биті поля відкидаються, а не валять урок;
// урок без жодної картки вважається невалідним (краще чесна помилка,
// ніж порожній екран теорії).

const lessonCache = new Map<string, MicroLesson>()

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** Лише https або відносний шлях — жодних javascript:/data: з контенту. */
function safeMediaUrl(v: unknown): string {
  const raw = str(v)
  if (!raw) return ''
  if (raw.startsWith('/') || raw.startsWith('./')) return raw
  try {
    return new URL(raw).protocol === 'https:' ? raw : ''
  } catch {
    return ''
  }
}

function normalizeCard(raw: unknown): LessonCard | null {
  if (typeof raw !== 'object' || raw === null) return null
  const card = raw as Record<string, unknown>
  const text = str(card.text)
  if (!text) return null
  const out: LessonCard = { text }
  const title = str(card.title)
  if (title) out.title = title
  const image = safeMediaUrl(card.image)
  if (image) {
    out.image = image
    out.imageAlt = str(card.imageAlt)
  }
  return out
}

function normalizeCheckQuestion(raw: unknown): LessonCheckQuestion | null {
  if (typeof raw !== 'object' || raw === null) return null
  const q = raw as Record<string, unknown>
  const question = str(q.question)
  const options = Array.isArray(q.options)
    ? q.options.map(str).filter(Boolean)
    : []
  if (!question || options.length < 2) return null
  const correctRaw = Number.isInteger(q.correct) ? (q.correct as number) : 0
  const out: LessonCheckQuestion = {
    question,
    options,
    correct: Math.min(Math.max(0, correctRaw), options.length - 1),
  }
  const explanation = str(q.explanation)
  if (explanation) out.explanation = explanation
  return out
}

/** Pure-нормалізація для тестів; повертає null для непридатного уроку. */
export function normalizeLesson(raw: unknown, fallbackId: string): MicroLesson | null {
  if (typeof raw !== 'object' || raw === null) return null
  const obj = raw as Record<string, unknown>
  const cards = Array.isArray(obj.cards)
    ? obj.cards.map(normalizeCard).filter((c): c is LessonCard => c !== null)
    : []
  if (!cards.length) return null

  const lesson: MicroLesson = {
    id: str(obj.id) || fallbackId,
    version: Number.isInteger(obj.version) && (obj.version as number) > 0 ? (obj.version as number) : 1,
    title: str(obj.title) || 'Урок',
    cards,
    check: Array.isArray(obj.check)
      ? obj.check.map(normalizeCheckQuestion).filter((q): q is LessonCheckQuestion => q !== null)
      : [],
  }
  const videoUrl = safeMediaUrl(obj.videoUrl)
  if (videoUrl) lesson.videoUrl = videoUrl
  return lesson
}

export async function loadLesson(lessonId: string): Promise<MicroLesson> {
  const cached = lessonCache.get(lessonId)
  if (cached) return cached

  let res: Response
  try {
    res = await fetch(`/lessons/${encodeURIComponent(lessonId)}.json`)
  } catch {
    throw new Error('Не вдалося завантажити урок. Перевір інтернет і спробуй ще раз.')
  }
  if (!res.ok) throw new Error('Цей урок ще готується — спробуй пізніше.')

  let raw: unknown
  try {
    raw = await res.json()
  } catch {
    throw new Error('Урок пошкоджено. Спробуй оновити сторінку.')
  }
  const lesson = normalizeLesson(raw, lessonId)
  if (!lesson) throw new Error('Урок пошкоджено. Спробуй оновити сторінку.')
  lessonCache.set(lessonId, lesson)
  return lesson
}
