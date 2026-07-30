import type {
  QuestionChannel,
  QuestionEditorialStatus,
  QuestionTrack,
  QuestionType,
} from '../db/schema.js'

export type OlympiadMode = 'demo' | 'official'
export type ProgressionBand = 'recognize' | 'apply' | 'reason'
export type ImageRole = 'essential' | 'supportive' | 'decorative'
export type OlympiadIssueSeverity = 'error' | 'warning'

export type OlympiadQuestionForPolicy = {
  id: string
  q: string
  code?: string | null
  type: QuestionType
  options: unknown
  grade: number | null
  difficulty: string | null
  track: QuestionTrack | null
  topic: string | null
  conceptKey: string | null
  progressionBand: ProgressionBand | null
  img: string | null
  imageAlt: string | null
  meta: Record<string, unknown> | null
  isOlympiad: boolean
  channels: QuestionChannel[]
  editorialStatus: QuestionEditorialStatus
}

export type OlympiadContentPolicy = {
  grade: number
  mode: OlympiadMode
  questionCount: number
  timeMinutes: number
  trackTargets: Record<QuestionTrack, number>
  difficultyTargets: Record<'easy' | 'medium' | 'hard', number>
  progressionTargets: Record<ProgressionBand, number>
  effortRange: readonly [number, number]
  essentialImageRange: readonly [number, number]
  minimumMechanics: number
  minimumTopics: number
  maximumTopicRepeats: number
  maximumCompoundQuestions: number
}

export type OlympiadReadinessIssue = {
  code: string
  severity: OlympiadIssueSeverity
  message: string
  questionIds?: string[]
  grade?: number
}

export type OlympiadSetMetrics = {
  questionCount: number
  effortUnits: number
  estimatedSeconds: number | null
  essentialImages: number
  mechanics: QuestionType[]
  topics: number
  maxTopicRepeats: number
  compoundQuestions: number
  track: Record<QuestionTrack | 'unassigned', number>
  difficulty: Record<'easy' | 'medium' | 'hard' | 'unassigned', number>
  progression: Record<ProgressionBand | 'unassigned', number>
}

export type OlympiadSetReadiness = {
  grade: number
  mode: OlympiadMode
  ready: boolean
  policy: OlympiadContentPolicy
  metrics: OlympiadSetMetrics
  issues: OlympiadReadinessIssue[]
}

export type OlympiadEventReadiness = {
  ready: boolean
  event: {
    timeMinutes: number
    questionsCount: number
  }
  grades: OlympiadSetReadiness[]
  issues: OlympiadReadinessIssue[]
}

const DEMO_TRACKS: Record<QuestionTrack, number> = {
  informatics: 5,
  'computational-thinking': 5,
  'ai-basics': 2,
}

const DEMO_DIFFICULTY = { easy: 3, medium: 6, hard: 3 } as const
const OFFICIAL_DIFFICULTY = {
  1: { easy: 3, medium: 9, hard: 4 },
  2: { easy: 4, medium: 11, hard: 5 },
  3: { easy: 4, medium: 14, hard: 6 },
  4: { easy: 4, medium: 14, hard: 6 },
} as const

const DEMO_PROGRESSION = {
  1: { recognize: 4, apply: 6, reason: 2 },
  2: { recognize: 3, apply: 5, reason: 4 },
  3: { recognize: 2, apply: 5, reason: 5 },
  4: { recognize: 2, apply: 4, reason: 6 },
} as const

const OFFICIAL_PROGRESSION = {
  1: { recognize: 5, apply: 7, reason: 4 },
  2: { recognize: 5, apply: 9, reason: 6 },
  3: { recognize: 4, apply: 10, reason: 10 },
  4: { recognize: 4, apply: 9, reason: 11 },
} as const

const OFFICIAL_TRACKS = {
  1: { informatics: 6, 'computational-thinking': 7, 'ai-basics': 3 },
  2: { informatics: 8, 'computational-thinking': 8, 'ai-basics': 4 },
  3: { informatics: 10, 'computational-thinking': 10, 'ai-basics': 4 },
  4: { informatics: 10, 'computational-thinking': 10, 'ai-basics': 4 },
} as const

