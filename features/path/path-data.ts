import type { QuestionTrack } from '../api/client.js'

// Статична карта навчального шляху (Home Mode). Джерело правди — код
// (версіонується з релізами); переїзд у БД/адмінку — свідомо пізніше.
// A point combines curriculum tags, a sequence of activities, and unlock conditions.
// Intersections are represented by several track/topic pairs in curriculum.

export type PathActivity =
  | { kind: 'sorting'; game: 'attributes' | 'infosort' | 'multisort' }
  | { kind: 'puzzles'; count?: number }
  | { kind: 'fact-opinion'; level: 1 | 2 }
  | { kind: 'simulator'; scenario: 'hardware' | 'software' }
  | { kind: 'mission'; track?: QuestionTrack; tracks?: QuestionTrack[]; topic?: string; count?: number }

export interface CurriculumTag {
  track: QuestionTrack
  topic: string
}

export interface PathActivityStep {
  /** Stable within the point and versioned with content changes. */
  id: string
  version: number
  title: string
  activity: PathActivity
  /** Reserved for future bonus activities; current pilot steps are required. */
  required: boolean
}

export interface PathPoint {
  id: string
  title: string
  /** Емодзі-іконка вузла на карті. */
  icon: string
  /** A point may contribute to several track/topic pairs at an intersection. */
  curriculum: CurriculumTag[]
  /** Required activities run sequentially; bonus activities can be added later. */
  activities: PathActivityStep[]
  /** Точка відкривається, коли ВСІ перелічені завершені. Порожньо = старт. */
  unlockAfter: string[]
  /** Позиція вузла на карті у відсотках (портретне полотно). */
  x: number
  y: number
}

export interface GradePathMap {
  grade: number
  title: string
  points: PathPoint[]
}

// ── Пілот: 2 клас ────────────────────────────────────────────────────────────
// 9 points: start, three branching tracks, and a shared final mission.

export const GRADE2_PATH: GradePathMap = {
  grade: 2,
  title: 'Шлях 2 класу',
  points: [
    {
      id: 'g2-info-start',
      title: 'Як ми отримуємо інформацію',
      icon: '📡',
      curriculum: [{ track: 'informatics', topic: 'information' }],
      activities: [{ id: 'infosort', version: 1, title: 'ІнфоСорт', activity: { kind: 'sorting', game: 'infosort' }, required: true }],
      unlockAfter: [],
      x: 50, y: 6,
    },
    {
      id: 'g2-ct-multisort',
      title: 'Сортуємо за різними правилами',
      icon: '🔀',
      curriculum: [{ track: 'computational-thinking', topic: 'classification' }],
      activities: [{ id: 'multisort', version: 1, title: 'Мульти-Сортування', activity: { kind: 'sorting', game: 'multisort' }, required: true }],
      unlockAfter: ['g2-info-start'],
      x: 22, y: 22,
    },
    {
      id: 'g2-fact-opinion',
      title: 'Факт чи думка?',
      icon: '🧐',
      curriculum: [
        { track: 'informatics', topic: 'information' },
        { track: 'ai-basics', topic: 'ai-ethics-safety' },
      ],
      // Рівень 2: факт / думка / міф (рівень 1 — дві категорії для 1 класу).
      activities: [{ id: 'fact-opinion-l2', version: 1, title: 'Факт, думка чи міф', activity: { kind: 'fact-opinion', level: 2 }, required: true }],
      unlockAfter: ['g2-info-start'],
      x: 78, y: 22,
    },
    {
      id: 'g2-assembly',
      title: 'Збери свій компʼютер',
      icon: '🔧',
      curriculum: [{ track: 'informatics', topic: 'computer-systems' }],
      activities: [{ id: 'assembly-hardware', version: 1, title: 'Майстерня компʼютера', activity: { kind: 'simulator', scenario: 'hardware' }, required: true }],
      unlockAfter: ['g2-info-start'],
      x: 50, y: 32,
    },
    {
      id: 'g2-ct-patterns',
      title: 'Знаходимо закономірність',
      icon: '🧩',
      curriculum: [{ track: 'computational-thinking', topic: 'patterns' }],
      activities: [{ id: 'patterns-puzzles', version: 1, title: 'Головоломки із закономірностями', activity: { kind: 'puzzles' }, required: true }],
      unlockAfter: ['g2-ct-multisort'],
      x: 16, y: 49,
    },
    {
      id: 'g2-ai-perception',
      title: 'Як ШІ розпізнає обʼєкти',
      icon: '👁️',
      curriculum: [{ track: 'ai-basics', topic: 'ai-perception' }],
      activities: [{ id: 'ai-perception-mission', version: 1, title: 'Місія про розпізнавання', activity: { kind: 'mission', track: 'ai-basics', topic: 'ai-perception' }, required: true }],
      unlockAfter: ['g2-fact-opinion'],
      x: 57, y: 51,
    },
    {
      id: 'g2-digital-safety',
      title: 'Що не можна повідомляти онлайн',
      icon: '🛡️',
      curriculum: [{ track: 'informatics', topic: 'digital-safety' }],
      activities: [{ id: 'digital-safety-mission', version: 1, title: 'Місія про приватні дані', activity: { kind: 'mission', track: 'informatics', topic: 'digital-safety' }, required: true }],
      unlockAfter: ['g2-fact-opinion'],
      x: 86, y: 51,
    },
    {
      id: 'g2-ct-algorithms',
      title: 'Будуємо точний алгоритм',
      icon: '🤖',
      curriculum: [{ track: 'computational-thinking', topic: 'algorithms' }],
      activities: [
        { id: 'algorithms-mission', version: 1, title: 'Місія про алгоритми', activity: { kind: 'mission', track: 'computational-thinking', topic: 'algorithms', count: 5 }, required: true },
        { id: 'algorithms-puzzles', version: 1, title: 'Закріплення головоломками', activity: { kind: 'puzzles', count: 2 }, required: true },
      ],
      unlockAfter: ['g2-ct-patterns'],
      x: 29, y: 68,
    },
    {
      id: 'g2-final',
      title: 'Фінальна місія трьох напрямів',
      icon: '🏰',
      curriculum: [
        { track: 'informatics', topic: 'information' },
        { track: 'computational-thinking', topic: 'logic' },
        { track: 'ai-basics', topic: 'ai-ethics-safety' },
      ],
      activities: [{
        id: 'final-three-tracks',
        version: 1,
        title: 'Фінальна місія',
        activity: { kind: 'mission', tracks: ['informatics', 'computational-thinking', 'ai-basics'], count: 9 },
        required: true,
      }],
      unlockAfter: ['g2-ct-algorithms', 'g2-ai-perception', 'g2-digital-safety'],
      x: 52, y: 88,
    },
  ],
}

export const PATHS_BY_GRADE: Record<number, GradePathMap> = {
  2: GRADE2_PATH,
}

/** Точка доступна, якщо всі unlockAfter завершені. */
export function isUnlocked(point: PathPoint, completed: ReadonlySet<string>): boolean {
  return point.unlockAfter.every(id => completed.has(id))
}
