import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import { toDisplaySafeLesson, type ActivitySpec, type LessonDefinitionV1 } from '../../backend/src/lib/curriculum-lesson-schema'
import { scoreServerActivity } from '../../backend/src/lib/curriculum-activity-scoring'
import { applyRunAction, resolveStep, runActionTimestamps, runSteps, type LessonRunAction } from '../../backend/src/lib/lesson-run-state'

const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']

const fixture = JSON.parse(readFileSync(
  new URL('../../backend/src/lib/curriculum-fixtures/g2-m2-l8.lesson.json', import.meta.url), 'utf8',
)) as LessonDefinitionV1
/** Exactly what GET /api/teacher/curriculum/lessons/:id serves. */
const servedLesson = toDisplaySafeLesson(fixture)

const TEACHER_NOTE = 'Орієнтовний час 35–40 хв'
const SPEAKER_NOTE = 'Покажіть на прикладі'
const SLIDE_COUNT = 12

/** The same lesson with the external trainer swapped for a platform game. */
function withGame(lesson: LessonDefinitionV1): LessonDefinitionV1 {
  const copy = structuredClone(lesson)
  const block = copy.blocks.find(b => b.id === 'g2-m2-l8-b11')!
  if (block.type === 'activity') {
    block.activity = {
      instanceId: 'windows-game', mechanic: 'game', telemetry: 'practice',
      config: { gameKey: 'windows', level: 'easy' }, scoring: { mode: 'client-unverified' },
    } as ActivitySpec
  }
  return copy
}

/** Server-side scoring for board checks, run in the test process like the real backend would. */
async function routeBoardChecks(page: Page, checks: unknown[] = []) {
  await page.route('**/api/teacher/curriculum/lessons/*/activities/*/check', async route => {
    const instanceId = route.request().url().split('/activities/')[1]!.split('/')[0]!
    const body = route.request().postDataJSON() as { answer: unknown }
    checks.push(body)
    const activity = fixture.blocks.flatMap(b => b.type === 'activity' ? [b.activity] : [])
      .find(a => a.instanceId === instanceId)!
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(scoreServerActivity(activity, body.answer)) })
  })
}

async function mockTeacherApi(page: Page, options: { lessonEngine: boolean; session?: boolean; lesson?: LessonDefinitionV1 }) {
  await page.addInitScript(({ lesson, lessonEngine, session }) => {
    if (session) {
      sessionStorage.setItem('teacher_session', JSON.stringify({
        accessToken: 'teacher-test-token', refreshToken: '', email: 'teacher@example.test',
      }))
    }
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
      status, headers: { 'Content-Type': 'application/json' },
    })
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      // Board checks, classes and runs are served by page.route in the test process.
      if (!url.includes('/api/') || url.endsWith('/check') || url.includes('/lesson-runs') || url.includes('/api/teacher/classes')) {
        return originalFetch(input, init)
      }
      const path = new URL(url).pathname
      if (path === '/api/teacher/me') {
        return json({ id: 't1', authUserId: 'a1', role: 'teacher', name: 'Вчитель', email: 'teacher@example.test', features: { lessonEngine } })
      }
      if (path === '/api/teacher/curriculum/lessons') {
        return json({ lessons: [{
          id: lesson.id, subjectPackId: lesson.subjectPackId, grade: lesson.grade, moduleId: lesson.moduleId,
          lessonNumber: lesson.lessonNumber, title: lesson.title, durationMin: lesson.durationMin, publishedVersion: 1,
        }] })
      }
      if (path === `/api/teacher/curriculum/lessons/${lesson.id}`) return json({ lesson, publishedVersion: 1 })
      return json({ error: 'Урок не знайдено' }, 404)
    }
  }, { lesson: options.lesson ?? servedLesson, lessonEngine: options.lessonEngine, session: options.session ?? true })
  // Defaults for runs and classes; routeRunServer() overrides them when a test needs runs.
  await page.route('**/api/teacher/lesson-runs**', route => route.fulfill({ contentType: 'application/json', body: '{"runs":[]}' }))
  await page.route('**/api/teacher/classes', route => route.fulfill({ contentType: 'application/json', body: '{"classes":[]}' }))
}

