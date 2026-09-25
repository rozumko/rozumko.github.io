// Plain-text lesson format (docs/lesson-engine/lesson-text-format.md).
// A teacher, or an AI assistant asked to rewrite a lesson, writes ordinary
// text. parseLessonText() turns it into a draft lesson for the editor, and
// lessonToText() writes a lesson back as text. The text states what the
// editor would otherwise ask block by block:
// - `## …` starts a step;
// - `[слайд]` puts a line on the board (without marks, a step gets its first
//   image or sentence);
// - `Для вчителя:` keeps a line in the teacher's plan only;
// - `?` starts a task, and `+` marks the right answer. Answers are never
//   guessed: a task without one is an error the author fixes in the text.
// The server still validates every save. Pure: type-only imports, so
// `node --test` runs it directly.

import type { EditableBlock, EditableLesson, Json, PackInfo } from './curriculum-model.js'
import type { ActivityTelemetry, LocalizedText } from '../lesson-engine/types.js'

// Mirrors backend/src/lib/curriculum-lesson-schema.ts.
const MAX_BLOCKS = 60
const MAX_ITEMS = 20
const MAX_SHORT = 200
const MAX_TEXT = 2000
const MAX_COLUMNS = 10
const HTML_TAG_RE = /<\/?[a-z!][^>]*>/i

const PLACEHOLDER_OBJECTIVE = 'Учні зможуть …'
const ABOUT_HEADING = 'Про урок'
const BREAK_HEADING = '☕ Перерва'
const TASK_HEADING = 'Завдання'

/** Paragraph prefixes for the three callouts of a step. */
const CALLOUTS: readonly { label: string; prefix: string }[] = [
  { label: 'Підказка', prefix: '💡 **Підказка:** ' },
  { label: 'Допомога', prefix: '🆘 **Потрібна допомога:** ' },
  { label: 'Більше', prefix: '🚀 **Хочеш більше:** ' },
]

const TELEMETRY_MARKS: Readonly<Record<string, ActivityTelemetry>> = {
  тренування: 'practice',
  перевірка: 'checkpoint',
  оцінювання: 'evidence',
}
const TELEMETRY_WORDS: Readonly<Record<ActivityTelemetry, string>> = {
  practice: 'тренування',
  checkpoint: 'перевірка',
  evidence: 'оцінювання',
}

type Item = Json & { type: string }

export interface TextIssue {
  /** 1-based line of the text; 0 for the text as a whole. */
  line: number
  message: string
}

/** `lesson` is set only when there are no errors (a flat shape: the frontend is not built with strictNullChecks). */
export interface TextParseResult {
  lesson?: EditableLesson
  errors: TextIssue[]
  warnings: TextIssue[]
}

export interface TextParseOptions {
  pack: PackInfo
  /** A free lesson id for the grade the text names. */
  lessonId: (grade: number) => string
}

const uk = (text: string): LocalizedText => ({ uk: text })

export function youtubeId(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return null
    const host = url.hostname.toLowerCase()
    let id: string | null = null
    if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0] ?? null
    else if (['youtube.com', 'www.youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com', 'm.youtube.com'].includes(host)) {
      id = url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1] ?? null
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
  } catch { return null }
}

/** A site-relative path or an https URL, as the schema accepts for media. */
function isMediaUrl(value: string): boolean {
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return true
  try {
    return new URL(value).protocol === 'https:'
  } catch { return false }
}

// ── Parsing ─────────────────────────────────────────────────────────────────

interface Entry { line: number; item: Item; teacherOnly: boolean; slide: boolean }

interface Question {
  line: number
  telemetry: ActivityTelemetry
  prompt: string
  options: { line: number; text: string; correct: boolean }[]
  statements: { line: number; text: string; value: boolean }[]
  placements: { line: number; category: string; text: string }[]
  explanation?: string
}

type Segment = { kind: 'content'; entries: Entry[] } | { kind: 'question'; question: Question }

interface Section { line: number; heading: string; isBreak: boolean; segments: Segment[] }

const STEP_RE = /^##(?!#)\s*(.*)$/
const QUESTION_RE = /^\?\s*(.*)$/
const OPTION_RE = /^([+\-–—])\s*(.+)$/
const EXPLANATION_RE = /^=\s*(.+)$/
const STATEMENT_RE = /^(правда|неправда|так|ні)\s*[:：]\s*(.+)$/iu
const PLACEMENT_RE = /^\[([^\]]+)\]\s*(.+)$/
const TABLE_SEPARATOR_RE = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/

