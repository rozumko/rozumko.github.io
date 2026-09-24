import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import { toDisplaySafeLesson, type ActivitySpec, type LessonDefinitionV1 } from '../../backend/src/lib/curriculum-lesson-schema'
import { scoreServerActivity } from '../../backend/src/lib/curriculum-activity-scoring'
import { applyRunAction, resolveStep, runActionTimestamps, runSteps, type LessonRunAction } from '../../backend/src/lib/lesson-run-state'
import { attemptLimit, liveSnapshot, scoreStudentAttempt, studentActivityView } from '../../backend/src/lib/lesson-live'
import { findSubjectPack } from '../../backend/src/lib/subject-packs'
import { lessonReport } from '../../backend/src/lib/lesson-evidence'

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
      if (!url.includes('/api/') || url.endsWith('/check') || url.includes('/lesson-runs') || url.includes('/api/teacher/classes')
        || url.includes('/api/teacher/classroom-remote')) {
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
interface FakeAttempt { dispatchId: string; lessonRunStudentId: string; attemptNo: number; normalizedScore: number; correct: number; total: number; answerPayload: Record<string, unknown> }

async function routeRunServer(page: Page, devices: FakeDevice[] = [], mapped: unknown[] = [], attempts: FakeAttempt[] = []) {
  const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })
  let run: Record<string, any> | null = null
  const dispatches: { id: string; blockId: string; activityInstanceId: string; openedAt: Date; closedAt: Date | null }[] = []
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
    if (parts[1] === 'dispatch' || parts[1] === 'live') {
      if (parts[1] === 'dispatch' && method === 'POST') {
        for (const d of dispatches) d.closedAt ??= new Date()
        if (parts[2] !== 'close') {
          const { blockId } = request.postDataJSON() as { blockId: string }
          const block = fixture.blocks.find(b => b.id === blockId)!
          if (block.type === 'activity') {
            dispatches.push({ id: `disp-${dispatches.length + 1}`, blockId, activityInstanceId: block.activity.instanceId, openedAt: new Date(), closedAt: null })
          }
        }
      }
      return route.fulfill(json(liveSnapshot({
        activities: new Map(fixture.blocks.flatMap(b => b.type === 'activity' ? [[b.activity.instanceId, b.activity] as const] : [])),
        dispatches,
        students: [{ id: 's1', label: 'Марко' }, { id: 's2', label: 'Софія' }],
        devices: [{ lessonRunStudentId: 's1', lastSeenAt: new Date() }],
        attempts,
        now: new Date(),
      })))
    }
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

// ── Activities on devices + live state (stage G2) ────────────────────────────

test('the teacher sends an activity to devices and watches the class grid', async ({ page }) => {
  const attempts: FakeAttempt[] = []
  await mockTeacherApi(page, { lessonEngine: true })
  await routeRunServer(page, [], [], attempts)
  await page.goto('/lesson-engine.html?lesson=g2-m2-l8')
  await page.getByRole('button', { name: 'Підготувати урок' }).click()
  await page.getByRole('button', { name: 'Почати урок' }).click()

  const live = page.getByRole('region', { name: 'Учні на пристроях' })
  await expect(live.getByRole('button', { name: 'Надіслати учням' })).toHaveCount(0)
  // Step 6 is the practice activity "Яка назва краща?".
  await page.locator('.le-console__step').nth(5).click()
  await live.getByRole('button', { name: 'Надіслати учням' }).click()

  const table = live.getByRole('table', { name: 'Стан класу за завданнями' })
  await expect(table.getByRole('columnheader', { name: 'Яка назва краща? (зараз)' })).toBeVisible()
  await expect(table.getByRole('row', { name: /Марко/ })).toContainText('… Працює')
  await expect(table.getByRole('row', { name: /Софія/ })).toContainText('⨯ Офлайн')

  attempts.push(
    { dispatchId: 'disp-1', lessonRunStudentId: 's1', attemptNo: 1, normalizedScore: 0, correct: 0, total: 1, answerPayload: { answer: { optionId: 'a' } } },
    { dispatchId: 'disp-1', lessonRunStudentId: 's2', attemptNo: 1, normalizedScore: 0, correct: 0, total: 1, answerPayload: { answer: { optionId: 'a' } } },
  )
  await expect(live.locator('.le-live__pattern')).toHaveText('2 з 2 учнів обрали однакову неправильну відповідь: «Файл А: Документ123.png».', { timeout: 8000 })
  await expect(table.getByRole('row', { name: /Марко/ })).toContainText('! Увага 0/1')
  await expect(live.locator('.le-live__summary')).toContainText('Увага 2')

  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze()
  expect(results.violations.map(v => v.id)).toEqual([])

  await live.getByRole('button', { name: 'Закрити завдання' }).click()
  await expect(live.getByRole('button', { name: 'Надіслати учням' })).toBeVisible()
  await expect(live.locator('.le-live__summary')).toContainText('Останнє завдання')
})