const POLICY_BY_GRADE = {
  1: {
    demo: { count: 12, effort: [18, 22], images: [3, 5], mechanics: 5, compound: 1 },
    official: { count: 16, effort: [25, 32], images: [4, 6], mechanics: 5, compound: 3 },
  },
  2: {
    demo: { count: 12, effort: [20, 24], images: [3, 5], mechanics: 6, compound: 2 },
    official: { count: 20, effort: [34, 40], images: [5, 8], mechanics: 6, compound: 4 },
  },
  3: {
    demo: { count: 12, effort: [22, 27], images: [4, 5], mechanics: 6, compound: 2 },
    official: { count: 24, effort: [42, 50], images: [7, 10], mechanics: 6, compound: 5 },
  },
  4: {
    demo: { count: 12, effort: [20, 24], images: [4, 5], mechanics: 6, compound: 2 },
    official: { count: 24, effort: [44, 52], images: [8, 10], mechanics: 6, compound: 5 },
  },
} as const

const TRACKS: QuestionTrack[] = ['informatics', 'computational-thinking', 'ai-basics']
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const
const PROGRESSION: ProgressionBand[] = ['recognize', 'apply', 'reason']
const REQUIRED_COVERAGE_BY_GRADE = {
  1: [
    { code: 'algorithms', label: 'алгоритми', keys: ['algorithms', 'algorithms-programming'] },
    { code: 'patterns', label: 'закономірності', keys: ['patterns', 'repetition'] },
    { code: 'classification', label: 'класифікація', keys: ['classification', 'data'] },
    { code: 'digital-safety', label: 'цифрова безпека', keys: ['digital-safety', 'networks-internet'] },
    { code: 'ai-judgment', label: 'розпізнавання ШІ та роль людини', keys: ['what-is-ai', 'human-vs-ai'] },
  ],
  2: [
    { code: 'algorithms', label: 'алгоритми й налагодження', keys: ['algorithms', 'debugging', 'algorithms-programming'] },
    { code: 'patterns', label: 'закономірності й логіка', keys: ['patterns', 'repetition', 'logic'] },
    { code: 'classification', label: 'класифікація та дані', keys: ['classification', 'data'] },
    { code: 'digital-safety', label: 'безпечний пошук і джерела', keys: ['digital-safety', 'networks-internet', 'information'] },
    { code: 'ai-judgment', label: 'сприйняття та навчання ШІ', keys: ['ai-perception', 'how-ai-learns'] },
  ],
  3: [
    { code: 'algorithms', label: 'алгоритми, повторення й налагодження', keys: ['algorithms', 'repetition', 'debugging', 'algorithms-programming'] },
    { code: 'logic', label: 'логіка й закономірності', keys: ['logic', 'patterns'] },
    { code: 'data', label: 'дані та класифікація', keys: ['data', 'classification'] },
    { code: 'digital-safety', label: 'мережі, джерела й цифрова безпека', keys: ['networks-internet', 'digital-safety', 'information'] },
    { code: 'ai-judgment', label: 'як навчається ШІ та де потрібна людина', keys: ['how-ai-learns', 'human-vs-ai', 'ai-ethics-safety'] },
  ],
  4: [
    { code: 'algorithms', label: 'алгоритми, ефективність і налагодження', keys: ['algorithms', 'efficiency', 'debugging', 'algorithms-programming'] },
    { code: 'decomposition', label: 'декомпозиція та абстракція', keys: ['decomposition', 'abstraction'] },
    { code: 'logic', label: 'логіка, закономірності й повторення', keys: ['logic', 'patterns', 'repetition'] },
    { code: 'digital-safety', label: 'мережі, інформація й цифрова безпека', keys: ['networks-internet', 'information', 'digital-safety'] },
    { code: 'ai-judgment', label: 'можливості, обмеження та безпека ШІ', keys: ['how-ai-learns', 'human-vs-ai', 'ai-ethics-safety'] },
  ],
} as const

export function getOlympiadContentPolicy(grade: number, mode: OlympiadMode): OlympiadContentPolicy {
  if (grade < 1 || grade > 4 || !Number.isInteger(grade)) throw new Error('Unsupported olympiad grade')
  const gradeKey = grade as 1 | 2 | 3 | 4
  const base = POLICY_BY_GRADE[gradeKey][mode]
  return {
    grade,
    mode,
    questionCount: base.count,
    timeMinutes: mode === 'demo' ? 20 : 45,
    trackTargets: mode === 'demo' ? { ...DEMO_TRACKS } : { ...OFFICIAL_TRACKS[gradeKey] },
    difficultyTargets: mode === 'demo' ? { ...DEMO_DIFFICULTY } : { ...OFFICIAL_DIFFICULTY[gradeKey] },
    progressionTargets: mode === 'demo' ? { ...DEMO_PROGRESSION[gradeKey] } : { ...OFFICIAL_PROGRESSION[gradeKey] },
    effortRange: base.effort,
    essentialImageRange: base.images,
    minimumMechanics: base.mechanics,
    minimumTopics: mode === 'demo' ? 6 : 6,
    maximumTopicRepeats: mode === 'demo' ? 2 : 3,
    maximumCompoundQuestions: base.compound,
  }
}