test('without a teacher session the page asks to sign in', async ({ page }) => {
  await mockTeacherApi(page, { lessonEngine: true, session: false })
  await page.goto('/lesson-engine.html')
  await expect(page.locator('#le-status')).toContainText('увійдіть у кабінет вчителя')
})

test('with the backend flag off the page stays closed', async ({ page }) => {
  await mockTeacherApi(page, { lessonEngine: false })
  await page.goto('/lesson-engine.html')
  await expect(page.locator('#le-status')).toContainText('ще недоступні')
  await expect(page.locator('.le-lesson-card')).toHaveCount(0)
})

test('teacher opens a lesson from the list and sees the full plan with teacher-only notes', async ({ page }) => {
  await mockTeacherApi(page, { lessonEngine: true })
  await page.goto('/lesson-engine.html')
  await page.getByRole('link', { name: /Файли й папки/ }).click()

  await expect(page).toHaveURL(/lesson=g2-m2-l8/)
  await expect(page.locator('#le-document-title')).toContainText('Файли й папки')
  await expect(page.locator('#g2-m2-l8-b02')).toContainText(TEACHER_NOTE)
  await expect(page.locator('#g2-m2-l8-b05')).toContainText(SPEAKER_NOTE)
  await expect(page.locator('#g2-m2-l8-b05 strong').first()).toHaveText('файла (file)')
  await expect(page.locator('.le-block')).toHaveCount(servedLesson.blocks.length)

  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze()
  expect(results.violations.map(v => v.id)).toEqual([])
})

test('the board walks every slide by keyboard and never shows teacher notes or answers', async ({ page }) => {
  await mockTeacherApi(page, { lessonEngine: true })
  await page.goto('/lesson-engine.html?lesson=g2-m2-l8')
  await page.getByRole('button', { name: 'Показати на дошці' }).click()

  const board = page.getByRole('dialog', { name: /Показ на дошці/ })
  const counter = board.locator('.le-board__counter')
  await expect(board).toBeVisible()
  await expect(counter).toHaveText(`1 / ${SLIDE_COUNT}`)
  await expect(board.getByRole('button', { name: '← Назад' })).toBeDisabled()

  for (let slide = 1; slide <= SLIDE_COUNT; slide++) {
    await expect(counter).toHaveText(`${slide} / ${SLIDE_COUNT}`)
    const text = await board.innerText()
    expect(text).not.toContain(TEACHER_NOTE)
    expect(text).not.toContain(SPEAKER_NOTE)
    expect(text).not.toContain('Змістовна назва підказує вміст')
    expect(text).not.toContain('Правильна відповідь')
    if (slide < SLIDE_COUNT) await page.keyboard.press('ArrowRight')
  }
  await expect(board.getByRole('button', { name: 'Далі →' })).toBeDisabled()
  await expect(board.getByRole('button', { name: 'Завершити показ' })).toBeFocused()

  await page.keyboard.press('Home')
  await expect(counter).toHaveText(`1 / ${SLIDE_COUNT}`)
  await page.keyboard.press('End')
  await expect(counter).toHaveText(`${SLIDE_COUNT} / ${SLIDE_COUNT}`)

  const results = await new AxeBuilder({ page }).include('.le-board').withTags(WCAG_AA_TAGS).analyze()
  expect(results.violations.map(v => v.id)).toEqual([])

  await page.keyboard.press('Escape')
  await expect(board).toHaveCount(0)
})

test('presenting from a block starts on its slide and the diagram asset loads', async ({ page }) => {
  await mockTeacherApi(page, { lessonEngine: true })
  await page.goto('/lesson-engine.html?lesson=g2-m2-l8')
  await page.locator('#g2-m2-l8-b06').getByRole('button', { name: 'Показати з цього місця' }).click()

  const board = page.getByRole('dialog', { name: /Показ на дошці/ })
  await expect(board.locator('.le-board__counter')).toHaveText(`5 / ${SLIDE_COUNT}`)
  const diagram = board.locator('img')
  await expect(diagram).toHaveAttribute('alt', /Шлях файла/)
  await expect.poll(() => diagram.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)

  await board.getByRole('button', { name: 'Далі →' }).click()
  await expect(board.locator('.le-activity__options li')).toHaveCount(2)
})

