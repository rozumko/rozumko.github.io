// ── Lesson Engine: curriculum lesson schema v1 ───────────────────────────────
// Canonical, subject-agnostic lesson definition (docs/lesson-engine/README.md).
// One definition feeds every projection (teacher, presentation, student,
// remote); no per-mode content copies.
//
// Boundaries this module enforces:
// - Core knows lessons, blocks, activities and outcomes — never a subject.
//   Subject specifics (external tools, grade range) come from a SubjectPack
//   and are checked by validateLessonAgainstPack(). A guard test fails if a
//   subject name leaks into this file.
// - Answer keys live only in `activity.scoring.key` and are server-only.
//   toDisplaySafeLesson() is the single place that strips them before any
//   definition leaves the backend (teacher view, static export).
// - Editorial status (draft/review/published/archived) belongs to the DB row
//   (ADR-0006), not to the definition, so the two can never disagree.
// - Validation is fail-closed and collects every problem with a JSON path, so
//   an editor or a migration report sees all of them at once.

export const CURRICULUM_LESSON_SCHEMA_VERSION = 1

// ── Types ─────────────────────────────────────────────────────────────────────

/** Ukrainian is required; English is optional (bilingual terms and titles). */
export interface LocalizedText {
  uk: string
  en?: string
}

export interface LessonObjective {
  id: string
  text: LocalizedText
}

export const LESSON_OUTCOME_ROLES = ['introduced', 'practised', 'assessed'] as const
export type LessonOutcomeRole = (typeof LESSON_OUTCOME_ROLES)[number]

export interface LessonOutcomeLink {
  outcomeId: string
  role: LessonOutcomeRole
}

export interface VocabularyItem {
  term: LocalizedText
  definition?: LocalizedText
}

export const LESSON_ASSET_KINDS = ['image', 'diagram', 'video'] as const
export type LessonAssetKind = (typeof LESSON_ASSET_KINDS)[number]

export interface LessonAsset {
  id: string
  kind: LessonAssetKind
  /** Relative path or https URL. */
  src: string
  /** Required: every visual must be describable to a screen reader. */
  alt: LocalizedText
  caption?: LocalizedText
}

export const BLOCK_MODALITIES = ['screen', 'teacher-led', 'discussion', 'paper', 'movement', 'unplugged'] as const
export type BlockModality = (typeof BLOCK_MODALITIES)[number]

export const PRESENTATION_LAYOUTS = ['title', 'visual', 'concept', 'question', 'activity-launcher'] as const
export type PresentationLayout = (typeof PRESENTATION_LAYOUTS)[number]

/**
 * Authored projection for the board. Stored, reviewed and published with the
 * lesson — never generated on the fly at run time.
 */
export interface BlockPresentation {
  layout: PresentationLayout
  headline?: LocalizedText
  shortText?: LocalizedText[]
  assetIds?: string[]
  /** Shown on the teacher console only, never on the projection surface. */
  speakerNotes?: LocalizedText
}

export interface LessonBlockBase {
  /** Stable, published ID: `<lessonId>-bNN`. Used by runtime, reports, evidence. */
  id: string
  audience: { teacher: boolean; student: boolean }
  views: { document: boolean; presentation: boolean; remote: boolean }
  modality: BlockModality
  estimatedMinutes?: number
  /** Whether the teacher console treats this block as a navigable step. */
  runtime?: { step: boolean }
  outcomeIds?: string[]
  presentation?: BlockPresentation
}

export interface ExplanationCallout {
  title?: LocalizedText
  text: LocalizedText
}

export interface HeroBlock extends LessonBlockBase {
  type: 'hero'
  content: { kicker?: LocalizedText; title: LocalizedText; subtitle?: LocalizedText }
}

export interface EssentialQuestionBlock extends LessonBlockBase {
  type: 'essential-question'
  content: { question: LocalizedText }
}

export interface ObjectivesBlock extends LessonBlockBase {
  type: 'objectives'
  /** Renders the lesson-level objectives; no content of its own. */
  content: { heading?: LocalizedText }
}

export interface ExplanationBlock extends LessonBlockBase {
  type: 'explanation'
  content: { heading?: LocalizedText; paragraphs: LocalizedText[]; callout?: ExplanationCallout }
}

export interface VisualBlock extends LessonBlockBase {
  type: 'visual'
  content: { heading?: LocalizedText; assetId: string }
}

export interface DiscussionBlock extends LessonBlockBase {
  type: 'discussion'
  content: { heading?: LocalizedText; prompt: LocalizedText; expectedResponse?: LocalizedText }
}

/** Guided practical work that happens outside the engine (OS apps, paper). */
export interface PracticeBlock extends LessonBlockBase {
  type: 'practice'
  content: {
    heading?: LocalizedText
    intro?: LocalizedText
    table?: { headers: LocalizedText[]; rows: LocalizedText[][] }
    steps: { title?: LocalizedText; items: LocalizedText[] }[]
  }
}

/** One authored block with independently composed teacher, board and student views. */
export type CanvasItem =
  | { type: 'paragraph' | 'heading'; text: LocalizedText }
  | { type: 'list'; ordered?: boolean; items: LocalizedText[] }
  | { type: 'table'; headers: LocalizedText[]; rows: LocalizedText[][] }
  | { type: 'image'; src: string; alt: LocalizedText }
  | { type: 'video'; videoId: string }
  | { type: 'link'; url: string; label: LocalizedText }

export interface CanvasBlock extends LessonBlockBase {
  type: 'canvas'
  content: { heading: LocalizedText; teacher: CanvasItem[]; board: CanvasItem[]; student: CanvasItem[] }
}

export interface SupportBlock extends LessonBlockBase {
  type: 'support'
  content: { heading?: LocalizedText; items: LocalizedText[] }
}

export interface ExtensionBlock extends LessonBlockBase {
  type: 'extension'
  content: { heading?: LocalizedText; prompt: LocalizedText; example?: LocalizedText }
}

export interface ReflectionBlock extends LessonBlockBase {
  type: 'reflection'
  content: { heading?: LocalizedText; prompt: LocalizedText }
}

export interface SuccessCriteriaBlock extends LessonBlockBase {
  type: 'success-criteria'
  content: { heading?: LocalizedText; items: LocalizedText[]; evidenceHint?: LocalizedText }
}

export interface VocabularyBlock extends LessonBlockBase {
  type: 'vocabulary'
  /** Renders the lesson-level vocabulary plus optional sentence frames. */
  content: { heading?: LocalizedText; sentenceFrames?: LocalizedText[] }
}

export interface TeacherNoteBlock extends LessonBlockBase {
  type: 'teacher-note'
  content: { text: LocalizedText }
}

export interface BreakBlock extends LessonBlockBase {
  type: 'break'
  content: { prompt?: LocalizedText }
}

// ── Activities ────────────────────────────────────────────────────────────────

/** MVP mechanics. New mechanics register a config validator below. */
export const ACTIVITY_MECHANICS = ['choice', 'truefalse', 'classify', 'external', 'game'] as const
export type ActivityMechanic = (typeof ACTIVITY_MECHANICS)[number]

