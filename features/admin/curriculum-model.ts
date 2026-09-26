// Pure editing rules for the admin Lesson Engine lesson editor
// (features/admin/curriculum-tab.ts). The server re-validates everything on
// save (backend/src/lib/curriculum-lesson-schema.ts); these helpers only keep
// the draft consistent while it is edited:
// - block ids are stable (`<lessonId>-bNN`) and never renumbered, because
//   runs, reports and evidence refer to them;
// - an outcome linked to an activity is always listed on the lesson;
// - new blocks and activities start from templates that pass validation (a
//   visual still needs an asset), so an author can save early and fill in the
//   placeholders.

import type {
  ActivityMechanic,
  ActivityTelemetry,
  BlockModality,
  LessonBlockType,
  LocalizedText,
  PresentationLayout,
} from '../lesson-engine/types.js'

export type Json = Record<string, unknown>

export type OutcomeRole = 'introduced' | 'practised' | 'assessed'
export type EvidenceRole = 'primary' | 'supporting'
export type ScoringMode = 'none' | 'server' | 'client-unverified' | 'teacher-observed'

export interface EditablePresentation {
  layout: PresentationLayout
  headline?: LocalizedText
  shortText?: LocalizedText[]
  assetIds?: string[]
  speakerNotes?: LocalizedText
}

export interface EditableActivity {
  instanceId: string
  mechanic: ActivityMechanic
  telemetry: ActivityTelemetry
  config: Json
  scoring: { mode: ScoringMode; key?: Json }
  outcomes?: EditableOutcomeLink[]
  attempts?: { max?: number }
}

/** `items` narrows the evidence to named items (server-checked, at least two). */
export interface EditableOutcomeLink {
  outcomeId: string
  evidenceRole: EvidenceRole
  items?: string[]
}

export interface EditableBlock {
  id: string
  type: LessonBlockType
  audience: { teacher: boolean; student: boolean }
  views: { document: boolean; presentation: boolean; remote: boolean }
  modality: BlockModality
  estimatedMinutes?: number
  runtime?: { step: boolean }
  outcomeIds?: string[]
  presentation?: EditablePresentation
  content: Json
  activity?: EditableActivity
}

export interface EditableLesson {
  schemaVersion: 1
  id: string
  slug: string
  subjectPackId: string
  subject: string
  grade: number
  moduleId?: string
  unitId?: string
  lessonNumber?: number
  title: LocalizedText
  shortTitle?: LocalizedText
  essentialQuestion?: LocalizedText
  durationMin: number
  objectives: { id: string; text: LocalizedText }[]
  learningOutcomes: { outcomeId: string; role: OutcomeRole }[]
  vocabulary?: unknown[]
  assets?: { id: string; kind: string; src: string; alt: LocalizedText; caption?: LocalizedText }[]
  blocks: EditableBlock[]
  metadata: { source: string; sourceRef?: string; contentVersion: number; language: string }
}

/** What the editor needs to know about a subject pack. */
export interface PackInfo {
  id: string
  subject: string
  gradeRange: { min: number; max: number }
  tools: { key: string }[]
  games: { key: string; levels: string[] }[]
}

export const LESSON_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

const uk = (text: string): LocalizedText => ({ uk: text })

/** Same as MIN_ITEMS_PER_OUTCOME in the lesson schema (a unit test keeps them equal). */
export const MIN_ITEMS_PER_OUTCOME = 2

/** «1 картка», «3 картки», «5 карток». */
export function cardsLabel(count: number): string {
  const tens = count % 100
  const ones = count % 10
  if (tens < 11 || tens > 14) {
    if (ones === 1) return `${count} картка`
    if (ones >= 2 && ones <= 4) return `${count} картки`
  }
  return `${count} карток`
}

// ── Templates ───────────────────────────────────────────────────────────────

/** Same list as ACTIVITY_MECHANICS in lesson-engine/types.ts (a unit test keeps them equal). */
export const EDITOR_MECHANICS = ['choice', 'truefalse', 'classify', 'external', 'game'] as const satisfies readonly ActivityMechanic[]

/** Content that passes validation; the author replaces the placeholders. */
function contentTemplate(type: LessonBlockType): Json {
  switch (type) {
    case 'hero': return { title: uk('Назва уроку') }
    case 'essential-question': return { question: uk('Головне питання уроку?') }
    case 'objectives': return {}
    case 'explanation': return { heading: uk('Пояснення'), paragraphs: [uk('Текст пояснення.')] }
    case 'visual': return { heading: uk('Схема'), assetId: '' }
    case 'discussion': return { prompt: uk('Питання для обговорення?') }
    case 'practice': return { heading: uk('Практична робота'), steps: [{ items: [uk('Крок 1.')] }] }
    case 'canvas': return { heading: uk('Новий блок'), teacher: [{ type: 'paragraph', text: uk('Текст для вчителя.') }], board: [], student: [] }
    case 'activity': return { heading: uk('Інтерактивне завдання') }
    case 'support': return { heading: uk('Підтримка'), items: [uk('Підказка.')] }
    case 'extension': return { heading: uk('Для тих, хто впорався'), prompt: uk('Додаткове завдання.') }
    case 'reflection': return { heading: uk('Рефлексія'), prompt: uk('Що нового ти дізнався?') }
    case 'success-criteria': return { heading: uk('Я зможу'), items: [uk('Критерій успіху.')] }
    case 'vocabulary': return { heading: uk('Словник') }
    case 'teacher-note': return { text: uk('Нотатка для вчителя.') }
    case 'break': return { prompt: uk('Фізкультхвилинка.') }
  }
}

