import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { ActivitySpec, LessonDefinitionV1 } from '../../backend/src/lib/curriculum-lesson-schema'
import { holdsLessonAssignment, validateLessonProgress } from '../../backend/src/lib/lesson-progress'
import { studentActivityView } from '../../backend/src/lib/lesson-live'
import { findSubjectPack } from '../../backend/src/lib/subject-packs'
import { studentPresentationSlide } from '../../backend/src/lib/lesson-student-material'

const lesson = JSON.parse(readFileSync(new URL('../../backend/src/lib/curriculum-fixtures/g2-devices-pilot.lesson.json', import.meta.url), 'utf8')) as LessonDefinitionV1
const classify = lesson.blocks.flatMap(block => block.type === 'activity' && block.activity.mechanic === 'classify' ? [block.activity] : [])[0]!
const STUDENT = '00000000-0000-4000-8000-00000000a001'
const LAPTOP = '00000000-0000-4000-8000-00000000d001'
const TABLET = '00000000-0000-4000-8000-00000000d002'
const DISPATCH = '00000000-0000-4000-8000-00000000e001'
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

/** Browser contract tests use shared in-memory persistence and the real pure server guards. */
async function recoveryServer(context: BrowserContext, activity: ActivitySpec = classify) {
  const state = {
    open: true, paused: false, offline: false, revision: 0, progress: null as Record<string, unknown> | null,
    slide: studentPresentationSlide(lesson, lesson.blocks[0]!.id),
    accepted: 0, refused: 0,
    devices: new Map([
      [LAPTOP, { lessonRunStudentId: STUDENT as string | null, assignmentVersion: 1 }],
      [TABLET, { lessonRunStudentId: null as string | null, assignmentVersion: 0 }],
    ]),
  }
  await context.route('**/api/student/lesson/state', route => {
    const { deviceId } = route.request().postDataJSON()
    const device = state.devices.get(deviceId)!
    return route.fulfill(json({
      ...device, mapped: device.lessonRunStudentId !== null, studentLabel: device.lessonRunStudentId ? 'Учень 1' : null,
      runStatus: state.paused ? 'paused' : 'active', lessonTitle: lesson.title, grade: 2, pairingNumber: deviceId === LAPTOP ? 4 : 9,
      material: null, slide: state.slide,
      task: state.open && !state.paused && device.lessonRunStudentId ? {
        dispatchId: DISPATCH, heading: { uk: 'Завдання' }, activity: studentActivityView(activity, findSubjectPack(lesson.subjectPackId)),
        acceptsAttempts: true, attemptsUsed: 0, attemptsMax: 10, lastResult: null,
        progress: state.progress, progressRevision: state.revision,
      } : null,
    }))
  })
  await context.route('**/api/student/lesson/progress', route => {
    if (state.offline) return route.abort('failed')
    const body = route.request().postDataJSON()
    const device = state.devices.get(body.deviceId)!
    if (!holdsLessonAssignment(device, body.lessonRunStudentId, body.assignmentVersion)) {
      state.refused++
      return route.fulfill(json({ code: 'ASSIGNMENT_CHANGED', error: 'Призначення змінилося.' }, 409))
    }
    if (body.revision !== state.revision) return route.fulfill(json({ code: 'PROGRESS_CONFLICT', error: 'Стан змінився.' }, 409))
    state.progress = structuredClone(validateLessonProgress(activity, body.progress))
    state.revision++
    state.accepted++
    return route.fulfill(json({ revision: state.revision }))
  })
  await context.route('**/api/student/lesson/attempt', route => {
    const body = route.request().postDataJSON()
    const device = state.devices.get(body.deviceId)!
    if (!holdsLessonAssignment(device, body.lessonRunStudentId, body.assignmentVersion)) {
      state.refused++
      return route.fulfill(json({ code: 'DEVICE_INVALID', error: 'Призначення змінилося.' }, 401))
    }
    return route.fulfill(json({ attemptNo: 1, attemptsLeft: 0, result: null, feedback: null }))
  })
  return state
}

async function join(page: Page, deviceId: string) {
  await page.route('**/api/student/lesson/join', route => route.fulfill(json({ deviceId, deviceToken: 'f'.repeat(64), pairingNumber: 4, expiresAt: '' }, 201)))
  await page.goto('/lesson-join.html?code=482913')
  await page.getByRole('button', { name: 'Приєднатися' }).click()
  await expect(page.locator('#lj-wait')).toBeVisible()
}

test('partial classification survives reload and an offline edit is replayed when connection returns', async ({ page, context }) => {
  const state = await recoveryServer(context)
  await join(page, LAPTOP)
  const first = page.locator('.le-interactive__question').first().getByRole('radio').first()
  await first.check()
  await expect.poll(() => state.accepted).toBeGreaterThan(0)
  await page.reload()
  await expect(first).toBeChecked()
  state.offline = true
  const second = page.locator('.le-interactive__question').first().getByRole('radio').nth(1)
  await second.check()
  await page.reload()
  await expect(second).toBeChecked()
  state.offline = false
  await expect.poll(() => state.progress?.selection).toEqual({ 'practice-keys': 'output' })
})