/** practice → learning only; checkpoint → live teacher signal; evidence → persistent outcome evidence. */
export const ACTIVITY_TELEMETRY = ['practice', 'checkpoint', 'evidence'] as const
export type ActivityTelemetry = (typeof ACTIVITY_TELEMETRY)[number]

export const SCORING_MODES = ['none', 'server', 'client-unverified', 'teacher-observed'] as const
export type ScoringMode = (typeof SCORING_MODES)[number]

export const EVIDENCE_ROLES = ['primary', 'supporting'] as const
export type EvidenceRole = (typeof EVIDENCE_ROLES)[number]

export interface ChoiceConfig {
  prompt: LocalizedText
  options: { id: string; text: LocalizedText }[]
}
/** `explanation` is feedback the server returns after an answer — it reveals the key, so it lives here. */
export interface ChoiceKey { correctOptionId: string; explanation?: LocalizedText }

export interface TrueFalseConfig {
  prompt?: LocalizedText
  statements: { id: string; text: LocalizedText }[]
}
export interface TrueFalseKey { answers: Record<string, boolean> }

export interface ClassifyConfig {
  prompt: LocalizedText
  categories: { id: string; label: LocalizedText }[]
  items: { id: string; label: LocalizedText }[]
}
export interface ClassifyKey { placement: Record<string, string> }

/** Launch-only external tool. The URL lives in the subject pack's allowlist, never in the lesson. */
export interface ExternalConfig {
  toolKey: string
  instructions?: LocalizedText
  estimatedMinutesLabel?: LocalizedText
}

/**
 * A code-owned interactive game from the platform registry. The game reports
 * its own aggregate result, so it is always client-unverified; which games a
 * lesson may use is decided by the subject pack.
 */
export interface GameConfig {
  gameKey: string
  level: string
  instructions?: LocalizedText
}

export interface ActivitySpec {
  /** Unique within the lesson; stable across published versions. */
  instanceId: string
  mechanic: ActivityMechanic
  telemetry: ActivityTelemetry
  config: ChoiceConfig | TrueFalseConfig | ClassifyConfig | ExternalConfig | GameConfig
  scoring: {
    mode: ScoringMode
    /** Server-only answer key. Stripped by toDisplaySafeLesson(). */
    key?: ChoiceKey | TrueFalseKey | ClassifyKey
  }
  outcomes?: ActivityOutcomeLink[]
  attempts?: { max?: number }
}

/**
 * `items` narrows the evidence for this outcome to the named classify items or
 * truefalse statements, so one activity can evidence several skills, each by
 * its own items. Without it the whole activity's score counts.
 */
export interface ActivityOutcomeLink {
  outcomeId: string
  evidenceRole: EvidenceRole
  items?: string[]
}

/** One item cannot evidence a skill: with two categories it is a coin toss. */
export const MIN_ITEMS_PER_OUTCOME = 2

export interface ActivityBlock extends LessonBlockBase {
  type: 'activity'
  content: { heading?: LocalizedText }
  activity: ActivitySpec
}

export type LessonBlock =
  | HeroBlock
  | EssentialQuestionBlock
  | ObjectivesBlock
  | ExplanationBlock
  | VisualBlock
  | DiscussionBlock
  | PracticeBlock
  | CanvasBlock
  | ActivityBlock
  | SupportBlock
  | ExtensionBlock
  | ReflectionBlock
  | SuccessCriteriaBlock
  | VocabularyBlock
  | TeacherNoteBlock
  | BreakBlock

export type LessonBlockType = LessonBlock['type']

export const LESSON_BLOCK_TYPES: readonly LessonBlockType[] = [
  'hero', 'essential-question', 'objectives', 'explanation', 'visual', 'discussion',
  'practice', 'canvas', 'activity', 'support', 'extension', 'reflection', 'success-criteria',
  'vocabulary', 'teacher-note', 'break',
]

export const LESSON_SOURCES = ['manual', 'html-import', 'legacy-import', 'fixture'] as const
export type LessonSource = (typeof LESSON_SOURCES)[number]

export interface LessonDefinitionV1 {
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
  objectives: LessonObjective[]
  learningOutcomes: LessonOutcomeLink[]
  vocabulary?: VocabularyItem[]
  assets?: LessonAsset[]
  blocks: LessonBlock[]
  metadata: {
    source: LessonSource
    sourceRef?: string
    contentVersion: number
    language: string
  }
}

/** Subject-specific registry a lesson is validated against. Lives outside core. */
export interface SubjectPack {
  id: string
  subject: string
  title: LocalizedText
  gradeRange: { min: number; max: number }
  curriculumRefs: string[]
  externalTools: Record<string, { url: string; integration: 'launch-only'; title: LocalizedText }>
  /** Registry keys of platform games lessons in this pack may embed. */
  games: string[]
  /** Learning outcomes lessons in this pack may target and evidence. */
  outcomes: Record<string, LearningOutcome>
}

export const OUTCOME_SOURCES = ['national-standard', 'program', 'international', 'internal'] as const
export type OutcomeSource = (typeof OUTCOME_SOURCES)[number]

/** How closely a mapped ref matches the outcome: a methodological judgement, not an official equivalence. */
export const MAPPING_STRENGTHS = ['direct', 'partial', 'supporting'] as const
export type MappingStrength = (typeof MAPPING_STRENGTHS)[number]

export interface OutcomeMapping {
  framework: string
  ref: string
  strength?: MappingStrength
}

/**
 * A pack-owned learning outcome. `mappings` links it to external frameworks
 * without the core knowing what a framework means.
 */
export interface LearningOutcome {
  code: string
  title: LocalizedText
  source: OutcomeSource
  sourceRef?: string
  gradeBand?: string
  mappings: OutcomeMapping[]
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface LessonValidationIssue {
  path: string
  message: string
}

export type LessonValidationResult =
  | { ok: true; lesson: LessonDefinitionV1 }
  | { ok: false; errors: LessonValidationIssue[] }

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const LOCAL_ID_RE = /^[a-z0-9]+([-_.][a-z0-9]+)*$/
const HTML_TAG_RE = /<\/?[a-z!][^>]*>/i
const LANGUAGE_RE = /^[a-z]{2}(-[a-z]{2})?$/

const MAX_ID = 64
const MAX_SHORT = 200
const MAX_TEXT = 2000
const MAX_BLOCKS = 60
const MAX_LIST = 20
const MAX_DURATION_MIN = 240
const MAX_GRADE = 12

type Json = Record<string, unknown>

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

class Collector {
  readonly errors: LessonValidationIssue[] = []
  add(path: string, message: string): void {
    this.errors.push({ path, message })
  }
}

function checkKnownKeys(c: Collector, value: Json, allowed: readonly string[], path: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) c.add(path ? `${path}.${key}` : key, 'unknown field')
  }
}

