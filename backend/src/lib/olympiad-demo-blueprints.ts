import type { QuestionTrack, QuestionType } from '../db/schema.js'

export const OLYMPIAD_DEMO_BLUEPRINT_VERSION = 1
export const OLYMPIAD_DEMO_VARIANTS_PER_SLOT = 4

type DemoDifficulty = 'easy' | 'medium' | 'hard'
type DemoProgressionBand = 'recognize' | 'apply' | 'reason'

export type OlympiadDemoSlot = {
  id: string
  type: QuestionType
  track: QuestionTrack
  topic: string
  difficulty: DemoDifficulty
  progressionBand: DemoProgressionBand
}

export type OlympiadDemoQuestionMeta = {
  purpose: 'olympiad-demo'
  slotId: string
  blueprintVersion: string
  templateId: string
  variantLabel: 'A' | 'B' | 'C' | 'D'
  estimatedSeconds: number
  imageRole?: 'essential' | 'supportive' | 'decorative'
  imageSource?: string
  imageLicense?: string
}

type SlotSeed = Omit<OlympiadDemoSlot, 'id'>

const SLOT_SEEDS: Record<number, SlotSeed[]> = {
  1: [
    { type: 'choice', track: 'informatics', topic: 'computer-systems', difficulty: 'easy', progressionBand: 'recognize' },
    { type: 'sequence', track: 'computational-thinking', topic: 'patterns', difficulty: 'easy', progressionBand: 'recognize' },
    { type: 'sort', track: 'computational-thinking', topic: 'algorithms', difficulty: 'medium', progressionBand: 'apply' },
    { type: 'choice', track: 'computational-thinking', topic: 'logic', difficulty: 'hard', progressionBand: 'reason' },
    { type: 'match', track: 'informatics', topic: 'information', difficulty: 'medium', progressionBand: 'recognize' },
    { type: 'sort', track: 'informatics', topic: 'digital-tools', difficulty: 'medium', progressionBand: 'apply' },
    { type: 'match', track: 'computational-thinking', topic: 'classification', difficulty: 'medium', progressionBand: 'apply' },
    { type: 'choice', track: 'informatics', topic: 'algorithms-programming', difficulty: 'hard', progressionBand: 'reason' },
    { type: 'truefalse', track: 'ai-basics', topic: 'what-is-ai', difficulty: 'easy', progressionBand: 'recognize' },
    { type: 'sort', track: 'computational-thinking', topic: 'decomposition', difficulty: 'medium', progressionBand: 'apply' },
    { type: 'choice', track: 'informatics', topic: 'digital-safety', difficulty: 'medium', progressionBand: 'apply' },
    { type: 'choice', track: 'ai-basics', topic: 'ai-ethics-safety', difficulty: 'hard', progressionBand: 'apply' },
  ],
  2: [
    { type: 'choice', track: 'informatics', topic: 'computer-systems', difficulty: 'easy', progressionBand: 'recognize' },
    { type: 'sequence', track: 'informatics', topic: 'data', difficulty: 'easy', progressionBand: 'recognize' },
    { type: 'match', track: 'computational-thinking', topic: 'classification', difficulty: 'medium', progressionBand: 'apply' },
    { type: 'input', track: 'computational-thinking', topic: 'patterns', difficulty: 'hard', progressionBand: 'reason' },
    { type: 'sort', track: 'informatics', topic: 'digital-tools', difficulty: 'medium', progressionBand: 'apply' },
    { type: 'choice', track: 'computational-thinking', topic: 'logic', difficulty: 'medium', progressionBand: 'apply' },
    { type: 'match', track: 'ai-basics', topic: 'how-ai-learns', difficulty: 'medium', progressionBand: 'apply' },
    { type: 'choice', track: 'computational-thinking', topic: 'debugging', difficulty: 'hard', progressionBand: 'reason' },
    { type: 'truefalse', track: 'informatics', topic: 'networks-internet', difficulty: 'easy', progressionBand: 'recognize' },
    { type: 'sort', track: 'computational-thinking', topic: 'algorithms', difficulty: 'medium', progressionBand: 'apply' },
    { type: 'choice', track: 'informatics', topic: 'digital-safety', difficulty: 'medium', progressionBand: 'reason' },
    { type: 'choice', track: 'ai-basics', topic: 'human-vs-ai', difficulty: 'hard', progressionBand: 'reason' },
  ],
  3: [
    { type: 'match', track: 'informatics', topic: 'digital-tools', difficulty: 'easy', progressionBand: 'recognize' },
    { type: 'choice', track: 'informatics', topic: 'information', difficulty: 'easy', progressionBand: 'recognize' },
    { type: 'match', track: 'computational-thinking', topic: 'abstraction', difficulty: 'medium', progressionBand: 'apply' },
    { type: 'input', track: 'computational-thinking', topic: 'patterns', difficulty: 'hard', progressionBand: 'reason' },
    { type: 'sort', track: 'informatics', topic: 'data', difficulty: 'medium', progressionBand: 'apply' },
    { type: 'sequence', track: 'computational-thinking', topic: 'repetition', difficulty: 'medium', progressionBand: 'apply' },
    { type: 'sort', track: 'ai-basics', topic: 'how-ai-learns', difficulty: 'medium', progressionBand: 'apply' },
    { type: 'choice', track: 'computational-thinking', topic: 'debugging', difficulty: 'hard', progressionBand: 'reason' },
    { type: 'match', track: 'informatics', topic: 'digital-tools', difficulty: 'easy', progressionBand: 'apply' },
    { type: 'truefalse', track: 'computational-thinking', topic: 'logic', difficulty: 'medium', progressionBand: 'reason' },
    { type: 'choice', track: 'informatics', topic: 'networks-internet', difficulty: 'medium', progressionBand: 'reason' },
    { type: 'choice', track: 'ai-basics', topic: 'ai-ethics-safety', difficulty: 'hard', progressionBand: 'reason' },
  ],
  4: [
    { type: 'choice', track: 'informatics', topic: 'information', difficulty: 'easy', progressionBand: 'recognize' },
    { type: 'match', track: 'informatics', topic: 'computer-systems', difficulty: 'easy', progressionBand: 'recognize' },
    { type: 'sequence', track: 'computational-thinking', topic: 'patterns', difficulty: 'medium', progressionBand: 'apply' },
    { type: 'input', track: 'computational-thinking', topic: 'algorithms', difficulty: 'hard', progressionBand: 'reason' },
    { type: 'choice', track: 'informatics', topic: 'algorithms-programming', difficulty: 'medium', progressionBand: 'apply' },
    { type: 'match', track: 'computational-thinking', topic: 'patterns', difficulty: 'medium', progressionBand: 'apply' },
    { type: 'choice', track: 'ai-basics', topic: 'human-vs-ai', difficulty: 'medium', progressionBand: 'reason' },
    { type: 'match', track: 'computational-thinking', topic: 'logic', difficulty: 'hard', progressionBand: 'reason' },
    { type: 'sort', track: 'informatics', topic: 'networks-internet', difficulty: 'easy', progressionBand: 'apply' },
    { type: 'choice', track: 'computational-thinking', topic: 'efficiency', difficulty: 'medium', progressionBand: 'reason' },
    { type: 'choice', track: 'informatics', topic: 'networks-internet', difficulty: 'medium', progressionBand: 'reason' },
    { type: 'truefalse', track: 'ai-basics', topic: 'ai-ethics-safety', difficulty: 'hard', progressionBand: 'reason' },
  ],
}

export function olympiadDemoBlueprintVersion(grade: number): string {
  return `g${grade}-demo-v${OLYMPIAD_DEMO_BLUEPRINT_VERSION}`
}

export function getOlympiadDemoBlueprint(grade: number): OlympiadDemoSlot[] {
  const seeds = SLOT_SEEDS[grade]
  if (!seeds) throw new Error(`Unsupported demo grade: ${grade}`)
  return seeds.map((slot, index) => ({
    id: `g${grade}-demo-${String(index + 1).padStart(2, '0')}`,
    ...slot,
  }))
}

export function readOlympiadDemoMeta(meta: Record<string, unknown> | null | undefined): OlympiadDemoQuestionMeta | null {
  if (meta?.purpose !== 'olympiad-demo') return null
  if (
    typeof meta.slotId !== 'string'
    || typeof meta.blueprintVersion !== 'string'
    || typeof meta.templateId !== 'string'
    || !['A', 'B', 'C', 'D'].includes(String(meta.variantLabel))
    || !Number.isInteger(meta.estimatedSeconds)
  ) return null
  return meta as unknown as OlympiadDemoQuestionMeta
}