const DEFAULT_LAYOUT: Partial<Record<LessonBlockType, PresentationLayout>> = {
  hero: 'title',
  'essential-question': 'question',
  explanation: 'concept',
  visual: 'visual',
  discussion: 'question',
  activity: 'activity-launcher',
  reflection: 'question',
}

const DEFAULT_MODALITY: Partial<Record<LessonBlockType, BlockModality>> = {
  activity: 'screen',
  discussion: 'discussion',
  practice: 'paper',
  reflection: 'discussion',
  break: 'movement',
}

/** Blocks the console steps through by default; support material is not a step. */
const STEP_TYPES = new Set<LessonBlockType>([
  'hero', 'essential-question', 'explanation', 'visual', 'discussion', 'practice', 'canvas', 'activity', 'reflection', 'break',
])

export function layoutFor(type: LessonBlockType): PresentationLayout {
  return DEFAULT_LAYOUT[type] ?? 'concept'
}

export function activityTemplate(mechanic: ActivityMechanic, instanceId: string, pack: PackInfo | null): EditableActivity {
  const base = { instanceId, mechanic, telemetry: 'practice' as ActivityTelemetry }
  switch (mechanic) {
    case 'choice':
      return {
        ...base,
        config: { prompt: uk('Питання?'), options: [{ id: 'a', text: uk('Варіант А') }, { id: 'b', text: uk('Варіант Б') }] },
        scoring: { mode: 'server', key: { correctOptionId: 'a' } },
      }
    case 'truefalse':
      return {
        ...base,
        config: { prompt: uk('Правда чи ні?'), statements: [{ id: 's1', text: uk('Твердження.') }] },
        scoring: { mode: 'server', key: { answers: { s1: true } } },
      }
    case 'classify':
      return {
        ...base,
        config: {
          prompt: uk('Розклади по групах.'),
          categories: [{ id: 'c1', label: uk('Група 1') }, { id: 'c2', label: uk('Група 2') }],
          items: [{ id: 'i1', label: uk('Предмет 1') }, { id: 'i2', label: uk('Предмет 2') }],
        },
        scoring: { mode: 'server', key: { placement: { i1: 'c1', i2: 'c2' } } },
      }
    case 'external':
      return { ...base, config: { toolKey: pack?.tools[0]?.key ?? '' }, scoring: { mode: 'none' } }
    case 'game': {
      const game = pack?.games[0]
      return {
        ...base,
        config: { gameKey: game?.key ?? '', level: game?.levels[0] ?? '' },
        scoring: { mode: 'client-unverified' },
      }
    }
  }
}

/** The scoring a mechanic implies: games report their own result, tools report nothing. */
export function scoringModeFor(mechanic: ActivityMechanic): ScoringMode {
  return mechanic === 'external' ? 'none' : mechanic === 'game' ? 'client-unverified' : 'server'
}

export function isActivityMechanic(value: string): value is ActivityMechanic {
  return (EDITOR_MECHANICS as readonly string[]).includes(value)
}

/** `reserved`: ids a new block must not take (published or deleted blocks). */
export function newBlock(type: LessonBlockType, lesson: EditableLesson, pack: PackInfo | null, reserved: Iterable<string> = []): EditableBlock {
  const student = type !== 'teacher-note'
  const layout = DEFAULT_LAYOUT[type]
  const onBoard = student && layout !== undefined
  const block: EditableBlock = {
    id: nextBlockId(lesson, reserved),
    type,
    audience: { teacher: true, student },
    views: { document: true, presentation: onBoard, remote: type === 'activity' },
    modality: DEFAULT_MODALITY[type] ?? 'teacher-led',
    content: contentTemplate(type),
  }
  if (STEP_TYPES.has(type)) block.runtime = { step: true }
  if (onBoard) block.presentation = { layout: layout! }
  if (type === 'activity') block.activity = activityTemplate('choice', nextInstanceId(lesson), pack)
  return block
}