type StudentServer = {
  runStatus: string
  instanceId: string | null
  /** Distinct attempts stored — the backend is idempotent per clientAttemptId. */
  attempts: number
  /** Every attempt request, including resends. */
  clientIds: string[]
  /** The next request never reaches the server. */
  failNext: boolean
  /** Every request fails before reaching the server. */
  failAll?: boolean
  /** The next request is stored but its response is lost. */
  loseNextResponse?: boolean
  /** A final refusal for every request. */
  refuse?: { code: string; error: string }
}

async function routeStudentTasks(page: Page, server: StudentServer) {
  const storedAttempts = new Map<string, number>()
  const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })
  const activityOf = (id: string) => fixture.blocks.flatMap(b => b.type === 'activity' ? [b] : []).find(b => b.activity.instanceId === id)!
  await page.route('**/api/student/lesson/join', route => route.fulfill(json({
    deviceId: '00000000-0000-4000-8000-00000000d001', deviceToken: 'f'.repeat(64), pairingNumber: 4, expiresAt: '',
  }, 201)))
  await page.route('**/api/student/lesson/state', route => {
    const block = server.instanceId ? activityOf(server.instanceId) : null
    return route.fulfill(json({
      runStatus: server.runStatus, lessonTitle: fixture.title, grade: 2, pairingNumber: 4, mapped: true, studentLabel: 'Марко',
      task: block ? {
        dispatchId: `disp-${server.instanceId}`,
        heading: block.content.heading ?? null,
        activity: studentActivityView(block.activity, findSubjectPack('informatics-ua-primary')),
        acceptsAttempts: block.activity.mechanic !== 'external',
        attemptsUsed: server.attempts,
        attemptsMax: attemptLimit(block.activity),
        lastResult: null,
      } : null,
    }))
  })
  await page.route('**/api/student/lesson/attempt', async route => {
    const body = route.request().postDataJSON() as { clientAttemptId: string; answer?: unknown; dispatchId: string }
    server.clientIds.push(body.clientAttemptId)
    if (server.failNext || server.failAll) {
      server.failNext = false
      return route.abort('failed')
    }
    if (server.refuse) return route.fulfill(json(server.refuse, 409))
    const activity = activityOf(body.dispatchId.replace('disp-', '')).activity
    const scored = scoreStudentAttempt(activity, body)
    storedAttempts.set(body.clientAttemptId, storedAttempts.get(body.clientAttemptId) ?? storedAttempts.size + 1)
    server.attempts = storedAttempts.size
    const attemptNo = storedAttempts.get(body.clientAttemptId)!
    if (server.loseNextResponse) {
      server.loseNextResponse = false
      return route.abort('failed')
    }
    const evidence = activity.telemetry === 'evidence'
    return route.fulfill(json({
      attemptNo,
      attemptsLeft: attemptLimit(activity) - attemptNo,
      result: evidence ? null : { correct: scored.result.correct, total: scored.result.total, normalizedScore: scored.result.normalizedScore, trust: scored.result.trust },
      feedback: scored.feedback,
    }, 201))
  })
}

async function joinAsChild(page: Page) {
  await page.goto('/lesson-join.html?code=482913')
  await page.getByRole('button', { name: 'Приєднатися' }).click()
}

