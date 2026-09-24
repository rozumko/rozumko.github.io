// ── Lesson Engine: subject pack registry ─────────────────────────────────────
// Code-owned registry of subject packs. Subject knowledge (grade range,
// allowlisted external tools) lives here, never in the core lesson schema.
// A lesson whose subjectPackId is not registered cannot be saved or published.

import type { SubjectPack } from './curriculum-lesson-schema.js'

const INFORMATICS_UA_PRIMARY: SubjectPack = {
  id: 'informatics-ua-primary',
  subject: 'informatics',
  title: { uk: 'Розумко Інформатика 1–4', en: 'Rozumko Informatics 1–4' },
  gradeRange: { min: 1, max: 4 },
  curriculumRefs: ['nush-primary', 'cambridge-primary-computing', 'rozumko-ct-taxonomy'],
  externalTools: {
    'itnauka-windows': {
      url: 'https://itnauka.org/services/digital_literacy/mouse_skills/windows/index.html',
      integration: 'launch-only',
      title: { uk: 'Швидкісні вікна' },
    },
  },
  // Platform games playable on the board without a School participant.
  // fact-or-opinion is excluded: it fetches statements with a participant token.
  games: [
    'key-puzzle', 'typing-keys', 'typing-words', 'typing-sprint', 'typing-lessons',
    'maze', 'windows', 'mouse-buttons', 'magic-squares', 'symbol-logic',
    'message-coding', 'sorting-station', 'precise-click', 'tangram', 'fireflies',
  ],
  // Internal outcomes for the pilot lessons. NUSH / Cambridge mappings are
  // added here once the methodologist confirms the exact codes — never guessed.
  outcomes: {
    'int-files-name-extension': {
      code: 'INF-2-FILES-1',
      title: { uk: 'Розрізняє ім’я файла та розширення і пояснює, навіщо потрібне розширення' },
      source: 'internal',
      gradeBand: '1-2',
      mappings: [],
    },
    'int-files-organize': {
      code: 'INF-2-FILES-2',
      title: { uk: 'Створює, перейменовує, переміщує та знаходить файли в тематичній папці' },
      source: 'internal',
      gradeBand: '1-2',
      mappings: [],
    },
  },
}

export const SUBJECT_PACKS: Readonly<Record<string, SubjectPack>> = Object.freeze({
  [INFORMATICS_UA_PRIMARY.id]: INFORMATICS_UA_PRIMARY,
})

export function findSubjectPack(id: string): SubjectPack | null {
  return Object.prototype.hasOwnProperty.call(SUBJECT_PACKS, id) ? SUBJECT_PACKS[id]! : null
}