export function newLesson(input: { id: string; title: string; grade: number; pack: PackInfo }): EditableLesson {
  const lesson: EditableLesson = {
    schemaVersion: 1,
    id: input.id,
    slug: input.id,
    subjectPackId: input.pack.id,
    subject: input.pack.subject,
    grade: input.grade,
    title: uk(input.title.trim() || 'Новий урок'),
    durationMin: 40,
    objectives: [{ id: 'o1', text: uk('Учні зможуть …') }],
    learningOutcomes: [],
    blocks: [],
    metadata: { source: 'manual', contentVersion: 1, language: 'uk' },
  }
  const hero = newBlock('hero', lesson, input.pack)
  hero.content = { title: uk(lesson.title.uk) }
  lesson.blocks.push(hero)
  return lesson
}

// ── Ids ─────────────────────────────────────────────────────────────────────

function blockNumber(lessonId: string, blockId: string): number | null {
  const prefix = `${lessonId}-b`
  if (!blockId.startsWith(prefix)) return null
  const suffix = blockId.slice(prefix.length)
  return /^\d{2,3}$/.test(suffix) ? Number(suffix) : null
}

/**
 * Next free `<lessonId>-bNN`. Existing ids are never renumbered, and ids in
 * `reserved` (blocks of the published version, blocks deleted while editing)
 * are never handed to a different block.
 */
export function nextBlockId(lesson: EditableLesson, reserved: Iterable<string> = []): string {
  const numbers = [...lesson.blocks.map(b => b.id), ...reserved].map(id => blockNumber(lesson.id, id) ?? 0)
  const next = Math.max(0, ...numbers) + 1
  return `${lesson.id}-b${String(next).padStart(2, '0')}`
}

export function nextInstanceId(lesson: EditableLesson): string {
  const used = new Set(lesson.blocks.map(b => b.activity?.instanceId).filter(Boolean))
  let n = 1
  while (used.has(`activity-${n}`)) n++
  return `activity-${n}`
}

/**
 * Renames a lesson that was never saved: its block ids carry the lesson id,
 * so they move with it. Saved lessons keep their id for good.
 */
export function renameLesson(lesson: EditableLesson, newId: string): EditableLesson {
  const oldId = lesson.id
  const copy = structuredClone(lesson)
  copy.id = newId
  if (copy.slug === oldId) copy.slug = newId
  for (const block of copy.blocks) {
    const n = blockNumber(oldId, block.id)
    if (n !== null) block.id = `${newId}-b${String(n).padStart(2, '0')}`
  }
  return copy
}

// ── Structure edits ─────────────────────────────────────────────────────────

export function moveBlock(lesson: EditableLesson, index: number, delta: -1 | 1): boolean {
  return moveBlockTo(lesson, index, index + delta)
}

/** Moves the block at `from` so that it ends up at index `to` (drag and drop). */
export function moveBlockTo(lesson: EditableLesson, from: number, to: number): boolean {
  const count = lesson.blocks.length
  if (!Number.isInteger(from) || !Number.isInteger(to)) return false
  if (from === to || from < 0 || from >= count || to < 0 || to >= count) return false
  const [block] = lesson.blocks.splice(from, 1)
  lesson.blocks.splice(to, 0, block!)
  return true
}

// ── Converting old block types into «Текст і медіа» (canvas) ────────────────

/** Types an author can turn into a canvas block; the rest carry behaviour of their own. */
export const CONVERTIBLE_TYPES: ReadonlySet<LessonBlockType> = new Set<LessonBlockType>([
  'essential-question', 'explanation', 'visual', 'discussion', 'practice',
  'support', 'extension', 'reflection', 'success-criteria', 'teacher-note',
])

/** Heading a converted block gets when the old one had none. */
const CONVERTED_HEADINGS: Partial<Record<LessonBlockType, string>> = {
  'essential-question': 'Питання уроку', explanation: 'Пояснення', visual: 'Схема', discussion: 'Обговорення',
  practice: 'Практична робота', support: 'Підтримка', extension: 'Для тих, хто хоче більше',
  reflection: 'Рефлексія', 'success-criteria': 'Критерії успіху', 'teacher-note': 'Для вчителя',
}

const MAX_CANVAS_ITEMS = 20
type CanvasItemJson = Json & { type: string }

const isText = (value: unknown): value is LocalizedText =>
  typeof value === 'object' && value !== null && typeof (value as LocalizedText).uk === 'string' && (value as LocalizedText).uk.trim() !== ''
const texts = (value: unknown): LocalizedText[] => Array.isArray(value) ? value.filter(isText) : []
const paragraph = (text: LocalizedText): CanvasItemJson => ({ type: 'paragraph', text })
const prefixed = (label: string, text: LocalizedText): LocalizedText => ({ uk: `${label}: ${text.uk}` })

/**
 * Canvas items for one block. `teacherOnly` adds what children must not see
 * (an expected answer), so the board and devices get the public part only.
 */
