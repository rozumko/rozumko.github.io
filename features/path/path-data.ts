import type { QuestionTrack } from '../api/client.js'

// Built-in Home Mode fallback. The authored source of truth is path_maps in the
// database; public/path bundles deliver reviewed revisions without a code release.
// A point combines curriculum tags, a sequence of activities, and unlock conditions.
// Intersections are represented by several track/topic pairs in curriculum.

export type PathActivity =
  | { kind: 'lesson'; lessonId: string }
  | {
    kind: 'mission-ref'
    missionId: string
    missionKind: 'sorting-game' | 'sequence-game' | 'scenario-game' | 'fact-opinion-game' | 'click-trainer-game' | 'simulator-game'
    gameKey?: string
    scenarioKey?: 'assembly-hardware' | 'assembly-software'
    missionVersion?: number
    count?: number
  }
  | { kind: 'sequence'; count?: number }
  | { kind: 'scenarios'; count?: number }
  | { kind: 'sorting'; game: 'attributes' | 'infosort' | 'multisort' }
  | { kind: 'puzzles'; count?: number }
  | { kind: 'fact-opinion'; level: 1 | 2 }
  | { kind: 'click-trainer'; game: 'computer-parts'; count?: number }
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
  /**
   * Доступ до точки: 'free' — відкрита всім, 'club' — під підпискою
   * (подання free-карти — docs/learning-path-plan.md, погоджено 2026-07-13).
   * Відсутнє поле = 'free'. UI-обмеження — окремий зріз монетизації.
   */
  access?: 'free' | 'club'
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
  /** Immutable database/static-bundle revision used for server validation. */
  version: number
  title: string
  points: PathPoint[]
}

// Grade 1: short, visual activities with minimal reading. The three branches
// separate after the first classification game and meet again at the finale.
export const GRADE1_PATH: GradePathMap = {
  grade: 1,
  version: 1,
  title: 'Шлях 1 класу',
  points: [
    {
      id: 'g1-sort-start', title: 'Знайди спільну ознаку', icon: '🧺',
      curriculum: [{ track: 'computational-thinking', topic: 'classification' }],
      activities: [{ id: 'attributes', version: 1, title: 'Розумне сортування', activity: { kind: 'sorting', game: 'attributes' }, required: true }],
      unlockAfter: [], x: 50, y: 6,
    },
    {
      id: 'g1-info-senses', title: 'Як ми отримуємо інформацію', icon: '👀',
      curriculum: [{ track: 'informatics', topic: 'information' }],
      activities: [{ id: 'infosort', version: 1, title: 'ІнфоСорт', activity: { kind: 'sorting', game: 'infosort' }, required: true }],
      unlockAfter: ['g1-sort-start'], x: 50, y: 27,
    },
    {
      id: 'g1-ct-patterns', title: 'Продовж візерунок', icon: '🧩',
      curriculum: [{ track: 'computational-thinking', topic: 'patterns' }],
      activities: [{ id: 'patterns-puzzles', version: 1, title: 'Головоломки з візерунками', activity: { kind: 'puzzles', count: 3 }, required: true }],
      unlockAfter: ['g1-sort-start'], x: 19, y: 27,
    },
    {
      id: 'g1-fact-opinion', title: 'Факт чи чиясь думка?', icon: '💬',
      curriculum: [
        { track: 'informatics', topic: 'information' },
        { track: 'ai-basics', topic: 'ai-ethics-safety' },
      ],
      activities: [{ id: 'fact-opinion-l1', version: 1, title: 'Факт чи думка', activity: { kind: 'fact-opinion', level: 1 }, required: true }],
      unlockAfter: ['g1-sort-start'], x: 81, y: 27,
    },
    {
      id: 'g1-ct-algorithms', title: 'Крок за кроком', icon: '👣',
      curriculum: [{ track: 'computational-thinking', topic: 'algorithms' }],
      activities: [{ id: 'algorithms-mission', version: 1, title: 'Прості алгоритми', activity: { kind: 'mission', track: 'computational-thinking', topic: 'algorithms', count: 4 }, required: true }],
      unlockAfter: ['g1-ct-patterns'], x: 20, y: 55,
    },
    {
      id: 'g1-ai-intro', title: 'Де живе штучний інтелект', icon: '🤖',
      curriculum: [{ track: 'ai-basics', topic: 'what-is-ai' }],
      activities: [{ id: 'what-is-ai-mission', version: 1, title: 'Знайомство із ШІ', activity: { kind: 'mission', track: 'ai-basics', topic: 'what-is-ai', count: 4 }, required: true }],
      unlockAfter: ['g1-fact-opinion'], x: 63, y: 52,
    },
    {
      id: 'g1-digital-safety', title: 'Мій секрет у безпеці', icon: '🛡️',
      curriculum: [{ track: 'informatics', topic: 'digital-safety' }],
      activities: [{ id: 'digital-safety-mission', version: 1, title: 'Безпечно онлайн', activity: { kind: 'mission', track: 'informatics', topic: 'digital-safety', count: 4 }, required: true }],
      unlockAfter: ['g1-info-senses'], x: 85, y: 68,
    },
    {
      id: 'g1-logic-bridge', title: 'Обери правильний крок', icon: '🚦',
      curriculum: [
        { track: 'computational-thinking', topic: 'logic' },
        { track: 'informatics', topic: 'algorithms-programming' },
      ],
      activities: [{ id: 'logic-puzzles', version: 1, title: 'Логічні головоломки', activity: { kind: 'puzzles', count: 3 }, required: true }],
      unlockAfter: ['g1-ct-algorithms', 'g1-info-senses'], x: 40, y: 72,
    },
    {
      id: 'g1-final', title: 'Свято трьох суперсил', icon: '🏰',
      curriculum: [
        { track: 'informatics', topic: 'information' },
        { track: 'computational-thinking', topic: 'logic' },
        { track: 'ai-basics', topic: 'what-is-ai' },
      ],
      activities: [{
        id: 'final-three-tracks', version: 1, title: 'Фінальна місія',
        activity: { kind: 'mission', tracks: ['informatics', 'computational-thinking', 'ai-basics'], count: 6 }, required: true,
      }],
      unlockAfter: ['g1-logic-bridge', 'g1-ai-intro', 'g1-digital-safety'], x: 54, y: 91,
    },
  ],
}