const isQuestionLine = (text: string) =>
  OPTION_RE.test(text) || EXPLANATION_RE.test(text) || STATEMENT_RE.test(text) || PLACEMENT_RE.test(text)

export function parseLessonText(source: string, options: TextParseOptions): TextParseResult {
  const errors: TextIssue[] = []
  const warnings: TextIssue[] = []
  const error = (line: number, message: string) => { errors.push({ line, message }) }
  const warn = (line: number, message: string) => { warnings.push({ line, message }) }

  /** Checks one piece of text: no HTML, and clipped to the schema limit. */
  const clean = (line: number, value: string, max: number): string => {
    const text = value.trim()
    if (HTML_TAG_RE.test(text)) error(line, 'HTML-теги не підтримуються: пишіть звичайний текст (**жирний** і `код` можна).')
    if (text.length > max) {
      warn(line, `Задовгий текст скорочено до ${max} символів.`)
      return text.slice(0, max)
    }
    return text
  }

  const lines = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
  let i = 0
  while (i < lines.length && !lines[i]!.trim()) i++
  if (i >= lines.length) {
    error(0, 'Текст порожній. Перший рядок — назва уроку.')
    return { errors, warnings }
  }
  if (STEP_RE.test(lines[i]!.trim())) {
    error(i + 1, 'Спершу назва уроку (перший рядок), а вже потім кроки «## …».')
    return { errors, warnings }
  }
  const title = clean(i + 1, lines[i]!.trim().replace(/^#\s*/, ''), MAX_SHORT)
  i++

  // ── Header: everything before the first step.
  let grade = options.pack.gradeRange.min
  let durationMin = 40
  const objectives: string[] = []
  const headerLines: { line: number; text: string }[] = []
  let inObjectives = false
  for (; i < lines.length && !STEP_RE.test(lines[i]!.trim()); i++) {
    const text = lines[i]!.trim()
    const line = i + 1
    if (!text) {
      inObjectives = false
      headerLines.push({ line, text })
      continue
    }
    const gradeMatch = /^клас\s*[:：]\s*(\d{1,2})\b/iu.exec(text)
    const durationMatch = /^(?:тривалість|час|хвилин)\s*[:：]\s*(\d{1,3})/iu.exec(text)
    const objectivesMatch = /^цілі\s*[:：]\s*(.*)$/iu.exec(text)
    const bullet = /^[-*•]\s+(.+)$/.exec(text)
    if (gradeMatch) {
      const value = Number(gradeMatch[1])
      const { min, max } = options.pack.gradeRange
      if (value < min || value > max) error(line, `Клас ${value}: цей предмет підтримує класи ${min}–${max}.`)
      else grade = value
      inObjectives = false
    } else if (durationMatch) {
      const value = Number(durationMatch[1])
      if (value < 1 || value > 240) error(line, 'Тривалість має бути від 1 до 240 хвилин.')
      else durationMin = value
      inObjectives = false
    } else if (objectivesMatch) {
      inObjectives = true
      if (objectivesMatch[1]!.trim()) objectives.push(clean(line, objectivesMatch[1]!, MAX_TEXT))
    } else if (inObjectives && bullet) {
      objectives.push(clean(line, bullet[1]!, MAX_TEXT))
    } else {
      inObjectives = false
      headerLines.push({ line, text: lines[i]! })
    }
  }
  if (objectives.length > MAX_ITEMS) {
    error(0, `Цілей може бути не більше ${MAX_ITEMS}.`)
  }
  if (!objectives.length) warn(0, 'Немає цілей уроку: додайте рядок «Цілі:» і список «- …» під ним (або допишіть їх у редакторі).')

  /** Content lines → entries: lists and tables gather consecutive lines. */
  const contentEntries = (source: { line: number; text: string }[], teacherOnlyAll: boolean): Entry[] => {
    const entries: Entry[] = []
    let table: { line: number; rows: { line: number; cells: string[] }[]; teacherOnly: boolean; slide: boolean } | null = null
    let previousWasList = false

    const flushTable = () => {
      if (!table) return
      const t = table
      table = null
      const width = Math.max(...t.rows.map(r => r.cells.length))
      if (width < 2) {
        warn(t.line, 'Таблицю з одним стовпцем перетворено на список.')
        entries.push({ line: t.line, item: { type: 'list', items: t.rows.map(r => uk(r.cells[0] ?? '')) }, teacherOnly: t.teacherOnly, slide: t.slide })
        return
      }
      if (width > MAX_COLUMNS) return error(t.line, `У таблиці може бути від 2 до ${MAX_COLUMNS} стовпців.`)
      if (t.rows.length < 2) return error(t.line, 'Таблиці потрібні рядок заголовків і хоча б один рядок даних.')
      if (t.rows.length - 1 > MAX_ITEMS) return error(t.line, `У таблиці може бути не більше ${MAX_ITEMS} рядків даних.`)
      const uneven = t.rows.find(r => r.cells.length !== width)
      if (uneven) return error(uneven.line, `У кожному рядку таблиці має бути ${width} клітинки (як у заголовку).`)
      const [head, ...body] = t.rows
      entries.push({
        line: t.line,
        item: { type: 'table', headers: head!.cells.map(uk), rows: body.map(r => r.cells.map(uk)) },
        teacherOnly: t.teacherOnly,
        slide: t.slide,
      })
    }

    for (const { line, text: raw } of source) {
      let rest = raw.trim()
      if (!rest) {
        flushTable()
        previousWasList = false
        continue
      }
      let teacherOnly = teacherOnlyAll
      let slide = false
      for (;;) {
        const teacherMark = /^для вчителя\s*[:：]\s*/iu.exec(rest)
        if (teacherMark) { teacherOnly = true; rest = rest.slice(teacherMark[0].length); continue }
        const slideMark = /^\[слайд\]\s*/iu.exec(rest)
        if (slideMark) { slide = true; rest = rest.slice(slideMark[0].length); continue }
        break
      }
      if (teacherOnly && slide) {
        warn(line, teacherOnlyAll
          ? 'Опис уроку до першого кроку бачить лише вчитель: позначку [слайд] пропущено.'
          : 'Рядок «Для вчителя» не показується на слайді: позначку [слайд] пропущено.')
        slide = false
      }
      if (!rest) continue

      if (rest.startsWith('|')) {
        if (TABLE_SEPARATOR_RE.test(rest)) continue
        const cells = rest.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map(cell => clean(line, cell, MAX_SHORT))
        if (table && (table.teacherOnly !== teacherOnly || table.slide !== slide)) flushTable()
        table ??= { line, rows: [], teacherOnly, slide }
        table.rows.push({ line, cells })
        previousWasList = false
        continue
      }
      flushTable()

      const bullet = /^[-*•]\s+(.+)$/.exec(rest)
      const numbered = /^\d{1,2}[.)]\s+(.+)$/.exec(rest)
      if (bullet || numbered) {
        const ordered = Boolean(numbered)
        const text = uk(clean(line, (bullet ?? numbered)![1]!, MAX_TEXT))
        const last = entries[entries.length - 1]
        if (previousWasList && last && last.item.type === 'list' && Boolean(last.item.ordered) === ordered
          && last.teacherOnly === teacherOnly && last.slide === slide && (last.item.items as LocalizedText[]).length < MAX_ITEMS) {
          (last.item.items as LocalizedText[]).push(text)
        } else {
          entries.push({ line, item: ordered ? { type: 'list', ordered: true, items: [text] } : { type: 'list', items: [text] }, teacherOnly, slide })
        }
        previousWasList = true
        continue
      }
      previousWasList = false

      const subheading = /^###\s*(.+)$/.exec(rest)
      const image = /^!\[([^\]]*)\]\(\s*(\S+)\s*\)$/.exec(rest)
      const link = /^\[([^\]]+)\]\(\s*(\S+)\s*\)$/.exec(rest)
      const bareUrl = /^https:\/\/\S+$/.test(rest) ? rest : null
      let item: Item
      if (subheading) {
        item = { type: 'heading', text: uk(clean(line, subheading[1]!, MAX_SHORT)) }
      } else if (image) {
        const src = image[2]!
        if (!isMediaUrl(src)) {
          error(line, 'Адреса зображення має починатися з https:// (або бути шляхом на сайті, що починається з /).')
          continue
        }
        let alt = clean(line, image[1]!, MAX_SHORT)
        if (!alt) {
          warn(line, 'У зображення немає опису: додайте його в квадратних дужках ![опис](адреса). Поки що — «Ілюстрація».')
          alt = 'Ілюстрація'
        }
        item = { type: 'image', src, alt: uk(alt) }
      } else if (link || bareUrl) {
        const url = link ? link[2]! : bareUrl!
        const video = youtubeId(url)
        if (video) item = { type: 'video', videoId: video }
        else if (!isMediaUrl(url)) {
          error(line, 'Посилання має починатися з https://.')
          continue
        } else item = { type: 'link', url, label: uk(clean(line, link ? link[1]! : url, MAX_SHORT)) }
      } else {
        const callout = CALLOUTS.find(c => new RegExp(`^${c.label}\\s*[:：]\\s*`, 'iu').test(rest))
        const text = callout ? `${callout.prefix}${rest.replace(new RegExp(`^${callout.label}\\s*[:：]\\s*`, 'iu'), '')}` : rest
        item = { type: 'paragraph', text: uk(clean(line, text, MAX_TEXT)) }
      }
      entries.push({ line, item, teacherOnly, slide })
    }
    flushTable()
    return entries
  }

  // ── Steps.
  const sections: Section[] = []
  let pending: { line: number; text: string }[] = []
  let section: Section | null = null
  const flushContent = () => {
    if (!section || !pending.some(p => p.text.trim())) {
      pending = []
      return
    }
    const entries = contentEntries(pending, false)
    pending = []
    if (entries.length) section.segments.push({ kind: 'content', entries })
  }
  for (; i < lines.length; i++) {
    const text = lines[i]!.trim()
    const line = i + 1
    const step = STEP_RE.exec(text)
    if (step) {
      flushContent()
      const heading = clean(line, step[1]!, MAX_SHORT)
      if (!heading) error(line, 'Після «##» потрібна назва кроку.')
      section = { line, heading, isBreak: /^(?:☕\s*)?перерва(?!\p{L})/iu.test(heading), segments: [] }
      sections.push(section)
      continue
    }
    const questionStart = QUESTION_RE.exec(text)
    if (questionStart && section) {
      flushContent()
      let prompt = questionStart[1]!
      let telemetry: ActivityTelemetry = 'practice'
      const mark = /^\(([^)]+)\)\s*/u.exec(prompt)
      if (mark && TELEMETRY_MARKS[mark[1]!.trim().toLowerCase()]) {
        telemetry = TELEMETRY_MARKS[mark[1]!.trim().toLowerCase()]!
        prompt = prompt.slice(mark[0].length)
      }
      const question: Question = { line, telemetry, prompt: clean(line, prompt, MAX_TEXT), options: [], statements: [], placements: [] }
      while (i + 1 < lines.length && isQuestionLine(lines[i + 1]!.trim())) {
        i++
        const optionLine = i + 1
        const option = lines[i]!.trim()
        const statement = STATEMENT_RE.exec(option)
        const explanation = EXPLANATION_RE.exec(option)
        const placement = PLACEMENT_RE.exec(option)
        const choice = OPTION_RE.exec(option)
        if (statement) {
          const word = statement[1]!.toLowerCase()
          question.statements.push({ line: optionLine, text: clean(optionLine, statement[2]!, MAX_TEXT), value: word === 'правда' || word === 'так' })
        } else if (explanation) {
          question.explanation = clean(optionLine, explanation[1]!, MAX_TEXT)
        } else if (placement) {
          question.placements.push({ line: optionLine, category: clean(optionLine, placement[1]!, MAX_SHORT), text: clean(optionLine, placement[2]!, MAX_SHORT) })
        } else if (choice) {
          question.options.push({ line: optionLine, text: clean(optionLine, choice[2]!, MAX_TEXT), correct: choice[1] === '+' })
        }
      }
      section.segments.push({ kind: 'question', question })
      continue
    }
    if (section) pending.push({ line, text: lines[i]! })
  }
  flushContent()

  if (!sections.length) warn(0, 'У тексті немає кроків: кожен крок починається рядком «## Назва кроку».')

  // ── Blocks.
  const lesson: EditableLesson = {
    schemaVersion: 1,
    id: options.lessonId(grade),
    slug: '',
    subjectPackId: options.pack.id,
    subject: options.pack.subject,
    grade,
    title: uk(title || 'Новий урок'),
    durationMin,
    objectives: (objectives.length ? objectives : [PLACEHOLDER_OBJECTIVE]).slice(0, MAX_ITEMS).map((text, k) => ({ id: `o${k + 1}`, text: uk(text) })),
    learningOutcomes: [],
    blocks: [],
    metadata: { source: 'manual', contentVersion: 1, language: 'uk' },
  }
  lesson.slug = lesson.id
  let blockNumber = 0
  const nextBlockId = () => `${lesson.id}-b${String(++blockNumber).padStart(2, '0')}`
  let instanceNumber = 0

  lesson.blocks.push({
    id: nextBlockId(),
    type: 'hero',
    audience: { teacher: true, student: true },
    views: { document: true, presentation: true, remote: false },
    modality: 'teacher-led',
    runtime: { step: true },
    presentation: { layout: 'title' },
    content: { title: uk(lesson.title.uk) },
  })

  const pushCanvas = (heading: string, entries: Entry[], board: Item[]) => {
    const teacher = entries.map(e => e.item)
    const student = entries.filter(e => !e.teacherOnly).map(e => e.item)
    const block: EditableBlock = {
      id: nextBlockId(),
      type: 'canvas',
      audience: { teacher: true, student: board.length > 0 || student.length > 0 },
      views: { document: teacher.length > 0, presentation: board.length > 0, remote: student.length > 0 },
      modality: 'teacher-led',
      content: { heading: uk(heading), teacher, board, student },
    }
    if (student.length) block.runtime = { step: true }
    if (board.length) block.presentation = { layout: 'concept' }
    lesson.blocks.push(block)
  }

  const headerEntries = contentEntries(headerLines, true)
  for (let k = 0; k < headerEntries.length; k += MAX_ITEMS) pushCanvas(ABOUT_HEADING, headerEntries.slice(k, k + MAX_ITEMS), [])

  for (const s of sections) {
    if (s.isBreak) {
      const texts: string[] = []
      for (const segment of s.segments) {
        if (segment.kind === 'question') { warn(segment.question.line, 'Завдання в перерві пропущено.'); continue }
        for (const entry of segment.entries) {
          if (entry.item.type === 'paragraph') texts.push((entry.item.text as LocalizedText).uk)
          else warn(entry.line, 'У перерві зберігається лише текст: цей рядок пропущено.')
        }
      }
      const block: EditableBlock = {
        id: nextBlockId(),
        type: 'break',
        audience: { teacher: true, student: true },
        views: { document: true, presentation: false, remote: false },
        modality: 'movement',
        runtime: { step: true },
        content: texts.length ? { prompt: uk(texts.join(' ').slice(0, MAX_TEXT)) } : {},
      }
      lesson.blocks.push(block)
      continue
    }
    if (!s.segments.length) {
      warn(s.line, `Крок «${s.heading}» порожній, його пропущено.`)
      continue
    }
    const marked = s.segments.some(seg => seg.kind === 'content' && seg.entries.some(e => e.slide))
    let autoDone = marked
    for (const segment of s.segments) {
      if (segment.kind === 'question') {
        const block = questionBlock(segment.question, s.heading, `activity-${++instanceNumber}`, error, warn)
        if (block) {
          block.id = nextBlockId()
          lesson.blocks.push(block)
        }
        continue
      }
      for (let k = 0; k < segment.entries.length; k += MAX_ITEMS) {
        const chunk = segment.entries.slice(k, k + MAX_ITEMS)
        const publicItems = chunk.filter(e => !e.teacherOnly).map(e => e.item)
        let board: Item[] = []
        if (marked) board = chunk.filter(e => e.slide && !e.teacherOnly).map(e => e.item)
        else if (!autoDone && publicItems.length) {
          board = autoBoard(publicItems, s.heading)
          autoDone = true
        }
        pushCanvas(s.heading, chunk, board)
      }
    }
  }

  if (lesson.blocks.length > MAX_BLOCKS) {
    error(0, `Забагато блоків (${lesson.blocks.length}, можна до ${MAX_BLOCKS}): об'єднайте короткі кроки або розділіть урок на два.`)
  }
  for (const block of lesson.blocks) {
    if (block.activity?.telemetry === 'evidence') {
      warn(0, 'Завдання «(оцінювання)» треба пов’язати з результатом навчання в редакторі, інакше урок не збережеться.')
      break
    }
  }
  if (errors.length) return { errors, warnings }
  return { lesson, errors, warnings }
}

