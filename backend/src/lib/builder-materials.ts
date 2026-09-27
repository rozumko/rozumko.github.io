// Lesson Builder board materials: validated canvas items, a derived kind for
// filtering and a plain-text search field that never includes file payloads.

import { canvasItemIssues, type CanvasItem, type LessonValidationIssue } from './curriculum-lesson-schema.js'
import type { BuilderMaterialKind } from '../db/schema.js'

export const MAX_BOARD_MATERIALS = 300
export const MAX_MATERIAL_BYTES = 1024 * 1024
const MAX_SEARCH_TEXT = 4000

export class MaterialValidationError extends Error {
  constructor(readonly issues: LessonValidationIssue[]) {
    super('Матеріал не пройшов перевірку')
  }
}

export interface PreparedMaterial {
  title: string
  items: CanvasItem[]
  kind: BuilderMaterialKind
  searchText: string
}

/** Same precedence as the builder UI: the first non-text item decides. */
export function materialKind(items: CanvasItem[]): BuilderMaterialKind {
  const media = items.find(item => !['paragraph', 'heading', 'list', 'table'].includes(item.type))
  if (!media) return 'text'
  if (media.type === 'file') return media.mime === 'application/pdf' ? 'pdf' : 'image'
  return media.type as BuilderMaterialKind
}

export function materialSearchText(title: string, items: CanvasItem[]): string {
  const parts: string[] = [title]
  for (const item of items) {
    switch (item.type) {
      case 'paragraph': case 'heading': parts.push(item.text.uk); break
      case 'list': parts.push(...item.items.map(entry => entry.uk)); break
      case 'table': parts.push(...item.headers.map(h => h.uk), ...item.rows.flat().map(cell => cell.uk)); break
      case 'image': parts.push(item.alt.uk); break
      case 'link': case 'pdf': parts.push(item.label.uk); break
      case 'file': parts.push(item.name.uk); break
      // Authored HTML is code: only its visible text is worth matching.
      case 'html': parts.push(item.html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')); break
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, MAX_SEARCH_TEXT)
}

export function prepareMaterial(input: { title: unknown; items: unknown }): PreparedMaterial {
  const issues: LessonValidationIssue[] = []
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  if (!title || title.length > 200) issues.push({ path: 'title', message: 'must be 1–200 characters' })
  if (Array.isArray(input.items) && input.items.length === 0) issues.push({ path: 'items', message: 'must not be empty' })
  issues.push(...canvasItemIssues(input.items))
  if (!issues.length && Buffer.byteLength(JSON.stringify(input.items), 'utf8') > MAX_MATERIAL_BYTES) {
    issues.push({ path: 'items', message: 'material exceeds 1 MiB' })
  }
  if (issues.length) throw new MaterialValidationError(issues)
  const items = input.items as CanvasItem[]
  return { title, items, kind: materialKind(items), searchText: materialSearchText(title, items) }
}