function checkString(c: Collector, value: unknown, path: string, max: number, re?: RegExp): value is string {
  if (typeof value !== 'string' || !value.trim()) {
    c.add(path, 'must be a non-empty string')
    return false
  }
  if (value.length > max) c.add(path, `must be at most ${max} characters`)
  if (re && !re.test(value)) c.add(path, 'has an invalid format')
  return true
}

function checkPlainText(c: Collector, value: string, path: string): void {
  // Content is structured data, never raw HTML: renderers escape everything
  // and interpret only **bold** and `code`.
  if (HTML_TAG_RE.test(value)) c.add(path, 'must not contain HTML markup')
}

function checkLocalized(c: Collector, value: unknown, path: string, max = MAX_TEXT): boolean {
  if (!isRecord(value)) {
    c.add(path, 'must be an object { uk, en? }')
    return false
  }
  checkKnownKeys(c, value, ['uk', 'en'], path)
  if (checkString(c, value.uk, `${path}.uk`, max)) checkPlainText(c, value.uk, `${path}.uk`)
  if (value.en !== undefined && checkString(c, value.en, `${path}.en`, max)) {
    checkPlainText(c, value.en, `${path}.en`)
  }
  return true
}

function checkOptionalLocalized(c: Collector, value: unknown, path: string, max = MAX_TEXT): void {
  if (value !== undefined) checkLocalized(c, value, path, max)
}

function checkLocalizedList(c: Collector, value: unknown, path: string, min: number, max = MAX_LIST): void {
  if (!Array.isArray(value)) {
    c.add(path, 'must be an array')
    return
  }
  if (value.length < min || value.length > max) c.add(path, `must have ${min}–${max} items`)
  value.forEach((item, i) => checkLocalized(c, item, `${path}[${i}]`))
}

function checkInt(c: Collector, value: unknown, path: string, min: number, max: number): boolean {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    c.add(path, `must be an integer ${min}–${max}`)
    return false
  }
  return true
}

function checkEnum<T extends string>(c: Collector, value: unknown, allowed: readonly T[], path: string): value is T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    c.add(path, `must be one of: ${allowed.join(', ')}`)
    return false
  }
  return true
}

function checkBool(c: Collector, value: unknown, path: string): void {
  if (typeof value !== 'boolean') c.add(path, 'must be a boolean')
}

function checkMediaSrc(c: Collector, value: unknown, path: string): void {
  if (!checkString(c, value, path, 500)) return
  const src = value as string
  if (src.startsWith('/') && !src.startsWith('//') && !src.includes('\\')) return
  let parsed: URL
  try {
    parsed = new URL(src)
  } catch {
    c.add(path, 'must be a relative path or an https URL')
    return
  }
  if (parsed.protocol !== 'https:') c.add(path, 'must be a relative path or an https URL')
}

/** Collects IDs from a list of `{ id }` records, reporting duplicates and bad formats. */
function checkIdList(c: Collector, list: unknown[], path: string, field = 'id'): Set<string> {
  const ids = new Set<string>()
  list.forEach((item, i) => {
    if (!isRecord(item)) return
    const id = item[field]
    if (!checkString(c, id, `${path}[${i}].${field}`, MAX_ID, LOCAL_ID_RE)) return
    if (ids.has(id as string)) c.add(`${path}[${i}].${field}`, 'must be unique')
    ids.add(id as string)
  })
  return ids
}

interface LessonContext {
  lessonId: string
  assetIds: Set<string>
  outcomeIds: Set<string>
  instanceIds: Set<string>
}

// ── Mechanic validators ──────────────────────────────────────────────────────
// Each registered mechanic validates its display-safe config and, when the
// scoring mode needs one, its server-only key.

type MechanicValidator = (c: Collector, config: Json, key: unknown, scoring: ScoringMode, path: string) => void

function requireServerKey(c: Collector, key: unknown, scoring: ScoringMode, path: string): key is Json {
  if (scoring === 'server') {
    if (!isRecord(key)) {
      c.add(`${path}.scoring.key`, 'is required when scoring.mode is "server"')
      return false
    }
    return true
  }
  if (key !== undefined) c.add(`${path}.scoring.key`, 'is allowed only when scoring.mode is "server"')
  return false
}

