import { loadQuestions as apiLoadQuestions, type Question } from '../api/client.js'

export interface ModeConfig {
  count:           number
  timeMinutes:     number | null
  showExplanation: boolean
  saveResult:      boolean
}

// mode: 'practice' | 'demo' | 'olympiad'
export async function loadQuestions(grade: number, mode: string, count: number, difficulty: string | null): Promise<Question[]> {
  // Публічний API видає лише тренувальні питання. У demo ховаємо ключі відповідей.
  const hideAnswers = mode === 'demo'
  const diff       = mode === 'demo' ? 'hard' : (difficulty ?? undefined)
  const qs = await apiLoadQuestions({ grade, isOlympiad: false, count, difficulty: diff, hideAnswers })
  if (!qs.length) throw new Error(`Питань для ${grade} класу ще немає. Зверніться до вчителя.`)
  return qs
}

export function getModeConfig(mode: string, event: { questionsCount?: number; timeMinutes?: number } | null = null): ModeConfig {
  const defaults: Record<string, ModeConfig> = {
    practice: { count: 10, timeMinutes: null, showExplanation: true,  saveResult: false },
    demo:     { count: 5,  timeMinutes: 10,   showExplanation: false, saveResult: false },
    olympiad: { count: 10, timeMinutes: 15,   showExplanation: false, saveResult: true  },
  }
  const cfg = { ...defaults[mode] }
  if (!cfg) return defaults['practice']
  if (event && (mode === 'olympiad' || mode === 'demo')) {
    if (event.questionsCount) cfg.count       = event.questionsCount
    if (event.timeMinutes)    cfg.timeMinutes = event.timeMinutes
  }
  return cfg
}
