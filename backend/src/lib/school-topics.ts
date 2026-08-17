import type { QuestionTrack } from '../db/schema.js'

export type SchoolTopicId =
  | 'information-messages'
  | 'computer-devices'
  | 'digital-tools'
  | 'data-tables-charts'
  | 'algorithms-programming'
  | 'internet-networks-search'
  | 'digital-safety'
  // Kept for rolling-deploy compatibility with the previous teacher UI.
  | 'files-environment'
  | 'digital-creation'
  | 'algorithms-executors'
  | 'programming-scratch'

export interface SchoolTopicSelection {
  track: QuestionTrack
  topic: string
}

export const CANONICAL_SCHOOL_TOPIC_IDS = [
  'information-messages',
  'data-tables-charts',
  'computer-devices',
  'digital-tools',
  'algorithms-programming',
  'internet-networks-search',
  'digital-safety',
] as const

export const SCHOOL_TOPIC_IDS = [
  ...CANONICAL_SCHOOL_TOPIC_IDS,
  'files-environment',
  'digital-creation',
  'algorithms-executors',
  'programming-scratch',
] as const satisfies readonly SchoolTopicId[]

export const SCHOOL_TOPIC_SELECTIONS: Record<SchoolTopicId, SchoolTopicSelection> = {
  'information-messages': {
    track: 'informatics',
    topic: 'information',
  },
  'computer-devices': {
    track: 'informatics',
    topic: 'computer-systems',
  },
  'digital-tools': {
    track: 'informatics',
    topic: 'digital-tools',
  },
  'data-tables-charts': {
    track: 'informatics',
    topic: 'data',
  },
  'algorithms-programming': {
    track: 'informatics',
    topic: 'algorithms-programming',
  },
  'internet-networks-search': {
    track: 'informatics',
    topic: 'networks-internet',
  },
  'digital-safety': {
    track: 'informatics',
    topic: 'digital-safety',
  },
  'files-environment': { track: 'informatics', topic: 'digital-tools' },
  'digital-creation': { track: 'informatics', topic: 'digital-tools' },
  'algorithms-executors': { track: 'informatics', topic: 'algorithms-programming' },
  'programming-scratch': { track: 'informatics', topic: 'algorithms-programming' },
}

export function resolveSchoolTopicSelection(raw: unknown): SchoolTopicSelection | null {
  if (raw == null || raw === '') return null
  if (typeof raw !== 'string') throw new Error('Unknown School topic')
  const topic = SCHOOL_TOPIC_SELECTIONS[raw as SchoolTopicId]
  if (!topic) throw new Error('Unknown School topic')
  return topic
}