const MECHANIC_VALIDATORS: Record<ActivityMechanic, MechanicValidator> = {
  choice(c, config, key, scoring, path) {
    checkKnownKeys(c, config, ['prompt', 'options'], `${path}.config`)
    checkLocalized(c, config.prompt, `${path}.config.prompt`)
    const options = Array.isArray(config.options) ? config.options : []
    if (options.length < 2 || options.length > 6) c.add(`${path}.config.options`, 'must have 2–6 options')
    options.forEach((o, i) => {
      if (!isRecord(o)) return c.add(`${path}.config.options[${i}]`, 'must be an object')
      checkKnownKeys(c, o, ['id', 'text'], `${path}.config.options[${i}]`)
      checkLocalized(c, o.text, `${path}.config.options[${i}].text`)
    })
    const optionIds = checkIdList(c, options, `${path}.config.options`)
    if (requireServerKey(c, key, scoring, path)) {
      checkKnownKeys(c, key, ['correctOptionId', 'explanation'], `${path}.scoring.key`)
      if (typeof key.correctOptionId !== 'string' || !optionIds.has(key.correctOptionId)) {
        c.add(`${path}.scoring.key.correctOptionId`, 'must reference an option id')
      }
      checkOptionalLocalized(c, key.explanation, `${path}.scoring.key.explanation`)
    }
  },

  truefalse(c, config, key, scoring, path) {
    checkKnownKeys(c, config, ['prompt', 'statements'], `${path}.config`)
    checkOptionalLocalized(c, config.prompt, `${path}.config.prompt`)
    const statements = Array.isArray(config.statements) ? config.statements : []
    if (statements.length < 1 || statements.length > 10) c.add(`${path}.config.statements`, 'must have 1–10 statements')
    statements.forEach((s, i) => {
      if (!isRecord(s)) return c.add(`${path}.config.statements[${i}]`, 'must be an object')
      checkKnownKeys(c, s, ['id', 'text'], `${path}.config.statements[${i}]`)
      checkLocalized(c, s.text, `${path}.config.statements[${i}].text`)
    })
    const ids = checkIdList(c, statements, `${path}.config.statements`)
    if (requireServerKey(c, key, scoring, path)) {
      checkKnownKeys(c, key, ['answers'], `${path}.scoring.key`)
      const answers = isRecord(key.answers) ? key.answers : {}
      for (const id of ids) {
        if (typeof answers[id] !== 'boolean') c.add(`${path}.scoring.key.answers.${id}`, 'must be a boolean')
      }
      for (const id of Object.keys(answers)) {
        if (!ids.has(id)) c.add(`${path}.scoring.key.answers.${id}`, 'references an unknown statement')
      }
    }
  },

  classify(c, config, key, scoring, path) {
    checkKnownKeys(c, config, ['prompt', 'categories', 'items'], `${path}.config`)
    checkLocalized(c, config.prompt, `${path}.config.prompt`)
    const categories = Array.isArray(config.categories) ? config.categories : []
    const items = Array.isArray(config.items) ? config.items : []
    if (categories.length < 2 || categories.length > 4) c.add(`${path}.config.categories`, 'must have 2–4 categories')
    if (items.length < 2 || items.length > MAX_LIST) c.add(`${path}.config.items`, `must have 2–${MAX_LIST} items`)
    categories.forEach((cat, i) => {
      if (!isRecord(cat)) return c.add(`${path}.config.categories[${i}]`, 'must be an object')
      checkKnownKeys(c, cat, ['id', 'label'], `${path}.config.categories[${i}]`)
      checkLocalized(c, cat.label, `${path}.config.categories[${i}].label`, MAX_SHORT)
    })
    items.forEach((item, i) => {
      if (!isRecord(item)) return c.add(`${path}.config.items[${i}]`, 'must be an object')
      checkKnownKeys(c, item, ['id', 'label'], `${path}.config.items[${i}]`)
      checkLocalized(c, item.label, `${path}.config.items[${i}].label`, MAX_SHORT)
    })
    const categoryIds = checkIdList(c, categories, `${path}.config.categories`)
    const itemIds = checkIdList(c, items, `${path}.config.items`)
    if (requireServerKey(c, key, scoring, path)) {
      checkKnownKeys(c, key, ['placement'], `${path}.scoring.key`)
      const placement = isRecord(key.placement) ? key.placement : {}
      for (const id of itemIds) {
        const target = placement[id]
        if (typeof target !== 'string' || !categoryIds.has(target)) {
          c.add(`${path}.scoring.key.placement.${id}`, 'must reference a category id')
        }
      }
      for (const id of Object.keys(placement)) {
        if (!itemIds.has(id)) c.add(`${path}.scoring.key.placement.${id}`, 'references an unknown item')
      }
    }
  },

  external(c, config, key, scoring, path) {
    checkKnownKeys(c, config, ['toolKey', 'instructions', 'estimatedMinutesLabel'], `${path}.config`)
    checkString(c, config.toolKey, `${path}.config.toolKey`, MAX_ID, LOCAL_ID_RE)
    checkOptionalLocalized(c, config.instructions, `${path}.config.instructions`)
    checkOptionalLocalized(c, config.estimatedMinutesLabel, `${path}.config.estimatedMinutesLabel`, MAX_SHORT)
    // Launch-only tools report nothing back, so they can never score.
    if (scoring !== 'none') c.add(`${path}.scoring.mode`, 'must be "none" for launch-only external activities')
    requireServerKey(c, key, scoring, path)
  },

  game(c, config, key, scoring, path) {
    checkKnownKeys(c, config, ['gameKey', 'level', 'instructions'], `${path}.config`)
    checkString(c, config.gameKey, `${path}.config.gameKey`, MAX_ID, LOCAL_ID_RE)
    checkString(c, config.level, `${path}.config.level`, MAX_ID, LOCAL_ID_RE)
    checkOptionalLocalized(c, config.instructions, `${path}.config.instructions`)
    // The browser computes a game's result; the server can only bound it.
    if (scoring !== 'client-unverified') c.add(`${path}.scoring.mode`, 'must be "client-unverified" for games')
    requireServerKey(c, key, scoring, path)
  },
}

/** Item-level evidence needs per-item server scoring: classify items or truefalse statements. */
function checkOutcomeItems(c: Collector, items: unknown, mechanic: unknown, config: unknown, mode: ScoringMode | null, path: string): void {
  const list = mechanic === 'classify' ? 'items' : mechanic === 'truefalse' ? 'statements' : null
  if (!list || mode !== 'server') {
    c.add(path, 'only server-scored classify or truefalse activities can split evidence by item')
    return
  }
  if (!Array.isArray(items)) {
    c.add(path, 'must be an array')
    return
  }
  const known = new Set(
    (isRecord(config) && Array.isArray(config[list]) ? config[list] as unknown[] : [])
      .map(entry => (isRecord(entry) ? entry.id : undefined))
      .filter((id): id is string => typeof id === 'string'),
  )
  const seen = new Set<string>()
  items.forEach((id, i) => {
    if (typeof id !== 'string' || !known.has(id)) c.add(`${path}[${i}]`, `must reference a ${list === 'items' ? 'config item' : 'config statement'}`)
    else if (seen.has(id)) c.add(`${path}[${i}]`, 'must not repeat')
    else seen.add(id)
  })
  if (items.length < MIN_ITEMS_PER_OUTCOME) c.add(path, `must name at least ${MIN_ITEMS_PER_OUTCOME} items`)
}

function checkActivity(c: Collector, value: unknown, path: string, ctx: LessonContext): void {
  if (!isRecord(value)) {
    c.add(path, 'must be an object')
    return
  }
  checkKnownKeys(c, value, ['instanceId', 'mechanic', 'telemetry', 'config', 'scoring', 'outcomes', 'attempts'], path)

  if (checkString(c, value.instanceId, `${path}.instanceId`, MAX_ID, LOCAL_ID_RE)) {
    if (ctx.instanceIds.has(value.instanceId)) c.add(`${path}.instanceId`, 'must be unique within the lesson')
    ctx.instanceIds.add(value.instanceId)
  }

  const mechanicOk = checkEnum(c, value.mechanic, ACTIVITY_MECHANICS, `${path}.mechanic`)
  const telemetryOk = checkEnum(c, value.telemetry, ACTIVITY_TELEMETRY, `${path}.telemetry`)

  let mode: ScoringMode | null = null
  let key: unknown
  if (!isRecord(value.scoring)) {
    c.add(`${path}.scoring`, 'must be an object')
  } else {
    checkKnownKeys(c, value.scoring, ['mode', 'key'], `${path}.scoring`)
    if (checkEnum(c, value.scoring.mode, SCORING_MODES, `${path}.scoring.mode`)) mode = value.scoring.mode
    key = value.scoring.key
  }

  if (!isRecord(value.config)) c.add(`${path}.config`, 'must be an object')
  else if (mechanicOk && mode) MECHANIC_VALIDATORS[value.mechanic as ActivityMechanic](c, value.config, key, mode, path)

  const outcomes = value.outcomes
  if (outcomes !== undefined) {
    if (!Array.isArray(outcomes)) c.add(`${path}.outcomes`, 'must be an array')
    else outcomes.forEach((o, i) => {
      const p = `${path}.outcomes[${i}]`
      if (!isRecord(o)) return c.add(p, 'must be an object')
      checkKnownKeys(c, o, ['outcomeId', 'evidenceRole', 'items'], p)
      if (typeof o.outcomeId !== 'string' || !ctx.outcomeIds.has(o.outcomeId)) {
        c.add(`${p}.outcomeId`, 'must reference a lesson learningOutcomes entry')
      }
      checkEnum(c, o.evidenceRole, EVIDENCE_ROLES, `${p}.evidenceRole`)
      if (o.items !== undefined) checkOutcomeItems(c, o.items, value.mechanic, value.config, mode, `${p}.items`)
    })
  }

  // Evidence is persistent and traceable to an outcome: it needs a scorer and
  // an outcome link. Client-reported results are never primary evidence.
  if (telemetryOk && value.telemetry === 'evidence') {
    if (mode === 'none') c.add(`${path}.scoring.mode`, 'evidence activities must be scored')
    if (!Array.isArray(outcomes) || outcomes.length === 0) c.add(`${path}.outcomes`, 'evidence activities must link an outcome')
    if (mode === 'client-unverified' && Array.isArray(outcomes)
      && outcomes.some(o => isRecord(o) && o.evidenceRole === 'primary')) {
      c.add(`${path}.outcomes`, 'client-unverified results can only be supporting evidence')
    }
  }

  if (value.attempts !== undefined) {
    if (!isRecord(value.attempts)) c.add(`${path}.attempts`, 'must be an object')
    else {
      checkKnownKeys(c, value.attempts, ['max'], `${path}.attempts`)
      if (value.attempts.max !== undefined) checkInt(c, value.attempts.max, `${path}.attempts.max`, 1, 10)
    }
  }
}

