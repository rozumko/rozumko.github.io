import type { MissionSummary } from '../missions/mission-result.js'
import type { SortingSummary } from '../games/sorting-game.js'
import type { LessonSummary } from '../lessons/lesson-data.js'
import type { CurriculumTag } from './path-data.js'

// Єдиний контракт «активність завершена» для карти шляху (Home Mode).
// Клієнтський і безключовий: жодних відповідей чи балів, лише навчальний
// підсумок (зірки/кількість). Джерела: mission-runner, sorting-game,
// puzzle-engine — кожен зі своїм адаптером нижче.

export type ActivityType = 'mission' | 'game' | 'puzzle' | 'lesson'

export interface ActivityResult {
  activityType: ActivityType
  /** Стабільний id активності, напр. 'game:attributes', 'mission:demo-informatics'. */
  activityId: string
  /** Immutable content version used to interpret attempts after releases. */
  activityVersion: number
  /** Exact revision of referenced external content, such as a micro-lesson. */
  contentVersion?: number
  grade: number | null
  curriculum: CurriculumTag[]
  /** Browser results are practice evidence, never trusted certification. */
  trust: 'client-unverified'
  /** 0..3 (0 — завершено, але без досягнення; місії так уміють). */
  stars: number
  correct: number
  total: number
  durationSec: number | null
  /** ISO-час завершення; разом з activityId — ключ ідемпотентності. */
  completedAt: string
}

/** Контекст точки шляху, який рушії активностей не знають самі. */
export interface ActivityContext {
  activityId: string
  activityVersion: number
  contentVersion?: number
  grade?: number
  curriculum: CurriculumTag[]
  durationSec?: number
  /** Для тестів; за замовчуванням — поточний час. */
  now?: () => Date
}

function clampStars(stars: number): number {
  return Math.max(0, Math.min(3, Math.floor(stars)))
}

/**
 * Зірки місії за відсотком. Пороги мусять збігатися з
 * mission-result.starRating (звірено тестом у progress-store.test.mjs);
 * без runtime-імпорту, щоб модуль лишався тестованим листком (node --test
 * не резолвить './x.js' → './x.ts').
 */
export function missionStars(percent: number): number {
  if (percent >= 90) return 3
  if (percent >= 70) return 2
  if (percent >= 40) return 1
  return 0
}

function base(activityType: ActivityType, ctx: ActivityContext) {
  return {
    activityType,
    activityId: ctx.activityId,
    activityVersion: ctx.activityVersion,
    ...(ctx.contentVersion !== undefined ? { contentVersion: ctx.contentVersion } : {}),
    grade: ctx.grade ?? null,
    curriculum: ctx.curriculum.map(tag => ({ ...tag })),
    trust: 'client-unverified' as const,
    durationSec: ctx.durationSec ?? null,
    completedAt: (ctx.now ? ctx.now() : new Date()).toISOString(),
  }
}

/** Адаптер sorting-game: onComplete(SortingSummary) → ActivityResult. */
export function fromSortingSummary(s: SortingSummary, ctx: ActivityContext): ActivityResult {
  const total = Math.max(0, s.totalItems)
  return {
    ...base('game', ctx),
    stars: clampStars(s.stars),
    correct: Math.max(0, total - Math.max(0, s.mistakes)),
    total,
  }
}

/** Підсумок сесії головоломок (див. onComplete у puzzle-engine). */
export interface PuzzleSummary {
  correct: number
  total: number
  stars: number
}

/** Адаптер puzzle-engine: onComplete(PuzzleSummary) → ActivityResult. */
export function fromPuzzleSummary(s: PuzzleSummary, ctx: ActivityContext): ActivityResult {
  return {
    ...base('puzzle', ctx),
    stars: clampStars(s.stars),
    correct: Math.max(0, Math.min(s.correct, s.total)),
    total: Math.max(0, s.total),
  }
}

/** Адаптер ігор із підсумком {correct, total, stars} (напр. «Факт чи думка»). */
export function fromGameSummary(s: PuzzleSummary, ctx: ActivityContext): ActivityResult {
  return { ...fromPuzzleSummary(s, ctx), activityType: 'game' }
}

/**
 * Адаптер lesson-runner: теорія не «завалюється», тому зірки фіксовані (3 за
 * завершення); correct/total мікро-квізу зберігаються як формувальна аналітика.
 */
export function fromLessonSummary(s: LessonSummary, ctx: ActivityContext): ActivityResult {
  return {
    ...base('lesson', ctx),
    stars: 3,
    correct: Math.max(0, Math.min(s.correct, s.total)),
    total: Math.max(0, s.total),
  }
}

/** Адаптер mission-runner: onComplete(MissionSummary) → ActivityResult. */
export function fromMissionSummary(s: MissionSummary, ctx: ActivityContext): ActivityResult {
  return {
    ...base('mission', ctx),
    stars: clampStars(missionStars(s.percent)),
    correct: s.correct,
    total: s.total,
  }
}
