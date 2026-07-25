// Відбір питань для місії — чиста логіка без I/O і без залежностей
// (тестується в Node напряму; static-questions.ts додає fetch-обгортку).

export interface MissionPick {
  count: number
  difficulty?: string | null
  track?: string | null
  topic?: string | null
  /**
   * Preferred progression band (recognize → apply → reason), so a point can
   * open on recall and finish on reasoning instead of drawing at random.
   *
   * A PREFERENCE, not a filter, and deliberately so: within one topic each band
   * holds 1–5 questions, and some hold none at all (`ai-ethics-safety` has no
   * `recognize`, `information` has only `recognize`). Filtering would return
   * fewer questions than the mission asked for, or none.
   */
  band?: string | null
}

type Pickable = {
  difficulty?: string | null
  track?: string | null
  topic?: string | null
  progressionBand?: string | null
}

/**
 * Fisher–Yates + фільтри (track/topic/difficulty) + пріоритет band + обрізання
 * до count. Вхід не мутується.
 */
export function pickMissionQuestions<T extends Pickable>(
  all: T[],
  { count, difficulty, track, topic, band }: MissionPick,
): T[] {
  const pool = all.filter(q =>
    (!difficulty || q.difficulty === difficulty) &&
    (!track      || q.track === track) &&
    (!topic      || q.topic === topic)
  )
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  if (!band) return pool.slice(0, count)

  // Stable partition: the shuffle above still decides order inside each group,
  // so repeat runs stay varied while the band leads.
  const preferred = pool.filter(q => q.progressionBand === band)
  const rest = pool.filter(q => q.progressionBand !== band)
  return [...preferred, ...rest].slice(0, count)
}