export const GRADE3_PATH: GradePathMap = {
  grade: 3,
  version: 1,
  title: 'Шлях 3 класу',
  points: [
    {
      id: 'g3-algorithms-start', title: 'Команда за командою', icon: '🧭',
      curriculum: [{ track: 'computational-thinking', topic: 'algorithms' }],
      activities: [{ id: 'algorithms-mission', version: 1, title: 'Будуємо алгоритм', activity: { kind: 'mission', track: 'computational-thinking', topic: 'algorithms', count: 5 }, required: true }],
      unlockAfter: [], x: 50, y: 6,
    },
    {
      id: 'g3-decomposition', title: 'Розклади задачу на частини', icon: '🧱',
      curriculum: [{ track: 'computational-thinking', topic: 'decomposition' }],
      activities: [{ id: 'decomposition-mission', version: 1, title: 'Велике завдання — малі кроки', activity: { kind: 'mission', track: 'computational-thinking', topic: 'decomposition', count: 5 }, required: true }],
      unlockAfter: ['g3-algorithms-start'], x: 18, y: 27,
    },
    {
      id: 'g3-data', title: 'Інформація стає даними', icon: '📊',
      curriculum: [{ track: 'informatics', topic: 'data' }],
      activities: [{ id: 'data-mission', version: 1, title: 'Місія про дані', activity: { kind: 'mission', track: 'informatics', topic: 'data', count: 5 }, required: true }],
      unlockAfter: ['g3-algorithms-start'], x: 50, y: 28,
    },
    {
      id: 'g3-ai-learning', title: 'Як навчається ШІ', icon: '🧠',
      curriculum: [{ track: 'ai-basics', topic: 'how-ai-learns' }],
      activities: [{ id: 'ai-learning-mission', version: 1, title: 'Приклади для ШІ', activity: { kind: 'mission', track: 'ai-basics', topic: 'how-ai-learns', count: 5 }, required: true }],
      unlockAfter: ['g3-algorithms-start'], x: 82, y: 27,
    },
    {
      id: 'g3-repetition', title: 'Повторюй розумно', icon: '🔁',
      curriculum: [{ track: 'computational-thinking', topic: 'repetition' }],
      activities: [{ id: 'repetition-mission', version: 1, title: 'Знаходимо повторення', activity: { kind: 'mission', track: 'computational-thinking', topic: 'repetition', count: 5 }, required: true }],
      unlockAfter: ['g3-decomposition'], x: 17, y: 53,
    },
    {
      id: 'g3-assembly', title: 'Майстерня комп’ютера', icon: '🔧',
      curriculum: [{ track: 'informatics', topic: 'computer-systems' }],
      activities: [{ id: 'assembly-hardware', version: 1, title: 'Збери комп’ютер', activity: { kind: 'simulator', scenario: 'hardware' }, required: true }],
      unlockAfter: ['g3-data'], x: 50, y: 54,
    },
    {
      id: 'g3-ai-perception', title: 'Як ШІ бачить і чує', icon: '👁️',
      curriculum: [{ track: 'ai-basics', topic: 'ai-perception' }],
      activities: [{ id: 'ai-perception-mission', version: 1, title: 'Розпізнавання навколо нас', activity: { kind: 'mission', track: 'ai-basics', topic: 'ai-perception', count: 5 }, required: true }],
      unlockAfter: ['g3-ai-learning'], x: 83, y: 53,
    },
    {
      id: 'g3-debug-bridge', title: 'Знайди й виправ помилку', icon: '🐞',
      curriculum: [
        { track: 'computational-thinking', topic: 'debugging' },
        { track: 'informatics', topic: 'algorithms-programming' },
      ],
      activities: [{ id: 'debug-puzzles', version: 1, title: 'Лабораторія помилок', activity: { kind: 'puzzles', count: 4 }, required: true }],
      unlockAfter: ['g3-repetition', 'g3-assembly'], x: 35, y: 75,
    },
    {
      id: 'g3-final', title: 'Експедиція трьох напрямів', icon: '🚀',
      curriculum: [
        { track: 'informatics', topic: 'computer-systems' },
        { track: 'computational-thinking', topic: 'debugging' },
        { track: 'ai-basics', topic: 'ai-perception' },
      ],
      activities: [{ id: 'final-three-tracks', version: 1, title: 'Фінальна експедиція', activity: { kind: 'mission', tracks: ['informatics', 'computational-thinking', 'ai-basics'], count: 9 }, required: true }],
      unlockAfter: ['g3-debug-bridge', 'g3-ai-perception'], x: 56, y: 92,
    },
  ],
}