/** A slide says only the main thing: the first picture, else the first sentence. */
function autoBoard(publicItems: Item[], heading: string): Item[] {
  const image = publicItems.find(item => item.type === 'image' || item.type === 'video')
  if (image) return [image]
  const paragraph = publicItems.find(item => item.type === 'paragraph' && (item.text as LocalizedText).uk.trim() !== heading.trim())
  if (paragraph) return [paragraph]
  return publicItems.slice(0, 1)
}

function questionBlock(
  q: Question,
  heading: string,
  instanceId: string,
  error: (line: number, message: string) => void,
  warn: (line: number, message: string) => void,
): EditableBlock | null {
  const kinds = [q.options.length && 'choice', q.statements.length && 'truefalse', q.placements.length && 'classify'].filter(Boolean)
  const quoted = q.prompt ? `«${q.prompt.slice(0, 60)}${q.prompt.length > 60 ? '…' : ''}»` : 'без тексту'
  if (!kinds.length) {
    error(q.line, `Питання ${quoted}: після нього мають іти варіанти — «+ правильний» і «- неправильний», або «Правда: …» / «Неправда: …», або «[Група] предмет».`)
    return null
  }
  if (kinds.length > 1) {
    error(q.line, `Питання ${quoted}: в одному завданні змішано різні види варіантів. Розділіть його на кілька питань.`)
    return null
  }
  if (q.explanation !== undefined && kinds[0] !== 'choice') warn(q.line, `Питання ${quoted}: пояснення «= …» підтримується лише для вибору відповіді, його пропущено.`)

  let config: Json
  let key: Json
  const mechanic = kinds[0] as 'choice' | 'truefalse' | 'classify'
  if (mechanic === 'choice') {
    const correct = q.options.filter(o => o.correct)
    if (!q.prompt) error(q.line, 'Після «?» потрібен текст питання.')
    if (q.options.length < 2 || q.options.length > 6) error(q.line, `Питання ${quoted}: потрібно від 2 до 6 варіантів.`)
    if (correct.length === 0) error(q.line, `Питання ${quoted}: позначте правильну відповідь знаком «+» на початку рядка.`)
    if (correct.length > 1) error(q.line, `Питання ${quoted}: правильна відповідь має бути одна. Для кількох тверджень використайте «Правда: …» / «Неправда: …».`)
    const options = q.options.map((o, k) => ({ id: String.fromCharCode(97 + k), text: uk(o.text) }))
    config = { prompt: uk(q.prompt), options }
    const correctIndex = q.options.findIndex(o => o.correct)
    key = { correctOptionId: options[Math.max(0, correctIndex)]?.id ?? 'a' }
    if (q.explanation) key.explanation = uk(q.explanation)
  } else if (mechanic === 'truefalse') {
    if (q.statements.length > 10) error(q.line, `Питання ${quoted}: не більше 10 тверджень.`)
    const statements = q.statements.map((s, k) => ({ id: `s${k + 1}`, text: uk(s.text) }))
    config = q.prompt ? { prompt: uk(q.prompt), statements } : { statements }
    key = { answers: Object.fromEntries(q.statements.map((s, k) => [`s${k + 1}`, s.value])) }
  } else {
    if (!q.prompt) error(q.line, 'Після «?» потрібен текст завдання.')
    const labels = [...new Set(q.placements.map(p => p.category))]
    if (labels.length < 2 || labels.length > 4) error(q.line, `Завдання ${quoted}: потрібно від 2 до 4 груп у квадратних дужках.`)
    if (q.placements.length < 2 || q.placements.length > MAX_ITEMS) error(q.line, `Завдання ${quoted}: потрібно від 2 до ${MAX_ITEMS} предметів.`)
    const categories = labels.map((label, k) => ({ id: `c${k + 1}`, label: uk(label) }))
    const items = q.placements.map((p, k) => ({ id: `i${k + 1}`, label: uk(p.text) }))
    config = { prompt: uk(q.prompt), categories, items }
    key = { placement: Object.fromEntries(q.placements.map((p, k) => [`i${k + 1}`, `c${labels.indexOf(p.category) + 1}`])) }
  }

  return {
    id: '',
    type: 'activity',
    audience: { teacher: true, student: true },
    views: { document: true, presentation: true, remote: true },
    modality: 'screen',
    runtime: { step: true },
    presentation: { layout: 'activity-launcher' },
    content: { heading: uk(heading) },
    activity: { instanceId, mechanic, telemetry: q.telemetry, config, scoring: { mode: 'server', key } },
  }
}