function contentItems(block: EditableBlock, lesson: EditableLesson, teacherOnly: boolean): CanvasItemJson[] {
  const c = block.content
  const items: CanvasItemJson[] = []
  const list = (entries: LocalizedText[], ordered = false) => { if (entries.length) items.push(ordered ? { type: 'list', ordered: true, items: entries } : { type: 'list', items: entries }) }
  switch (block.type) {
    case 'essential-question':
      if (isText(c.question)) items.push(paragraph(c.question))
      break
    case 'explanation': {
      for (const text of texts(c.paragraphs)) items.push(paragraph(text))
      const callout = c.callout as { title?: unknown; text?: unknown } | undefined
      if (callout && isText(callout.title)) items.push({ type: 'heading', text: callout.title })
      if (callout && isText(callout.text)) items.push(paragraph(callout.text))
      break
    }
    case 'visual': {
      const asset = lesson.assets?.find(entry => entry.id === c.assetId)
      if (asset) items.push({ type: 'image', src: asset.src, alt: asset.alt })
      if (asset?.caption && isText(asset.caption)) items.push(paragraph(asset.caption))
      break
    }
    case 'discussion':
    case 'reflection':
    case 'extension':
      if (isText(c.prompt)) items.push(paragraph(c.prompt))
      if (isText(c.example)) items.push(paragraph(prefixed('Приклад', c.example)))
      if (teacherOnly && isText(c.expectedResponse)) items.push(paragraph(prefixed('Очікувана відповідь', c.expectedResponse)))
      break
    case 'practice': {
      if (isText(c.intro)) items.push(paragraph(c.intro))
      const table = c.table as { headers?: unknown; rows?: unknown } | undefined
      if (table && Array.isArray(table.headers) && Array.isArray(table.rows)) items.push({ type: 'table', headers: table.headers, rows: table.rows })
      for (const step of (Array.isArray(c.steps) ? c.steps : []) as { title?: unknown; items?: unknown }[]) {
        if (isText(step.title)) items.push({ type: 'heading', text: step.title })
        list(texts(step.items), true)
      }
      break
    }
    case 'support':
      list(texts(c.items))
      break
    case 'success-criteria':
      list(texts(c.items))
      if (isText(c.evidenceHint)) items.push(paragraph(c.evidenceHint))
      break
    case 'teacher-note':
      if (isText(c.text)) items.push(paragraph(c.text))
      break
  }
  return items
}

/**
 * Turns an old-style block into «Текст і медіа», keeping its id, place,
 * outcomes, timing, step and speaker notes. The teacher view gets the full
 * content; the board gets the authored slide points and images,
 * or the public content when the slide had none; devices get content only
 * where the old block was already shown on them (practice). Returns false for
 * types that cannot be converted.
 */
export function convertToCanvas(block: EditableBlock, lesson: EditableLesson): boolean {
  if (!CONVERTIBLE_TYPES.has(block.type)) return false
  const c = block.content
  const heading: LocalizedText = isText(c.heading) ? c.heading : { uk: CONVERTED_HEADINGS[block.type] ?? 'Блок уроку' }
  const teacher = contentItems(block, lesson, true)
  const publicItems = contentItems(block, lesson, false)
  const slide = block.presentation

  let board: CanvasItemJson[] = []
  if (block.views.presentation && block.audience.student && slide) {
    const points = texts(slide.shortText)
    if (points.length) board.push({ type: 'list', items: points })
    for (const id of slide.assetIds ?? []) {
      const asset = lesson.assets?.find(entry => entry.id === id)
      if (asset) board.push({ type: 'image', src: asset.src, alt: asset.alt })
    }
    // The slide title already shows the headline; do not repeat it as text.
    const headline = (slide.headline && isText(slide.headline) ? slide.headline : heading).uk.trim()
    if (!board.length) board = publicItems.filter(item => !(isText(item.text) && item.text.uk.trim() === headline))
    if (!board.length) board = publicItems
  }
  const student = block.views.remote && block.audience.student ? publicItems : []

  block.type = 'canvas'
  block.content = {
    heading,
    teacher: teacher.slice(0, MAX_CANVAS_ITEMS),
    board: board.slice(0, MAX_CANVAS_ITEMS),
    student: student.slice(0, MAX_CANVAS_ITEMS),
  }
  block.views = { document: teacher.length > 0, presentation: board.length > 0, remote: student.length > 0 }
  block.audience = { teacher: true, student: board.length > 0 || student.length > 0 }
  if (board.length && slide) {
    block.presentation = { layout: slide.layout === 'activity-launcher' || slide.layout === 'title' ? 'concept' : slide.layout }
    if (slide.headline && isText(slide.headline)) block.presentation.headline = slide.headline
    if (slide.speakerNotes && isText(slide.speakerNotes)) block.presentation.speakerNotes = slide.speakerNotes
  } else {
    delete block.presentation
  }
  if (student.length) block.runtime = { step: true }
  return true
}

/** Whether children see the block. Teacher-only blocks never reach the board or devices. */
export function setStudentAudience(block: EditableBlock, student: boolean): void {
  if (block.type === 'teacher-note') student = false
  block.audience.student = student
  if (!student) {
    block.views.presentation = false
    block.views.remote = false
    delete block.presentation
  }
}

