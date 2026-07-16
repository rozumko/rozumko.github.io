import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { and, asc, eq, inArray, isNotNull, ne } from 'drizzle-orm'
import { db } from '../db/index.js'
import { microLessons, missions, pathMaps, questions } from '../db/schema.js'

const PUBLISHED_GAME_KINDS = ['sorting-game', 'sequence-game', 'scenario-game', 'simulator-game']
const SHA256_RE = /^[0-9a-f]{64}$/
const SHA_RE = /^[0-9a-f]{40}$/
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

export interface ContentPublicationManifest extends Record<string, unknown> {
  schemaVersion: 1
  practiceQuestions: Array<{ id: string; version: number; editVersion: number }>
  lessons: Array<{ id: string; version: number }>
  gamePacks: Array<{ id: string; version: number }>
  paths: Array<{ id: string; version: number }>
}

export async function buildContentPublicationManifest(): Promise<ContentPublicationManifest> {
  // Keep export compatible with the deliberately low connection limit of the
  // read-only content_exporter role. Each awaited query releases its pool slot
  // before the next content family is read.
  const practiceQuestions = await db
    .select({ id: questions.id, version: questions.version, editVersion: questions.editVersion })
    .from(questions).where(and(eq(questions.isOlympiad, false), eq(questions.editorialStatus, 'published')))
    .orderBy(asc(questions.id))
  const lessons = await db.select({ id: microLessons.id, version: microLessons.publishedVersion }).from(microLessons)
    .where(and(isNotNull(microLessons.publishedVersion), ne(microLessons.status, 'archived')))
    .orderBy(asc(microLessons.id))
  const gamePacks = await db.select({ id: missions.id, version: missions.publishedVersion }).from(missions)
    .where(and(inArray(missions.kind, PUBLISHED_GAME_KINDS), isNotNull(missions.publishedVersion), ne(missions.status, 'archived')))
    .orderBy(asc(missions.id))
  const paths = await db.select({ id: pathMaps.pathId, version: pathMaps.version }).from(pathMaps)
    .where(eq(pathMaps.status, 'published')).orderBy(asc(pathMaps.pathId))
  return {
    schemaVersion: 1,
    practiceQuestions,
    lessons: lessons.map(item => ({ id: item.id, version: item.version! })),
    gamePacks: gamePacks.map(item => ({ id: item.id, version: item.version! })),
    paths,
  }
}

export function contentManifestSha256(manifest: ContentPublicationManifest): string {
  return createHash('sha256').update(JSON.stringify(manifest)).digest('hex')
}

export interface PublicationCallbackBody {
  publicationId: string
  status: 'running' | 'succeeded' | 'failed'
  workflowRunId?: string
  workflowUrl?: string
  sourceSha?: string
  manifestSha256?: string
  failureReason?: string
}

export function publicationCallbackMessage(timestamp: string, body: PublicationCallbackBody): string {
  return [
    timestamp, body.publicationId, body.status, body.workflowRunId ?? '', body.workflowUrl ?? '',
    body.sourceSha ?? '', body.manifestSha256 ?? '', body.failureReason ?? '',
  ].join('\n')
}

export function verifyPublicationCallback(
  secret: string | undefined,
  timestamp: string | undefined,
  signature: string | undefined,
  body: PublicationCallbackBody,
  now = Date.now(),
): boolean {
  if (!secret || secret.length < 32 || !timestamp || !/^[0-9]{10,12}$/.test(timestamp)
    || !signature || !SHA256_RE.test(signature)) return false
  const timestampMs = Number(timestamp) * 1000
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > 10 * 60_000) return false
  const expected = createHmac('sha256', secret).update(publicationCallbackMessage(timestamp, body)).digest()
  const supplied = Buffer.from(signature, 'hex')
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

export function validPublicationSourceSha(value: string | undefined): value is string {
  return typeof value === 'string' && SHA_RE.test(value)
}

export function validManifestSha256(value: string | undefined): value is string {
  return typeof value === 'string' && SHA256_RE.test(value)
}

export async function dispatchContentPublication(
  publicationId: string,
  expectedManifestSha256: string,
): Promise<{ workflowRunId?: string; workflowUrl?: string }> {
  const token = process.env.CONTENT_PUBLISH_GITHUB_TOKEN
  const repository = process.env.CONTENT_PUBLISH_GITHUB_REPOSITORY
  if (!token || !repository || !REPOSITORY_RE.test(repository)) {
    throw new Error('Сервіс публікації не налаштовано')
  }
  const response = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/deploy.yml/dispatches`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'rozumko-content-publisher',
      'X-GitHub-Api-Version': '2026-03-10',
    },
    body: JSON.stringify({
      ref: 'main',
      inputs: { publication_id: publicationId, expected_manifest_sha256: expectedManifestSha256 },
      return_run_details: true,
    }),
  })
  if (!response.ok) throw new Error(`GitHub Actions відхилив запуск (${response.status})`)
  if (response.status === 204) return {}
  const result = await response.json() as { workflow_run_id?: number; html_url?: string }
  return {
    ...(result.workflow_run_id ? { workflowRunId: String(result.workflow_run_id) } : {}),
    ...(result.html_url ? { workflowUrl: result.html_url } : {}),
  }
}
