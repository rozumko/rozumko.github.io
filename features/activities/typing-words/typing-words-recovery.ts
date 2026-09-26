export interface WordsRecovery {
  version: 1
  level: string
  tasks: string[]
  taskIndex: number
  charIndex: number
  mistakes: number
  durationSec: number
}

/** A checkpoint can only restore the chosen level's own texts and valid positions. */
export function wordsRecovery(value: unknown, level: string, items: readonly string[], total: number): WordsRecovery | null {
  if (!value || typeof value !== 'object') return null
  const state = value as WordsRecovery
  if (state.version !== 1 || state.level !== level || !Array.isArray(state.tasks) || state.tasks.length !== total ||
    !state.tasks.every(task => typeof task === 'string' && items.includes(task))) return null
  if (!Number.isInteger(state.taskIndex) || state.taskIndex < 0 || state.taskIndex > total ||
    !Number.isInteger(state.charIndex) || state.charIndex < 0 || state.charIndex > (state.tasks[state.taskIndex]?.length ?? 0) ||
    !Number.isInteger(state.mistakes) || state.mistakes < 0 || state.mistakes > 9999 ||
    !Number.isInteger(state.durationSec) || state.durationSec < 0 || state.durationSec > 86400) return null
  return state
}