export function setOnBoard(block: EditableBlock, onBoard: boolean): void {
  if (onBoard && !block.audience.student) return
  block.views.presentation = onBoard
  if (onBoard) block.presentation ??= { layout: layoutFor(block.type) }
  else delete block.presentation
}

/** Activities are dispatched; practice and canvas content appear with the current step. */
export function setOnDevices(block: EditableBlock, onDevices: boolean): void {
  block.views.remote = onDevices && (block.type === 'activity' || block.type === 'practice' || block.type === 'canvas') && block.audience.student
  if (block.views.remote && (block.type === 'practice' || block.type === 'canvas')) block.runtime = { step: true }
}

export function setStep(block: EditableBlock, step: boolean): void {
  if (step) block.runtime = { step: true }
  else {
    delete block.runtime
    if (block.type === 'practice' || block.type === 'canvas') block.views.remote = false
  }
}

/** One short line per bullet, at most 5; empty lines are dropped. */
export function shortTextFromLines(text: string): LocalizedText[] | undefined {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean).slice(0, 5)
  return lines.length ? lines.map(line => uk(line)) : undefined
}

export function optionalText(value: string, previous?: LocalizedText): LocalizedText | undefined {
  const text = value.trim()
  if (!text) return undefined
  return previous?.en ? { uk: text, en: previous.en } : uk(text)
}

// ── Outcomes ────────────────────────────────────────────────────────────────

function roleFromLinks(lesson: EditableLesson, outcomeId: string): OutcomeRole {
  const evidence = lesson.blocks.some(b => b.activity?.telemetry === 'evidence'
    && b.activity.outcomes?.some(o => o.outcomeId === outcomeId))
  return evidence ? 'assessed' : 'practised'
}

/**
 * Every outcome an activity links must be listed on the lesson. Missing ones
 * are added (assessed when an evidence activity links them, else practised);
 * roles the author set are kept.
 */
export function syncLessonOutcomes(lesson: EditableLesson): void {
  const listed = new Set(lesson.learningOutcomes.map(link => link.outcomeId))
  for (const block of lesson.blocks) {
    for (const link of block.activity?.outcomes ?? []) {
      if (listed.has(link.outcomeId)) continue
      lesson.learningOutcomes.push({ outcomeId: link.outcomeId, role: roleFromLinks(lesson, link.outcomeId) })
      listed.add(link.outcomeId)
    }
  }
}

export function addActivityOutcome(lesson: EditableLesson, blockIndex: number, outcomeId: string): boolean {
  const activity = lesson.blocks[blockIndex]?.activity
  if (!activity) return false
  activity.outcomes ??= []
  if (activity.outcomes.some(o => o.outcomeId === outcomeId)) return false
  // Games report their own result, so they can only ever be supporting evidence.
  activity.outcomes.push({ outcomeId, evidenceRole: activity.scoring.mode === 'client-unverified' ? 'supporting' : 'primary' })
  syncLessonOutcomes(lesson)
  return true
}

/**
 * Items an outcome link can be narrowed to: classify items or truefalse
 * statements of a server-scored activity. Empty for every other activity.
 */
export function outcomeItemChoices(activity: EditableActivity): { id: string; label: string }[] {
  if (activity.scoring.mode !== 'server') return []
  const list = activity.mechanic === 'classify' ? 'items' : activity.mechanic === 'truefalse' ? 'statements' : null
  if (!list || !isRecord(activity.config) || !Array.isArray(activity.config[list])) return []
  return (activity.config[list] as Json[]).flatMap(entry => {
    if (!isRecord(entry) || typeof entry.id !== 'string') return []
    const text = isRecord(entry.label) ? entry.label : isRecord(entry.text) ? entry.text : null
    return [{ id: entry.id, label: text && typeof text.uk === 'string' && text.uk.trim() ? text.uk : entry.id }]
  })
}

/** Checking every item means "the whole activity", so `items` is dropped. */
export function setOutcomeItems(activity: EditableActivity, link: EditableOutcomeLink, checked: readonly string[]): void {
  const choices = outcomeItemChoices(activity).map(choice => choice.id)
  const kept = choices.filter(id => checked.includes(id))
  if (choices.length === 0 || kept.length === choices.length) delete link.items
  else link.items = kept
}

/** A card counts for a link when the link names it, or names no cards at all. */
export function itemCountsFor(link: EditableOutcomeLink, itemId: string): boolean {
  return !link.items || link.items.includes(itemId)
}

/** Turns one card on or off for one outcome (the coloured tags in the activity dialog). */
export function toggleItemOutcome(activity: EditableActivity, link: EditableOutcomeLink, itemId: string): void {
  const current = link.items ?? outcomeItemChoices(activity).map(choice => choice.id)
  setOutcomeItems(activity, link, current.includes(itemId) ? current.filter(id => id !== itemId) : [...current, itemId])
}

// ── Activity setup (the three-step activity dialog) ─────────────────────────

