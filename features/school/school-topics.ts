import type { QuestionTrack } from '../api/client.js'

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

export type SchoolTopicGradeStatus = 'core' | 'support'

export interface SchoolTopicTag {
  track: QuestionTrack
  topic: string
}

export interface SchoolTopicConfig {
  id: SchoolTopicId
  label: string
  description: string
  sessionFilter: SchoolTopicTag
  primaryTags: readonly SchoolTopicTag[]
  supportingTags: readonly SchoolTopicTag[]
  grades: Partial<Record<1 | 2 | 3 | 4, SchoolTopicGradeStatus>>
}

export const SCHOOL_TOPICS: readonly SchoolTopicConfig[] = [
  {
    id: 'information-messages',
    label: 'Інформація та повідомлення',
    description: 'Види повідомлень, джерела інформації, факт і думка, уважне читання.',
    sessionFilter: { track: 'informatics', topic: 'information' },
    primaryTags: [{ track: 'informatics', topic: 'information' }],
    supportingTags: [
      { track: 'computational-thinking', topic: 'logic' },
      { track: 'ai-basics', topic: 'ai-ethics-safety' },
    ],
    grades: { 1: 'core', 2: 'core', 3: 'support', 4: 'support' },
  },
  {
    id: 'computer-devices',
    label: "Комп'ютер і пристрої",
    description: "Складові комп'ютера, пристрої введення та виведення, призначення пристроїв.",
    sessionFilter: { track: 'informatics', topic: 'computer-systems' },
    primaryTags: [{ track: 'informatics', topic: 'computer-systems' }],
    supportingTags: [{ track: 'computational-thinking', topic: 'classification' }],
    grades: { 1: 'core', 2: 'core', 3: 'core', 4: 'core' },
  },
  {
    id: 'files-environment',
    label: 'Файли, папки і робоче середовище',
    description: 'Відкрити, зберегти, знайти, назвати й упорядкувати файл.',
    sessionFilter: { track: 'informatics', topic: 'digital-tools' },
    primaryTags: [
      { track: 'informatics', topic: 'digital-tools' },
      { track: 'informatics', topic: 'computer-systems' },
    ],
    supportingTags: [{ track: 'computational-thinking', topic: 'algorithms' }],
    grades: { 1: 'support', 2: 'core', 3: 'core', 4: 'core' },
  },
  {
    id: 'digital-creation',
    label: 'Створення цифрового вмісту',
    description: 'Текст, малюнок, фото, аудіо, презентація та просте редагування.',
    sessionFilter: { track: 'informatics', topic: 'digital-tools' },
    primaryTags: [{ track: 'informatics', topic: 'digital-tools' }],
    supportingTags: [
      { track: 'computational-thinking', topic: 'decomposition' },
      { track: 'ai-basics', topic: 'ai-tools' },
    ],
    grades: { 1: 'core', 2: 'core', 3: 'core', 4: 'core' },
  },
  {
    id: 'data-tables-charts',
    label: 'Дані, таблиці, діаграми',
    description: 'Групування, таблиці, піктограми, діаграми й висновки за даними.',
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
    id: 'algorithms-executors',
    label: 'Алгоритми і виконавці',
    description: 'Команди, порядок дій, маршрути, виконавці та помилки в алгоритмі.',
    sessionFilter: { track: 'informatics', topic: 'algorithms-programming' },
    primaryTags: [{ track: 'informatics', topic: 'algorithms-programming' }],
    supportingTags: [
      { track: 'computational-thinking', topic: 'algorithms' },
      { track: 'computational-thinking', topic: 'debugging' },
    ],
    grades: { 1: 'core', 2: 'core', 3: 'core', 4: 'support' },
  },
  {
    id: 'programming-scratch',
    label: 'Програмування і Scratch',
    description: 'Послідовності, події, повторення, прості програми й тестування.',
    sessionFilter: { track: 'informatics', topic: 'algorithms-programming' },
    primaryTags: [{ track: 'informatics', topic: 'algorithms-programming' }],
    supportingTags: [
      { track: 'computational-thinking', topic: 'repetition' },
      { track: 'computational-thinking', topic: 'debugging' },
      { track: 'computational-thinking', topic: 'decomposition' },
    ],
    grades: { 1: 'support', 2: 'core', 3: 'core', 4: 'core' },
  },
  {
    id: 'internet-networks-search',
    label: 'Інтернет, мережі та пошук',
    description: 'Онлайн і офлайн, мережі, пошук інформації, посилання та QR-коди.',
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
    label: 'Безпека в цифровому середовищі',
    description: 'Особиста інформація, пароль, онлайн-спілкування та цифровий добробут.',
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
