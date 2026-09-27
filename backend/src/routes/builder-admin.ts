// Lesson Builder boards API: a teacher's topic boards of collected materials.
// Admin-only while the builder is; every query is scoped to the caller's own
// rows (owner_id), so a foreign ID is indistinguishable from a missing one.
// Materials are validated canvas items; scored activities never live here.

import type { FastifyInstance, FastifyReply, preHandlerAsyncHookHandler } from 'fastify'
import { and, count, desc, eq, ilike, inArray, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { builderBoards, builderMaterials } from '../db/schema.js'
import { requireAdmin } from '../lib/auth.js'
import { isLessonEngineEnabled } from '../lib/lesson-engine-flag.js'
import { MAX_BOARD_MATERIALS, MaterialValidationError, prepareMaterial } from '../lib/builder-materials.js'
import { assetIssues } from '../lib/lesson-assets.js'

const MAX_BOARDS = 100
const uuid = { type: 'string', format: 'uuid' } as const
const coordinate = { type: 'integer', minimum: -100000, maximum: 100000 } as const
const idParams = { type: 'object', required: ['id'], properties: { id: uuid } } as const
const boardTitle = { type: 'string', minLength: 1, maxLength: 120 } as const
const MATERIAL_BODY_LIMIT = 1536 * 1024

const MATERIAL_COLUMNS = {
  id: builderMaterials.id,
  boardId: builderMaterials.boardId,
  title: builderMaterials.title,
  kind: builderMaterials.kind,
  items: builderMaterials.items,
  x: builderMaterials.x,
  y: builderMaterials.y,
  updatedAt: builderMaterials.updatedAt,
}

function sendError(reply: FastifyReply, err: unknown) {
  if (err instanceof MaterialValidationError) return reply.code(400).send({ error: err.message, issues: err.issues })
  throw err
}

/** `%` and `_` typed by a teacher are literal characters, not wildcards. */
function likePattern(query: string): string {
  return `%${query.toLowerCase().replace(/[\\%_]/g, char => `\\${char}`)}%`
}

async function ownBoard(ownerId: string, boardId: string) {
  const [board] = await db.select({ id: builderBoards.id }).from(builderBoards)
    .where(and(eq(builderBoards.id, boardId), eq(builderBoards.ownerId, ownerId))).limit(1)
  return board ?? null
}

async function touchBoard(boardId: string) {
  await db.update(builderBoards).set({ updatedAt: new Date() }).where(eq(builderBoards.id, boardId))
}

export interface BuilderAdminOptions {
  /** Tests only; production registers without options and gets requireAdmin. */
  authenticate?: preHandlerAsyncHookHandler
}

export async function builderAdminRoutes(app: FastifyInstance, options: BuilderAdminOptions = {}) {
  // Same gate as the rest of the Lesson Engine: dark before validation or auth.
  app.addHook('onRequest', async (_req, reply) => {
    if (!isLessonEngineEnabled()) return reply.code(404).send({ error: 'Not Found' })
  })
  app.addHook('preHandler', options.authenticate ?? requireAdmin)

  // GET /api/admin/builder/boards — the caller's boards, most recent first
  app.get('/boards', async (req, reply) => {
    const boards = await db.select({
      id: builderBoards.id,
      title: builderBoards.title,
      updatedAt: builderBoards.updatedAt,
      materialCount: sql<number>`(select count(*)::int from builder_materials m where m.board_id = ${builderBoards.id})`,
    }).from(builderBoards).where(eq(builderBoards.ownerId, req.user!.id)).orderBy(desc(builderBoards.updatedAt))
    return reply.send({ boards })
  })

  app.post<{ Body: { title: string } }>('/boards', {
    schema: { body: { type: 'object', required: ['title'], additionalProperties: false, properties: { title: boardTitle } } },
  }, async (req, reply) => {
    const title = req.body.title.trim()
    if (!title) return reply.code(400).send({ error: 'Назва дошки не може бути порожньою.' })
    const [{ total }] = await db.select({ total: count() }).from(builderBoards).where(eq(builderBoards.ownerId, req.user!.id))
    if (total >= MAX_BOARDS) return reply.code(409).send({ error: `Можна мати до ${MAX_BOARDS} дошок.` })
    const [board] = await db.insert(builderBoards).values({ ownerId: req.user!.id, title })
      .returning({ id: builderBoards.id, title: builderBoards.title, updatedAt: builderBoards.updatedAt })
    return reply.code(201).send({ board: { ...board, materialCount: 0 } })
  })

  app.patch<{ Params: { id: string }; Body: { title: string } }>('/boards/:id', {
    schema: { params: idParams, body: { type: 'object', required: ['title'], additionalProperties: false, properties: { title: boardTitle } } },
  }, async (req, reply) => {
    const title = req.body.title.trim()
    if (!title) return reply.code(400).send({ error: 'Назва дошки не може бути порожньою.' })
    const [board] = await db.update(builderBoards).set({ title, updatedAt: new Date() })
      .where(and(eq(builderBoards.id, req.params.id), eq(builderBoards.ownerId, req.user!.id)))
      .returning({ id: builderBoards.id, title: builderBoards.title, updatedAt: builderBoards.updatedAt })
    if (!board) return reply.code(404).send({ error: 'Дошку не знайдено' })
    return reply.send({ board })
  })

  // Deleting a board removes its materials (ON DELETE CASCADE); lessons keep their own copies.
  app.delete<{ Params: { id: string } }>('/boards/:id', { schema: { params: idParams } }, async (req, reply) => {
    const deleted = await db.delete(builderBoards)
      .where(and(eq(builderBoards.id, req.params.id), eq(builderBoards.ownerId, req.user!.id)))
      .returning({ id: builderBoards.id })
    if (!deleted.length) return reply.code(404).send({ error: 'Дошку не знайдено' })
    return reply.code(204).send()
  })

  app.get<{ Params: { id: string } }>('/boards/:id/materials', { schema: { params: idParams } }, async (req, reply) => {
    if (!await ownBoard(req.user!.id, req.params.id)) return reply.code(404).send({ error: 'Дошку не знайдено' })
    const materials = await db.select(MATERIAL_COLUMNS).from(builderMaterials)
      .where(and(eq(builderMaterials.boardId, req.params.id), eq(builderMaterials.ownerId, req.user!.id)))
    return reply.send({ materials })
  })

  // GET /api/admin/builder/materials?q= — search across all of the caller's boards
  app.get<{ Querystring: { q: string } }>('/materials', {
    schema: { querystring: { type: 'object', required: ['q'], additionalProperties: false, properties: { q: { type: 'string', minLength: 2, maxLength: 100 } } } },
  }, async (req, reply) => {
    const query = req.query.q.trim()
    if (query.length < 2) return reply.code(400).send({ error: 'Введіть щонайменше 2 символи.' })
    const materials = await db.select({ ...MATERIAL_COLUMNS, boardTitle: builderBoards.title }).from(builderMaterials)
      .innerJoin(builderBoards, eq(builderBoards.id, builderMaterials.boardId))
      .where(and(eq(builderMaterials.ownerId, req.user!.id), ilike(builderMaterials.searchText, likePattern(query))))
      .orderBy(desc(builderMaterials.updatedAt)).limit(60)
    return reply.send({ materials })
  })

  app.post<{ Params: { id: string }; Body: { title: string; items: unknown[]; x: number; y: number } }>('/boards/:id/materials', {
    bodyLimit: MATERIAL_BODY_LIMIT,
    schema: {
      params: idParams,
      body: {
        type: 'object', required: ['title', 'items', 'x', 'y'], additionalProperties: false,
        properties: { title: { type: 'string', maxLength: 200 }, items: { type: 'array', maxItems: 20 }, x: coordinate, y: coordinate },
      },
    },
  }, async (req, reply) => {
    try {
      const prepared = prepareMaterial(req.body)
      const missing = await assetIssues(prepared.items)
      if (missing.length) throw new MaterialValidationError(missing)
      if (!await ownBoard(req.user!.id, req.params.id)) return reply.code(404).send({ error: 'Дошку не знайдено' })
      const [{ total }] = await db.select({ total: count() }).from(builderMaterials).where(eq(builderMaterials.boardId, req.params.id))
      if (total >= MAX_BOARD_MATERIALS) return reply.code(409).send({ error: `На дошці може бути до ${MAX_BOARD_MATERIALS} матеріалів. Створіть нову дошку.` })
      const [material] = await db.insert(builderMaterials).values({
        boardId: req.params.id, ownerId: req.user!.id, ...prepared, x: req.body.x, y: req.body.y,
      }).returning(MATERIAL_COLUMNS)
      await touchBoard(req.params.id)
      return reply.code(201).send({ material })
    } catch (err) { return sendError(reply, err) }
  })

  // PATCH /api/admin/builder/materials/:id — edit content, move on the canvas or to another board
  app.patch<{ Params: { id: string }; Body: { title?: string; items?: unknown[]; x?: number; y?: number; boardId?: string } }>('/materials/:id', {
    bodyLimit: MATERIAL_BODY_LIMIT,
    schema: {
      params: idParams,
      body: {
        type: 'object', additionalProperties: false, minProperties: 1,
        properties: { title: { type: 'string', maxLength: 200 }, items: { type: 'array', maxItems: 20 }, x: coordinate, y: coordinate, boardId: uuid },
      },
    },
  }, async (req, reply) => {
    try {
      const ownerId = req.user!.id
      const [current] = await db.select({ title: builderMaterials.title, items: builderMaterials.items, boardId: builderMaterials.boardId })
        .from(builderMaterials).where(and(eq(builderMaterials.id, req.params.id), eq(builderMaterials.ownerId, ownerId))).limit(1)
      if (!current) return reply.code(404).send({ error: 'Матеріал не знайдено' })
      const { title, items, x, y, boardId } = req.body
      const content = title !== undefined || items !== undefined
        ? prepareMaterial({ title: title ?? current.title, items: items ?? current.items })
        : null
      const missing = content ? await assetIssues(content.items) : []
      if (missing.length) throw new MaterialValidationError(missing)
      if (boardId && boardId !== current.boardId && !await ownBoard(ownerId, boardId)) return reply.code(404).send({ error: 'Дошку не знайдено' })
      const [material] = await db.update(builderMaterials).set({
        ...(content ?? {}),
        ...(x !== undefined ? { x } : {}),
        ...(y !== undefined ? { y } : {}),
        ...(boardId ? { boardId } : {}),
        updatedAt: new Date(),
      }).where(and(eq(builderMaterials.id, req.params.id), eq(builderMaterials.ownerId, ownerId))).returning(MATERIAL_COLUMNS)
      if (!material) return reply.code(404).send({ error: 'Матеріал не знайдено' })
      await touchBoard(material.boardId)
      return reply.send({ material })
    } catch (err) { return sendError(reply, err) }
  })

  // PUT /api/admin/builder/boards/:id/positions — one request for a multi-card drag or "arrange"
  app.put<{ Params: { id: string }; Body: { positions: { id: string; x: number; y: number }[] } }>('/boards/:id/positions', {
    schema: {
      params: idParams,
      body: {
        type: 'object', required: ['positions'], additionalProperties: false,
        properties: {
          positions: {
            type: 'array', minItems: 1, maxItems: MAX_BOARD_MATERIALS,
            items: { type: 'object', required: ['id', 'x', 'y'], additionalProperties: false, properties: { id: uuid, x: coordinate, y: coordinate } },
          },
        },
      },
    },
  }, async (req, reply) => {
    const ownerId = req.user!.id
    if (!await ownBoard(ownerId, req.params.id)) return reply.code(404).send({ error: 'Дошку не знайдено' })
    await db.transaction(async tx => {
      for (const { id, x, y } of req.body.positions) {
        await tx.update(builderMaterials).set({ x, y })
          .where(and(eq(builderMaterials.id, id), eq(builderMaterials.boardId, req.params.id), eq(builderMaterials.ownerId, ownerId)))
      }
    })
    return reply.code(204).send()
  })

  // POST /api/admin/builder/materials/delete — remove selected cards (several at once)
  app.post<{ Body: { ids: string[] } }>('/materials/delete', {
    schema: {
      body: {
        type: 'object', required: ['ids'], additionalProperties: false,
        properties: { ids: { type: 'array', minItems: 1, maxItems: MAX_BOARD_MATERIALS, uniqueItems: true, items: uuid } },
      },
    },
  }, async (req, reply) => {
    const deleted = await db.delete(builderMaterials)
      .where(and(inArray(builderMaterials.id, req.body.ids), eq(builderMaterials.ownerId, req.user!.id)))
      .returning({ id: builderMaterials.id, boardId: builderMaterials.boardId })
    for (const boardId of new Set(deleted.map(row => row.boardId))) await touchBoard(boardId)
    return reply.send({ deleted: deleted.map(row => row.id) })
  })
}