export const GRADE4_PATH: GradePathMap = {
  grade: 4,
  version: 1,
  title: 'Шлях 4 класу',
  points: [
    {
      id: 'g4-safety-start', title: 'Захисти цифровий світ', icon: '🛡️',
      curriculum: [{ track: 'informatics', topic: 'digital-safety' }],
      activities: [{ id: 'digital-safety-mission', version: 1, title: 'Цифровий захисник', activity: { kind: 'mission', track: 'informatics', topic: 'digital-safety', count: 6 }, required: true }],
      unlockAfter: [], x: 50, y: 6,
    },
    {
      id: 'g4-networks', title: 'Як мандрують повідомлення', icon: '🌐',
      curriculum: [{ track: 'informatics', topic: 'networks-internet' }],
      activities: [{ id: 'networks-mission', version: 1, title: 'Місія про мережі', activity: { kind: 'mission', track: 'informatics', topic: 'networks-internet', count: 6 }, required: true }],
      unlockAfter: ['g4-safety-start'], x: 18, y: 27,
    },
    {
      id: 'g4-efficiency', title: 'Обери кращий алгоритм', icon: '⚡',
      curriculum: [{ track: 'computational-thinking', topic: 'efficiency' }],
      activities: [{ id: 'efficiency-mission', version: 1, title: 'Швидше й простіше', activity: { kind: 'mission', track: 'computational-thinking', topic: 'efficiency', count: 6 }, required: true }],
      unlockAfter: ['g4-safety-start'], x: 50, y: 28,
    },
    {
      id: 'g4-information-trust', title: 'Перевір, перш ніж довіряти', icon: '🔎',
      curriculum: [
        { track: 'informatics', topic: 'information' },
        { track: 'ai-basics', topic: 'ai-ethics-safety' },
      ],
      activities: [{ id: 'fact-opinion-l2', version: 1, title: 'Факт, думка чи міф', activity: { kind: 'fact-opinion', level: 2 }, required: true }],
      unlockAfter: ['g4-safety-start'], x: 82, y: 27,
    },
    {
      id: 'g4-software', title: 'Підготуй комп’ютер до роботи', icon: '💻',
      curriculum: [{ track: 'informatics', topic: 'computer-systems' }],
      activities: [{ id: 'assembly-software', version: 1, title: 'Встанови систему й програми', activity: { kind: 'simulator', scenario: 'software' }, required: true }],
      unlockAfter: ['g4-networks'], x: 17, y: 54,
    },
    {
      id: 'g4-debugging', title: 'Полювання на помилки', icon: '🐞',
      curriculum: [{ track: 'computational-thinking', topic: 'debugging' }],
      activities: [{ id: 'debug-puzzles', version: 1, title: 'Знайди помилку', activity: { kind: 'puzzles', count: 5 }, required: true }],
      unlockAfter: ['g4-efficiency'], x: 50, y: 55,
    },
    {
      id: 'g4-ai-ethics', title: 'Коли ШІ може помилятися', icon: '⚖️',
      curriculum: [{ track: 'ai-basics', topic: 'ai-ethics-safety' }],
      activities: [{ id: 'ai-ethics-mission', version: 1, title: 'Відповідальний ШІ', activity: { kind: 'mission', track: 'ai-basics', topic: 'ai-ethics-safety', count: 6 }, required: true }],
      unlockAfter: ['g4-information-trust'], x: 83, y: 54,
    },
    {
      id: 'g4-data-ai-bridge', title: 'Дані навчають ШІ', icon: '🗂️',
      curriculum: [
        { track: 'informatics', topic: 'data' },
        { track: 'ai-basics', topic: 'how-ai-learns' },
      ],
      activities: [{ id: 'data-ai-mission', version: 1, title: 'Які дані потрібні ШІ', activity: { kind: 'mission', tracks: ['informatics', 'ai-basics'], count: 6 }, required: true }],
      unlockAfter: ['g4-software', 'g4-information-trust'], x: 30, y: 76,
    },
    {
      id: 'g4-final', title: 'Фінал цифрового дослідника', icon: '🏆',
      curriculum: [
        { track: 'informatics', topic: 'networks-internet' },
        { track: 'computational-thinking', topic: 'debugging' },
        { track: 'ai-basics', topic: 'ai-ethics-safety' },
      ],
      activities: [{ id: 'final-three-tracks', version: 1, title: 'Фінальна місія', activity: { kind: 'mission', tracks: ['informatics', 'computational-thinking', 'ai-basics'], count: 9 }, required: true }],
      unlockAfter: ['g4-data-ai-bridge', 'g4-debugging', 'g4-ai-ethics'], x: 56, y: 93,
    },
  ],
}

