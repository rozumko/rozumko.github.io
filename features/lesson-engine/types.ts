// Display-safe Lesson Engine definition as the teacher API serves it.
// Mirrors backend/src/lib/curriculum-lesson-schema.ts minus server-only answer
// keys (activity.scoring.key never reaches the browser). A guard test keeps the
// shared enums in sync with the backend.

export interface LocalizedText {
  uk: string
  en?: string
}

export type CanvasItem =
  | { type: 'paragraph' | 'heading'; text: LocalizedText }
  | { type: 'list'; ordered?: boolean; items: LocalizedText[] }
  | { type: 'table'; headers: LocalizedText[]; rows: LocalizedText[][] }
  | { type: 'image'; src: string; alt: LocalizedText }
  | { type: 'video'; videoId: string }
  | { type: 'learningapps'; appId: string }
  | { type: 'link'; url: string; label: LocalizedText }

export const LESSON_BLOCK_TYPES = [
  'hero', 'essential-question', 'objectives', 'explanation', 'visual', 'discussion',
  'practice', 'canvas', 'activity', 'support', 'extension', 'reflection', 'success-criteria',
  'vocabulary', 'teacher-note', 'break',
] as const
export type LessonBlockType = (typeof LESSON_BLOCK_TYPES)[number]

export const PRESENTATION_LAYOUTS = ['title', 'visual', 'concept', 'question', 'activity-launcher'] as const
export type PresentationLayout = (typeof PRESENTATION_LAYOUTS)[number]

export const ACTIVITY_MECHANICS = ['choice', 'truefalse', 'classify', 'external', 'game'] as const
export type ActivityMechanic = (typeof ACTIVITY_MECHANICS)[number]

export const ACTIVITY_TELEMETRY = ['practice', 'checkpoint', 'evidence'] as const
export type ActivityTelemetry = (typeof ACTIVITY_TELEMETRY)[number]

export const BLOCK_MODALITIES = ['screen', 'teacher-led', 'discussion', 'paper', 'movement', 'unplugged'] as const
export type BlockModality = (typeof BLOCK_MODALITIES)[number]

export interface LessonAsset {
  id: string
  kind: 'image' | 'diagram' | 'video'
  src: string
  alt: LocalizedText
  caption?: LocalizedText
}

export interface BlockPresentation {
  layout: PresentationLayout
  headline?: LocalizedText
  shortText?: LocalizedText[]
  assetIds?: string[]
  /** Teacher console only; never rendered on the board. */
  speakerNotes?: LocalizedText
}

export interface ActivityView {
  instanceId: string
  mechanic: ActivityMechanic
  telemetry: ActivityTelemetry
  config: Record<string, unknown>
  scoring: { mode: 'none' | 'server' | 'client-unverified' | 'teacher-observed' }
  outcomes?: { outcomeId: string; evidenceRole: 'primary' | 'supporting'; items?: string[] }[]
}

export interface LessonBlock {
  id: string
  type: LessonBlockType
  audience: { teacher: boolean; student: boolean }
  views: { document: boolean; presentation: boolean; remote: boolean }
  modality: BlockModality
  estimatedMinutes?: number
  runtime?: { step: boolean }
  outcomeIds?: string[]
  presentation?: BlockPresentation
  content: Record<string, unknown>
  activity?: ActivityView
}

export interface LessonDefinition {
  schemaVersion: 1
  id: string
  slug: string
  subjectPackId: string
  subject: string
  grade: number
  moduleId?: string
  lessonNumber?: number
  title: LocalizedText
  shortTitle?: LocalizedText
  essentialQuestion?: LocalizedText
  durationMin: number
  objectives: { id: string; text: LocalizedText }[]
  learningOutcomes: { outcomeId: string; role: 'introduced' | 'practised' | 'assessed' }[]
  vocabulary?: { term: LocalizedText; definition?: LocalizedText }[]
  assets?: LessonAsset[]
  blocks: LessonBlock[]
  metadata: { source: string; sourceRef?: string; contentVersion: number; language: string }
}

export interface CurriculumLessonSummary {
  id: string
  subjectPackId: string
  grade: number
  moduleId: string | null
  lessonNumber: number | null
  title: LocalizedText
  durationMin: number
  publishedVersion: number
}

/** Common result envelope for every mechanic (matches the backend). */
export interface ActivityResult {
  activityInstanceId: string
  status: 'submitted'
  correct: number
  total: number
  mistakes: number
  normalizedScore: number
  durationSec?: number
  trust: 'server-verified' | 'client-unverified' | 'teacher-observed'
}

/** Server feedback: correctness of submitted items, never the key itself. */
export interface ActivityFeedback {
  items: { id: string; correct: boolean }[]
  explanation?: LocalizedText
}

export type BoardAnswer =
  | { optionId: string }
  | { answers: Record<string, boolean> }
  | { placement: Record<string, string> }

// ── Lesson runs (stage F) ────────────────────────────────────────────────────

export type LessonRunStatus = 'prepared' | 'active' | 'paused' | 'finished' | 'cancelled'
export type LessonRunAction = 'start' | 'pause' | 'resume' | 'finish' | 'cancel'