// ── Block validators ─────────────────────────────────────────────────────────

const BASE_KEYS = ['id', 'type', 'audience', 'views', 'modality', 'estimatedMinutes', 'runtime', 'outcomeIds', 'presentation', 'content'] as const

/** Structured table: 2–10 header cells and 1–MAX_LIST rows of the same width. */
function checkTableCells(c: Collector, table: Record<string, unknown>, path: string): void {
  const headers = table.headers
  if (!Array.isArray(headers) || headers.length < 2 || headers.length > 10) c.add(`${path}.headers`, 'must have 2–10 columns')
  else headers.forEach((cell, i) => checkLocalized(c, cell, `${path}.headers[${i}]`, MAX_SHORT))
  const rows = table.rows
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > MAX_LIST) c.add(`${path}.rows`, `must have 1–${MAX_LIST} rows`)
  else rows.forEach((row, i) => {
    if (!Array.isArray(row) || !Array.isArray(headers) || row.length !== headers.length) c.add(`${path}.rows[${i}]`, 'must match the column count')
    else row.forEach((cell, j) => checkLocalized(c, cell, `${path}.rows[${i}][${j}]`, MAX_SHORT))
  })
}

function checkCanvasItems(c: Collector, value: unknown, path: string): void {
  if (!Array.isArray(value) || value.length > MAX_LIST) {
    c.add(path, `must be an array of at most ${MAX_LIST} items`)
    return
  }
  value.forEach((item, i) => {
    const at = `${path}[${i}]`
    if (!isRecord(item)) return c.add(at, 'must be an object')
    switch (item.type) {
      case 'paragraph':
      case 'heading':
        checkKnownKeys(c, item, ['type', 'text'], at)
        checkLocalized(c, item.text, `${at}.text`, item.type === 'heading' ? MAX_SHORT : MAX_TEXT)
        break
      case 'list':
        checkKnownKeys(c, item, ['type', 'ordered', 'items'], at)
        if (item.ordered !== undefined) checkBool(c, item.ordered, `${at}.ordered`)
        checkLocalizedList(c, item.items, `${at}.items`, 1)
        break
      case 'table':
        checkKnownKeys(c, item, ['type', 'headers', 'rows'], at)
        checkTableCells(c, item, at)
        break
      case 'image':
        checkKnownKeys(c, item, ['type', 'src', 'alt'], at)
        checkMediaSrc(c, item.src, `${at}.src`)
        checkLocalized(c, item.alt, `${at}.alt`, MAX_SHORT)
        break
      case 'video':
        checkKnownKeys(c, item, ['type', 'videoId'], at)
        checkString(c, item.videoId, `${at}.videoId`, 11, /^[A-Za-z0-9_-]{11}$/)
        break
      case 'link':
        checkKnownKeys(c, item, ['type', 'url', 'label'], at)
        checkMediaSrc(c, item.url, `${at}.url`)
        checkLocalized(c, item.label, `${at}.label`, MAX_SHORT)
        break
      default:
        c.add(`${at}.type`, 'unknown content item')
    }
  })
}

function checkBlockContent(c: Collector, block: Json, type: LessonBlockType, path: string, ctx: LessonContext): void {
  const p = `${path}.content`
  if (!isRecord(block.content)) {
    c.add(p, 'must be an object')
    return
  }
  const content = block.content
  const known = (keys: string[]) => checkKnownKeys(c, content, keys, p)
  const heading = () => checkOptionalLocalized(c, content.heading, `${p}.heading`, MAX_SHORT)

  switch (type) {
    case 'hero':
      known(['kicker', 'title', 'subtitle'])
      checkOptionalLocalized(c, content.kicker, `${p}.kicker`, MAX_SHORT)
      checkLocalized(c, content.title, `${p}.title`, MAX_SHORT)
      checkOptionalLocalized(c, content.subtitle, `${p}.subtitle`, MAX_SHORT)
      break
    case 'essential-question':
      known(['question'])
      checkLocalized(c, content.question, `${p}.question`)
      break
    case 'objectives':
    case 'activity':
      known(['heading'])
      heading()
      break
    case 'explanation':
      known(['heading', 'paragraphs', 'callout'])
      heading()
      checkLocalizedList(c, content.paragraphs, `${p}.paragraphs`, 1)
      if (content.callout !== undefined) {
        if (!isRecord(content.callout)) c.add(`${p}.callout`, 'must be an object')
        else {
          checkKnownKeys(c, content.callout, ['title', 'text'], `${p}.callout`)
          checkOptionalLocalized(c, content.callout.title, `${p}.callout.title`, MAX_SHORT)
          checkLocalized(c, content.callout.text, `${p}.callout.text`)
        }
      }
      break
    case 'visual':
      known(['heading', 'assetId'])
      heading()
      if (typeof content.assetId !== 'string' || !ctx.assetIds.has(content.assetId)) {
        c.add(`${p}.assetId`, 'must reference a lesson asset')
      }
      break
    case 'discussion':
      known(['heading', 'prompt', 'expectedResponse'])
      heading()
      checkLocalized(c, content.prompt, `${p}.prompt`)
      checkOptionalLocalized(c, content.expectedResponse, `${p}.expectedResponse`)
      break
    case 'practice': {
      known(['heading', 'intro', 'table', 'steps'])
      heading()
      checkOptionalLocalized(c, content.intro, `${p}.intro`)
      if (content.table !== undefined) {
        const table = content.table
        if (!isRecord(table)) c.add(`${p}.table`, 'must be an object')
        else {
          checkKnownKeys(c, table, ['headers', 'rows'], `${p}.table`)
          checkTableCells(c, table, `${p}.table`)
        }
      }
      const steps = content.steps
      if (!Array.isArray(steps) || steps.length < 1 || steps.length > MAX_LIST) {
        c.add(`${p}.steps`, `must have 1–${MAX_LIST} steps`)
        break
      }
      steps.forEach((step, i) => {
        if (!isRecord(step)) return c.add(`${p}.steps[${i}]`, 'must be an object')
        checkKnownKeys(c, step, ['title', 'items'], `${p}.steps[${i}]`)
        checkOptionalLocalized(c, step.title, `${p}.steps[${i}].title`, MAX_SHORT)
        checkLocalizedList(c, step.items, `${p}.steps[${i}].items`, 1)
      })
      break
    }
    case 'canvas':
      known(['heading', 'teacher', 'board', 'student'])
      checkLocalized(c, content.heading, `${p}.heading`, MAX_SHORT)
      checkCanvasItems(c, content.teacher, `${p}.teacher`)
      checkCanvasItems(c, content.board, `${p}.board`)
      checkCanvasItems(c, content.student, `${p}.student`)
      if (Array.isArray(content.teacher) && block.views && isRecord(block.views) && block.views.document === true && content.teacher.length === 0) c.add(`${p}.teacher`, 'visible teacher view needs content')
      if (Array.isArray(content.board) && block.views && isRecord(block.views) && block.views.presentation === true && content.board.length === 0) c.add(`${p}.board`, 'visible presentation needs content')
      if (Array.isArray(content.student) && block.views && isRecord(block.views) && block.views.remote === true && content.student.length === 0) c.add(`${p}.student`, 'visible student view needs content')
      break
    case 'support':
      known(['heading', 'items'])
      heading()
      checkLocalizedList(c, content.items, `${p}.items`, 1)
      break
    case 'extension':
      known(['heading', 'prompt', 'example'])
      heading()
      checkLocalized(c, content.prompt, `${p}.prompt`)
      checkOptionalLocalized(c, content.example, `${p}.example`)
      break
    case 'reflection':
      known(['heading', 'prompt'])
      heading()
      checkLocalized(c, content.prompt, `${p}.prompt`)
      break
    case 'success-criteria':
      known(['heading', 'items', 'evidenceHint'])
      heading()
      checkLocalizedList(c, content.items, `${p}.items`, 1)
      checkOptionalLocalized(c, content.evidenceHint, `${p}.evidenceHint`)
      break
    case 'vocabulary':
      known(['heading', 'sentenceFrames'])
      heading()
      if (content.sentenceFrames !== undefined) checkLocalizedList(c, content.sentenceFrames, `${p}.sentenceFrames`, 1)
      break
    case 'teacher-note':
      known(['text'])
      checkLocalized(c, content.text, `${p}.text`)
      break
    case 'break':
      known(['prompt'])
      checkOptionalLocalized(c, content.prompt, `${p}.prompt`)
      break
  }
}