test('a child answers a practice task, sees feedback, and a lost send is resent with the same attempt id', async ({ page }) => {
  const server: StudentServer = { runStatus: 'active', instanceId: 'try-meaningful-name', attempts: 0, clientIds: [], failNext: true }
  await routeStudentTasks(page, server)
  await joinAsChild(page)

  const task = page.getByRole('region', { name: 'Спробуй!' })
  await task.getByRole('radio', { name: /А\)/ }).check()
  await task.getByRole('button', { name: 'Надіслати' }).click()
  // The send was lost: the answer waits on the device and goes out on the next poll.
  await expect(task.getByText('Відповідь чекає на зв\'язок')).toBeVisible()
  await expect(task.locator('.le-interactive__score')).toHaveText('Правильно: 0 з 1', { timeout: 6000 })
  expect(server.clientIds).toHaveLength(2)
  expect(server.clientIds[0]).toBe(server.clientIds[1])
  expect(server.attempts).toBe(1)

  // A wrong practice answer may be retried, with a fresh attempt id.
  await task.getByRole('button', { name: 'Спробувати ще раз' }).click()
  await task.getByRole('radio', { name: /Б\)/ }).check()
  await task.getByRole('button', { name: 'Надіслати' }).click()
  await expect(task.locator('.le-interactive__verdict')).toHaveText('✓ Правильно')
  await expect(task.locator('.le-interactive__explanation')).toContainText('Змістовна назва')
  await expect(task.getByRole('button', { name: 'Спробувати ще раз' })).toBeHidden()
  expect(server.clientIds[2]).not.toBe(server.clientIds[0])

  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze()
  expect(results.violations.map(v => v.id)).toEqual([])
})

test('evidence on a device confirms receipt without revealing the score, and a pause hides the task', async ({ page }) => {
  const server: StudentServer = { runStatus: 'active', instanceId: 'self-check-extension', attempts: 0, clientIds: [], failNext: false }
  await routeStudentTasks(page, server)
  await joinAsChild(page)

  const task = page.getByRole('region', { name: 'Перевір себе' })
  await task.getByRole('radio', { name: /А\)/ }).check()
  await task.getByRole('button', { name: 'Надіслати' }).click()
  await expect(task.locator('.le-interactive__score')).toHaveText('✓ Відповідь збережено')
  await expect(task.locator('.le-interactive__verdict:visible')).toHaveCount(0)
  await expect(task.getByRole('button', { name: 'Спробувати ще раз' })).toBeHidden()

  server.runStatus = 'paused'
  await expect(page.locator('#lj-status')).toHaveText('Пауза. Слухай учителя.', { timeout: 6000 })
  await expect(page.getByRole('region', { name: 'Перевір себе' })).toHaveCount(0)
})

test('a launch-only tool opens from the device through its allowlisted link', async ({ page }) => {
  const server: StudentServer = { runStatus: 'active', instanceId: 'windows-trainer', attempts: 0, clientIds: [], failNext: false }
  await routeStudentTasks(page, server)
  await joinAsChild(page)
  const link = page.getByRole('link', { name: /Швидкісні вікна/ })
  await expect(link).toHaveAttribute('href', /^https:\/\/itnauka\.org\//)
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
})

// ── Offline outbox (stage J) ─────────────────────────────────────────────────

// Mocked routes still answer while the context is offline, so both sides go
// down together: the browser's online state (and its events) and the "server".
async function goOffline(context: BrowserContext, server: StudentServer) {
  server.failAll = true
  await context.setOffline(true)
}

async function goOnline(context: BrowserContext, server: StudentServer) {
  server.failAll = false
  await context.setOffline(false)
}

test('offline: the answer waits on the device and lands exactly once after reconnecting', async ({ page, context }) => {
  const server: StudentServer = { runStatus: 'active', instanceId: 'self-check-extension', attempts: 0, clientIds: [], failNext: false }
  await routeStudentTasks(page, server)
  await joinAsChild(page)

  const task = page.getByRole('region', { name: 'Перевір себе' })
  await task.getByRole('radio', { name: /А\)/ }).check()
  await goOffline(context, server)
  await task.getByRole('button', { name: 'Надіслати' }).click()
  await expect(task.getByText('Відповідь чекає на зв\'язок')).toBeVisible()
  await expect(task.getByRole('button', { name: 'Надіслати' })).toHaveCount(0)
  expect(server.attempts).toBe(0)

  await goOnline(context, server)
  await expect(task.getByText('✓ Відповідь надіслано')).toBeVisible()
  await expect(task.getByText('Чекай на наступне завдання.')).toBeVisible()
  expect(server.attempts).toBe(1)
  expect(new Set(server.clientIds).size).toBe(1)

  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze()
  expect(results.violations.map(v => v.id)).toEqual([])
})