test('the lesson page fits a phone without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await mockTeacherApi(page, { lessonEngine: true })
  await page.goto('/lesson-engine.html?lesson=g2-m2-l8')
  await expect(page.locator('#le-document-title')).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

async function openBoardAt(page: Page, slide: number) {
  await page.goto('/lesson-engine.html?lesson=g2-m2-l8')
  await page.getByRole('button', { name: 'Показати на дошці' }).click()
  const board = page.getByRole('dialog', { name: /Показ на дошці/ })
  for (let i = 1; i < slide; i++) await page.keyboard.press('ArrowRight')
  await expect(board.locator('.le-board__counter')).toHaveText(`${slide} / ${SLIDE_COUNT}`)
  return board
}

test('the class does a practice activity together and the server scores it', async ({ page }) => {
  const checks: unknown[] = []
  await mockTeacherApi(page, { lessonEngine: true })
  await routeBoardChecks(page, checks)
  const board = await openBoardAt(page, 6)

  await board.getByRole('button', { name: 'Виконати разом' }).click()
  const submit = board.getByRole('button', { name: 'Перевірити' })
  await expect(submit).toBeDisabled()

  // Arrow keys belong to the radio group, not to slide navigation.
  await board.getByRole('radio', { name: /А\)/ }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(board.locator('.le-board__counter')).toHaveText(`6 / ${SLIDE_COUNT}`)

  await board.getByRole('radio', { name: /Б\)/ }).check()
  await submit.click()
  await expect(board.locator('.le-interactive__score')).toHaveText('Правильно: 1 з 1')
  await expect(board.locator('.le-interactive__verdict')).toHaveText('✓ Правильно')
  await expect(board.locator('.le-interactive__explanation')).toContainText('Змістовна назва')
  expect(checks).toEqual([{ answer: { optionId: 'b' } }])

  const results = await new AxeBuilder({ page }).include('.le-board').withTags(WCAG_AA_TAGS).analyze()
  expect(results.violations.map(v => v.id)).toEqual([])

  await board.getByRole('button', { name: 'Спробувати ще раз' }).click()
  await expect(board.getByRole('radio', { name: /Б\)/ })).not.toBeChecked()
})

test('evidence activities are never checked on the board', async ({ page }) => {
  const checks: unknown[] = []
  await mockTeacherApi(page, { lessonEngine: true })
  await routeBoardChecks(page, checks)
  const board = await openBoardAt(page, 10)

  await expect(board.locator('.le-board__note')).toContainText('самостійно')
  await expect(board.getByRole('button', { name: 'Виконати разом' })).toHaveCount(0)
  await expect(board.getByRole('radio')).toHaveCount(0)
  expect(checks).toEqual([])
})

test('a platform game runs on the board and holds the keyboard until stopped', async ({ page }) => {
  await mockTeacherApi(page, { lessonEngine: true, lesson: toDisplaySafeLesson(withGame(fixture)) })
  const board = await openBoardAt(page, 9)

  await expect(board.locator('.le-game__title')).toContainText('Вікна програм')
  await board.getByRole('button', { name: 'Запустити гру' }).click()
  await expect(board.locator('.le-game__stage')).not.toBeEmpty()
  await page.keyboard.press('ArrowRight')
  await expect(board.locator('.le-board__counter')).toHaveText(`9 / ${SLIDE_COUNT}`)

  await board.getByRole('button', { name: 'Зупинити гру' }).click()
  await expect(board.locator('.le-game__status')).toContainText('Зупинено')
  await expect(board.locator('.le-game__stage')).toBeEmpty()
  await page.keyboard.press('ArrowRight')
  await expect(board.locator('.le-board__counter')).toHaveText(`10 / ${SLIDE_COUNT}`)
})

// ── Lesson runs (stage F) ────────────────────────────────────────────────────

const RUN_ID = '00000000-0000-4000-8000-0000000000aa'
const CLASS_ID = '00000000-0000-4000-8000-0000000000bb'

interface FakeDevice { id: string; pairingNumber: number; lessonRunStudentId: string | null; lastSeenAt: null; createdAt: string }

