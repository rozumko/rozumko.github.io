// Runtime join of the code-owned subject pack registry with the outcome
// directory (curriculum_outcomes). Every consumer that needs a pack's
// outcomes — lesson save/publish validation and the lesson report — resolves
// the pack through here.

import { asc, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { curriculumOutcomes } from '../db/schema.js'
import type { SubjectPack } from './curriculum-lesson-schema.js'
import { outcomeRegistry } from './curriculum-outcome-rules.js'
import { findSubjectPack, withOutcomes } from './subject-packs.js'

/**
 * The pack with its outcomes, or null for an unregistered pack. Validation of
 * new content uses active outcomes only; reports include archived ones so old
 * evidence keeps its title.
 */
export async function resolveSubjectPack(
  packId: string | null,
  options: { includeArchived: boolean },
): Promise<SubjectPack | null> {
  const entry = packId ? findSubjectPack(packId) : null
  if (!entry) return null
  const rows = await db.select().from(curriculumOutcomes)
    .where(eq(curriculumOutcomes.subjectPackId, entry.id))
    .orderBy(asc(curriculumOutcomes.code))
  return withOutcomes(entry, outcomeRegistry(rows, options))
}
