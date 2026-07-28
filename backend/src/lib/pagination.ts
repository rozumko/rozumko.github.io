// Server-side paging for admin lists. The payload is the cost — a bank of a few
// thousand questions is megabytes of jsonb before the browser draws anything —
// so list routes never answer with more than one page.

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 200

/** Query params every paginated list route accepts. Spread into an existing
 *  querystring schema, or used on its own when a route has no other filters. */
export const paginationProperties = {
  limit:  { type: 'integer', minimum: 1, maximum: MAX_PAGE_SIZE },
  offset: { type: 'integer', minimum: 0 },
} as const

export const paginationQuerystring = {
  type: 'object',
  additionalProperties: false,
  properties: paginationProperties,
} as const

export interface PageRange {
  limit: number
  offset: number
}

/** What the client needs to draw a pager: the page it got and the size of the
 *  whole filtered set behind it. */
export interface PageInfo extends PageRange {
  total: number
}

/** The schema clamps limit and offset before this runs; the guards here keep
 *  the helper safe for callers that build a range themselves. */
export function pageRange(query: { limit?: number; offset?: number }): PageRange {
  const limit = Number.isInteger(query.limit)
    ? Math.min(Math.max(query.limit as number, 1), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE
  const offset = Number.isInteger(query.offset) && (query.offset as number) > 0
    ? (query.offset as number)
    : 0
  return { limit, offset }
}

export function pageInfo(range: PageRange, total: number): PageInfo {
  return { total, limit: range.limit, offset: range.offset }
}