/** In-memory run server that applies the real backend state machine. */
async function routeRunServer(page: Page, devices: FakeDevice[] = [], mapped: unknown[] = []) {
  const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })
  let run: Record<string, any> | null = null
  const steps = runSteps(fixture)
  const view = () => ({
    run: { ...run, steps },
    lesson: servedLesson,
    students: [
      { id: 's1', classStudentId: 'c1', label: 'Марко', status: 'expected' },
      { id: 's2', classStudentId: 'c2', label: 'Софія', status: 'expected' },
    ],
  })

  await page.route('**/api/teacher/classes', route => route.fulfill(json({
    classes: [{ id: CLASS_ID, teacherId: 't1', name: '2-А', grade: 2, createdAt: '', updatedAt: '' }],
  })))
  await page.route('**/api/teacher/lesson-runs**', async route => {
    const request = route.request()
    const parts = new URL(request.url()).pathname.split('/').filter(Boolean).slice(3)
    const method = request.method()
    if (parts.length === 0 && method === 'GET') {
      return route.fulfill(json({ runs: run ? [{
        id: run.id, status: run.status, classId: CLASS_ID, className: '2-А', lessonId: fixture.id,
        lessonTitle: fixture.title, currentStepIndex: run.currentStepIndex, stepCount: steps.length, createdAt: '',
      }] : [] }))
    }
    if (parts.length === 0 && method === 'POST') {
      if (run && ['prepared', 'active', 'paused'].includes(run.status)) {
        return route.fulfill(json({ error: 'У цього класу вже є незавершений урок', runId: run.id }, 409))
      }
      run = {
        id: RUN_ID, status: 'prepared', classId: CLASS_ID, className: '2-А', lessonId: fixture.id,
        lessonPublishedVersion: 1, currentStepIndex: 0, currentBlockId: steps[0], createdAt: '',
        joinCode: null, joinCodeExpiresAt: null,
        startedAt: null, pausedAt: null, finishedAt: null, cancelledAt: null,
      }
      return route.fulfill(json(view(), 201))
    }
    if (!run || parts[0] !== run.id) return route.fulfill(json({ error: 'Урок не знайдено' }, 404))
    if (parts[1] === 'join-code') {
      run.joinCode = method === 'POST' ? '482913' : null
      run.joinCodeExpiresAt = method === 'POST' ? new Date(Date.now() + 3600e3).toISOString() : null
      return route.fulfill(method === 'POST' ? json({ joinCode: run.joinCode, joinCodeExpiresAt: run.joinCodeExpiresAt }) : { status: 204 })
    }
    if (parts[1] === 'devices') {
      if (parts.length === 2) return route.fulfill(json({ devices }))
      const index = devices.findIndex(d => d.id === parts[2])
      if (method === 'DELETE') devices.splice(index, 1)
      else {
        const { lessonRunStudentId } = request.postDataJSON() as { lessonRunStudentId: string | null }
        mapped.push(lessonRunStudentId)
        for (const d of devices) if (lessonRunStudentId && d.lessonRunStudentId === lessonRunStudentId) d.lessonRunStudentId = null
        devices[index]!.lessonRunStudentId = lessonRunStudentId
      }
      return route.fulfill(method === 'DELETE' ? { status: 204 } : json({ ok: true }))
    }
    try {
      if (parts.length === 2 && parts[1] === 'step' && method === 'PUT') {
        const { stepIndex } = request.postDataJSON() as { stepIndex: number }
        run.currentBlockId = resolveStep(fixture, run.status, stepIndex)
        run.currentStepIndex = stepIndex
      } else if (parts.length === 2 && method === 'POST') {
        const action = parts[1] as LessonRunAction
        run.status = applyRunAction(run.status, action).status
        Object.assign(run, runActionTimestamps(action, new Date()))
      }
      return route.fulfill(json(view()))
    } catch (err) {
      return route.fulfill(json({ error: (err as Error).message }, 409))
    }
  })
}