/**
 * Sets what an activity is for. Evidence is done once, on the children's
 * devices, so a stale attempt limit is dropped and the task is sent to
 * devices; lesson outcome roles follow unless the author marked one as an
 * introduction.
 */
export function setActivityPurpose(lesson: EditableLesson, block: EditableBlock, telemetry: ActivityTelemetry): void {
  const activity = block.activity
  if (!activity) return
  activity.telemetry = telemetry
  if (telemetry === 'evidence') {
    delete activity.attempts
    setOnDevices(block, true)
  }
  for (const link of lesson.learningOutcomes) {
    if (link.role === 'introduced') continue
    if (activity.outcomes?.some(o => o.outcomeId === link.outcomeId)) link.role = roleFromLinks(lesson, link.outcomeId)
  }
}

export const CLASSIFY_LIMITS = { categories: { min: 2, max: 4 }, items: { min: 2, max: 20 } } as const

interface ClassifyParts {
  categories: Json[]
  items: Json[]
  placement: Record<string, unknown>
}

/** The classify config and key, created in place when missing. */
function classifyParts(activity: EditableActivity): ClassifyParts {
  const config = activity.config
  if (!Array.isArray(config.categories)) config.categories = []
  if (!Array.isArray(config.items)) config.items = []
  const key = activity.scoring.key ?? {}
  if (!isRecord(key.placement)) key.placement = {}
  activity.scoring.key = key
  return {
    categories: (config.categories as unknown[]).filter(isRecord),
    items: (config.items as unknown[]).filter(isRecord),
    placement: key.placement as Record<string, unknown>,
  }
}

function freeId(list: Json[], prefix: string): string {
  const used = new Set(list.map(entry => entry.id))
  let n = 1
  while (used.has(`${prefix}${n}`)) n++
  return `${prefix}${n}`
}

export function moveClassifyItem(activity: EditableActivity, itemId: string, categoryId: string): void {
  const { categories, placement } = classifyParts(activity)
  if (categories.some(category => category.id === categoryId)) placement[itemId] = categoryId
}

/** Adds an empty card to a group; returns its id, or null at the limit. */
export function addClassifyItem(activity: EditableActivity, categoryId: string): string | null {
  const { items, placement } = classifyParts(activity)
  if (items.length >= CLASSIFY_LIMITS.items.max) return null
  const id = freeId(items, 'i')
  ;(activity.config.items as unknown[]).push({ id, label: uk('') })
  placement[id] = categoryId
  // A link that names cards keeps naming the same ones; a new card is opt-in.
  return id
}

/** Removes a card from the task, the key and every outcome link. */
export function removeClassifyItem(activity: EditableActivity, itemId: string): boolean {
  const { items, placement } = classifyParts(activity)
  if (items.length <= CLASSIFY_LIMITS.items.min) return false
  activity.config.items = (activity.config.items as unknown[]).filter(item => !isRecord(item) || item.id !== itemId)
  delete placement[itemId]
  for (const link of activity.outcomes ?? []) {
    if (link.items) setOutcomeItems(activity, link, link.items.filter(id => id !== itemId))
  }
  return true
}

export function addClassifyCategory(activity: EditableActivity): string | null {
  const { categories } = classifyParts(activity)
  if (categories.length >= CLASSIFY_LIMITS.categories.max) return null
  const id = freeId(categories, 'c')
  ;(activity.config.categories as unknown[]).push({ id, label: uk('') })
  return id
}

/** Removes a group; its cards move to the first remaining group. */
export function removeClassifyCategory(activity: EditableActivity, categoryId: string): boolean {
  const { categories, placement } = classifyParts(activity)
  if (categories.length <= CLASSIFY_LIMITS.categories.min) return false
  activity.config.categories = (activity.config.categories as unknown[]).filter(c => !isRecord(c) || c.id !== categoryId)
  const fallback = String(categories.find(category => category.id !== categoryId)!.id)
  for (const [itemId, target] of Object.entries(placement)) if (target === categoryId) placement[itemId] = fallback
  return true
}

export interface ReadinessCheck {
  level: 'ok' | 'warn'
  text: string
  /** A one-click repair the dialog offers next to the warning. */
  fix?: 'make-evidence' | 'send-to-devices'
}

const PURPOSE_SUMMARY: Record<ActivityTelemetry, string> = {
  evidence: 'Для оцінки: одна спроба, результат іде у профіль учня і звіт',
  checkpoint: 'Перевірка на уроці: вчитель бачить відповіді класу, у профіль не йде',
  practice: 'Тренування: результат нікуди не записується',
}

function quoted(labels: string[]): string {
  return labels.map(label => `«${label}»`).join(', ')
}

/**
 * The dialog's readiness list: settings that save fine but defeat the
 * author's intent (outcomes on a practice task, evidence not sent to
 * devices, a skill checked by one card) and gaps the server would refuse.
 */