// ── Writing a lesson back as text ───────────────────────────────────────────

export interface TextExport {
  text: string
  /** Blocks the text format cannot hold (other block types, tools, games). */
  skipped: { id: string; type: string }[]
}

/** Key-order independent comparison of two canvas items. */
function sameItem(a: unknown, b: unknown): boolean {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical)
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical((value as Json)[k])]))
    }
    return value
  }
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
}

const itemsOf = (block: EditableBlock, surface: 'teacher' | 'board' | 'student'): Item[] =>
  (Array.isArray(block.content[surface]) ? block.content[surface] : []) as Item[]

const oneLine = (text: string) => text.replace(/\s*\n\s*/g, ' ').trim()

function itemLines(item: Item): string[] {
  const text = (value: unknown) => oneLine((value as LocalizedText | undefined)?.uk ?? '')
  switch (item.type) {
    case 'paragraph': {
      const body = text(item.text)
      const callout = CALLOUTS.find(c => body.startsWith(c.prefix))
      return [callout ? `${callout.label}: ${body.slice(callout.prefix.length)}` : body]
    }
    case 'heading': return [`### ${text(item.text)}`]
    case 'list': return (item.items as LocalizedText[]).map((line, k) => `${item.ordered ? `${k + 1}.` : '-'} ${text(line)}`)
    case 'table': {
      const row = (cells: LocalizedText[]) => `| ${cells.map(cell => text(cell).replace(/\|/g, '/')).join(' | ')} |`
      return [row(item.headers as LocalizedText[]), ...(item.rows as LocalizedText[][]).map(row)]
    }
    case 'image': return [`![${text(item.alt)}](${String(item.src)})`]
    case 'video': return [`https://www.youtube.com/watch?v=${String(item.videoId)}`]
    case 'link': return [`[${text(item.label)}](${String(item.url)})`]
    default: return []
  }
}