test('a teacher prepares, conducts, pauses to reteach, and finishes a lesson with a class', async ({ page }) => {
  await mockTeacherApi(page, { lessonEngine: true })
  await routeRunServer(page)
  await page.goto('/lesson-engine.html?lesson=g2-m2-l8')

  await page.getByLabel('Клас', { exact: true }).selectOption(CLASS_ID)
  await page.getByRole('button', { name: 'Підготувати урок' }).click()
  await expect(page).toHaveURL(/run=/)

  const controls = page.getByRole('toolbar', { name: 'Керування уроком' })
  const badge = page.locator('.le-console__badge')
  const current = page.locator('.le-console__step[aria-current="step"]')
  await expect(badge).toHaveText('Підготовлено')
  await expect(controls.getByRole('button', { name: 'Далі →' })).toHaveCount(0)
  await expect(page.locator('.le-console__step').first()).toBeDisabled()
  // The teacher note attached to the first step is visible in the console.
  await expect(page.locator('.le-console__current')).toContainText(TEACHER_NOTE)

  await controls.getByRole('button', { name: 'Почати урок' }).click()
  await expect(badge).toHaveText('Триває')
  await controls.getByRole('button', { name: 'Далі →' }).click()
  await expect(current).toContainText('2.')

  // The server owns the step: a reload resumes where the lesson is.
  await page.reload()
  await expect(current).toContainText('2.')

  await controls.getByRole('button', { name: 'Пауза' }).click()
  await expect(badge).toHaveText('Пауза')
  await expect(page.locator('.le-console__paused')).toBeVisible()
  await page.locator('.le-console__step').first().click()
  await expect(current).toContainText('1.')
  await controls.getByRole('button', { name: 'Продовжити' }).click()
  await expect(badge).toHaveText('Триває')

  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze()
  expect(results.violations.map(v => v.id)).toEqual([])

  await controls.getByRole('button', { name: 'Завершити урок' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'OK' }).click()
  await expect(badge).toHaveText('Завершено')
  await expect(controls.getByRole('button', { name: 'Далі →' })).toHaveCount(0)
  await expect(page.locator('.le-console__done')).toBeVisible()
})

test('moving through the board moves the run, and the lesson list offers to resume', async ({ page }) => {
  await mockTeacherApi(page, { lessonEngine: true })
  await routeRunServer(page)
  await page.goto('/lesson-engine.html?lesson=g2-m2-l8')
  await page.getByRole('button', { name: 'Підготувати урок' }).click()
  await page.getByRole('button', { name: 'Почати урок' }).click()
  await expect(page.locator('.le-console__badge')).toHaveText('Триває')

  await page.getByRole('button', { name: 'Показати на дошці' }).click()
  const board = page.getByRole('dialog', { name: /Показ на дошці/ })
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(board.locator('.le-board__counter')).toHaveText(`3 / ${SLIDE_COUNT}`)
  await page.keyboard.press('Escape')
  await expect(page.locator('.le-console__step[aria-current="step"]')).toContainText('3.')

  await page.goto('/lesson-engine.html')
  await expect(page.getByRole('heading', { name: 'Незавершені уроки' })).toBeVisible()
  await expect(page.getByRole('link', { name: /2-А/ })).toHaveAttribute('href', /run=/)

  // Preparing again for the same class resumes the open run instead of forking it.
  await page.goto('/lesson-engine.html?lesson=g2-m2-l8')
  await expect(page.getByRole('link', { name: 'Продовжити урок: 2-А' })).toBeVisible()
  await page.getByRole('button', { name: 'Підготувати урок' }).click()
  await expect(page).toHaveURL(new RegExp(`run=${RUN_ID}`))
})

// ── Web join (stage G1) ──────────────────────────────────────────────────────

test('the teacher opens joining, shows the code, and maps joined devices to students', async ({ page }) => {
  const devices: FakeDevice[] = []
  const mapped: unknown[] = []
  await mockTeacherApi(page, { lessonEngine: true })
  await routeRunServer(page, devices, mapped)
  await page.goto('/lesson-engine.html?lesson=g2-m2-l8')
  await page.getByRole('button', { name: 'Підготувати урок' }).click()

  const panel = page.getByRole('region', { name: 'Приєднання учнів' })
  await panel.getByRole('button', { name: 'Відкрити приєднання' }).click()
  await expect(panel.locator('.le-join__code')).toHaveText('482 913')
  await expect(panel.locator('.le-join__url')).toContainText('lesson-join.html?code=482913')
  await expect(panel.locator('.le-join__empty')).toHaveText('Поки ніхто не приєднався.')

  // Two children join; the panel picks them up on its next poll.
  devices.push(
    { id: 'd1', pairingNumber: 1, lessonRunStudentId: null, lastSeenAt: null, createdAt: '' },
    { id: 'd2', pairingNumber: 2, lessonRunStudentId: null, lastSeenAt: null, createdAt: '' },
  )
  await expect(panel.getByLabel('№ 1', { exact: true })).toBeVisible({ timeout: 8000 })
  await expect(panel.locator('.le-join__summary')).toHaveText('Призначено 0 з 2 учнів')

  await panel.getByLabel('№ 1', { exact: true }).selectOption({ label: 'Марко' })
  await expect(panel.locator('.le-join__summary')).toHaveText('Призначено 1 з 2 учнів')
  await expect(panel.getByLabel('№ 2', { exact: true }).locator('option', { hasText: 'Марко (зараз на № 1)' })).toHaveCount(1)
  expect(mapped).toEqual(['s1'])

  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze()
  expect(results.violations.map(v => v.id)).toEqual([])

  await panel.getByRole('button', { name: 'Відключити пристрій № 2' }).click()
  await expect(panel.getByLabel('№ 2', { exact: true })).toHaveCount(0)

  await panel.getByRole('button', { name: 'На весь екран' }).click()
  const full = page.getByRole('dialog', { name: 'Код приєднання до уроку' })
  await expect(full.locator('.le-join-full__code')).toHaveText('482 913')
  await page.keyboard.press('Escape')
  await expect(full).toHaveCount(0)

  await panel.getByRole('button', { name: 'Закрити приєднання' }).click()
  await expect(panel.getByRole('button', { name: 'Відкрити приєднання' })).toBeVisible()
})