export interface LessonRunState {
  id: string
  status: LessonRunStatus
  classId: string
  className: string
  lessonId: string
  lessonPublishedVersion: number
  currentStepIndex: number
  currentBlockId: string
  /** Block ids of the navigable steps, in order. */
  steps: string[]
  /** Six digits while joining is open; null otherwise. */
  joinCode: string | null
  joinCodeExpiresAt: string | null
  createdAt: string
  startedAt: string | null
  pausedAt: string | null
  finishedAt: string | null
  cancelledAt: string | null
}

export interface LessonRunView {
  run: LessonRunState
  /** The frozen lesson the run conducts, display-safe. */
  lesson: LessonDefinition
  students: { id: string; classStudentId: string | null; label: string | null; status: string }[]
}

export interface LessonRunSummary {
  id: string
  status: LessonRunStatus
  classId: string
  className: string
  lessonId: string
  lessonTitle: LocalizedText
  currentStepIndex: number
  stepCount: number
  createdAt: string
}

// ── Web join (stage G1) ──────────────────────────────────────────────────────

export interface LessonRunDevice {
  id: string
  pairingNumber: number
  lessonRunStudentId: string | null
  lastSeenAt: string | null
  createdAt: string
}

export interface LessonDeviceJoin {
  deviceId: string
  deviceToken: string
  pairingNumber: number
  expiresAt: string
}

export interface StudentTask {
  dispatchId: string
  heading: LocalizedText | null
  /** Display-safe: no key ever. External tools carry their allowlisted URL. */
  activity: ActivityView & { external?: { url: string; title: LocalizedText } }
  acceptsAttempts: boolean
  attemptsUsed: number
  attemptsMax: number
  /** Withheld for evidence. */
  lastResult: { correct: number; total: number } | null
}

export interface StudentPracticeMaterial {
  kind: 'practice'
  blockId: string
  heading: LocalizedText | null
  intro: LocalizedText | null
  table: { headers: LocalizedText[]; rows: LocalizedText[][] } | null
  steps: { title?: LocalizedText; items: LocalizedText[] }[]
}

export interface StudentCanvasMaterial {
  kind: 'canvas'
  blockId: string
  heading: LocalizedText
  items: CanvasItem[]
}

export interface LessonAttemptResponse {
  attemptNo: number
  attemptsLeft: number
  /** Null for evidence: the child sees that the answer was received, not its score. */
  result: { correct: number; total: number; normalizedScore: number; trust: string } | null
  feedback: ActivityFeedback | null
}

export interface LessonDeviceState {
  task: StudentTask | null
  material: StudentPracticeMaterial | StudentCanvasMaterial | null
  runStatus: LessonRunStatus
  lessonTitle: LocalizedText
  grade: number
  pairingNumber: number
  mapped: boolean
  /** The child's own roster label, only after the teacher mapped the device. */
  studentLabel: string | null
}

// ── Live class state (stage G2) ──────────────────────────────────────────────

export type LiveCellState = 'not-started' | 'working' | 'completed' | 'needs-attention' | 'offline' | 'skipped'

export interface LiveDispatch {
  id: string
  blockId: string
  activityInstanceId: string
  mechanic: ActivityMechanic | null
  telemetry: ActivityTelemetry | null
  open: boolean
  openedAt: string
  pattern: { optionId: string; optionText: LocalizedText; count: number; of: number } | null
}

export interface LiveSnapshot {
  dispatches: LiveDispatch[]
  students: {
    lessonRunStudentId: string
    label: string
    hasDevice: boolean
    online: boolean
    cells: Record<string, { state: LiveCellState; attempts: number; correct: number | null; total: number | null }>
  }[]
}

// ── Lesson report (stage H) ──────────────────────────────────────────────────

export type OutcomeStatus = 'demonstrated' | 'progressing' | 'needs-support' | 'not-enough-evidence'

export interface ReportEvidence {
  attemptId: string
  activityInstanceId: string | null
  activityTitle: string | null
  attemptNo: number | null
  correct: number | null
  total: number | null
  score: number
  trust: 'server-verified' | 'client-unverified' | 'teacher-observed'
  evidenceRole: 'primary' | 'supporting'
  observedAt: string
}

export interface LessonReport {
  run: {
    status: LessonRunStatus
    className: string
    lessonTitle: LocalizedText
    lessonId: string
    lessonPublishedVersion: number
    startedAt: string | null
    finishedAt: string | null
  }
  rule: { demonstratedAt: number; progressingAt: number }
  outcomes: { id: string; role: string; code: string; title: string }[]
  activities: {
    dispatchId: string
    blockId: string
    activityInstanceId: string
    title: string
    telemetry: ActivityTelemetry | null
    mechanic: ActivityMechanic | null
    answered: number
    of: number
    averageScore: number | null
    pattern: { optionId: string; optionText: LocalizedText; count: number; of: number } | null
  }[]
  students: {
    lessonRunStudentId: string
    label: string
    participated: boolean
    activities: { dispatchId: string; title: string; attempts: number; correct: number | null; total: number | null; trust: string | null }[]
    missing: string[]
    outcomes: { outcomeId: string; status: OutcomeStatus; label: string; basis: string; evidence: ReportEvidence[] }[]
    comment: string
  }[]
}