function questionLines(block: EditableBlock): string[] | null {
  const activity = block.activity
  if (!activity || activity.scoring.mode !== 'server' || !activity.scoring.key) return null
  const config = activity.config
  const key = activity.scoring.key
  const mark = activity.telemetry === 'practice' ? '' : `(${TELEMETRY_WORDS[activity.telemetry]}) `
  const text = (value: unknown) => oneLine((value as LocalizedText | undefined)?.uk ?? '')
  switch (activity.mechanic) {
    case 'choice': {
      const lines = [`? ${mark}${text(config.prompt)}`]
      for (const option of (config.options ?? []) as { id: string; text: LocalizedText }[]) {
        lines.push(`${option.id === key.correctOptionId ? '+' : '-'} ${text(option.text)}`)
      }
      if (key.explanation) lines.push(`= ${text(key.explanation)}`)
      return lines
    }
    case 'truefalse': {
      const answers = (key.answers ?? {}) as Record<string, boolean>
      const lines = [`? ${mark}${config.prompt ? text(config.prompt) : 'Правда чи ні?'}`]
      for (const s of (config.statements ?? []) as { id: string; text: LocalizedText }[]) {
        lines.push(`${answers[s.id] ? 'Правда' : 'Неправда'}: ${text(s.text)}`)
      }
      return lines
    }
    case 'classify': {
      const placement = (key.placement ?? {}) as Record<string, string>
      const labels = new Map(((config.categories ?? []) as { id: string; label: LocalizedText }[]).map(c => [c.id, text(c.label)]))
      const lines = [`? ${mark}${text(config.prompt)}`]
      for (const item of (config.items ?? []) as { id: string; label: LocalizedText }[]) {
        lines.push(`[${labels.get(placement[item.id] ?? '') ?? '?'}] ${text(item.label)}`)
      }
      return lines
    }
    default:
      return null
  }
}

