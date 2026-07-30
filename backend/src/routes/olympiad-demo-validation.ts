import { createHmac, timingSafeEqual } from 'crypto'
import type { QuestionTrack, QuestionType } from '../db/schema.js'

export const OLYMPIAD_DEMO_QUESTION_COUNT = 12
export const OLYMPIAD_DEMO_TIME_MINUTES = 20
export const OLYMPIAD_DEMO_TOKEN_TTL_MS = 2 * 60 * 60 * 1000

type DemoDifficulty = 'easy' | 'medium' | 'hard'

type DemoSlot = {
  track: QuestionTrack
  difficulty: DemoDifficulty
}

export type DemoQuestionCandidate = {
  id: string
  type: QuestionType
  track: QuestionTrack | null
  difficulty: string | null
  topic: string | null
  progressionBand?: 'recognize' | 'apply' | 'reason' | null
  img?: string | null
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
  code: 'cannot-compose' | 'variant-gap' | 'mechanic-gap' | 'image-gap' | 'topic-duplication'
  message: string
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

export function pickDemoQuestionSet(
  grade: number,
  candidates: DemoQuestionCandidate[],
  random: () => number = Math.random,
): string[] {
  const slots = SLOT_BLUEPRINTS[grade]
  if (!slots) throw new Error('Unsupported demo grade')

  const selectedIds = new Set<string>()
  const selectedTypes = new Set<QuestionType>()
  const topicCounts = new Map<string, number>()
  const progressionCounts = new Map<string, number>()
  let selectedImages = 0
  const result: string[] = []

  for (const slot of slots) {
    const eligible = candidates.filter(question =>
      question.track === slot.track
      && question.difficulty === slot.difficulty
      && !selectedIds.has(question.id),
    )
    if (!eligible.length) {
      throw new Error(`Demo pool is incomplete for grade ${grade}: ${slot.track}/${slot.difficulty}`)
    }

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

    const chosen = ranked[0]!.question
    result.push(chosen.id)
    selectedIds.add(chosen.id)
    selectedTypes.add(chosen.type)
    if (chosen.topic) topicCounts.set(chosen.topic, (topicCounts.get(chosen.topic) ?? 0) + 1)
    if (chosen.progressionBand) {
      progressionCounts.set(chosen.progressionBand, (progressionCounts.get(chosen.progressionBand) ?? 0) + 1)
    }
    if (chosen.img) selectedImages++
  }

  return result
}

export function analyzeDemoCoverage(
  grade: number,
  candidates: DemoQuestionCandidate[],
): DemoCoverageGrade {
  const slots = SLOT_BLUEPRINTS[grade]
  if (!slots) throw new Error('Unsupported demo grade')

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
    const eligible = candidates.filter(question =>
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
    const selectedIds = pickDemoQuestionSet(grade, candidates, () => 0.5)
    const byId = new Map(candidates.map(question => [question.id, question]))
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
    // The cell-level issue above contains the actionable composition gap.
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