test('a lost response survives a reload and is counted once', async ({ page }) => {
  const server: StudentServer = {
    runStatus: 'active', instanceId: 'self-check-extension', attempts: 0, clientIds: [], failNext: false, loseNextResponse: true,
  }
  await routeStudentTasks(page, server)
  await joinAsChild(page)

  const task = page.getByRole('region', { name: 'Перевір себе' })
  await task.getByRole('radio', { name: /А\)/ }).check()
  await task.getByRole('button', { name: 'Надіслати' }).click()
  await expect(task.getByText('Відповідь чекає на зв\'язок')).toBeVisible()
  expect(server.attempts).toBe(1) // stored, but the device never heard back

  // The connection stays bad across a reload: the waiting answer is restored, not re-asked.
  server.failAll = true
  await page.reload()
  await expect(page.getByRole('region', { name: 'Перевір себе' }).getByText('Відповідь чекає на зв\'язок')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Перевір себе' }).getByRole('button', { name: 'Надіслати' })).toHaveCount(0)

  server.failAll = false
  await expect(page.getByRole('region', { name: 'Перевір себе' }).getByText('✓ Відповідь надіслано')).toBeVisible({ timeout: 6000 })
  expect(server.attempts).toBe(1)
  expect(new Set(server.clientIds).size).toBe(1)
})

test('an answer the server finally refuses after reconnecting is dropped with a clear message', async ({ page, context }) => {
  const server: StudentServer = { runStatus: 'active', instanceId: 'try-meaningful-name', attempts: 0, clientIds: [], failNext: false }
  await routeStudentTasks(page, server)
  await joinAsChild(page)

  const task = page.getByRole('region', { name: 'Спробуй!' })
  await task.getByRole('radio', { name: /А\)/ }).check()
  await goOffline(context, server)
  await task.getByRole('button', { name: 'Надіслати' }).click()
  await expect(task.getByText('Відповідь чекає на зв\'язок')).toBeVisible()

  // While the device was offline the teacher closed the task.
  server.refuse = { code: 'DISPATCH_CLOSED', error: 'Це завдання вже закрите.' }
  await goOnline(context, server)
  await expect(page.locator('#lj-notice')).toHaveText('Відповідь не зараховано: Це завдання вже закрите.')
  expect(server.attempts).toBe(0)
  // The next poll shows the task as the server sees it again.
  await expect(task.getByRole('button', { name: 'Надіслати' })).toBeVisible({ timeout: 6000 })
})

// ── Lesson report (stage H) ──────────────────────────────────────────────────

test('the lesson report shows outcome summaries that open to their evidence', async ({ page }) => {
  const t = (m: number) => new Date(Date.UTC(2026, 8, 24, 10, m))
  const report = lessonReport({
    run: { status: 'finished', className: '2-А', lessonPublishedVersion: 3, startedAt: t(0), finishedAt: t(40) },
    lesson: fixture,
    outcomes: findSubjectPack('informatics-ua-primary')!.outcomes,
    students: [{ id: 's1', label: 'Марко' }, { id: 's2', label: 'Софія' }],
    mappedStudentIds: new Set(['s1', 's2']),
    dispatches: [{ id: 'd1', blockId: 'g2-m2-l8-b12', activityInstanceId: 'self-check-extension' }],
    attempts: [
      { id: 'a1', dispatchId: 'd1', lessonRunStudentId: 's1', activityInstanceId: 'self-check-extension', attemptNo: 1, correct: 1, total: 1, normalizedScore: 1, trust: 'server-verified', answerPayload: { answer: { optionId: 'b' } }, createdAt: t(20) },
      { id: 'a2', dispatchId: 'd1', lessonRunStudentId: 's2', activityInstanceId: 'self-check-extension', attemptNo: 1, correct: 0, total: 1, normalizedScore: 0, trust: 'server-verified', answerPayload: { answer: { optionId: 'a' } }, createdAt: t(21) },
    ],
    evidence: [
      { lessonRunStudentId: 's1', activityAttemptId: 'a1', outcomeId: 'int-files-name-extension', evidenceRole: 'primary', trust: 'server-verified', score: 1, observedAt: t(20) },
      { lessonRunStudentId: 's2', activityAttemptId: 'a2', outcomeId: 'int-files-name-extension', evidenceRole: 'primary', trust: 'server-verified', score: 0, observedAt: t(21) },
    ],
  })
  await mockTeacherApi(page, { lessonEngine: true })
  await page.route('**/api/teacher/lesson-runs/*/report', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(report) }))
  await page.goto(`/lesson-engine.html?run=${RUN_ID}&view=report`)

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Звіт уроку: Файли й папки')
  await expect(page.locator('.le-report__rule')).toContainText('≥ 80%')
  const table = page.getByRole('table', { name: 'Навчальні результати' })
  await expect(table.getByRole('row', { name: /Марко/ })).toContainText('✓ Продемонстровано')
  await expect(table.getByRole('row', { name: /Софія/ })).toContainText('! Потрібна підтримка')
  await expect(table.getByRole('row', { name: /Марко/ })).toContainText('? Недостатньо даних')

  await page.locator('summary', { hasText: 'Софія' }).click()
  const sofia = page.locator('details', { hasText: 'Софія' })
  await expect(sofia.getByRole('list', { name: 'Докази' })).toContainText('Перевір себе · спроба 1 · 0/1 · перевірено сервером · основний доказ')
  await expect(sofia.locator('.le-report__comment')).toContainText('Софія: потрібна підтримка')
  await expect(page.locator('.le-report__activities')).toContainText('відповіли 2 з 2')

  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze()
  expect(results.violations.map(v => v.id)).toEqual([])
})