export function readImageRole(question: OlympiadQuestionForPolicy): ImageRole | null {
  const value = question.meta?.imageRole
  return value === 'essential' || value === 'supportive' || value === 'decorative' ? value : null
}

export function readEstimatedSeconds(question: OlympiadQuestionForPolicy): number | null {
  const value = question.meta?.estimatedSeconds
  return Number.isInteger(value) && Number(value) >= 10 && Number(value) <= 600 ? Number(value) : null
}

export function readTemplateId(question: OlympiadQuestionForPolicy): string | null {
  const value = question.meta?.templateId
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function responseElementCount(question: Pick<OlympiadQuestionForPolicy, 'type' | 'options'>): number {
  if (!question.options || typeof question.options !== 'object') return 1
  const options = question.options as Record<string, unknown>
  if (question.type === 'sort') return Array.isArray(options.items) ? options.items.length : 1
  if (question.type === 'match') return Array.isArray(options.left) ? options.left.length : 1
  return 1
}

export function normalizedOlympiadText(value: string): string {
  return value
    .toLocaleLowerCase('uk-UA')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function normalizedOlympiadCode(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .trim()
}

function wordCount(value: string): number {
  const normalized = normalizedOlympiadText(value)
  return normalized ? normalized.split(/\s+/u).length : 0
}

function canonicalizePublicStimulus(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizePublicStimulus)
  if (!value || typeof value !== 'object') return value

  const secretKeys = new Set(['answer', 'correct', 'correctAnswers', 'correctOrder', 'pairs', 'explanation'])
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !secretKeys.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalizePublicStimulus(item)]),
  )
}

export function olympiadQuestionFingerprint(question: {
  id: string
  q?: string | null
  code?: string | null
  type: QuestionType
  options?: unknown
  img?: string | null
}): string {
  if (!question.q) return `id:${question.id}`
  return JSON.stringify({
    q: normalizedOlympiadText(question.q),
    code: normalizedOlympiadCode(question.code ?? ''),
    type: question.type,
    options: canonicalizePublicStimulus(question.options),
    img: question.img?.trim() ?? '',
  })
}

export function olympiadQuestionVariantGroupKey(question: {
  id: string
  q?: string | null
  meta?: Record<string, unknown> | null
}): string {
  const templateId = typeof question.meta?.templateId === 'string'
    ? question.meta.templateId.trim()
    : ''
  if (templateId) return `template:${templateId}`
  if (question.q) return `stem:${normalizedOlympiadText(question.q)}`
  return `id:${question.id}`
}

function stringOptions(question: OlympiadQuestionForPolicy): string[] {
  if (Array.isArray(question.options)) return question.options.filter((value): value is string => typeof value === 'string')
  if (!question.options || typeof question.options !== 'object') return []
  const options = question.options as Record<string, unknown>
  return ['items', 'given', 'choices', 'left', 'right']
    .flatMap(key => Array.isArray(options[key]) ? options[key] : [])
    .filter((value): value is string => typeof value === 'string')
}

function emptyMetrics(): OlympiadSetMetrics {
  return {
    questionCount: 0,
    effortUnits: 0,
    estimatedSeconds: null,
    essentialImages: 0,
    mechanics: [],
    topics: 0,
    maxTopicRepeats: 0,
    compoundQuestions: 0,
    track: { informatics: 0, 'computational-thinking': 0, 'ai-basics': 0, unassigned: 0 },
    difficulty: { easy: 0, medium: 0, hard: 0, unassigned: 0 },
    progression: { recognize: 0, apply: 0, reason: 0, unassigned: 0 },
  }
}

function distributionIssues<T extends string>(
  grade: number,
  label: string,
  actual: Record<T | 'unassigned', number>,
  expected: Record<T, number>,
): OlympiadReadinessIssue[] {
  const issues: OlympiadReadinessIssue[] = []
  for (const key of Object.keys(expected) as T[]) {
    if (actual[key] !== expected[key]) {
      issues.push({
        code: `${label}-distribution`,
        severity: 'warning',
        grade,
        message: `${label}: «${key}» — ${actual[key]} замість ${expected[key]}.`,
      })
    }
  }
  if (actual.unassigned > 0) {
    issues.push({
      code: `${label}-unassigned`,
      severity: 'error',
      grade,
      message: `${actual.unassigned} пит. не мають обов’язкового поля «${label}».`,
    })
  }
  return issues
}

