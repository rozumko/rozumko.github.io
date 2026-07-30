import { loadQuestions as apiLoadQuestions, type Question } from '../api/client.js'
import { getPublicQuestionRequest } from './public-question-policy.js'

export { getPublicQuestionRequest } from './public-question-policy.js'

export interface ModeConfig {
  count:           number
  timeMinutes:     number | null
  showExplanation: boolean
  saveResult:      boolean
}

// mode: 'practice' | 'demo' | 'olympiad'
export async function loadQuestions(grade: number, mode: string, count: number, difficulty: string | null): Promise<Question[]> {
  const request = getPublicQuestionRequest(mode, difficulty)
  const qs = await apiLoadQuestions({ grade, count, ...request })
  if (!qs.length) throw new Error(`Питань для ${grade} класу ще немає. Зверніться до вчителя.`)
  return qs
}

export function getModeConfig(mode: string, event: { questionsCount?: number; timeMinutes?: number } | null = null): ModeConfig {
  const defaults: Record<string, ModeConfig> = {
    practice: { count: 10, timeMinutes: null, showExplanation: true,  saveResult: false },
    demo:     { count: 12, timeMinutes: 20,   showExplanation: false, saveResult: false },
    olympiad: { count: 24, timeMinutes: 45,   showExplanation: false, saveResult: true  },
  }
  const cfg = { ...defaults[mode] }
  if (!cfg) return defaults['practice']
  if (event && (mode === 'olympiad' || mode === 'demo')) {
    if (event.questionsCount) cfg.count       = event.questionsCount
    if (event.timeMinutes)    cfg.timeMinutes = event.timeMinutes
  }
  return cfg
}
