import { loadQuestions as apiLoadQuestions } from '../api/client.js'

// mode: 'practice' | 'demo' | 'olympiad'
export async function loadQuestions(grade: number, mode: string, count: number, difficulty: string | null) {
  // demo uses olympiad (isOlympiad=true) hard questions — no answer keys returned
  const isOlympiad = mode === 'olympiad' || mode === 'demo'
  const diff       = mode === 'demo' ? 'hard' : (difficulty ?? undefined)
  const qs = await apiLoadQuestions({ grade, isOlympiad, count, difficulty: diff })
  if (!qs.length) throw new Error(`Питань для ${grade} класу ще немає. Зверніться до вчителя.`)
  return qs
}

export function getModeConfig(mode, event = null) {
  const defaults = {
    practice: { count: 10, timeMinutes: null, showExplanation: true,  saveResult: false },
    demo:     { count: 5,  timeMinutes: 10,   showExplanation: false, saveResult: false },
    olympiad: { count: 10, timeMinutes: 15,   showExplanation: false, saveResult: true  },
  }
  const cfg = { ...defaults[mode] }
  if (!cfg) return null
  if (event && (mode === 'olympiad' || mode === 'demo')) {
    if (event.questionsCount) cfg.count       = event.questionsCount
    if (event.timeMinutes)    cfg.timeMinutes = event.timeMinutes
  }
  return cfg
}
