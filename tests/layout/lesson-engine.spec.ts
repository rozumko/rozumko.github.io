import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import { toDisplaySafeLesson, type ActivitySpec, type LessonDefinitionV1 } from '../../backend/src/lib/curriculum-lesson-schema'
import { scoreServerActivity } from '../../backend/src/lib/curriculum-activity-scoring'

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
      if (!url.includes('/api/') || url.endsWith('/check')) return originalFetch(input, init)
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