export function activityReadiness(block: EditableBlock, codeOf: (outcomeId: string) => string): ReadinessCheck[] {
  const activity = block.activity
  if (!activity) return []
  const checks: ReadinessCheck[] = [{ level: 'ok', text: PURPOSE_SUMMARY[activity.telemetry] }]
  const links = activity.outcomes ?? []
  const evidence = activity.telemetry === 'evidence'

  if (!evidence && links.length > 0) {
    checks.push({ level: 'warn', text: 'Вміння прив’язані, але завдання не для оцінки: у профіль учня нічого не запишеться.', fix: 'make-evidence' })
  }
  if (evidence && links.length === 0) checks.push({ level: 'warn', text: 'Завдання для оцінки, але не прив’язане до жодного вміння.' })
  if (evidence && !block.views.remote) {
    checks.push({ level: 'warn', text: 'Завдання для оцінки не надсилається на пристрої: діти не зможуть його виконати.', fix: 'send-to-devices' })
  }
  if (evidence && activity.mechanic === 'external') checks.push({ level: 'warn', text: 'Зовнішній тренажер нічого не повертає, тож для оцінки не підходить.' })
  if (evidence && activity.mechanic === 'game') checks.push({ level: 'ok', text: 'Гра сама повідомляє результат, тому це лише допоміжний доказ.' })

  const choices = outcomeItemChoices(activity)
  if (evidence && choices.length > 0 && links.length > 0) {
    for (const link of links) {
      const count = choices.filter(choice => itemCountsFor(link, choice.id)).length
      if (count < MIN_ITEMS_PER_OUTCOME) {
        checks.push({ level: 'warn', text: `${codeOf(link.outcomeId)}: потрібно щонайменше ${MIN_ITEMS_PER_OUTCOME} картки, інакше це вгадування.` })
      } else {
        checks.push({ level: 'ok', text: `${codeOf(link.outcomeId)}: ${link.items ? cardsLabel(count) : 'усі картки'}` })
      }
    }
    const loose = choices.filter(choice => !links.some(link => itemCountsFor(link, choice.id)))
    if (loose.length) checks.push({ level: 'warn', text: `Не рахується в жодне вміння: ${quoted(loose.map(choice => choice.label))}.` })
  }

  if (activity.mechanic === 'classify') {
    const { categories, items, placement } = classifyParts(activity)
    const groupIds = new Set(categories.map(category => category.id))
    if (categories.some(category => !localizedText(category.label))) checks.push({ level: 'warn', text: 'Є група без назви.' })
    if (items.some(item => !localizedText(item.label))) checks.push({ level: 'warn', text: 'Є картка без тексту.' })
    const homeless = items.filter(item => !groupIds.has(placement[String(item.id)]))
    if (homeless.length) checks.push({ level: 'warn', text: `Картка без групи: ${quoted(homeless.map(item => localizedText(item.label) || String(item.id)))}.` })
  }
  if (activity.mechanic === 'choice' && !activity.scoring.key?.correctOptionId) {
    checks.push({ level: 'warn', text: 'Не позначено правильну відповідь.' })
  }
  return checks
}

function localizedText(value: unknown): string {
  return isRecord(value) && typeof value.uk === 'string' ? value.uk.trim() : ''
}

export function removeActivityOutcome(lesson: EditableLesson, blockIndex: number, outcomeId: string): void {
  const activity = lesson.blocks[blockIndex]?.activity
  if (!activity?.outcomes) return
  activity.outcomes = activity.outcomes.filter(o => o.outcomeId !== outcomeId)
  if (activity.outcomes.length === 0) delete activity.outcomes
}

export function addLessonOutcome(lesson: EditableLesson, outcomeId: string, role: OutcomeRole = 'introduced'): boolean {
  if (lesson.learningOutcomes.some(link => link.outcomeId === outcomeId)) return false
  lesson.learningOutcomes.push({ outcomeId, role })
  return true
}

/** Removes an outcome from the lesson and from every block and activity that links it. */
export function removeLessonOutcome(lesson: EditableLesson, outcomeId: string): void {
  lesson.learningOutcomes = lesson.learningOutcomes.filter(link => link.outcomeId !== outcomeId)
  lesson.blocks.forEach((block, i) => {
    removeActivityOutcome(lesson, i, outcomeId)
    if (block.outcomeIds) {
      block.outcomeIds = block.outcomeIds.filter(id => id !== outcomeId)
      if (block.outcomeIds.length === 0) delete block.outcomeIds
    }
  })
}

export interface OutcomeCoverage {
  outcomeId: string
  role: OutcomeRole
  activities: { blockIndex: number; blockId: string; instanceId: string; telemetry: ActivityTelemetry; evidenceRole: EvidenceRole }[]
  /** An evidence activity with a primary link: the report can decide this outcome. */
  measured: boolean
}

