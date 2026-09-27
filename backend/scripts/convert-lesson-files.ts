// Moves base64 `{ type: 'file' }` items out of lesson drafts and builder board
// materials into lesson_assets (0063), replacing them with `{ type: 'asset' }`
// references. Dry run by default; `--apply` writes.
//
//   npx tsx scripts/convert-lesson-files.ts            # report only
//   npx tsx scripts/convert-lesson-files.ts --apply    # convert
//
// Published snapshots and revisions are immutable (database triggers) and keep
// their embedded files; a lesson becomes lighter with its next publish. Each
// converted draft gets edit_version + 1 and an 'update' revision, so an editor
// with the lesson open is told it changed; status and content_version stay.

import 'dotenv/config'
import { eq, and } from 'drizzle-orm'
import { db, pool } from '../src/db/index.js'
import { builderMaterials, curriculumLessonRevisions, curriculumLessons, lessonAssets } from '../src/db/schema.js'
import { fileSignatureMatches } from '../src/lib/curriculum-lesson-schema.js'
import { assetDigest, MAX_ASSET_BYTES } from '../src/lib/lesson-assets.js'
import { curriculumRevisionSnapshot } from '../src/routes/curriculum-editorial.js'

const apply = process.argv.includes('--apply')

interface Found { sha256: string; mime: string; bytes: Buffer }

/** Replaces embedded files in a JSON value; returns the new value and the files found. */
function convert(value: unknown, found: Found[], problems: string[], path = ''): unknown {
  if (Array.isArray(value)) return value.map((entry, i) => convert(entry, found, problems, `${path}[${i}]`))
  if (!value || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  if (record.type === 'file' && typeof record.data === 'string' && typeof record.mime === 'string') {
    const bytes = Buffer.from(record.data, 'base64')
    if (!bytes.length || bytes.length > MAX_ASSET_BYTES || !fileSignatureMatches(record.mime, bytes)) {
      problems.push(`${path}: not a valid ${record.mime}; left as is`)
      return value
    }
    const sha256 = assetDigest(bytes)
    found.push({ sha256, mime: record.mime, bytes })
    return { type: 'asset', sha256, mime: record.mime, name: record.name }
  }
  return Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, convert(entry, found, problems, path ? `${path}.${key}` : key)]))
}

async function main() {
  const unique = new Map<string, Found>()
  let lessonCount = 0
  let materialCount = 0
  let embeddedBytes = 0
  const problems: string[] = []

  const lessons = await db.select().from(curriculumLessons)
  for (const lesson of lessons) {
    const found: Found[] = []
    const draft = convert(lesson.draftContent, found, problems, `lesson ${lesson.id}`)
    if (!found.length) continue
    lessonCount++
    for (const file of found) { unique.set(file.sha256, file); embeddedBytes += file.bytes.length }
    console.log(`lesson ${lesson.id} (${lesson.status}): ${found.length} file(s)`)
    if (!apply) continue
    await db.transaction(async tx => {
      for (const file of found) {
        await tx.insert(lessonAssets).values({ sha256: file.sha256, mime: file.mime, bytes: file.bytes, size: file.bytes.length }).onConflictDoNothing()
      }
      const [row] = await tx.update(curriculumLessons)
        .set({ draftContent: draft as Record<string, unknown>, editVersion: lesson.editVersion + 1, updatedAt: new Date() })
        .where(and(eq(curriculumLessons.id, lesson.id), eq(curriculumLessons.editVersion, lesson.editVersion))).returning()
      if (!row) throw new Error(`lesson ${lesson.id} changed while converting; run again`)
      await tx.insert(curriculumLessonRevisions).values({
        lessonId: row.id, editVersion: row.editVersion, action: 'update', snapshot: curriculumRevisionSnapshot(row), changedBy: null,
      })
    })
  }

  const materials = await db.select().from(builderMaterials)
  for (const material of materials) {
    const found: Found[] = []
    const items = convert(material.items, found, problems, `material ${material.id}`)
    if (!found.length) continue
    materialCount++
    for (const file of found) { unique.set(file.sha256, file); embeddedBytes += file.bytes.length }
    console.log(`board material ${material.id} «${material.title}»: ${found.length} file(s)`)
    if (!apply) continue
    await db.transaction(async tx => {
      for (const file of found) {
        await tx.insert(lessonAssets).values({ sha256: file.sha256, mime: file.mime, bytes: file.bytes, size: file.bytes.length }).onConflictDoNothing()
      }
      await tx.update(builderMaterials).set({ items: items as unknown[], updatedAt: new Date() }).where(eq(builderMaterials.id, material.id))
    })
  }

  const storedBytes = [...unique.values()].reduce((sum, file) => sum + file.bytes.length, 0)
  console.log(`\n${apply ? 'Converted' : 'Would convert'}: ${lessonCount} lesson draft(s), ${materialCount} board material(s)`)
  console.log(`Embedded copies: ${(embeddedBytes / 1024).toFixed(0)} KiB → unique files: ${unique.size} (${(storedBytes / 1024).toFixed(0)} KiB)`)
  for (const problem of problems) console.log(`skipped ${problem}`)
  if (!apply) console.log('\nDry run. Re-run with --apply to write.')
}

main().catch(err => { console.error(err); process.exitCode = 1 }).finally(() => pool.end())
