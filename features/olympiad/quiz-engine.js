// Завантажує питання для класу та режиму.
// Основне джерело: Firestore (olympiad_questions).
// Fallback: JS-модулі (якщо Firestore порожній для цього класу/режиму).

import { getQuizQuestions } from '../../services/questions.js';

const PRACTICE_MODULES = {
  1: () => import('../../data/questions/informatics/grade1.js'),
  2: () => import('../../data/questions/informatics/grade2.js'),
  3: () => import('../../data/questions/informatics/grade3.js'),
  4: () => import('../../data/questions/informatics/grade4.js'),
};

const OLYMPIAD_MODULES = {
  1: () => import('../../data/questions/informatics/grade1-olympiad.js'),
  2: () => import('../../data/questions/informatics/grade2-olympiad.js'),
  3: () => import('../../data/questions/informatics/grade3-olympiad.js'),
  4: () => import('../../data/questions/informatics/grade4-olympiad.js'),
};

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

  // Спробуємо Firestore
  try {
    const qs = await getQuizQuestions(grade, isOlympiad);
    if (qs.length > 0) {
      return shuffle(qs).slice(0, Math.min(count, qs.length));
    }
  } catch (err) {
    console.warn('[quiz-engine] Firestore недоступний, fallback до JS-модулів:', err?.message ?? err);
  }

  // Fallback до JS-модулів
  const modules = isOlympiad ? OLYMPIAD_MODULES : PRACTICE_MODULES;
  const loader  = modules[grade];
  if (!loader) throw new Error(`Питань для ${grade} класу не знайдено.`);
  const { questions } = await loader();
  if (!questions?.length) throw new Error('Банк питань порожній.');
  return shuffle(questions).slice(0, Math.min(count, questions.length));
}

// Повертає конфіг режиму.
// event — документ з olympiad_events (необов'язково).
// Якщо переданий — його questionsCount і timeMinutes перекривають дефолти
// для режимів 'olympiad' і 'demo'.
export function getModeConfig(mode, event = null) {
  const defaults = {
    practice: { count: 5,  timeMinutes: null, showExplanation: true,  saveResult: false },
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
