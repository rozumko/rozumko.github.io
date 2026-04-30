// Завантажує питання для класу та режиму з Firestore (olympiad_questions).

import { getQuizQuestions } from '../../services/questions.js';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// mode: 'practice' | 'demo' | 'olympiad'
export async function loadQuestions(grade, mode, count) {
  const isOlympiad = mode === 'olympiad';
  const qs = await getQuizQuestions(grade, isOlympiad);
  if (!qs.length) throw new Error(`Питань для ${grade} класу ще немає. Зверніться до вчителя.`);
  return shuffle(qs).slice(0, Math.min(count, qs.length));
}

// Повертає конфіг режиму.
// event — документ з olympiad_events (необов'язково).
// Якщо переданий — його questionsCount і timeMinutes перекривають дефолти
// для режимів 'olympiad' і 'demo'.
export function getModeConfig(mode, event = null) {
  const defaults = {
    practice: { count: 10, timeMinutes: null, showExplanation: true,  saveResult: false },
    demo:     { count: 5,  timeMinutes: 10,   showExplanation: false, saveResult: false },
    olympiad: { count: 10, timeMinutes: 15,   showExplanation: false, saveResult: true  },
  };
  const cfg = { ...defaults[mode] };
  if (!cfg) return null;
  if (event && (mode === 'olympiad' || mode === 'demo')) {
    if (event.questionsCount) cfg.count       = event.questionsCount;
    if (event.timeMinutes)    cfg.timeMinutes = event.timeMinutes;
  }
  return cfg;
}
