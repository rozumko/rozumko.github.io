// Put Lesson Engine lesson files into a deployed backend through its admin
// API (bulk loads; single lessons are edited in the admin tab «Керовані
// уроки»). The script goes through
// the real routes, so validation, the editorial workflow, revisions and the
// audit trail are exactly those of a manual edit by that administrator.
//
// Steps per lesson: validate locally (schema + subject pack) → create, or
// update the draft → optionally review → publish. A lesson already published
// with the same content is left as is; changed content becomes a new draft
// (the published version stays in use until the new one is published).
// Every file is validated before anything is sent; one failing lesson does
// not stop the others, and the exit code reports any failure.
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
//   npx tsx scripts/publish-curriculum-lesson.ts path/to/folder --publish   (every .json in it)
// Instead of email/password, ADMIN_ACCESS_TOKEN may hold a current access token.

import 'dotenv/config'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { validateLessonAgainstPack, validateLessonDefinition, type LearningOutcome } from '../src/lib/curriculum-lesson-schema.js'
import { findSubjectPack, withOutcomes } from '../src/lib/subject-packs.js'

const DEFAULT_LESSON = fileURLToPath(new URL('../src/lib/curriculum-fixtures/g2-m2-l8.lesson.json', import.meta.url))

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const publish = args.includes('--publish')
const target = args.find(a => !a.startsWith('--')) ?? DEFAULT_LESSON
const files = statSync(target).isDirectory()
  ? readdirSync(target).filter(name => name.endsWith('.json')).sort().map(name => join(target, name))
  : [target]

function fail(message: string): never {
  console.error(`✗ ${message}`)
  process.exit(1)
}

// 1. Local validation of every file — the same fail-closed checks the backend runs.
interface Checked { file: string; lessonId: string; raw: unknown }
const checked: Checked[] = []
const invalid: string[] = []
for (const file of files) {
  const raw: unknown = JSON.parse(readFileSync(file, 'utf8'))
  const result = validateLessonDefinition(raw)
  if (!result.ok) {
    invalid.push(`${file} schema:\n${result.errors.map(e => `  ${e.path}: ${e.message}`).join('\n')}`)
    continue
  }
  const pack = findSubjectPack(result.lesson.subjectPackId)
  if (!pack) {
    invalid.push(`${file}: unknown subject pack "${result.lesson.subjectPackId}"`)
    continue
  }
  // Outcomes live in the directory (database), so they are checked by the
  // server on save; locally the lesson's own outcome ids stand in for them.
  const placeholders: Record<string, LearningOutcome> = Object.fromEntries(result.lesson.learningOutcomes.map(link => [
    link.outcomeId, { code: link.outcomeId, title: { uk: link.outcomeId }, source: 'internal', mappings: [] },
  ]))
  const packIssues = validateLessonAgainstPack(result.lesson, withOutcomes(pack, placeholders))
  if (packIssues.length) {
    invalid.push(`${file} subject pack:\n${packIssues.map(e => `  ${e.path}: ${e.message}`).join('\n')}`)
    continue
  }
  checked.push({ file, lessonId: result.lesson.id, raw })
  console.log(`✓ ${result.lesson.id} is valid (${result.lesson.blocks.length} blocks, pack ${pack.id}; outcomes are checked by the server)`)
}
if (invalid.length) fail(`${invalid.length} of ${files.length} file(s) are invalid; nothing was sent:\n${invalid.join('\n')}`)
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
  // Supabase Auth names the reason in different fields across versions.
  const data = await res.json().catch(() => ({})) as { access_token?: string; error_description?: string; msg?: string; error_code?: string }
  if (!res.ok || !data.access_token) {
    const reason = [data.error_code, data.error_description ?? data.msg].filter(Boolean).join(': ')
    fail(`sign-in failed: HTTP ${res.status}${reason ? ` — ${reason}` : ''}`)
  }
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

class StepError extends Error {}

function expectOk(lessonId: string, step: string, r: { status: number; data: Record<string, unknown> }): AdminLesson {
  if (r.status >= 400) {
    const hint = r.status === 404 ? ' (is LESSON_ENGINE_ENABLED=true on the backend?)'
      : r.status === 403 || r.status === 401 ? ' (the account must be an active admin)' : ''
    throw new StepError(`${lessonId} ${step}: HTTP ${r.status} ${String(r.data.error ?? '')}${hint}`)
  }
  return r.data.lesson as AdminLesson
}

async function setStatus(lessonId: string, lesson: AdminLesson, status: string): Promise<AdminLesson> {
  const updated = expectOk(lessonId, `status → ${status}`, await api('PUT', `/lessons/${lessonId}/status`, { status, expectedEditVersion: lesson.editVersion }))
  console.log(`✓ ${lessonId}: ${lesson.status} → ${updated.status}`)
  return updated
}

async function upload({ lessonId, raw }: Checked): Promise<void> {
  // 3. Create or update the draft.
  const existing = await api('GET', `/lessons/${lessonId}`)
  let lesson: AdminLesson
  if (existing.status === 404 && existing.data.error !== 'Not Found') {
    lesson = expectOk(lessonId, 'create', await api('POST', '/lessons', { definition: raw }))
    console.log(`✓ ${lessonId}: created as draft`)
  } else {
    lesson = expectOk(lessonId, 'read', existing)
    // Editing published content turns it into a new draft; the published
    // snapshot stays with teachers until the new version is published.
    const saved = await api('PUT', `/lessons/${lessonId}`, { definition: raw, expectedEditVersion: lesson.editVersion })
    const changed = saved.data.changed === true
    lesson = expectOk(lessonId, 'update', saved)
    console.log(changed ? `✓ ${lessonId}: draft updated` : `✓ ${lessonId}: content unchanged`)
  }

  // 4. Publish (draft → review → published).
  if (publish) {
    if (lesson.status === 'archived') lesson = await setStatus(lessonId, lesson, 'draft')
    if (lesson.status === 'draft') lesson = await setStatus(lessonId, lesson, 'review')
    if (lesson.status === 'review') lesson = await setStatus(lessonId, lesson, 'published')
    console.log(`✓ ${lessonId}: status ${lesson.status}, published version ${lesson.publishedVersion ?? '—'}`)
  } else {
    console.log(`  ${lessonId}: status ${lesson.status}. Run again with --publish to make it available to teachers.`)
  }
}

const failed: string[] = []
for (const item of checked) {
  try {
    await upload(item)
  } catch (err) {
    if (!(err instanceof StepError)) throw err
    console.error(`✗ ${err.message}`)
    failed.push(item.lessonId)
  }
}
if (checked.length > 1) console.log(`${checked.length - failed.length} of ${checked.length} lesson(s) done${failed.length ? `; failed: ${failed.join(', ')}` : ''}`)
if (failed.length) process.exit(1)
