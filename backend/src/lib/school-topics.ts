import type { ConceptKey } from './taxonomy.js'
import type { QuestionTrack } from '../db/schema.js'

export type SchoolTopicId =
  | 'information-messages'
  | 'computer-devices'
  | 'files-environment'
  | 'digital-creation'
  | 'data-tables-charts'
  | 'algorithms-executors'
  | 'programming-scratch'
  | 'internet-networks-search'
  | 'digital-safety'

export interface SchoolTopicSelection {
  track: QuestionTrack
  topic: string
  preferredConceptKeys?: readonly ConceptKey[]
}

export const SCHOOL_TOPIC_IDS = [
  'information-messages',
  'computer-devices',
  'files-environment',
  'digital-creation',
  'data-tables-charts',
  'algorithms-executors',
  'programming-scratch',
  'internet-networks-search',
  'digital-safety',
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
  'files-environment': {
    track: 'informatics',
    topic: 'digital-tools',
  },
  'digital-creation': {
    track: 'informatics',
    topic: 'digital-tools',
  },
  'data-tables-charts': {
    track: 'informatics',
    topic: 'data',
  },
  'algorithms-executors': {
    track: 'informatics',
    topic: 'algorithms-programming',
    preferredConceptKeys: ['algorithms', 'debugging'],
  },
  'programming-scratch': {
    track: 'informatics',
    topic: 'algorithms-programming',
    preferredConceptKeys: ['repetition', 'decomposition', 'debugging'],
  },
  'internet-networks-search': {
    track: 'informatics',
    topic: 'networks-internet',
  },
  'digital-safety': {
    track: 'informatics',
    topic: 'digital-safety',
  },
}

export function resolveSchoolTopicSelection(raw: unknown): SchoolTopicSelection | null {
  if (raw == null || raw === '') return null
  if (typeof raw !== 'string') throw new Error('Unknown School topic')
  const topic = SCHOOL_TOPIC_SELECTIONS[raw as SchoolTopicId]
  if (!topic) throw new Error('Unknown School topic')
  return topic
}