export function inspectOlympiadQuestionContent(
  question: OlympiadQuestionForPolicy,
): OlympiadReadinessIssue[] {
  const issues: OlympiadReadinessIssue[] = []
  const questionIds = [question.id]
  const words = wordCount(question.q)
  const responseElements = responseElementCount(question)
  const options = stringOptions(question)

  if (words > 40) {
    issues.push({ code: 'stem-too-long', severity: 'error', message: `Умова має ${words} слів; максимум — 40.`, questionIds })
  } else if (words > 25) {
    issues.push({ code: 'stem-review-length', severity: 'warning', message: `Умова має ${words} слів; потрібна редакторська перевірка.`, questionIds })
  }
  if (options.length > 0 && Math.max(...options.map(value => value.length)) > 90) {
    issues.push({ code: 'option-too-long', severity: 'error', message: 'Один із варіантів довший за 90 символів і створює ризик прокрутки.', questionIds })
  }
  const selectableOptions = question.type === 'multi_select' && question.options && typeof question.options === 'object'
    ? (question.options as Record<string, unknown>).choices
    : question.options
  if (
    (question.type === 'choice' || question.type === 'truefalse' || question.type === 'multi_select')
    && Array.isArray(selectableOptions)
    && selectableOptions.length > 6
  ) {
    issues.push({ code: 'too-many-options', severity: 'error', message: 'На одному екрані дозволено не більше 6 варіантів.', questionIds })
  }
  if ((question.type === 'sort' || question.type === 'match') && responseElements > 6) {
    issues.push({ code: 'too-many-response-elements', severity: 'error', message: 'На одному екрані дозволено не більше 6 елементів відповіді.', questionIds })
  }
  if (question.img && !question.imageAlt) {
    issues.push({ code: 'missing-image-alt', severity: 'error', message: 'Зображення не має alt-опису.', questionIds })
  }
  if (question.img && !readImageRole(question)) {
    issues.push({ code: 'missing-image-role', severity: 'warning', message: 'Вкажіть роль зображення: essential, supportive або decorative.', questionIds })
  }
  if (!readEstimatedSeconds(question)) {
    issues.push({ code: 'missing-estimated-seconds', severity: 'warning', message: 'Не вказано очікуваний час виконання.', questionIds })
  }
  if (!readTemplateId(question)) {
    issues.push({ code: 'missing-template-id', severity: 'warning', message: 'Не вказано ID шаблону/концепції для контролю варіантів і повторів.', questionIds })
  }
  if (question.type === 'input' && question.grade === 1) {
    issues.push({ code: 'grade-one-input', severity: 'warning', message: 'Для 1 класу введення відповіді потребує окремої перевірки.', questionIds })
  }
  return issues
}

function inspectQuestion(
  question: OlympiadQuestionForPolicy,
  mode: OlympiadMode,
): OlympiadReadinessIssue[] {
  const issues = inspectOlympiadQuestionContent(question)
  const questionIds = [question.id]
  if (question.editorialStatus !== 'published') {
    issues.push({ code: 'unpublished-question', severity: 'error', message: 'Питання не опубліковане.', questionIds })
  }
  if (mode === 'official' && (!question.isOlympiad || question.channels.length > 0)) {
    issues.push({ code: 'official-delivery-boundary', severity: 'error', message: 'Питання основного туру має бути приватним і без тренувальних каналів.', questionIds })
  }
  if (mode === 'demo' && (question.isOlympiad || !question.channels.includes('olympiad_training'))) {
    issues.push({ code: 'demo-delivery-boundary', severity: 'error', message: 'Демо-питання має належати лише до тренувального олімпіадного пулу.', questionIds })
  }
  return issues
}