test('the laptop stays running while the tablet resumes; stale laptop writes and submissions cannot replace tablet work', async ({ page: laptop, context }) => {
  const state = await recoveryServer(context)
  await join(laptop, LAPTOP)
  await laptop.locator('.le-interactive__question').first().getByRole('radio').first().check()
  await expect.poll(() => state.accepted).toBeGreaterThan(0)
  const tablet = await context.newPage()
  state.devices.set(LAPTOP, { lessonRunStudentId: null, assignmentVersion: 2 })
  state.devices.set(TABLET, { lessonRunStudentId: STUDENT, assignmentVersion: 1 })
  await tablet.setViewportSize({ width: 390, height: 844 })
  await join(tablet, TABLET)
  await expect(tablet.locator('.le-interactive__question').first().getByRole('radio').first()).toBeChecked()
  await tablet.locator('.le-interactive__question').first().getByRole('radio').nth(1).check()
  await expect.poll(() => state.progress?.selection).toEqual({ 'practice-keys': 'output' })
  const stale = { deviceId: LAPTOP, deviceToken: 'f'.repeat(64), lessonRunStudentId: STUDENT, assignmentVersion: 1, dispatchId: DISPATCH }
  const statuses = await laptop.evaluate(async ({ stale, revision }) => {
    const send = (path: string, body: unknown) => fetch(`/api/student/lesson/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(response => response.status)
    return [
      await send('progress', { ...stale, revision, progress: { selection: { 'practice-keys': 'input' } } }),
      await send('attempt', { ...stale, clientAttemptId: crypto.randomUUID(), answer: { placement: { 'practice-keys': 'input' } } }),
    ]
  }, { stale, revision: state.revision })
  expect(statuses).toEqual([409, 401])
  expect(state.progress?.selection).toEqual({ 'practice-keys': 'output' })
  expect(state.refused).toBe(2)
})

test('remote slides follow the current teacher slide after an activity closes; pause shows the teacher attention screen', async ({ page, context }) => {
  const state = await recoveryServer(context)
  state.open = false
  await join(page, LAPTOP)
  await expect(page.locator('.le-slide')).toHaveAttribute('data-block-id', lesson.blocks[0]!.id)
  const next = lesson.blocks.find(block => block.id !== lesson.blocks[0]!.id && block.presentation && block.audience.student)!
  state.slide = studentPresentationSlide(lesson, next.id)
  await expect(page.locator('.le-slide')).toHaveAttribute('data-block-id', next.id)
  state.open = true
  await expect(page.locator('.le-interactive')).toBeVisible()
  await expect(page.locator('.le-slide')).toHaveCount(0)
  state.open = false
  await expect(page.locator('.le-slide')).toHaveAttribute('data-block-id', next.id)
  state.paused = true
  await expect(page.locator('#lj-status')).toHaveText('Пауза. Слухай учителя.')
  await expect(page.locator('.le-slide')).toHaveCount(0)
})

test('typing words resumes the exact shuffled word and letter on a narrow tablet without waiting for the old laptop to stop', async ({ page: laptop, context }) => {
  const game: ActivitySpec = { instanceId: 'typing', mechanic: 'game', telemetry: 'practice', config: { gameKey: 'typing-words', level: 'words-easy' }, scoring: { mode: 'client-unverified' } }
  const state = await recoveryServer(context, game)
  await join(laptop, LAPTOP)
  await laptop.getByRole('button', { name: 'Почати: Друкуй слова', exact: true }).click()
  const target = (await laptop.locator('.tw-target').textContent())!.trim()
  const key = (await laptop.locator('.tw-target__current').textContent())!.trim()
  // Chromium automation cannot press Ukrainian layout keys by their character names.
  await laptop.evaluate(key => {
    const isG = key.toLocaleLowerCase('uk') === 'ґ'
    window.dispatchEvent(new KeyboardEvent('keydown', { key, code: isG ? 'KeyU' : '', ctrlKey: isG, altKey: isG }))
  }, key)
  await expect.poll(() => (state.progress?.gameState as { charIndex?: number })?.charIndex).toBe(1)
  state.devices.set(LAPTOP, { lessonRunStudentId: null, assignmentVersion: 2 })
  state.devices.set(TABLET, { lessonRunStudentId: STUDENT, assignmentVersion: 1 })
  const tablet = await context.newPage()
  await tablet.setViewportSize({ width: 390, height: 844 })
  await join(tablet, TABLET)
  await tablet.getByRole('button', { name: 'Продовжити: Друкуй слова', exact: true }).click()
  await expect(tablet.locator('.tw-target')).toHaveText(target)
  await expect(tablet.locator('.tw-target__done')).toHaveText(key)
  const next = (await tablet.locator('.tw-target__current').textContent())!.trim()
  await tablet.getByRole('textbox', { name: 'Друкуй наступну літеру' }).fill(next)
  await expect.poll(() => (state.progress?.gameState as { charIndex?: number })?.charIndex).toBe(2)
  const overflow = await tablet.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflow).toBe(false)
})