// ── Classroom control (stage I) ──────────────────────────────────────────────

test('with a classroom provider the teacher assigns computers and opens the lesson on them', async ({ page, context }) => {
  const saved: unknown[] = []
  const launched: unknown[] = []
  await mockTeacherApi(page, { lessonEngine: true })
  await routeRunServer(page)
  const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('**/api/teacher/classes/*/device-assignments', route => {
    if (route.request().method() === 'PUT') saved.push(route.request().postDataJSON())
    return route.fulfill(json({ assignments: route.request().method() === 'PUT' ? (route.request().postDataJSON() as any).assignments : [] }))
  })
  await page.route('**/api/teacher/lesson-runs/*/launch', route => {
    const { remoteDeviceIds } = route.request().postDataJSON() as { remoteDeviceIds: string[] }
    launched.push(remoteDeviceIds)
    return route.fulfill(json({
      commandId: 'cmd-1',
      launches: remoteDeviceIds.map(id => ({ remoteDeviceId: id, url: `lesson-join.html#launch=${id === 'PC-01' ? 'A'.repeat(43) : 'B'.repeat(43)}` })),
      skipped: [],
    }))
  })

  await page.goto('/lesson-engine.html?lesson=g2-m2-l8&classroom=fake')
  await page.getByRole('button', { name: 'Підготувати урок' }).click()
  await expect(page).toHaveURL(/run=.*classroom=fake/)

  const panel = page.getByRole('region', { name: /Комп’ютери класу/ })
  await expect(panel.getByLabel('PC-01', { exact: true })).toBeVisible()
  await panel.getByLabel('PC-01', { exact: true }).selectOption({ label: 'Марко' })
  await panel.getByLabel('PC-03', { exact: true }).selectOption({ label: 'Софія' })
  await panel.getByRole('button', { name: 'Відкрити урок на комп’ютерах' }).click()

  await expect(panel.getByRole('list', { name: 'Результат відкриття' })).toContainText('✓ PC-01: відкрито')
  await expect(panel.getByRole('list', { name: 'Результат відкриття' })).toContainText('✗ PC-03: Пристрій не відповів')
  await expect(panel.locator('.le-join__message')).toHaveText('Відкрито на 1 з 2 комп’ютерів.')
  expect(launched).toEqual([['PC-01', 'PC-03']])
  expect(saved[saved.length - 1]).toEqual({ assignments: [{ remoteDeviceId: 'PC-01', classStudentId: 'c1' }, { remoteDeviceId: 'PC-03', classStudentId: 'c2' }] })

  // What the provider opened: an absolute URL with the token in the fragment only.
  const opened = await page.evaluate(() => (window as any).__rozumkoClassroom.opened)
  expect(opened).toHaveLength(1)
  expect(opened[0].url).toMatch(/\/lesson-join\.html#launch=A{43}$/)

  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze()
  expect(results.violations.map(v => v.id)).toEqual([])

  // On the lab computer: the link joins as the mapped student, no code typed.
  const child = await context.newPage()
  const exchanges: unknown[] = []
  await child.route('**/api/student/lesson/launch', route => {
    exchanges.push(route.request().postDataJSON())
    return route.fulfill(json({ deviceId: '00000000-0000-4000-8000-00000000d009', deviceToken: 'e'.repeat(64), pairingNumber: 7, expiresAt: '' }, 201))
  })
  await child.route('**/api/student/lesson/state', route => route.fulfill(json({
    runStatus: 'prepared', lessonTitle: fixture.title, grade: 2, pairingNumber: 7, mapped: true, studentLabel: 'Марко', task: null,
  })))
  await child.goto(opened[0].url)
  await expect(child.locator('#lj-status')).toHaveText('Привіт, Марко! Чекай на завдання від учителя.')
  await expect(child).toHaveURL(/lesson-join\.html$/)
  expect(exchanges).toEqual([{ launchToken: 'A'.repeat(43) }])
})

test('a used or expired launch link falls back to the code screen with a clear message', async ({ page }) => {
  await page.route('**/api/student/lesson/launch', route => route.fulfill({
    status: 410, contentType: 'application/json',
    body: JSON.stringify({ error: 'Це посилання вже використане або застаріло. Попроси вчителя відкрити урок ще раз.' }),
  }))
  await page.goto(`/lesson-join.html#launch=${'C'.repeat(43)}`)
  await expect(page.locator('#lj-error')).toContainText('вже використане')
  await expect(page.getByLabel('Код від учителя')).toBeVisible()
  await expect(page).toHaveURL(/lesson-join\.html$/)
})

// ── Class link and remembered seats ─────────────────────────────────────────

const CLASS_KEY = (version: number) => `${'k'.repeat(42)}${version}`

test('the teacher turns on the class link, copies it, rotates it and forgets seats', async ({ page }) => {
  await mockTeacherApi(page, { lessonEngine: true })
  await routeRunServer(page)
  const link = { enabled: false, version: 0, seats: 2 }
  const state = () => ({
    link: link.version === 0 ? null : {
      enabled: link.enabled, version: link.version, updatedAt: '',
      path: link.enabled ? `lesson-join.html#class=${CLASS_ID}.${link.version}.${CLASS_KEY(link.version)}` : null,
    },
    rememberedSeats: link.seats,
  })
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route(`**/api/teacher/classes/${CLASS_ID}/lesson-link**`, route => {
    const request = route.request()
    if (request.method() === 'PUT') {
      const { enabled } = request.postDataJSON() as { enabled: boolean }
      link.enabled = enabled
      link.version ||= 1
    } else if (request.method() === 'POST') {
      link.version += 1
      link.enabled = true
    }
    return route.fulfill(json(state()))
  })
  await page.route(`**/api/teacher/classes/${CLASS_ID}/lesson-seats`, route => {
    link.seats = 0
    return route.fulfill(json(state()))
  })
  page.on('dialog', dialog => void dialog.accept())

  await page.goto('/lesson-engine.html?lesson=g2-m2-l8')
  await page.getByRole('button', { name: 'Підготувати урок' }).click()
  const panel = page.getByRole('region', { name: 'Приєднання учнів' })
  await panel.getByText('Посилання класу (Classroom Remote)').click()
  await expect(panel.locator('.le-classlink__seats')).toHaveText('Запам’ятовано місць: 2. На цих ноутбуках учні підхопляться самі.')

  await panel.getByRole('button', { name: 'Увімкнути посилання класу' }).click()
  const field = panel.getByLabel('Посилання класу', { exact: true })
  await expect(field).toHaveValue(new RegExp(`/lesson-join\\.html#class=${CLASS_ID}\\.1\\.k{42}1$`))
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze()
  expect(results.violations.map(v => v.id)).toEqual([])

  await panel.getByRole('button', { name: 'Нове посилання' }).click()
  await expect(field).toHaveValue(new RegExp(`#class=${CLASS_ID}\\.2\\.k{42}2$`))
  await expect(panel.locator('.le-classlink__message')).toHaveText('Створено нове посилання. Оновіть його в Classroom Remote.')

  await panel.getByRole('button', { name: 'Забути місця' }).click()
  await expect(panel.locator('.le-classlink__seats')).toContainText('ще не запам’ятовано')

  await panel.getByRole('button', { name: 'Вимкнути' }).click()
  await expect(panel.getByRole('button', { name: 'Увімкнути посилання класу' })).toBeVisible()
})

test('a laptop on the class link waits for the lesson, joins by itself with its seat, and rejoins the next lesson', async ({ page }) => {
  const server = { open: false, runStatus: 'active', joins: [] as { seat?: string }[] }
  const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('**/api/student/lesson/join-class', route => {
    const body = route.request().postDataJSON() as { classId: string; version: number; key: string; seat?: string }
    expect(body).toMatchObject({ classId: CLASS_ID, version: 1, key: CLASS_KEY(1) })
    server.joins.push(body)
    if (!server.open) return route.fulfill(json({ error: 'Урок ще не почався. Зачекай.', code: 'NO_OPEN_RUN' }, 409))
    server.runStatus = 'active'
    const n = server.joins.length
    return route.fulfill(json({ deviceId: `00000000-0000-4000-8000-00000000d00${n}`, deviceToken: 'f'.repeat(64), pairingNumber: n, expiresAt: '' }, 201))
  })
  await page.route('**/api/student/lesson/state', route => route.fulfill(json({
    // The remembered seat maps the device by itself.
    runStatus: server.runStatus, lessonTitle: fixture.title, grade: 2, pairingNumber: 1, mapped: true, studentLabel: 'Марко', task: null,
  })))
  await page.clock.install()
  await page.goto(`/lesson-join.html#class=${CLASS_ID}.1.${CLASS_KEY(1)}`)

  await expect(page.locator('#lj-status')).toHaveText('Чекай: урок ще не почався.')
  await expect(page.locator('#lj-number')).toBeHidden()
  await expect(page.getByLabel('Код від учителя')).toBeHidden()
  const axe = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze()
  expect(axe.violations.map(v => v.id)).toEqual([])

  server.open = true
  await page.clock.runFor(15_000)
  await expect(page.locator('#lj-status')).toHaveText('Привіт, Марко! Чекай на завдання від учителя.')
  const seat = server.joins[0]!.seat!
  expect(seat).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(server.joins.every(j => j.seat === seat)).toBe(true)
  expect(await page.evaluate(() => localStorage.getItem('rozumko_lesson_seat'))).toBe(seat)
  await expect(page).toHaveURL(new RegExp(`#class=${CLASS_ID}`), { timeout: 1000 })

  // The lesson ends; the laptop stays ready and joins the class's next lesson.
  server.runStatus = 'finished'
  server.open = false
  await page.clock.runFor(2_000)
  await expect(page.locator('#lj-status')).toHaveText('Урок завершено. Дякуємо!')
  const joinsBefore = server.joins.length
  server.open = true
  await page.clock.runFor(15_000)
  await expect(page.locator('#lj-status')).toHaveText('Привіт, Марко! Чекай на завдання від учителя.')
  expect(server.joins.length).toBeGreaterThan(joinsBefore)
  expect(server.joins[server.joins.length - 1]!.seat).toBe(seat)
})

test('a rotated class link falls back to the code screen, and a code join still carries the seat', async ({ page }) => {
  const joins: { code: string; seat?: string }[] = []
  const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('**/api/student/lesson/join-class', route => route.fulfill(json({
    error: 'Посилання класу більше не діє. Попроси вчителя нове.', code: 'LINK_INVALID',
  }, 404)))
  await page.route('**/api/student/lesson/join', route => {
    joins.push(route.request().postDataJSON() as { code: string; seat?: string })
    return route.fulfill(json({ deviceId: '00000000-0000-4000-8000-00000000d001', deviceToken: 'f'.repeat(64), pairingNumber: 4, expiresAt: '' }, 201))
  })
  await page.route('**/api/student/lesson/state', route => route.fulfill(json({
    runStatus: 'active', lessonTitle: fixture.title, grade: 2, pairingNumber: 4, mapped: false, studentLabel: null, task: null,
  })))
  await page.goto(`/lesson-join.html#class=${CLASS_ID}.1.${CLASS_KEY(1)}`)
  await expect(page.locator('#lj-error')).toHaveText('Посилання класу більше не діє. Попроси вчителя нове.')
  await page.getByLabel('Код від учителя').fill('482913')
  await page.getByRole('button', { name: 'Приєднатися' }).click()
  await expect(page.locator('#lj-number')).toHaveText('№ 4')
  expect(joins[0]!.code).toBe('482913')
  expect(joins[0]!.seat).toBe(await page.evaluate(() => localStorage.getItem('rozumko_lesson_seat')))
})

// ── Classroom Remote from the run console ───────────────────────────────────

test('the teacher connects Classroom Remote once and opens the lesson on every laptop from the console', async ({ page }) => {
  await mockTeacherApi(page, { lessonEngine: true })
  await routeRunServer(page)
  const remote = { connected: false, opened: 0, keys: [] as string[] }
  const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })
  const connection = () => remote.connected
    ? { configured: true, connected: true, keyHint: 'AAAA', roomName: 'Кабінет інформатики', organizationName: 'UGS' }
    : { configured: true, connected: false }
  await page.route('**/api/teacher/classroom-remote', route => {
    const request = route.request()
    if (request.method() === 'PUT') {
      const { key } = request.postDataJSON() as { key: string }
      remote.keys.push(key)
      remote.connected = true
    }
    if (request.method() === 'DELETE') remote.connected = false
    return route.fulfill(json(connection()))
  })
  await page.route(`**/api/teacher/lesson-runs/${RUN_ID}/classroom-remote`, route => route.fulfill(json({
    configured: true, connected: remote.connected, roomName: 'Кабінет інформатики',
    showingThisClass: remote.opened > 0, revision: 3 + remote.opened,
    summary: { total: 3, online: 2, synced: remote.opened > 0 ? 2 : 0 },
    devices: [
      { deviceName: 'PC-01', online: true, synced: remote.opened > 0 },
      { deviceName: 'PC-02', online: true, synced: remote.opened > 0 },
      { deviceName: 'PC-03', online: false, synced: false },
    ],
  })))
  await page.route(`**/api/teacher/lesson-runs/${RUN_ID}/classroom-remote/open`, route => {
    remote.opened += 1
    return route.fulfill(json({ revision: 4 }))
  })
  page.on('dialog', dialog => void dialog.accept())

  await page.goto('/lesson-engine.html?lesson=g2-m2-l8')
  await page.getByRole('button', { name: 'Підготувати урок' }).click()
  const panel = page.getByRole('region', { name: 'Ноутбуки класу' })
  const key = panel.getByLabel('Ключ інтеграції Classroom Remote')
  await key.fill('not-a-key')
  await panel.getByRole('button', { name: 'Підключити' }).click()
  await expect(panel.locator('.le-classlink__message')).toContainText('починається з crk_')
  expect(remote.keys).toEqual([])

  const token = `crk_${'1'.repeat(32)}_${'A'.repeat(43)}`
  await key.fill(token)
  await panel.getByRole('button', { name: 'Підключити' }).click()
  await expect(panel.locator('.le-remote__room')).toHaveText('Кабінет: Кабінет інформатики')
  await expect(panel.locator('.le-remote__summary')).toHaveText('2 з 3 онлайн · урок ще не відкрито')
  expect(remote.keys).toEqual([token])
  const axe = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze()
  expect(axe.violations.map(v => v.id)).toEqual([])

  await panel.getByRole('button', { name: 'Відкрити урок на ноутбуках' }).click()
  await expect(panel.locator('.le-remote__summary')).toHaveText('2 з 3 онлайн · 2 відкрили урок')
  await expect(panel.getByRole('list', { name: 'Ноутбуки кабінету' }).getByRole('listitem')).toHaveText([
    'PC-01: урок відкрито ✓', 'PC-02: урок відкрито ✓', 'PC-03: офлайн',
  ])
  expect(remote.opened).toBe(1)
  // The key never comes back to the page.
  expect(await page.content()).not.toContain(token)

  await panel.getByRole('button', { name: 'Відключити Classroom Remote' }).click()
  await expect(panel.getByLabel('Ключ інтеграції Classroom Remote')).toBeVisible()
})

test('without a server-side integration the laptops panel stays hidden', async ({ page }) => {
  await mockTeacherApi(page, { lessonEngine: true })
  await routeRunServer(page)
  await page.route('**/api/teacher/classroom-remote', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ configured: false, connected: false }),
  }))
  await page.goto('/lesson-engine.html?lesson=g2-m2-l8')
  await page.getByRole('button', { name: 'Підготувати урок' }).click()
  await expect(page.getByRole('region', { name: 'Приєднання учнів' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Ноутбуки класу' })).toHaveCount(0)
})