function checkPresentation(c: Collector, value: unknown, path: string, ctx: LessonContext): void {
  if (!isRecord(value)) {
    c.add(path, 'must be an object')
    return
  }
  checkKnownKeys(c, value, ['layout', 'headline', 'shortText', 'assetIds', 'speakerNotes'], path)
  checkEnum(c, value.layout, PRESENTATION_LAYOUTS, `${path}.layout`)
  checkOptionalLocalized(c, value.headline, `${path}.headline`, MAX_SHORT)
  if (value.shortText !== undefined) checkLocalizedList(c, value.shortText, `${path}.shortText`, 1, 5)
  if (value.assetIds !== undefined) {
    if (!Array.isArray(value.assetIds)) c.add(`${path}.assetIds`, 'must be an array')
    else value.assetIds.forEach((id, i) => {
      if (typeof id !== 'string' || !ctx.assetIds.has(id)) c.add(`${path}.assetIds[${i}]`, 'must reference a lesson asset')
    })
  }
  checkOptionalLocalized(c, value.speakerNotes, `${path}.speakerNotes`)
}

function checkBlock(c: Collector, value: unknown, index: number, ctx: LessonContext, seenIds: Set<string>): void {
  const path = `blocks[${index}]`
  if (!isRecord(value)) {
    c.add(path, 'must be an object')
    return
  }
  const typeOk = checkEnum(c, value.type, LESSON_BLOCK_TYPES, `${path}.type`)
  const type = value.type as LessonBlockType
  checkKnownKeys(c, value, typeOk && type === 'activity' ? [...BASE_KEYS, 'activity'] : BASE_KEYS, path)

  // Stable IDs: `<lessonId>-bNN`, unique. Runtime, reports and evidence key on them.
  if (checkString(c, value.id, `${path}.id`, MAX_ID + 8)) {
    const suffix = value.id.startsWith(`${ctx.lessonId}-b`) ? value.id.slice(ctx.lessonId.length + 2) : ''
    if (!/^\d{2,3}$/.test(suffix)) {
      c.add(`${path}.id`, `must look like "${ctx.lessonId}-b01"`)
    }
    if (seenIds.has(value.id)) c.add(`${path}.id`, 'must be unique')
    seenIds.add(value.id)
  }

  let student = false
  if (!isRecord(value.audience)) c.add(`${path}.audience`, 'must be an object')
  else {
    checkKnownKeys(c, value.audience, ['teacher', 'student'], `${path}.audience`)
    checkBool(c, value.audience.teacher, `${path}.audience.teacher`)
    checkBool(c, value.audience.student, `${path}.audience.student`)
    student = value.audience.student === true
  }

  let views: Json = {}
  if (!isRecord(value.views)) c.add(`${path}.views`, 'must be an object')
  else {
    views = value.views
    checkKnownKeys(c, views, ['document', 'presentation', 'remote'], `${path}.views`)
    checkBool(c, views.document, `${path}.views.document`)
    checkBool(c, views.presentation, `${path}.views.presentation`)
    checkBool(c, views.remote, `${path}.views.remote`)
  }

  checkEnum(c, value.modality, BLOCK_MODALITIES, `${path}.modality`)
  if (value.estimatedMinutes !== undefined) checkInt(c, value.estimatedMinutes, `${path}.estimatedMinutes`, 1, MAX_DURATION_MIN)
  if (value.runtime !== undefined) {
    if (!isRecord(value.runtime)) c.add(`${path}.runtime`, 'must be an object')
    else {
      checkKnownKeys(c, value.runtime, ['step'], `${path}.runtime`)
      checkBool(c, value.runtime.step, `${path}.runtime.step`)
    }
  }
  if (value.outcomeIds !== undefined) {
    if (!Array.isArray(value.outcomeIds)) c.add(`${path}.outcomeIds`, 'must be an array')
    else value.outcomeIds.forEach((id, i) => {
      if (typeof id !== 'string' || !ctx.outcomeIds.has(id)) {
        c.add(`${path}.outcomeIds[${i}]`, 'must reference a lesson learningOutcomes entry')
      }
    })
  }

  // Teacher-only material never reaches a surface the class can see.
  if (!student && (views.presentation === true || views.remote === true)) {
    c.add(`${path}.views`, 'teacher-only blocks cannot appear in presentation or remote views')
  }
  if (typeOk && type === 'teacher-note' && student) c.add(`${path}.audience.student`, 'teacher notes are teacher-only')
  // Practical work is shown with the current step; only activities are dispatched.
  if (views.remote === true && type !== 'activity' && type !== 'practice' && type !== 'canvas') c.add(`${path}.views.remote`, 'only activity, practice and canvas blocks can appear on devices')
  if (views.remote === true && (type === 'practice' || type === 'canvas') && (!isRecord(value.runtime) || value.runtime.step !== true)) c.add(`${path}.runtime.step`, 'device-visible content must be a lesson step')

  // The board shows an authored projection, never an on-the-fly summary.
  if (views.presentation === true) {
    if (value.presentation === undefined) c.add(`${path}.presentation`, 'is required when views.presentation is true')
    else checkPresentation(c, value.presentation, `${path}.presentation`, ctx)
  } else if (value.presentation !== undefined) {
    c.add(`${path}.presentation`, 'is allowed only when views.presentation is true')
  }

  if (!typeOk) return
  checkBlockContent(c, value, type, path, ctx)
  if (type === 'activity') checkActivity(c, value.activity, `${path}.activity`, ctx)
}