/** For each lesson outcome: which activities check it, and whether any can decide it. */
export function outcomeCoverage(lesson: EditableLesson): OutcomeCoverage[] {
  return lesson.learningOutcomes.map(link => {
    const activities: OutcomeCoverage['activities'] = []
    lesson.blocks.forEach((block, blockIndex) => {
      const activity = block.activity
      const found = activity?.outcomes?.find(o => o.outcomeId === link.outcomeId)
      if (activity && found) {
        activities.push({ blockIndex, blockId: block.id, instanceId: activity.instanceId, telemetry: activity.telemetry, evidenceRole: found.evidenceRole })
      }
    })
    const measured = activities.some(a => a.telemetry === 'evidence' && a.evidenceRole === 'primary')
    return { outcomeId: link.outcomeId, role: link.role, activities, measured }
  })
}

// ── Preview, issues, JSON ───────────────────────────────────────────────────

/** The draft as a teacher would receive it: answer keys removed. */
export function withoutAnswerKeys(lesson: EditableLesson): EditableLesson {
  const copy = structuredClone(lesson)
  for (const block of copy.blocks) if (block.activity) delete block.activity.scoring.key
  return copy
}

export interface Issue { path: string; message: string }

/** Server issues split into lesson-level ones and ones that belong to a block. */
export function groupIssues(issues: Issue[]): { lesson: Issue[]; blocks: Map<number, Issue[]> } {
  const lesson: Issue[] = []
  const blocks = new Map<number, Issue[]>()
  for (const issue of issues) {
    const match = /^blocks\[(\d+)\](?:\.(.*))?$/.exec(issue.path)
    if (!match) {
      lesson.push(issue)
      continue
    }
    const index = Number(match[1])
    const list = blocks.get(index) ?? []
    list.push({ path: match[2] ?? '', message: issue.message })
    blocks.set(index, list)
  }
  return { lesson, blocks }
}

const MESSAGES: readonly [RegExp, string][] = [
  [/^must be a non-empty string$/, 'не може бути порожнім'],
  [/^unknown field$/, 'невідоме поле (приберіть його)'],
  [/^must not contain HTML markup$/, 'без HTML: лише **жирний** і `код`'],
  [/^must reference a lesson asset$/, 'має посилатися на ресурс уроку (розділ «Ресурси»)'],
  [/^must reference a lesson learningOutcomes entry$/, 'результат має бути в списку результатів уроку'],
  [/^is not in the subject pack outcome registry$/, 'такого діючого результату немає в довіднику'],
  [/^is not in the subject pack allowlist$/, 'предмет не дозволяє цей інструмент або гру'],
  [/^names an unknown game or level$/, 'невідома гра або рівень'],
  [/^evidence activities must link an outcome$/, 'завдання-доказ має бути пов’язане з результатом'],
  [/^evidence activities must be scored$/, 'завдання-доказ має оцінюватися'],
  [/^client-unverified results can only be supporting evidence$/, 'результат гри може бути лише допоміжним доказом'],
  [/^at least one block must be a runtime step$/, 'хоча б один блок має бути кроком уроку'],
  [/^is required when views\.presentation is true$/, 'для показу на дошці потрібен слайд'],
  [/^teacher-only blocks cannot appear in presentation or remote views$/, 'блок лише для вчителя не можна показувати учням'],
  [/^must be unique$/, 'має бути унікальним'],
  [/^must be unique within the lesson$/, 'має бути унікальним в уроці'],
  [/^must match the lesson being edited$/, 'не збігається з уроком, який редагується'],
  [/^is not a registered subject pack$/, 'такого предмета немає'],
]

export function describeIssueMessage(message: string): string {
  for (const [pattern, text] of MESSAGES) if (pattern.test(message)) return text
  return message
}

const LESSON_FIELDS: Readonly<Record<string, string>> = {
  id: 'ID', slug: 'Slug', title: 'Назва', 'title.uk': 'Назва', grade: 'Клас', durationMin: 'Тривалість',
  subjectPackId: 'Предмет', subject: 'Предмет', objectives: 'Цілі', learningOutcomes: 'Результати уроку',
  blocks: 'Блоки', assets: 'Ресурси', vocabulary: 'Словник', essentialQuestion: 'Головне питання',
  moduleId: 'Модуль', lessonNumber: 'Номер уроку',
}

/** «Цілі 2 → text.uk: не може бути порожнім» for a lesson-level issue. */
export function describeLessonIssue(issue: Issue): string {
  const list = /^(objectives|learningOutcomes|assets|vocabulary)\[(\d+)\](?:\.(.*))?$/.exec(issue.path)
  const field = list
    ? `${LESSON_FIELDS[list[1]!]} ${Number(list[2]) + 1}${list[3] ? ` → ${list[3]}` : ''}`
    : LESSON_FIELDS[issue.path] ?? issue.path
  return `${field || 'Урок'}: ${describeIssueMessage(issue.message)}`
}

/** `value` when ok, `error` otherwise (a flat shape: the frontend is not built with strictNullChecks). */
export interface JsonParse { ok: boolean; value?: unknown; error?: string }

export function parseJson(text: string): JsonParse {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2)
}

