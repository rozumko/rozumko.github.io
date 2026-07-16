import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  contentManifestSha256, publicationCallbackMessage, verifyPublicationCallback,
  type ContentPublicationManifest, type PublicationCallbackBody,
} from './content-publication.js'

const manifest: ContentPublicationManifest = {
  schemaVersion: 1,
  practiceQuestions: [{ id: '00000000-0000-4000-8000-000000000001', version: 2, editVersion: 3 }],
  lessons: [{ id: 'lesson', version: 2 }], gamePacks: [{ id: 'game', version: 4 }], paths: [{ id: 'grade-2', version: 5 }],
}

test('publication manifest hash is stable and content-sensitive', () => {
  assert.equal(contentManifestSha256(manifest), contentManifestSha256(structuredClone(manifest)))
  const changed = structuredClone(manifest); changed.paths[0].version++
  assert.notEqual(contentManifestSha256(manifest), contentManifestSha256(changed))
})

test('publication manifest avoids parallel database reads for the constrained exporter role', async () => {
  const source = await readFile(new URL('./content-publication.ts', import.meta.url), 'utf8')
  const manifestBuilder = source.slice(
    source.indexOf('export async function buildContentPublicationManifest'),
    source.indexOf('export function contentManifestSha256'),
  )
  assert.doesNotMatch(manifestBuilder, /Promise\.all/)
  assert.match(manifestBuilder, /const practiceQuestions = await db/)
  assert.match(manifestBuilder, /const lessons = await db/)
  assert.match(manifestBuilder, /const gamePacks = await db/)
  assert.match(manifestBuilder, /const paths = await db/)
})

test('publication callback verifies HMAC and rejects stale or altered payloads', () => {
  const secret = 'a-secure-test-secret-with-at-least-32-characters'
  const timestamp = String(Math.floor(Date.now() / 1000))
  const body: PublicationCallbackBody = { publicationId: '00000000-0000-4000-8000-000000000001', status: 'running' }
  const signature = createHmac('sha256', secret).update(publicationCallbackMessage(timestamp, body)).digest('hex')
  assert.equal(verifyPublicationCallback(secret, timestamp, signature, body), true)
  assert.equal(verifyPublicationCallback(secret, timestamp, signature, { ...body, status: 'failed' }), false)
  assert.equal(verifyPublicationCallback(secret, timestamp, signature, body, Date.now() + 11 * 60_000), false)
})
