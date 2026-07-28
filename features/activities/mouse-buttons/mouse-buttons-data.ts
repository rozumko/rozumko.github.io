// Content for «Ліва і права кнопки миші»: what falls down the road and how
// fast, per level. Ported from the standalone game at itnauka.org.
//
// The point of the activity is the two mouse buttons — left steers left, right
// steers right — so the obstacles exist to give the child a reason to press
// them. Icons are emoji: the original used an icon font from a CDN.

export interface RoadObject {
  type: 'obstacle' | 'bonus'
  kind?: 'star' | 'bolt'
  icon: string
  /** Relative spawn frequency before the level multipliers apply. */
  weight: number
  /** Bonus only: slows the world down for a moment. */
  effect?: 'slow'
}

export const ROAD_OBJECTS: readonly RoadObject[] = [
  { type: 'obstacle', icon: '🚧', weight: 3 },
  { type: 'obstacle', icon: '⛰️', weight: 3 },
  { type: 'obstacle', icon: '🚗', weight: 2 },
  { type: 'obstacle', icon: '📦', weight: 3 },
  { type: 'bonus', kind: 'star', icon: '⭐', weight: 2 },
  { type: 'bonus', kind: 'bolt', icon: '⚡', weight: 1, effect: 'slow' },
]

export interface MouseLevel {
  id: string
  label: string
  /** How long the run lasts. */
  timeLimitSec: number
  /** Starting fall speed in px/s and how it ramps up. */
  baseSpeed: number
  speedInc: number
  /** Obstacles avoided between speed increases. */
  speedStep: number
  /** Spawn interval, tightening towards minSpawnMs. */
  spawnMs: number
  minSpawnMs: number
  tighten: number
  obstacleMult: number
  bonusMult: number
  slowFactor: number
  slowMs: number
  /** Opening grace period where only bonuses spawn, so steering is learned first. */
  tutorialMs: number
}

// The standalone game also had a «Вільний» mode with no time limit. A class
// activity has to end on its own, so only the two timed levels ship.
export const MOUSE_LEVELS: Record<string, MouseLevel> = {
  beginner: {
    id: 'beginner',
    label: 'Початківець',
    timeLimitSec: 75,
    baseSpeed: 220, speedInc: 10, speedStep: 8,
    spawnMs: 1600, minSpawnMs: 750, tighten: 3,
    obstacleMult: 0.85, bonusMult: 1.4,
    slowFactor: 0.55, slowMs: 3200,
    tutorialMs: 15_000,
  },
  master: {
    id: 'master',
    label: 'Майстер',
    timeLimitSec: 180,
    baseSpeed: 520, speedInc: 26, speedStep: 5,
    spawnMs: 950, minSpawnMs: 360, tighten: 7,
    obstacleMult: 1.22, bonusMult: 0.85,
    slowFactor: 0.7, slowMs: 2200,
    tutorialMs: 0,
  },
}

export const MOUSE_LANES = 3

export function mouseLevel(id: string): MouseLevel | null {
  return Object.prototype.hasOwnProperty.call(MOUSE_LEVELS, id) ? MOUSE_LEVELS[id]! : null
}
