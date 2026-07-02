// Відбір питань для місії — чиста логіка без I/O і без залежностей
// (тестується в Node напряму; static-questions.ts додає fetch-обгортку).

export interface MissionPick {
  count: number
  difficulty?: string | null
}

/** Fisher–Yates + фільтр складності + обрізання до count. Вхід не мутується. */
export function pickMissionQuestions<T extends { difficulty?: string | null }>(
  all: T[],
  { count, difficulty }: MissionPick,
): T[] {
  const pool = difficulty ? all.filter(q => q.difficulty === difficulty) : [...all]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, count)
}