async function routeStudentLesson(page: Page, state: { mapped: boolean; runStatus: string }, stateRequests: string[] = []) {
  const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('**/api/student/lesson/join', async route => {
    const { code } = route.request().postDataJSON() as { code: string }
    if (code !== '482913') return route.fulfill(json({ error: 'Урок із таким кодом не знайдено.' }, 404))
    return route.fulfill(json({ deviceId: '00000000-0000-4000-8000-00000000d001', deviceToken: 'f'.repeat(64), pairingNumber: 4, expiresAt: '' }, 201))
  })
  await page.route('**/api/student/lesson/state', route => {
    stateRequests.push(route.request().url())
    return route.fulfill(json({
      runStatus: state.runStatus, lessonTitle: fixture.title, pairingNumber: 4,
      mapped: state.mapped, studentLabel: state.mapped ? 'Марко' : null,
    }))
  })
}

test('a child joins with the code, shows their number, and is greeted once mapped', async ({ page }) => {
  const state = { mapped: false, runStatus: 'active' }
  const stateRequests: string[] = []
  await routeStudentLesson(page, state, stateRequests)
  await page.goto('/lesson-join.html?code=482913')

  await expect(page.getByLabel('Код від учителя')).toHaveValue('482 913')
  const axeJoin = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze()
  expect(axeJoin.violations.map(v => v.id)).toEqual([])

  await page.getByRole('button', { name: 'Приєднатися' }).click()
  await expect(page.locator('#lj-number')).toHaveText('№ 4')
  await expect(page.locator('#lj-status')).toHaveText('Покажи свій номер учителю і чекай.')
  await expect(page).toHaveURL(/lesson-join\.html$/)
  expect(stateRequests.every(url => !url.includes('f'.repeat(16)))).toBe(true)

  state.mapped = true
  await expect(page.locator('#lj-status')).toHaveText('Привіт, Марко! Чекай на завдання від учителя.', { timeout: 8000 })
  const axeWait = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze()
  expect(axeWait.violations.map(v => v.id)).toEqual([])

  // A reload keeps the device (sessionStorage), then the lesson ends.
  await page.reload()
  await expect(page.locator('#lj-number')).toHaveText('№ 4')
  state.runStatus = 'finished'
  await expect(page.locator('#lj-status')).toHaveText('Урок завершено. Дякуємо!', { timeout: 8000 })
})

test('a wrong code keeps the child on the code screen with a clear message', async ({ page }) => {
  await routeStudentLesson(page, { mapped: false, runStatus: 'active' })
  await page.goto('/lesson-join.html')
  await page.getByLabel('Код від учителя').fill('111111')
  await page.getByRole('button', { name: 'Приєднатися' }).click()
  await expect(page.locator('#lj-error')).toHaveText('Урок із таким кодом не знайдено.')
  await page.getByLabel('Код від учителя').fill('12')
  await page.getByRole('button', { name: 'Приєднатися' }).click()
  await expect(page.locator('#lj-error')).toHaveText('Введи 6 цифр коду.')
})
