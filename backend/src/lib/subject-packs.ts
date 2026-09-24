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
}

export const SUBJECT_PACKS: Readonly<Record<string, SubjectPack>> = Object.freeze({
  [INFORMATICS_UA_PRIMARY.id]: INFORMATICS_UA_PRIMARY,
})

export function findSubjectPack(id: string): SubjectPack | null {
  return Object.hasOwn(SUBJECT_PACKS, id) ? SUBJECT_PACKS[id]! : null
}