/**
 * Validates an untrusted lesson definition. Fail-closed: unknown fields,
 * dangling references and HTML are errors, never silently dropped.
 */
export function validateLessonDefinition(input: unknown): LessonValidationResult {
  const c = new Collector()
  if (!isRecord(input)) return { ok: false, errors: [{ path: '', message: 'must be an object' }] }

  checkKnownKeys(c, input, [
    'schemaVersion', 'id', 'slug', 'subjectPackId', 'subject', 'grade', 'moduleId', 'unitId',
    'lessonNumber', 'title', 'shortTitle', 'essentialQuestion', 'durationMin', 'objectives',
    'learningOutcomes', 'vocabulary', 'assets', 'blocks', 'metadata',
  ], '')

  if (input.schemaVersion !== CURRICULUM_LESSON_SCHEMA_VERSION) {
    c.add('schemaVersion', `must be ${CURRICULUM_LESSON_SCHEMA_VERSION}`)
  }
  const idOk = checkString(c, input.id, 'id', MAX_ID, SLUG_RE)
  checkString(c, input.slug, 'slug', MAX_ID, SLUG_RE)
  checkString(c, input.subjectPackId, 'subjectPackId', MAX_ID, SLUG_RE)
  checkString(c, input.subject, 'subject', MAX_ID, SLUG_RE)
  checkInt(c, input.grade, 'grade', 0, MAX_GRADE)
  if (input.moduleId !== undefined) checkString(c, input.moduleId, 'moduleId', MAX_ID, SLUG_RE)
  if (input.unitId !== undefined) checkString(c, input.unitId, 'unitId', MAX_ID, SLUG_RE)
  if (input.lessonNumber !== undefined) checkInt(c, input.lessonNumber, 'lessonNumber', 1, 999)
  checkLocalized(c, input.title, 'title', MAX_SHORT)
  checkOptionalLocalized(c, input.shortTitle, 'shortTitle', MAX_SHORT)
  checkOptionalLocalized(c, input.essentialQuestion, 'essentialQuestion')
  checkInt(c, input.durationMin, 'durationMin', 1, MAX_DURATION_MIN)

  if (!Array.isArray(input.objectives) || input.objectives.length < 1 || input.objectives.length > MAX_LIST) {
    c.add('objectives', `must have 1–${MAX_LIST} items`)
  } else {
    input.objectives.forEach((o, i) => {
      if (!isRecord(o)) return c.add(`objectives[${i}]`, 'must be an object')
      checkKnownKeys(c, o, ['id', 'text'], `objectives[${i}]`)
      checkLocalized(c, o.text, `objectives[${i}].text`)
    })
    checkIdList(c, input.objectives, 'objectives')
  }

  let outcomeIds = new Set<string>()
  if (!Array.isArray(input.learningOutcomes)) c.add('learningOutcomes', 'must be an array')
  else {
    input.learningOutcomes.forEach((l, i) => {
      if (!isRecord(l)) return c.add(`learningOutcomes[${i}]`, 'must be an object')
      checkKnownKeys(c, l, ['outcomeId', 'role'], `learningOutcomes[${i}]`)
      checkEnum(c, l.role, LESSON_OUTCOME_ROLES, `learningOutcomes[${i}].role`)
    })
    outcomeIds = checkIdList(c, input.learningOutcomes, 'learningOutcomes', 'outcomeId')
  }

  if (input.vocabulary !== undefined) {
    if (!Array.isArray(input.vocabulary) || input.vocabulary.length > 40) c.add('vocabulary', 'must be an array of at most 40 items')
    else input.vocabulary.forEach((v, i) => {
      if (!isRecord(v)) return c.add(`vocabulary[${i}]`, 'must be an object')
      checkKnownKeys(c, v, ['term', 'definition'], `vocabulary[${i}]`)
      checkLocalized(c, v.term, `vocabulary[${i}].term`, MAX_SHORT)
      checkOptionalLocalized(c, v.definition, `vocabulary[${i}].definition`)
    })
  }

  let assetIds = new Set<string>()
  if (input.assets !== undefined) {
    if (!Array.isArray(input.assets) || input.assets.length > MAX_LIST) c.add('assets', `must be an array of at most ${MAX_LIST} items`)
    else {
      input.assets.forEach((a, i) => {
        if (!isRecord(a)) return c.add(`assets[${i}]`, 'must be an object')
        checkKnownKeys(c, a, ['id', 'kind', 'src', 'alt', 'caption'], `assets[${i}]`)
        checkEnum(c, a.kind, LESSON_ASSET_KINDS, `assets[${i}].kind`)
        checkMediaSrc(c, a.src, `assets[${i}].src`)
        checkLocalized(c, a.alt, `assets[${i}].alt`)
        checkOptionalLocalized(c, a.caption, `assets[${i}].caption`)
      })
      assetIds = checkIdList(c, input.assets, 'assets')
    }
  }

  if (!isRecord(input.metadata)) c.add('metadata', 'must be an object')
  else {
    const m = input.metadata
    checkKnownKeys(c, m, ['source', 'sourceRef', 'contentVersion', 'language'], 'metadata')
    checkEnum(c, m.source, LESSON_SOURCES, 'metadata.source')
    if (m.sourceRef !== undefined) checkString(c, m.sourceRef, 'metadata.sourceRef', MAX_SHORT)
    checkInt(c, m.contentVersion, 'metadata.contentVersion', 1, 1_000_000)
    checkString(c, m.language, 'metadata.language', 8, LANGUAGE_RE)
  }

  if (!Array.isArray(input.blocks) || input.blocks.length < 1 || input.blocks.length > MAX_BLOCKS) {
    c.add('blocks', `must have 1–${MAX_BLOCKS} blocks`)
  } else if (idOk) {
    const ctx: LessonContext = { lessonId: input.id as string, assetIds, outcomeIds, instanceIds: new Set() }
    const seenIds = new Set<string>()
    input.blocks.forEach((block, i) => checkBlock(c, block, i, ctx, seenIds))
    if (!input.blocks.some(b => isRecord(b) && isRecord(b.runtime) && b.runtime.step === true)) {
      c.add('blocks', 'at least one block must be a runtime step')
    }
  }

  if (c.errors.length > 0) return { ok: false, errors: c.errors }
  return { ok: true, lesson: input as unknown as LessonDefinitionV1 }
}

