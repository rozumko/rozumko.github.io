// Put a Lesson Engine lesson into a deployed backend through its admin API
// (there is no admin UI for curriculum lessons yet). The script goes through
// the real routes, so validation, the editorial workflow, revisions and the
// audit trail are exactly those of a manual edit by that administrator.
//
// Steps: validate locally (schema + subject pack) → create, or update the
// draft → optionally review → publish. A lesson already published with the
// same content is left as is; changed content becomes a new draft (the
// published version stays in use until the new one is published).
//
// Run (PowerShell):
//   cd backend
//   $env:API_URL = "https://<backend>.onrender.com"
//   $env:SUPABASE_URL = "https://<project>.supabase.co"
//   $env:SUPABASE_ANON_KEY = "<anon key>"
//   $env:SUPABASE_EMAIL = "<admin email>"; $env:SUPABASE_PASSWORD = "<admin password>"
//   npx tsx scripts/publish-curriculum-lesson.ts --dry-run          (local validation only)
//   npx tsx scripts/publish-curriculum-lesson.ts                    (create/update the draft)
//   npx tsx scripts/publish-curriculum-lesson.ts --publish          (… and publish it)
//   npx tsx scripts/publish-curriculum-lesson.ts path/to/lesson.json --publish
// Instead of email/password, ADMIN_ACCESS_TOKEN may hold a current access token.

import 'dotenv/config'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { validateLessonAgainstPack, validateLessonDefinition } from '../src/lib/curriculum-lesson-schema.js'
import { findSubjectPack } from '../src/lib/subject-packs.js'

const DEFAULT_LESSON = fileURLToPath(new URL('../src/lib/curriculum-fixtures/g2-m2-l8.lesson.json', import.meta.url))

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const publish = args.includes('--publish')
const file = args.find(a => !a.startsWith('--')) ?? DEFAULT_LESSON

function fail(message: string): never {
  console.error(`✗ ${message}`)
  process.exit(1)
}

// 1. Local validation — the same fail-closed checks the backend runs.
const raw: unknown = JSON.parse(readFileSync(file, 'utf8'))
const checked = validateLessonDefinition(raw)
if (!checked.ok) fail(`schema:\n${checked.errors.map(e => `  ${e.path}: ${e.message}`).join('\n')}`)
const pack = findSubjectPack(checked.lesson.subjectPackId)
if (!pack) fail(`unknown subject pack "${checked.lesson.subjectPackId}"`)
const packIssues = validateLessonAgainstPack(checked.lesson, pack)
if (packIssues.length) fail(`subject pack:\n${packIssues.map(e => `  ${e.path}: ${e.message}`).join('\n')}`)
const lessonId = checked.lesson.id
console.log(`✓ ${lessonId} is valid (${checked.lesson.blocks.length} blocks, pack ${pack.id})`)
if (dryRun) process.exit(0)

// 2. Admin session.
const apiUrl = (process.env.API_URL ?? '').replace(/\/+$/, '')
if (!apiUrl) fail('set API_URL to the backend address')

async function accessToken(): Promise<string> {
  if (process.env.ADMIN_ACCESS_TOKEN) return process.env.ADMIN_ACCESS_TOKEN
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_EMAIL, SUPABASE_PASSWORD } = process.env
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_EMAIL || !SUPABASE_PASSWORD) {
    fail('set ADMIN_ACCESS_TOKEN, or SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_EMAIL and SUPABASE_PASSWORD')
  }
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email: SUPABASE_EMAIL, password: SUPABASE_PASSWORD }),
  })
  const data = await res.json() as { access_token?: string; error_description?: string }
  if (!res.ok || !data.access_token) fail(`sign-in failed: ${data.error_description ?? res.status}`)
  return data.access_token
}
const token = await accessToken()

interface AdminLesson { id: string; status: string; editVersion: number; publishedVersion: number | null }

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${apiUrl}/api/admin/curriculum${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = (res.headers.get('content-type') ?? '').includes('application/json') ? await res.json() as Record<string, unknown> : {}
  return { status: res.status, data }
}

function expectOk(step: string, r: { status: number; data: Record<string, unknown> }): AdminLesson {
  if (r.status >= 400) {
    const hint = r.status === 404 ? ' (is LESSON_ENGINE_ENABLED=true on the backend?)'
      : r.status === 403 || r.status === 401 ? ' (the account must be an active admin)' : ''
    fail(`${step}: HTTP ${r.status} ${String(r.data.error ?? '')}${hint}`)
  }
  return r.data.lesson as AdminLesson
}

async function setStatus(lesson: AdminLesson, status: string): Promise<AdminLesson> {
  const updated = expectOk(`status → ${status}`, await api('PUT', `/lessons/${lessonId}/status`, { status, expectedEditVersion: lesson.editVersion }))
  console.log(`✓ ${lessonId}: ${lesson.status} → ${updated.status}`)
  return updated
}

// 3. Create or update the draft.
const existing = await api('GET', `/lessons/${lessonId}`)
let lesson: AdminLesson
if (existing.status === 404 && existing.data.error !== 'Not Found') {
  lesson = expectOk('create', await api('POST', '/lessons', { definition: raw }))
  console.log(`✓ ${lessonId}: created as draft`)
} else {
  lesson = expectOk('read', existing)
  // Editing published content turns it into a new draft; the published
  // snapshot stays with teachers until the new version is published.
  const saved = await api('PUT', `/lessons/${lessonId}`, { definition: raw, expectedEditVersion: lesson.editVersion })
  const changed = saved.data.changed === true
  lesson = expectOk('update', saved)
  console.log(changed ? `✓ ${lessonId}: draft updated` : `✓ ${lessonId}: content unchanged`)
}

// 4. Publish (draft → review → published).
if (publish) {
  if (lesson.status === 'archived') lesson = await setStatus(lesson, 'draft')
  if (lesson.status === 'draft') lesson = await setStatus(lesson, 'review')
  if (lesson.status === 'review') lesson = await setStatus(lesson, 'published')
  console.log(`✓ ${lessonId}: status ${lesson.status}, published version ${lesson.publishedVersion ?? '—'}`)
} else {
  console.log(`  status ${lesson.status}. Run again with --publish to make it available to teachers.`)
}