export function analyzeOlympiadSet(
  grade: number,
  mode: OlympiadMode,
  questions: OlympiadQuestionForPolicy[],
): OlympiadSetReadiness {
  const policy = getOlympiadContentPolicy(grade, mode)
  const issues = questions.flatMap(question => inspectQuestion(question, mode))
  const metrics = emptyMetrics()
  metrics.questionCount = questions.length

  const topicCounts = new Map<string, number>()
  const estimated = questions.map(readEstimatedSeconds)
  if (estimated.every((value): value is number => value !== null)) {
    metrics.estimatedSeconds = estimated.reduce((sum, value) => sum + value, 0)
  }

  for (const question of questions) {
    const effort = responseElementCount(question)
    metrics.effortUnits += effort
    if (effort > 4) metrics.compoundQuestions++
    if (question.img && readImageRole(question) === 'essential') metrics.essentialImages++
    if (!metrics.mechanics.includes(question.type)) metrics.mechanics.push(question.type)
    if (question.topic) topicCounts.set(question.topic, (topicCounts.get(question.topic) ?? 0) + 1)
    if (question.track && TRACKS.includes(question.track)) metrics.track[question.track]++
    else metrics.track.unassigned++
    if (question.difficulty === 'easy' || question.difficulty === 'medium' || question.difficulty === 'hard') {
      metrics.difficulty[question.difficulty]++
    } else metrics.difficulty.unassigned++
    if (question.progressionBand && PROGRESSION.includes(question.progressionBand)) metrics.progression[question.progressionBand]++
    else metrics.progression.unassigned++
  }
  metrics.mechanics.sort()
  metrics.topics = topicCounts.size
  metrics.maxTopicRepeats = Math.max(0, ...topicCounts.values())

  if (questions.length !== policy.questionCount) {
    issues.push({
      code: 'question-count',
      severity: 'error',
      grade,
      message: `${grade} клас: потрібно ${policy.questionCount} пит., вибрано ${questions.length}.`,
    })
  }

  const fingerprints = new Map<string, OlympiadQuestionForPolicy[]>()
  const variantGroups = new Map<string, OlympiadQuestionForPolicy[]>()
  for (const question of questions) {
    const fingerprint = olympiadQuestionFingerprint(question)
    fingerprints.set(fingerprint, [...(fingerprints.get(fingerprint) ?? []), question])
    const variantKey = olympiadQuestionVariantGroupKey(question)
    variantGroups.set(variantKey, [...(variantGroups.get(variantKey) ?? []), question])
  }
  const duplicateIds = [...new Set(
    [...fingerprints.values()].filter(group => group.length > 1).flatMap(group => group.map(question => question.id)),
  )]
  if (duplicateIds.length) {
    issues.push({
      code: 'duplicate-question',
      severity: 'error',
      grade,
      message: 'Набір містить повністю однакові завдання.',
      questionIds: duplicateIds,
    })
  }
  for (const group of variantGroups.values()) {
    if (group.length < 2 || new Set(group.map(olympiadQuestionFingerprint)).size < 2) continue
    issues.push({
      code: 'repeated-question-template',
      severity: 'warning',
      grade,
      message: 'Набір містить кілька варіантів одного шаблону завдання.',
      questionIds: group.map(question => question.id),
    })
  }

  issues.push(...distributionIssues(grade, 'track', metrics.track, policy.trackTargets))
  issues.push(...distributionIssues(grade, 'difficulty', metrics.difficulty, policy.difficultyTargets))
  issues.push(...distributionIssues(grade, 'progression', metrics.progression, policy.progressionTargets))

  if (metrics.mechanics.length < policy.minimumMechanics) {
    issues.push({ code: 'mechanic-gap', severity: 'warning', grade, message: `Механік: ${metrics.mechanics.length}; потрібно щонайменше ${policy.minimumMechanics}.` })
  }
  if (metrics.topics < policy.minimumTopics) {
    issues.push({ code: 'topic-gap', severity: 'warning', grade, message: `Тем: ${metrics.topics}; потрібно щонайменше ${policy.minimumTopics}.` })
  }
  if (metrics.maxTopicRepeats > policy.maximumTopicRepeats) {
    issues.push({ code: 'topic-repeat', severity: 'warning', grade, message: `Одна тема повторюється ${metrics.maxTopicRepeats} разів; максимум — ${policy.maximumTopicRepeats}.` })
  }
  if (metrics.effortUnits < policy.effortRange[0] || metrics.effortUnits > policy.effortRange[1]) {
    issues.push({ code: 'effort-range', severity: 'warning', grade, message: `Навантаження: ${metrics.effortUnits}; ціль — ${policy.effortRange[0]}–${policy.effortRange[1]} одиниць.` })
  }
  if (metrics.essentialImages < policy.essentialImageRange[0] || metrics.essentialImages > policy.essentialImageRange[1]) {
    issues.push({ code: 'essential-image-range', severity: 'warning', grade, message: `Обов’язкових візуальних завдань: ${metrics.essentialImages}; ціль — ${policy.essentialImageRange[0]}–${policy.essentialImageRange[1]}.` })
  }
  if (metrics.compoundQuestions > policy.maximumCompoundQuestions) {
    issues.push({ code: 'compound-question-limit', severity: 'warning', grade, message: `Складених завдань: ${metrics.compoundQuestions}; максимум — ${policy.maximumCompoundQuestions}.` })
  }
  if (metrics.estimatedSeconds !== null && metrics.estimatedSeconds > policy.timeMinutes * 60) {
    issues.push({ code: 'estimated-time', severity: 'error', grade, message: `Оцінка часу ${metrics.estimatedSeconds} с перевищує ліміт ${policy.timeMinutes * 60} с.` })
  }
  const singleChoiceCount = questions.filter(question => question.type === 'choice').length
  if (mode === 'official' && singleChoiceCount > Math.floor(policy.questionCount * 0.4)) {
    issues.push({ code: 'choice-share', severity: 'warning', grade, message: `Одинарний вибір: ${singleChoiceCount}; максимум — 40% набору.` })
  }
  const trueFalseCount = questions.filter(question => question.type === 'truefalse').length
  if (mode === 'official' && trueFalseCount > 1) {
    issues.push({ code: 'truefalse-limit', severity: 'warning', grade, message: `Так/Ні: ${trueFalseCount}; максимум — 1 завдання.` })
  }

  const coverageKeys = new Set(questions.flatMap(question =>
    [question.topic, question.conceptKey].filter((value): value is string => Boolean(value)),
  ))
  for (const group of REQUIRED_COVERAGE_BY_GRADE[grade as 1 | 2 | 3 | 4]) {
    if (!group.keys.some(key => coverageKeys.has(key))) {
      issues.push({
        code: `required-concept-${group.code}`,
        severity: 'warning',
        grade,
        message: `Не покрито обов’язкову групу для ${grade} класу: ${group.label}.`,
      })
    }
  }

  return {
    grade,
    mode,
    ready: !issues.some(issue => issue.severity === 'error'),
    policy,
    metrics,
    issues,
  }
}