const headingOf = (block: EditableBlock, fallback: string) => {
  const heading = block.content.heading as LocalizedText | undefined
  return heading?.uk?.trim() ? oneLine(heading.uk) : fallback
}

/** The lesson as plain text in the same format parseLessonText() reads. */
export function lessonToText(lesson: EditableLesson): TextExport {
  const out: string[] = [`# ${oneLine(lesson.title.uk)}`, `Клас: ${lesson.grade}`, `Тривалість: ${lesson.durationMin} хв`]
  const skipped: TextExport['skipped'] = []
  const objectives = lesson.objectives.map(o => oneLine(o.text.uk)).filter(Boolean)
  // The lone placeholder is what a text without «Цілі:» gets anyway.
  const onlyPlaceholder = objectives.length === 1 && objectives[0] === PLACEHOLDER_OBJECTIVE
  if (objectives.length && !onlyPlaceholder) out.push('Цілі:', ...objectives.map(text => `- ${text}`))

  let k = lesson.blocks[0]?.type === 'hero' ? 1 : 0
  // The lesson description: teacher-only canvas blocks right after the title.
  const isAbout = (block: EditableBlock | undefined) => block?.type === 'canvas' && headingOf(block, '') === ABOUT_HEADING
    && !itemsOf(block, 'board').length && !itemsOf(block, 'student').length
  let described = false
  while (isAbout(lesson.blocks[k])) {
    if (!described) out.push('')
    described = true
    for (const item of itemsOf(lesson.blocks[k]!, 'teacher')) out.push(...itemLines(item))
    k++
  }

  // Consecutive canvas and task blocks with one heading form one step.
  const sections: { heading: string; blocks: EditableBlock[] }[] = []
  for (const block of lesson.blocks.slice(k)) {
    if (block.type === 'break') {
      sections.push({ heading: BREAK_HEADING, blocks: [block] })
      continue
    }
    const isTask = block.type === 'activity' && questionLines(block) !== null
    if (block.type !== 'canvas' && !isTask) {
      skipped.push({ id: block.id, type: block.activity ? `activity:${block.activity.mechanic}` : block.type })
      continue
    }
    const heading = headingOf(block, TASK_HEADING)
    const last = sections[sections.length - 1]
    if (last && last.heading === heading && last.blocks[0]?.type !== 'break') last.blocks.push(block)
    else sections.push({ heading, blocks: [block] })
  }

  for (const s of sections) {
    out.push('', `## ${s.heading}`)
    const first = s.blocks[0]!
    if (first.type === 'break') {
      const prompt = first.content.prompt as LocalizedText | undefined
      if (prompt?.uk?.trim()) out.push(oneLine(prompt.uk))
      continue
    }
    // Marks are needed unless every slide is what the parser would pick itself.
    let autoDone = false
    const automatic = s.blocks.filter(b => b.type === 'canvas').every(block => {
      const student = itemsOf(block, 'student')
      let expected: Item[] = []
      if (!autoDone && student.length) {
        expected = autoBoard(student, s.heading)
        autoDone = true
      }
      return sameItem(itemsOf(block, 'board'), expected)
    })
    let afterTask = false
    for (const block of s.blocks) {
      if (block.type === 'activity') {
        if (out[out.length - 1] !== '' && !out[out.length - 1]!.startsWith('## ')) out.push('')
        out.push(...questionLines(block)!)
        afterTask = true
        continue
      }
      if (afterTask) out.push('')
      afterTask = false
      const student = itemsOf(block, 'student')
      const board = [...itemsOf(block, 'board')]
      let next = 0
      const emit = (item: Item, teacherOnly: boolean) => {
        let slide = false
        if (!automatic) {
          const index = board.findIndex(entry => sameItem(entry, item))
          if (index >= 0 && !teacherOnly) {
            slide = true
            board.splice(index, 1)
          }
        }
        const prefix = `${teacherOnly ? 'Для вчителя: ' : ''}${slide ? '[слайд] ' : ''}`
        out.push(...itemLines(item).map(line => `${prefix}${line}`))
      }
      for (const item of itemsOf(block, 'teacher')) {
        const isPublic = next < student.length && sameItem(item, student[next])
        if (isPublic) next++
        emit(item, !isPublic)
      }
      // Content authored for devices or the board only has no line of its own
      // in the text; it is written as ordinary lines so nothing is lost.
      for (const item of student.slice(next)) emit(item, false)
      if (!automatic) for (const item of board) out.push(...itemLines(item).map(line => `[слайд] ${line}`))
    }
  }
  return { text: `${out.join('\n')}\n`, skipped }
}
