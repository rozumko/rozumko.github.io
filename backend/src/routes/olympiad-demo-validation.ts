import { createHmac, timingSafeEqual } from 'crypto'
import type { QuestionTrack, QuestionType } from '../db/schema.js'
import {
  inspectOlympiadQuestionContent,
  olympiadQuestionFingerprint,
  olympiadQuestionVariantGroupKey,
  type OlympiadQuestionForPolicy,
} from '../lib/olympiad-content-policy.js'

export const OLYMPIAD_DEMO_QUESTION_COUNT = 12
export const OLYMPIAD_DEMO_TIME_MINUTES = 20
export const OLYMPIAD_DEMO_TOKEN_TTL_MS = 2 * 60 * 60 * 1000
export const OLYMPIAD_DEMO_MAX_SEARCH_NODES = 2_000
export const OLYMPIAD_DEMO_MAX_SEARCH_MS = 100

type DemoDifficulty = 'easy' | 'medium' | 'hard'

type DemoSlot = {
  track: QuestionTrack
  difficulty: DemoDifficulty
}

export type DemoQuestionCandidate = {
  id: string
  q?: string | null
  code?: string | null
  type: QuestionType
  options?: unknown
  track: QuestionTrack | null
  difficulty: string | null
  topic: string | null
  progressionBand?: 'recognize' | 'apply' | 'reason' | null
  img?: string | null
  imageAlt?: string | null
  meta?: Record<string, unknown> | null
}

export type DemoCoverageCell = {
  track: QuestionTrack
  difficulty: DemoDifficulty
  requiredSlots: number
  candidates: number
  targetCandidates: number
  missingCandidates: number
  mechanics: QuestionType[]
  topics: number
  images: number
}

export type DemoCoverageIssue = {
  code: 'cannot-compose' | 'invalid-candidate' | 'variant-gap' | 'mechanic-gap' | 'image-gap' | 'topic-duplication'
  message: string
  questionIds?: string[]
}

export type DemoCoverageGrade = {
  grade: number
  ready: boolean
  canCompose: boolean
  cells: DemoCoverageCell[]
  sample: {
    mechanics: QuestionType[]
    images: number
    maxTopicRepeats: number
    progression: Record<'recognize' | 'apply' | 'reason' | 'unassigned', number>
  } | null
  issues: DemoCoverageIssue[]
}

export type DemoTokenPayload = {
  v: 1
  grade: number
  questionIds: string[]
  expiresAt: number
}

const SLOT_BLUEPRINTS: Record<number, DemoSlot[]> = {
  1: [
    { track: 'ai-basics', difficulty: 'easy' },
    { track: 'computational-thinking', difficulty: 'easy' },
    { track: 'informatics', difficulty: 'medium' },
    { track: 'computational-thinking', difficulty: 'medium' },
    { track: 'informatics', difficulty: 'hard' },
    { track: 'ai-basics', difficulty: 'easy' },
    { track: 'informatics', difficulty: 'medium' },
    { track: 'computational-thinking', difficulty: 'medium' },
    { track: 'informatics', difficulty: 'hard' },
    { track: 'computational-thinking', difficulty: 'medium' },
    { track: 'computational-thinking', difficulty: 'medium' },
    { track: 'informatics', difficulty: 'hard' },
  ],
  2: [
    { track: 'informatics', difficulty: 'easy' },
    { track: 'computational-thinking', difficulty: 'easy' },
    { track: 'ai-basics', difficulty: 'easy' },
    { track: 'computational-thinking', difficulty: 'medium' },
    { track: 'informatics', difficulty: 'medium' },
    { track: 'computational-thinking', difficulty: 'medium' },
    { track: 'ai-basics', difficulty: 'medium' },
    { track: 'informatics', difficulty: 'hard' },
    { track: 'computational-thinking', difficulty: 'medium' },
    { track: 'informatics', difficulty: 'hard' },
    { track: 'computational-thinking', difficulty: 'medium' },
    { track: 'informatics', difficulty: 'hard' },
  ],
  3: [
    { track: 'informatics', difficulty: 'easy' },
    { track: 'computational-thinking', difficulty: 'easy' },
    { track: 'ai-basics', difficulty: 'easy' },
    { track: 'informatics', difficulty: 'medium' },
    { track: 'computational-thinking', difficulty: 'medium' },
    { track: 'ai-basics', difficulty: 'medium' },
    { track: 'informatics', difficulty: 'hard' },
    { track: 'computational-thinking', difficulty: 'medium' },
    { track: 'informatics', difficulty: 'medium' },
    { track: 'computational-thinking', difficulty: 'hard' },
    { track: 'computational-thinking', difficulty: 'medium' },
    { track: 'informatics', difficulty: 'hard' },
  ],
  4: [
    { track: 'informatics', difficulty: 'easy' },
    { track: 'computational-thinking', difficulty: 'easy' },
    { track: 'ai-basics', difficulty: 'easy' },
    { track: 'informatics', difficulty: 'medium' },
    { track: 'computational-thinking', difficulty: 'medium' },
    { track: 'ai-basics', difficulty: 'medium' },
    { track: 'informatics', difficulty: 'hard' },
    { track: 'computational-thinking', difficulty: 'medium' },
    { track: 'informatics', difficulty: 'medium' },
    { track: 'computational-thinking', difficulty: 'hard' },
    { track: 'computational-thinking', difficulty: 'medium' },
    { track: 'informatics', difficulty: 'hard' },
  ],
}