export function analyzeOfficialEvent(
  event: { timeMinutes: number; questionsCount: number },
  questions: OlympiadQuestionForPolicy[],
): OlympiadEventReadiness {
  const issues: OlympiadReadinessIssue[] = []
  if (event.timeMinutes !== 45) {
    issues.push({ code: 'event-time', severity: 'error', message: `Основна олімпіада має тривати 45 хв, зараз ${event.timeMinutes}.` })
  }
  if (event.questionsCount !== 24) {
    issues.push({ code: 'event-question-cap', severity: 'error', message: `Ліміт події має бути 24 питання, зараз ${event.questionsCount}.` })
  }
  const grades = [1, 2, 3, 4].map(grade =>
    analyzeOlympiadSet(grade, 'official', questions.filter(question => question.grade === grade)),
  )

  const duplicateAcrossGrades = new Map<string, OlympiadQuestionForPolicy[]>()
  const sharedTemplates = new Map<string, OlympiadQuestionForPolicy[]>()
  for (const question of questions) {
    const fingerprint = olympiadQuestionFingerprint(question)
    duplicateAcrossGrades.set(fingerprint, [...(duplicateAcrossGrades.get(fingerprint) ?? []), question])
    const templateId = readTemplateId(question)
    if (templateId) sharedTemplates.set(templateId, [...(sharedTemplates.get(templateId) ?? []), question])
  }
  for (const group of duplicateAcrossGrades.values()) {
    if (new Set(group.map(question => question.grade)).size < 2) continue
    issues.push({
      code: 'cross-grade-duplicate-stem',
      severity: 'error',
      message: 'Однакове завдання повторюється в наборах різних класів; вертикальна прогресія відсутня.',
      questionIds: group.map(question => question.id),
    })
  }
  for (const [templateId, group] of sharedTemplates) {
    if (new Set(group.map(question => question.grade)).size < 2) continue
    issues.push({
      code: 'cross-grade-template-repeat',
      severity: 'warning',
      message: `Шаблон «${templateId}» використано в різних класах. Перевірте, що спосіб міркування справді ускладнюється.`,
      questionIds: group.map(question => question.id),
    })
  }

  return {
    ready: issues.every(issue => issue.severity !== 'error') && grades.every(result => result.ready),
    event,
    grades,
    issues,
  }
}
