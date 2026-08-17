import type { QuestionTrack } from '../api/client.js'

export type SchoolTopicId =
  | 'information-messages'
  | 'computer-devices'
  | 'digital-tools'
  | 'data-tables-charts'
  | 'algorithms-programming'
  | 'internet-networks-search'
  | 'digital-safety'

export type SchoolTopicGroupId = 'information' | 'tools' | 'algorithms' | 'internet'

export const SCHOOL_TOPIC_GROUPS: readonly { id: SchoolTopicGroupId; label: string }[] = [
  { id: 'information', label: 'Інформація і дані' },
  { id: 'tools', label: 'Комп’ютер і цифрові інструменти' },
  { id: 'algorithms', label: 'Алгоритми і програмування' },
  { id: 'internet', label: 'Інтернет і безпека' },
]

export type SchoolTopicGradeStatus = 'core' | 'support'

export interface SchoolTopicTag {
  track: QuestionTrack
  topic: string
}

export interface SchoolTopicConfig {
  id: SchoolTopicId
  /** Stable API id; legacy aliases keep frontend/backend rolling deploys compatible. */
  sessionId: string
  label: string
  description: string
  group: SchoolTopicGroupId
  icon: string
  sessionFilter: SchoolTopicTag
  primaryTags: readonly SchoolTopicTag[]
  supportingTags: readonly SchoolTopicTag[]
  grades: Partial<Record<1 | 2 | 3 | 4, SchoolTopicGradeStatus>>
}

export const SCHOOL_TOPICS: readonly SchoolTopicConfig[] = [
  {
    id: 'information-messages',
    sessionId: 'information-messages',
    label: 'Інформація та повідомлення',
    description: 'Види повідомлень, джерела інформації, факт і думка, уважне читання.',
    group: 'information',
    icon: 'fa-comment-alt',
    sessionFilter: { track: 'informatics', topic: 'information' },
    primaryTags: [{ track: 'informatics', topic: 'information' }],
    supportingTags: [
      { track: 'computational-thinking', topic: 'logic' },
      { track: 'ai-basics', topic: 'ai-ethics-safety' },
    ],
    grades: { 1: 'core', 2: 'core', 3: 'support', 4: 'support' },
  },
  {
    id: 'data-tables-charts',
    sessionId: 'data-tables-charts',
    label: 'Дані, таблиці, діаграми',
    description: 'Групування, таблиці, піктограми, діаграми й висновки за даними.',
    group: 'information',
    icon: 'fa-table',
    sessionFilter: { track: 'informatics', topic: 'data' },
    primaryTags: [{ track: 'informatics', topic: 'data' }],
    supportingTags: [
      { track: 'computational-thinking', topic: 'classification' },
      { track: 'computational-thinking', topic: 'patterns' },
      { track: 'ai-basics', topic: 'how-ai-learns' },
    ],
    grades: { 1: 'support', 2: 'core', 3: 'core', 4: 'core' },
  },
  {
    id: 'computer-devices',
    sessionId: 'computer-devices',
    label: "Комп'ютер і пристрої",
    description: "Складові комп'ютера, пристрої введення та виведення, призначення пристроїв.",
    group: 'tools',
    icon: 'fa-desktop',
    sessionFilter: { track: 'informatics', topic: 'computer-systems' },
    primaryTags: [{ track: 'informatics', topic: 'computer-systems' }],
    supportingTags: [{ track: 'computational-thinking', topic: 'classification' }],
    grades: { 1: 'core', 2: 'core', 3: 'core', 4: 'core' },
  },
  {
    id: 'digital-tools',
    sessionId: 'files-environment',
    label: 'Файли і цифровий вміст',
    description: 'Файли, папки, текст, малюнки, презентації та робота у цифрових програмах.',
    group: 'tools',
    icon: 'fa-folder-open',
    sessionFilter: { track: 'informatics', topic: 'digital-tools' },
    primaryTags: [
      { track: 'informatics', topic: 'digital-tools' },
      { track: 'informatics', topic: 'computer-systems' },
    ],
    supportingTags: [{ track: 'computational-thinking', topic: 'algorithms' }],
    grades: { 1: 'support', 2: 'core', 3: 'core', 4: 'core' },
  },
  {
    id: 'algorithms-programming',
    sessionId: 'algorithms-executors',
    label: 'Алгоритми і програмування',
    description: 'Команди, виконавці, послідовності, повторення, прості програми та пошук помилок.',
    group: 'algorithms',
    icon: 'fa-code',
    sessionFilter: { track: 'informatics', topic: 'algorithms-programming' },
    primaryTags: [{ track: 'informatics', topic: 'algorithms-programming' }],
    supportingTags: [
      { track: 'computational-thinking', topic: 'algorithms' },
      { track: 'computational-thinking', topic: 'debugging' },
    ],
    grades: { 1: 'core', 2: 'core', 3: 'core', 4: 'core' },
  },
  {
    id: 'internet-networks-search',
    sessionId: 'internet-networks-search',
    label: 'Інтернет, мережі та пошук',
    description: 'Онлайн і офлайн, мережі, пошук інформації, посилання та QR-коди.',
    group: 'internet',
    icon: 'fa-globe',
    sessionFilter: { track: 'informatics', topic: 'networks-internet' },
    primaryTags: [{ track: 'informatics', topic: 'networks-internet' }],
    supportingTags: [
      { track: 'ai-basics', topic: 'ai-tools' },
      { track: 'ai-basics', topic: 'ai-ethics-safety' },
    ],
    grades: { 1: 'support', 2: 'core', 3: 'core', 4: 'core' },
  },
  {
    id: 'digital-safety',
    sessionId: 'digital-safety',
    label: 'Безпека в цифровому середовищі',
    description: 'Особиста інформація, пароль, онлайн-спілкування та цифровий добробут.',
    group: 'internet',
    icon: 'fa-shield-alt',
    sessionFilter: { track: 'informatics', topic: 'digital-safety' },
    primaryTags: [{ track: 'informatics', topic: 'digital-safety' }],
    supportingTags: [{ track: 'ai-basics', topic: 'ai-ethics-safety' }],
    grades: { 1: 'core', 2: 'core', 3: 'core', 4: 'core' },
  },
]

export function getSchoolTopicConfig(id: string): SchoolTopicConfig | undefined {
  return SCHOOL_TOPICS.find(topic => topic.id === id)
}

export function schoolTopicToSessionFilter(id: string): SchoolTopicTag | null {
  return getSchoolTopicConfig(id)?.sessionFilter ?? null
}

export function schoolTopicToSessionId(id: string): string | null {
  return getSchoolTopicConfig(id)?.sessionId ?? null
}