function getSecret(): string {
  const secret = process.env.ATTEMPT_SECRET
  if (!secret) throw new Error('ATTEMPT_SECRET environment variable is not set')
  return secret
}

function signPayload(encodedPayload: string): string {
  return createHmac('sha256', getSecret())
    .update(`olympiad-demo:v1:${encodedPayload}`)
    .digest('base64url')
}

export function createDemoToken(
  grade: number,
  questionIds: string[],
  now = Date.now(),
): string {
  const payload: DemoTokenPayload = {
    v: 1,
    grade,
    questionIds,
    expiresAt: now + OLYMPIAD_DEMO_TOKEN_TTL_MS,
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encodedPayload}.${signPayload(encodedPayload)}`
}

export function verifyDemoToken(token: string, now = Date.now()): DemoTokenPayload | null {
  const [encodedPayload, signature, extra] = token.split('.')
  if (!encodedPayload || !signature || extra) return null

  const expected = Buffer.from(signPayload(encodedPayload))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as DemoTokenPayload
    if (
      payload.v !== 1
      || !Number.isInteger(payload.grade)
      || payload.grade < 1
      || payload.grade > 4
      || !Array.isArray(payload.questionIds)
      || payload.questionIds.length !== OLYMPIAD_DEMO_QUESTION_COUNT
      || new Set(payload.questionIds).size !== OLYMPIAD_DEMO_QUESTION_COUNT
      || !payload.questionIds.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
      || !Number.isFinite(payload.expiresAt)
      || payload.expiresAt <= now
    ) return null
    return payload
  } catch {
    return null
  }
}

export type DemoSearchLimits = {
  maxVisitedNodes?: number
  maxDurationMs?: number
  now?: () => number
}

export class DemoCompositionBudgetExceededError extends Error {
  constructor(grade: number) {
    super(`Demo composition budget exceeded for grade ${grade}`)
    this.name = 'DemoCompositionBudgetExceededError'
  }
}

export function createSeededDemoRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 0x1_0000_0000
  }
}

function asPolicyQuestion(
  grade: number,
  question: DemoQuestionCandidate,
): OlympiadQuestionForPolicy {
  return {
    id: question.id,
    q: question.q ?? '',
    code: question.code,
    type: question.type,
    options: question.options ?? [],
    grade,
    difficulty: question.difficulty,
    track: question.track,
    topic: question.topic,
    conceptKey: null,
    progressionBand: question.progressionBand ?? null,
    img: question.img ?? null,
    imageAlt: question.imageAlt ?? null,
    meta: question.meta ?? null,
    isOlympiad: false,
    channels: ['olympiad_training'],
    editorialStatus: 'published',
  }
}

export function isDemoQuestionCandidateUsable(
  grade: number,
  question: DemoQuestionCandidate,
): boolean {
  if (!question.q?.trim() || !question.progressionBand) return false
  return !inspectOlympiadQuestionContent(asPolicyQuestion(grade, question))
    .some(issue => issue.severity === 'error')
}

export function pickDemoQuestionSet(
  grade: number,
  candidates: DemoQuestionCandidate[],
  random: () => number = Math.random,
  acceptSet: (questions: DemoQuestionCandidate[]) => boolean = () => true,
  limits: DemoSearchLimits = {},
): string[] {
  const slots = SLOT_BLUEPRINTS[grade]
  if (!slots) throw new Error('Unsupported demo grade')
  const usableCandidates = candidates.filter(question =>
    isDemoQuestionCandidateUsable(grade, question),
  )
  const maxVisitedNodes = Math.max(
    1,
    Math.floor(limits.maxVisitedNodes ?? OLYMPIAD_DEMO_MAX_SEARCH_NODES),
  )
  const maxDurationMs = Math.max(1, limits.maxDurationMs ?? OLYMPIAD_DEMO_MAX_SEARCH_MS)
  const now = limits.now ?? Date.now
  const startedAt = now()
  let visitedNodes = 0

  const requiredByCell = new Map<string, number>()
  for (const slot of slots) {
    const key = `${slot.track}:${slot.difficulty}`
    requiredByCell.set(key, (requiredByCell.get(key) ?? 0) + 1)
  }
  for (const [key, required] of requiredByCell) {
    const [track, difficulty] = key.split(':')
    const available = usableCandidates.filter(question =>
      question.track === track && question.difficulty === difficulty,
    ).length
    if (available < required) {
      throw new Error(`Demo pool is incomplete for grade ${grade}: ${track}/${difficulty}`)
    }
  }

  const selectedIds = new Set<string>()
  const selectedFingerprints = new Set<string>()
  const selectedVariantGroups = new Set<string>()
  const selectedTypes = new Set<QuestionType>()
  const topicCounts = new Map<string, number>()
  const progressionCounts = new Map<string, number>()
  let selectedImages = 0
  const result: DemoQuestionCandidate[] = []

  const chooseSlot = (slotIndex: number): boolean => {
    visitedNodes++
    if (visitedNodes > maxVisitedNodes || now() - startedAt >= maxDurationMs) {
      throw new DemoCompositionBudgetExceededError(grade)
    }
    if (slotIndex === slots.length) return acceptSet(result)
    const slot = slots[slotIndex]!
    const eligible = usableCandidates.filter(question =>
      question.track === slot.track
      && question.difficulty === slot.difficulty
      && !selectedIds.has(question.id)
      && !selectedFingerprints.has(olympiadQuestionFingerprint(question))
      && !selectedVariantGroups.has(olympiadQuestionVariantGroupKey(question)),
    )

    const ranked = eligible
      .map(question => {
        const topicCount = question.topic ? (topicCounts.get(question.topic) ?? 0) : 0
        const bandCount = question.progressionBand
          ? (progressionCounts.get(question.progressionBand) ?? 0)
          : 0
        const score =
          (selectedTypes.has(question.type) ? 0 : 100)
          + (question.type === 'choice' ? 0 : 20)
          + (selectedImages < 2 && question.img ? 15 : 0)
          + (question.progressionBand && bandCount < 3 ? 5 : 0)
          + (topicCount === 0 ? 10 : topicCount === 1 ? 2 : -100)
          + random()
        return { question, score }
      })
      .sort((a, b) => b.score - a.score)

    for (const { question: chosen } of ranked) {
      const fingerprint = olympiadQuestionFingerprint(chosen)
      const variantGroup = olympiadQuestionVariantGroupKey(chosen)
      const previousTopicCount = chosen.topic ? (topicCounts.get(chosen.topic) ?? 0) : 0
      const previousBandCount = chosen.progressionBand
        ? (progressionCounts.get(chosen.progressionBand) ?? 0)
        : 0
      const typeWasSelected = selectedTypes.has(chosen.type)

      result.push(chosen)
      selectedIds.add(chosen.id)
      selectedFingerprints.add(fingerprint)
      selectedVariantGroups.add(variantGroup)
      selectedTypes.add(chosen.type)
      if (chosen.topic) topicCounts.set(chosen.topic, previousTopicCount + 1)
      if (chosen.progressionBand) progressionCounts.set(chosen.progressionBand, previousBandCount + 1)
      if (chosen.img) selectedImages++

      if (chooseSlot(slotIndex + 1)) return true

      result.pop()
      selectedIds.delete(chosen.id)
      selectedFingerprints.delete(fingerprint)
      selectedVariantGroups.delete(variantGroup)
      if (!typeWasSelected) selectedTypes.delete(chosen.type)
      if (chosen.topic) {
        if (previousTopicCount) topicCounts.set(chosen.topic, previousTopicCount)
        else topicCounts.delete(chosen.topic)
      }
      if (chosen.progressionBand) {
        if (previousBandCount) progressionCounts.set(chosen.progressionBand, previousBandCount)
        else progressionCounts.delete(chosen.progressionBand)
      }
      if (chosen.img) selectedImages--
    }

    return false
  }

  if (!chooseSlot(0)) {
    throw new Error(`Demo pool cannot compose a unique policy-compliant set for grade ${grade}`)
  }
  return result.map(question => question.id)
}

export function analyzeDemoCoverage(
  grade: number,
  candidates: DemoQuestionCandidate[],
): DemoCoverageGrade {
  const slots = SLOT_BLUEPRINTS[grade]
  if (!slots) throw new Error('Unsupported demo grade')
  const invalidCandidates = candidates.filter(question =>
    !isDemoQuestionCandidateUsable(grade, question),
  )
  const usableCandidates = candidates.filter(question =>
    isDemoQuestionCandidateUsable(grade, question),
  )

  const grouped = new Map<string, DemoCoverageCell>()
  for (const slot of slots) {
    const key = `${slot.track}:${slot.difficulty}`
    const existing = grouped.get(key)
    if (existing) {
      existing.requiredSlots++
      existing.targetCandidates += 3
      continue
    }
    grouped.set(key, {
      track: slot.track,
      difficulty: slot.difficulty,
      requiredSlots: 1,
      candidates: 0,
      targetCandidates: 3,
      missingCandidates: 0,
      mechanics: [],
      topics: 0,
      images: 0,
    })
  }

  for (const cell of grouped.values()) {
    const eligible = usableCandidates.filter(question =>
      question.track === cell.track && question.difficulty === cell.difficulty,
    )
    cell.candidates = eligible.length
    cell.missingCandidates = Math.max(0, cell.targetCandidates - eligible.length)
    cell.mechanics = [...new Set(eligible.map(question => question.type))].sort()
    cell.topics = new Set(eligible.map(question => question.topic).filter(Boolean)).size
    cell.images = eligible.filter(question => Boolean(question.img)).length
  }

  const cells = [...grouped.values()]
  const issues: DemoCoverageIssue[] = []
  if (invalidCandidates.length > 0) {
    issues.push({
      code: 'invalid-candidate',
      message: `${invalidCandidates.length} опублікованих питань не можна включити до демо через блокувальні помилки контенту або незаповнений рівень мислення.`,
      questionIds: invalidCandidates.map(question => question.id),
    })
  }
  for (const cell of cells) {
    if (cell.candidates < cell.requiredSlots) {
      issues.push({
        code: 'cannot-compose',
        message: `${cell.track} / ${cell.difficulty}: потрібно ${cell.requiredSlots}, доступно ${cell.candidates}.`,
      })
    } else if (cell.missingCandidates > 0) {
      issues.push({
        code: 'variant-gap',
        message: `${cell.track} / ${cell.difficulty}: додайте ще ${cell.missingCandidates} варіант(и) для цілі 3 на слот.`,
      })
    }
  }

  let sample: DemoCoverageGrade['sample'] = null
  try {
    const selectedIds = pickDemoQuestionSet(grade, usableCandidates, () => 0.5)
    const byId = new Map(usableCandidates.map(question => [question.id, question]))
    const selected = selectedIds.map(id => byId.get(id)!)
    const mechanics = [...new Set(selected.map(question => question.type))].sort()
    const topicCounts = new Map<string, number>()
    const progression = { recognize: 0, apply: 0, reason: 0, unassigned: 0 }
    for (const question of selected) {
      if (question.topic) topicCounts.set(question.topic, (topicCounts.get(question.topic) ?? 0) + 1)
      const band = question.progressionBand ?? 'unassigned'
      progression[band]++
    }
    sample = {
      mechanics,
      images: selected.filter(question => Boolean(question.img)).length,
      maxTopicRepeats: Math.max(0, ...topicCounts.values()),
      progression,
    }
    if (mechanics.length < 5) {
      issues.push({
        code: 'mechanic-gap',
        message: `Збалансований набір використовує лише ${mechanics.length} механіки; потрібно щонайменше 5.`,
      })
    }
    if (sample.images < 2) {
      issues.push({
        code: 'image-gap',
        message: `Збалансований набір містить ${sample.images} візуальних завдань; потрібно щонайменше 2.`,
      })
    }
    if (sample.maxTopicRepeats > 2) {
      issues.push({
        code: 'topic-duplication',
        message: `Одна тема повторюється ${sample.maxTopicRepeats} разів; допустимо не більше 2.`,
      })
    }
  } catch {
    if (!issues.some(issue => issue.code === 'cannot-compose')) {
      issues.push({
        code: 'cannot-compose',
        message: 'Кандидатів достатньо за кількістю, але з них не складається набір без повтору завдань або шаблонів.',
      })
    }
  }

  return {
    grade,
    ready: issues.length === 0,
    canCompose: !issues.some(issue => issue.code === 'cannot-compose'),
    cells,
    sample,
    issues,
  }
}