/**
 * Cross-checks a structurally valid lesson against its subject pack. Kept
 * separate so core validation never needs subject knowledge.
 */
export function validateLessonAgainstPack(lesson: LessonDefinitionV1, pack: SubjectPack): LessonValidationIssue[] {
  const c = new Collector()
  if (lesson.subjectPackId !== pack.id) c.add('subjectPackId', `must be "${pack.id}"`)
  if (lesson.subject !== pack.subject) c.add('subject', `must be "${pack.subject}"`)
  if (lesson.grade < pack.gradeRange.min || lesson.grade > pack.gradeRange.max) {
    c.add('grade', `must be within ${pack.gradeRange.min}–${pack.gradeRange.max}`)
  }
  lesson.learningOutcomes.forEach((link, i) => {
    if (!Object.prototype.hasOwnProperty.call(pack.outcomes, link.outcomeId)) {
      c.add(`learningOutcomes[${i}].outcomeId`, 'is not in the subject pack outcome registry')
    }
  })
  lesson.blocks.forEach((block, i) => {
    if (block.type !== 'activity') return
    if (block.activity.mechanic === 'external') {
      const toolKey = (block.activity.config as ExternalConfig).toolKey
      const tool = Object.prototype.hasOwnProperty.call(pack.externalTools, toolKey) ? pack.externalTools[toolKey] : undefined
      if (!tool) c.add(`blocks[${i}].activity.config.toolKey`, 'is not in the subject pack allowlist')
    }
    if (block.activity.mechanic === 'game' && !pack.games.includes((block.activity.config as GameConfig).gameKey)) {
      c.add(`blocks[${i}].activity.config.gameKey`, 'is not in the subject pack allowlist')
    }
  })
  return c.errors
}

function checkLearningOutcome(c: Collector, outcome: unknown, p: string): void {
  if (!isRecord(outcome)) {
    c.add(p, 'must be an object')
    return
  }
  const at = (key: string) => (p ? `${p}.${key}` : key)
  checkKnownKeys(c, outcome, ['code', 'title', 'source', 'sourceRef', 'gradeBand', 'mappings'], p)
  checkString(c, outcome.code, at('code'), MAX_ID)
  checkLocalized(c, outcome.title, at('title'), MAX_SHORT)
  checkEnum(c, outcome.source, OUTCOME_SOURCES, at('source'))
  if (outcome.sourceRef !== undefined) checkString(c, outcome.sourceRef, at('sourceRef'), MAX_SHORT)
  if (outcome.gradeBand !== undefined) checkString(c, outcome.gradeBand, at('gradeBand'), 16)
  if (!Array.isArray(outcome.mappings)) c.add(at('mappings'), 'must be an array')
  else outcome.mappings.forEach((m, i) => {
    if (!isRecord(m)) return c.add(at(`mappings[${i}]`), 'must be an object')
    checkKnownKeys(c, m, ['framework', 'ref', 'strength'], at(`mappings[${i}]`))
    checkString(c, m.framework, at(`mappings[${i}].framework`), MAX_ID)
    checkString(c, m.ref, at(`mappings[${i}].ref`), MAX_SHORT)
    if (m.strength !== undefined) checkEnum(c, m.strength, MAPPING_STRENGTHS, at(`mappings[${i}].strength`))
  })
}

/** Validates one learning outcome (the outcome directory uses the same rules as packs). */
export function validateLearningOutcome(input: unknown): LessonValidationIssue[] {
  const c = new Collector()
  checkLearningOutcome(c, input, '')
  return c.errors
}

/** Validates a subject pack's own registry (external tools must be https). */
export function validateSubjectPack(input: unknown): LessonValidationIssue[] {
  const c = new Collector()
  if (!isRecord(input)) return [{ path: '', message: 'must be an object' }]
  checkKnownKeys(c, input, ['id', 'subject', 'title', 'gradeRange', 'curriculumRefs', 'externalTools', 'games', 'outcomes'], '')
  if (!isRecord(input.outcomes)) c.add('outcomes', 'must be an object')
  else for (const [id, outcome] of Object.entries(input.outcomes)) {
    const p = `outcomes.${id}`
    if (!LOCAL_ID_RE.test(id)) c.add(p, 'has an invalid key')
    checkLearningOutcome(c, outcome, p)
  }
  if (!Array.isArray(input.games)) c.add('games', 'must be an array')
  else input.games.forEach((key, i) => { checkString(c, key, `games[${i}]`, MAX_ID, LOCAL_ID_RE) })
  checkString(c, input.id, 'id', MAX_ID, SLUG_RE)
  checkString(c, input.subject, 'subject', MAX_ID, SLUG_RE)
  checkLocalized(c, input.title, 'title', MAX_SHORT)
  if (!isRecord(input.gradeRange)) c.add('gradeRange', 'must be an object')
  else {
    const minOk = checkInt(c, input.gradeRange.min, 'gradeRange.min', 0, MAX_GRADE)
    const maxOk = checkInt(c, input.gradeRange.max, 'gradeRange.max', 0, MAX_GRADE)
    if (minOk && maxOk && (input.gradeRange.min as number) > (input.gradeRange.max as number)) {
      c.add('gradeRange', 'min must not exceed max')
    }
  }
  if (!Array.isArray(input.curriculumRefs)) c.add('curriculumRefs', 'must be an array')
  if (!isRecord(input.externalTools)) c.add('externalTools', 'must be an object')
  else for (const [key, tool] of Object.entries(input.externalTools)) {
    const p = `externalTools.${key}`
    if (!LOCAL_ID_RE.test(key)) c.add(p, 'has an invalid key')
    if (!isRecord(tool)) {
      c.add(p, 'must be an object')
      continue
    }
    checkKnownKeys(c, tool, ['url', 'integration', 'title'], p)
    checkEnum(c, tool.integration, ['launch-only'] as const, `${p}.integration`)
    checkLocalized(c, tool.title, `${p}.title`, MAX_SHORT)
    if (checkString(c, tool.url, `${p}.url`, 500)) {
      let parsed: URL | null = null
      try { parsed = new URL(tool.url as string) } catch { /* reported below */ }
      if (!parsed || parsed.protocol !== 'https:') c.add(`${p}.url`, 'must be an https URL')
    }
  }
  return c.errors
}

/**
 * The only way a definition leaves the backend: a deep copy with every
 * server-only answer key removed. Teacher view and the static export both go
 * through here; answer checking stays on the server (ADR-0001).
 */
export function toDisplaySafeLesson(lesson: LessonDefinitionV1): LessonDefinitionV1 {
  const copy = structuredClone(lesson)
  for (const block of copy.blocks) {
    if (block.type === 'activity') delete block.activity.scoring.key
  }
  return copy
}