// Grade 2 live island 1: information, trust, and safe checking. Later islands
// will add the broader computational-thinking and AI track arcs from the yearly plan.

export const GRADE2_PATH: GradePathMap = {
  grade: 2,
  version: 4,
  title: 'Шлях 2 класу',
  points: [
    {
      id: 'g2-info-start',
      title: 'Як ми отримуємо інформацію',
      icon: '📡',
      curriculum: [{ track: 'informatics', topic: 'information' }],
      activities: [
        { id: 'theory', version: 2, title: 'Теорія', activity: { kind: 'lesson', lessonId: 'info-questions-g2' }, required: true },
        { id: 'infosort', version: 1, title: 'ІнфоСорт', activity: { kind: 'sorting', game: 'infosort' }, required: true },
      ],
      unlockAfter: [],
      x: 50, y: 8,
    },
    {
      id: 'g2-info-presentation',
      title: 'Подай інформацію по-різному',
      icon: '🎨',
      curriculum: [{ track: 'informatics', topic: 'information' }],
      activities: [{ id: 'presentation-mission', version: 1, title: 'Способи подання', activity: { kind: 'mission', track: 'informatics', topic: 'information', count: 4 }, required: true }],
      unlockAfter: ['g2-info-start'],
      x: 6, y: 31,
    },
    {
      id: 'g2-info-processes',
      title: 'Дії з інформацією',
      icon: '🔄',
      curriculum: [{ track: 'informatics', topic: 'information' }],
      activities: [{ id: 'processes-mission', version: 1, title: 'Отримай, збережи, передай', activity: { kind: 'mission', track: 'informatics', topic: 'information', count: 4 }, required: true }],
      unlockAfter: ['g2-info-presentation'],
      x: 66, y: 36,
    },
    {
      id: 'g2-info-signs-carriers',
      title: 'Знаки й носії',
      icon: '🪧',
      curriculum: [{ track: 'informatics', topic: 'information' }],
      activities: [{ id: 'infosort', version: 1, title: 'ІнфоСорт', activity: { kind: 'sorting', game: 'infosort' }, required: true }],
      unlockAfter: ['g2-info-processes'],
      x: 84, y: 53,
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
      unlockAfter: ['g2-info-signs-carriers'],
      x: 40, y: 66,
    },
    {
      id: 'g2-info-check-protect',
      title: 'Перевіряємо і захищаємося',
      icon: '🛡️',
      curriculum: [
        { track: 'informatics', topic: 'information' },
        { track: 'informatics', topic: 'digital-safety' },
      ],
      activities: [
        { id: 'theory', version: 2, title: 'Теорія', activity: { kind: 'lesson', lessonId: 'safety-personal-data-footprint-g2' }, required: true },
        { id: 'safety-scenarios', version: 1, title: 'Як вчинити?', activity: { kind: 'scenarios', count: 3 }, required: true },
      ],
      unlockAfter: ['g2-fact-opinion'],
      x: 16, y: 81,
    },
    {
      id: 'g2-info-check',
      title: 'Детектив фактів',
      icon: '🧭',
      curriculum: [
        { track: 'informatics', topic: 'information' },
        { track: 'ai-basics', topic: 'ai-ethics-safety' },
      ],
      activities: [{ id: 'info-check-mission', version: 1, title: 'Тематична перевірка', activity: { kind: 'mission', track: 'informatics', topic: 'information', count: 6 }, required: true }],
      unlockAfter: ['g2-info-check-protect'],
      x: 56, y: 93,
    },
    {
      id: 'g2-review-info-1',
      title: 'Згадай факти й повідомлення',
      icon: '🔁',
      curriculum: [
        { track: 'informatics', topic: 'information' },
        { track: 'computational-thinking', topic: 'classification' },
        { track: 'ai-basics', topic: 'ai-ethics-safety' },
      ],
      activities: [{ id: 'review-info-mission', version: 1, title: 'Повторення', activity: { kind: 'mission', tracks: ['informatics', 'computational-thinking', 'ai-basics'], count: 6 }, required: true }],
      unlockAfter: ['g2-info-check'],
      x: 91, y: 76,
    },
  ],
}

export const PATHS_BY_GRADE: Record<number, GradePathMap> = {
  1: GRADE1_PATH,
  2: GRADE2_PATH,
  3: GRADE3_PATH,
  4: GRADE4_PATH,
}

/** Точка доступна, якщо всі unlockAfter завершені. */
export function isUnlocked(point: PathPoint, completed: ReadonlySet<string>): boolean {
  return point.unlockAfter.every(id => completed.has(id))
}
