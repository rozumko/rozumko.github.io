// Lesson files by content hash (0063). A definition or board material that
// references an asset is accepted only if that exact file exists with the
// declared type: fail-closed, like the rest of the lesson schema.

import { createHash } from 'node:crypto'
import { inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { lessonAssets } from '../db/schema.js'
import type { LessonValidationIssue } from './curriculum-lesson-schema.js'

export const MAX_ASSET_BYTES = 2 * 1024 * 1024

export function assetDigest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export interface AssetRef { path: string; sha256: string; mime: string }

/** Every `{ type: 'asset' }` item anywhere in a value, with its JSON path. */
export function assetRefs(value: unknown, path = ''): AssetRef[] {
  if (Array.isArray(value)) return value.flatMap((entry, i) => assetRefs(entry, `${path}[${i}]`))
  if (!value || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  if (record.type === 'asset' && typeof record.sha256 === 'string' && typeof record.mime === 'string') {
    return [{ path, sha256: record.sha256, mime: record.mime }]
  }
  return Object.entries(record).flatMap(([key, entry]) => assetRefs(entry, path ? `${path}.${key}` : key))
}

type Selectable = Pick<typeof db, 'select'>

/** Issues for references to files that do not exist or whose type differs. */
export async function assetIssues(value: unknown, executor: Selectable = db): Promise<LessonValidationIssue[]> {
  const refs = assetRefs(value)
  if (!refs.length) return []
  const hashes = [...new Set(refs.map(ref => ref.sha256))]
  const rows = await executor.select({ sha256: lessonAssets.sha256, mime: lessonAssets.mime })
    .from(lessonAssets).where(inArray(lessonAssets.sha256, hashes))
  const known = new Map(rows.map(row => [row.sha256, row.mime]))
  return refs
    .filter(ref => known.get(ref.sha256) !== ref.mime)
    .map(ref => ({ path: `${ref.path}.sha256`, message: known.has(ref.sha256) ? 'file type does not match the stored file' : 'file is not in the lesson file storage' }))
}
