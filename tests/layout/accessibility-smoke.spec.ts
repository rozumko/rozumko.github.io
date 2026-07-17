import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const AXE_PAGES = [
  '/',
  '/home.html',
  '/path.html',
  '/parent.html',
  '/school.html',
  '/student.html',
  '/teacher.html',
  '/admin.html',
  '/games.html',
  '/for-parents.html',
  '/for-teachers.html',
  '/for-students.html',
  '/privacy.html',
  '/terms.html',
  '/transparency.html',
  '/standards.html',
  '/olympiad-enter.html',
]

const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']

const choiceQuestion = {
  id: 'choice-1',
  q: 'Choose the first option.',
  type: 'choice',
  options: ['First', 'Second', 'Third'],
  difficulty: 'medium',
  track: 'computational-thinking',
  topic: 'algorithms',
  grade: 3,
}

const sortQuestion = {
  id: 'sort-1',
  q: 'Put the steps in order.',
  type: 'sort',
  options: {
    items: ['Wake up', 'Brush teeth', 'Start the lesson'],
    correctOrder: [0, 1, 2],
  },
  difficulty: 'medium',
  track: 'computational-thinking',
  topic: 'algorithms',
  grade: 3,
}

const questionTypeFixtures = [
  choiceQuestion,
  {
    id: 'truefalse-1',
    q: 'Is a sequence an ordered list?',
    type: 'truefalse',
    correct: 0,
    difficulty: 'medium',
    track: 'computational-thinking',
    topic: 'algorithms',
    grade: 3,
  },
  {
    id: 'input-1',
    q: 'Type the word data.',
    type: 'input',
    answer: 'data',
    difficulty: 'medium',
    track: 'computational-thinking',
    topic: 'data',
    grade: 3,
  },
  sortQuestion,
  {
    id: 'sequence-1',
    q: 'What comes next?',
    type: 'sequence',
    given: ['2', '4', '6'],
    choices: ['8', '9', '10'],
    correct: 0,
    difficulty: 'medium',
    track: 'computational-thinking',
    topic: 'patterns',
    grade: 3,
  },
  {
    id: 'match-1',
    q: 'Match the concept to the example.',
    type: 'match',
    left: ['Algorithm', 'Data'],
    right: ['Steps', 'Facts'],
    pairs: [0, 1],
    difficulty: 'medium',
    track: 'computational-thinking',
    topic: 'algorithms',
    grade: 3,
  },
]

async function routeStaticQuestions(page: Page, questions: unknown[]) {
  await page.route('**/questions/grade-*.json', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(questions) }),
  )
}

async function startHomeMission(page: Page, questions: unknown[]) {
  await routeStaticQuestions(page, questions)
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/home.html')
  await page.locator('.home-grade-btn[data-grade="3"]').click()
  await page.locator('.home-track-btn[data-track="computational-thinking"]').click()
  await expect(page.locator('body')).toHaveClass(/mission-active/)
  await expect(page.locator('#quiz-question-text')).not.toHaveText('')
}

async function openAdminDashboard(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('teacher_session', JSON.stringify({
      accessToken: 'admin-test-token',
      refreshToken: '',
      email: 'admin@example.test',
    }))
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      if (!url.includes('/api/')) return originalFetch(input, init)

      const path = new URL(url).pathname
      const body = path === '/api/teacher/me'
        ? { id: 'admin-1', authUserId: 'auth-admin-1', role: 'admin', name: 'Test Admin' }
        : path === '/api/admin/stats'
          ? { teachers: 0, parents: 0, codes: 0, results: 0, events: 0 }
          : path === '/api/admin/teachers'
            ? { teachers: [] }
          : path === '/api/admin/parents'
            ? { parents: [] }
          : path === '/api/admin/results'
              ? {
                  results: [{
                    id: 'attempt-1',
                    code: 'TEST01',
                    grade: 2,
                    score: 8,
                    totalQ: 10,
                    status: 'finished',
                    finishedAt: '2026-07-11T10:00:00.000Z',
                  }],
                }
              : path === '/api/admin/events'
                ? { events: [] }
                : path === '/api/admin/missions'
                  ? { missions: [] }
                  : path === '/api/admin/lessons'
                    ? {
                        lessons: [{
                          id: 'test-lesson',
                          title: 'Test lesson',
                          version: 1,
                          status: 'published',
                          content: { title: 'Test lesson', cards: [], checkQuestions: [] },
                          createdAt: '2026-07-11T10:00:00.000Z',
                          updatedAt: '2026-07-11T10:00:00.000Z',
                        }],
                      }
                    : path === '/api/admin/path-maps'
                      ? {
                          maps: [{
                            pathId: 'grade-2',
                            grade: 2,
                            title: 'Test path',
                            version: 4,
                            status: 'published',
                            points: [{
                              id: 'g2-test-start',
                              title: 'Test point',
                              icon: '🧩',
                              access: 'free',
                              curriculum: [{ track: 'informatics', topic: 'data' }],
                              activities: [{
                                id: 'theory',
                                version: 1,
                                title: 'Theory',
                                activity: { kind: 'lesson', lessonId: 'test-lesson', lessonVersion: 1 },
                                required: true,
                              }],
                              unlockAfter: [],
                              x: 50,
                              y: 10,
                            }],
                            createdAt: '2026-07-11T10:00:00.000Z',
                            updatedAt: '2026-07-11T10:00:00.000Z',
                          }],
                        }
                      : path === '/api/admin/content-publications'
                        ? {
                            publications: [{
                              id: '00000000-0000-4000-8000-000000000041',
                              status: 'succeeded',
                              expectedManifest: {
                                schemaVersion: 1, practiceQuestions: [{}], lessons: [{}], gamePacks: [{}], paths: [{}],
                              },
                              expectedManifestSha256: 'a'.repeat(64),
                              publishedManifestSha256: 'a'.repeat(64),
                              requestedBy: 'admin-1',
                              workflowRunId: '41',
                              workflowUrl: 'https://github.com/example/repo/actions/runs/41',
                              sourceSha: 'b'.repeat(40),
                              failureReason: null,
                              createdAt: '2026-07-16T10:00:00.000Z',
                              startedAt: '2026-07-16T10:00:01.000Z',
                              completedAt: '2026-07-16T10:01:00.000Z',
                            }],
                          }
                  : { questions: [] }

      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  })
  await page.goto('/admin.html')
  await expect(page.locator('#admin-panel')).toBeVisible()
}

async function openTeacherDashboard(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('teacher_session', JSON.stringify({
      accessToken: 'teacher-test-token',
      refreshToken: '',
      email: 'teacher@example.test',
    }))
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      if (!url.includes('/api/')) return originalFetch(input, init)

      const path = new URL(url).pathname
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
      const schoolSession = {
        id: 'school-session-1',
        joinCode: 'ABC123',
        grade: 1,
        difficulty: null,
        questionsCount: 10,
        status: 'lobby',
      }
      const body = path === '/api/teacher/me'
        ? { id: 'teacher-1', authUserId: 'auth-teacher-1', role: 'teacher', name: 'Test Teacher' }
        : path === '/api/teacher/registration-events'
          ? { events: [] }
          : path === '/api/teacher/classes'
            ? { classes: [] }
            : path === '/api/teacher/registrations'
              ? { registrations: [] }
              : path === '/api/teacher/codes'
                ? { codes: [] }
                : path === '/api/teacher/results'
                  ? { results: [] }
                  : path === '/api/school/sessions' && method === 'POST'
                    ? { session: schoolSession }
                    : path === '/api/school/sessions/school-session-1/questions'
                      ? {
                          questions: [{
                            id: 'question-1',
                            q: 'Що робить клавіатура?',
                            type: 'choice',
                            options: ['Вводить дані', 'Друкує на папері', 'Показує відео', 'Зберігає електроенергію'],
                            img: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"%3E%3Crect width="640" height="360" fill="%23dbeafe"/%3E%3Crect x="90" y="95" width="460" height="170" rx="20" fill="%23ffffff" stroke="%231e3a8a" stroke-width="12"/%3E%3C/svg%3E',
                            imageAlt: 'Схематичне зображення клавіатури',
                          }],
                        }
                      : path === '/api/school/sessions/school-session-1/projector-answer' && method === 'POST'
                        ? { correct: true }
                    : path === '/api/school/sessions/school-session-1/finish' && method === 'POST'
                      ? { status: 'finished' }
                    : path === '/api/school/sessions/school-session-1'
                      ? {
                          session: schoolSession,
                          participants: [{ id: 'student-1', avatar: 'fox', nickname: 'Мрійник', score: 7 }],
                          topicStats: [
                            { topic: 'algorithms', total: 10, correct: 3 },
                            { topic: 'logic', total: 10, correct: 6 },
                            { topic: 'patterns', total: 10, correct: 9 },
                          ],
                        }
                  : {}

      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  })
  await page.goto('/teacher.html')
  await expect(page.locator('#dashboard-section')).toBeVisible()
}

test.describe('accessibility smoke: home and school missions', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('home choice options expose radio semantics and checked state', async ({ page }) => {
    await startHomeMission(page, [choiceQuestion])

    await expect(page.locator('#quiz-options')).toHaveAttribute('role', 'radiogroup')
    const radios = page.getByRole('radio')
    await expect(radios).toHaveCount(3)
    await expect(radios.first()).toHaveAttribute('aria-checked', 'false')

    await radios.first().click()

    await expect(radios.first()).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('#quiz-next-btn')).toBeVisible()
  })

  test('home choice radio group uses one tab stop and arrow-key roving focus', async ({ page }) => {
    await startHomeMission(page, [choiceQuestion])

    const radios = page.getByRole('radio')
    await expect(radios).toHaveCount(3)
    await expect(radios.nth(0)).toHaveAttribute('tabindex', '0')
    await expect(radios.nth(1)).toHaveAttribute('tabindex', '-1')
    await expect(radios.nth(2)).toHaveAttribute('tabindex', '-1')

    await radios.first().focus()
    await page.keyboard.press('ArrowDown')

    await expect(radios.nth(0)).toHaveAttribute('tabindex', '-1')
    await expect(radios.nth(1)).toHaveAttribute('tabindex', '0')
    await expect(radios.nth(1)).toBeFocused()
    await expect(radios.nth(1)).toHaveAttribute('aria-checked', 'false')

    await page.keyboard.press('Enter')
    await expect(radios.nth(1)).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('#quiz-next-btn')).toBeVisible()
  })

  test('home sort questions do not masquerade as radio groups', async ({ page }) => {
    await startHomeMission(page, [sortQuestion])

    await expect(page.locator('#quiz-options')).not.toHaveAttribute('role', 'radiogroup')
    await expect(page.getByRole('radio')).toHaveCount(0)

    const hiddenMoves = page.locator('.quiz-move--hidden')
    await expect(hiddenMoves).toHaveCount(2)
    for (let i = 0; i < await hiddenMoves.count(); i++) {
      await expect(hiddenMoves.nth(i)).toBeDisabled()
      await expect(hiddenMoves.nth(i)).toHaveAttribute('aria-hidden', 'true')
    }
  })

  test('home sort movement keeps keyboard focus and announces the new position', async ({ page }) => {
    await startHomeMission(page, [sortQuestion])

    const movedItem = await page.locator('.quiz-sort-row').first().locator('.quiz-sort-item').textContent()
    const moveDown = page.locator('.quiz-sort-row').first().locator('.quiz-move:not([disabled])').last()
    await moveDown.focus()
    await page.keyboard.press('Enter')

    await expect(page.locator('.quiz-move:focus')).toHaveCount(1)
    await expect(page.locator('[data-quiz-sort-live]')).toHaveText(`${movedItem} — тепер позиція 2`)

    await page.keyboard.press('Enter')

    await expect(page.locator('.quiz-move:focus')).toHaveCount(1)
    await expect(page.locator('[data-quiz-sort-live]')).toHaveText(`${movedItem} — тепер позиція 3`)
  })

  test('school choice options keep radio semantics after mocked join', async ({ page }) => {
    await page.addInitScript((question) => {
      const originalFetch = window.fetch.bind(window)
      window.fetch = async (input, init) => {
        const url = input instanceof Request ? input.url : String(input)
        if (url.includes('/api/school/join')) {
          return new Response(JSON.stringify({
            participantId: 'participant-1',
            participantToken: 'token-1',
            status: 'active',
            grade: 3,
            questions: [question],
            questionsCount: 1,
          }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
        if (url.includes('/api/school/participants/') && url.endsWith('/answer')) {
          return new Response(JSON.stringify({ correct: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return originalFetch(input, init)
      }
    }, choiceQuestion)

    await page.goto('/school.html')
    await page.locator('#join-code').fill('123456')
    await page.locator('#join-nickname').fill('Tester')
    await page.locator('#join-btn').click()

    await expect(page.locator('body')).toHaveClass(/mission-active/)
    await expect(page.locator('#quiz-options')).toHaveAttribute('role', 'radiogroup')
    const radios = page.getByRole('radio')
    await expect(radios).toHaveCount(3)

    await radios.first().click()

    await expect(radios.first()).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('#quiz-next-btn')).toBeVisible()
  })
})

test.describe('axe accessibility scan', () => {
  for (const path of AXE_PAGES) {
    test(`axe: ${path}`, async ({ page }) => {
      await page.goto(path)

      const results = await new AxeBuilder({ page })
        .withTags(WCAG_AA_TAGS)
        .analyze()

      expect(results.violations).toEqual([])
    })
  }
})

test.describe('mobile header touch targets', () => {
  test.use({ viewport: { width: 320, height: 700 } })

  test('menu button keeps a 44 by 44 CSS pixel target', async ({ page }) => {
    await page.goto('/home.html')

    const size = await page.getByRole('button', { name: 'Відкрити меню' }).evaluate((button) => {
      const rect = button.getBoundingClientRect()
      return { width: rect.width, height: rect.height }
    })

    expect(size.width).toBeGreaterThanOrEqual(44)
    expect(size.height).toBeGreaterThanOrEqual(44)
  })
})

test.describe('reduced motion', () => {
  for (const scenario of [
    { path: '/', selector: '.mascot' },
    { path: '/school.html', selector: '.school-wait-dots span' },
    { path: '/path.html?grade=2', selector: '.path-node--open .path-node__badge' },
  ]) {
    test(`${scenario.path} disables decorative animation`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(scenario.path)
      await expect(page.locator(scenario.selector).first()).toBeAttached()

      const motion = await page.locator(scenario.selector).first().evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          animationName: style.animationName,
          reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
        }
      })

      expect(motion).toEqual({ animationName: 'none', reduced: true })
    })
  }
})

test.describe('shared button sizing', () => {
  test('child actions keep the shared touch target and link layout', async ({ page }) => {
    await page.goto('/path.html')

    const styles = await page.locator('#path-parent-gate-link').evaluate((action) => {
      const computed = getComputedStyle(action)
      return {
        display: computed.display,
        minHeight: computed.minHeight,
        textDecoration: computed.textDecorationLine,
      }
    })

    expect(styles).toEqual({
      display: 'inline-flex',
      minHeight: '56px',
      textDecoration: 'none',
    })
  })

  test('mission links inherit the shared card presentation', async ({ page }) => {
    await page.goto('/home.html')

    const card = page.locator('a.mission-card[href="games.html"]')
    await expect(card).toHaveCSS('text-decoration-line', 'none')
    await card.focus()
    await expect(card).toHaveCSS('outline-style', 'solid')
  })

  test('admin compact modifier overrides dark variant defaults', async ({ page }) => {
    await page.goto('/admin.html')

    const styles = await page.locator('#q-filter-apply').evaluate((button) => {
      const computed = getComputedStyle(button)
      return {
        fontSize: computed.fontSize,
        minHeight: computed.minHeight,
        paddingBlock: computed.paddingBlock,
        paddingInline: computed.paddingInline,
      }
    })

    expect(styles).toEqual({
      fontSize: '14px',
      minHeight: '36px',
      paddingBlock: '8px',
      paddingInline: '12px',
    })
  })

  test('admin ghost button keeps its explicit border contract', async ({ page }) => {
    await page.goto('/admin.html')
    await expect(page.locator('#modal-cancel-btn')).toHaveCSS('border-top-width', '1px')
  })
})

test('axe: /admin.html dashboard', async ({ page }) => {
  await openAdminDashboard(page)

  const results = await new AxeBuilder({ page })
    .include('#admin-panel')
    .withTags(WCAG_AA_TAGS)
    .analyze()

  expect(results.violations).toEqual([])
})

test('axe: /admin.html question editor', async ({ page }) => {
  await openAdminDashboard(page)
  await page.locator('[data-tab="questions"]').click()
  await page.locator('#add-question-btn').click()
  await expect(page.locator('#question-modal')).toBeVisible()

  const results = await new AxeBuilder({ page })
    .include('#question-modal')
    .withTags(WCAG_AA_TAGS)
    .analyze()

  expect(results.violations).toEqual([])
})

test('admin publication journal is accessible and exposes the audited run', async ({ page }) => {
  await openAdminDashboard(page)
  await page.locator('[data-tab="publication"]').click()
  await expect(page.locator('#publication-list')).toContainText('Опубліковано')
  await expect(page.locator('#publication-list a')).toHaveAttribute('rel', 'noopener noreferrer')

  const results = await new AxeBuilder({ page })
    .include('#tab-publication')
    .withTags(WCAG_AA_TAGS)
    .analyze()
  expect(results.violations).toEqual([])
})

test('admin game content-pack editors are accessible and keyboard-contained', async ({ page }) => {
  await openAdminDashboard(page)
  await page.locator('[data-tab="missions"]').click()
  for (const [buttonId, formSelector, closeSelector] of [
    ['#add-sorting-mission-btn', '.sorting-editor-form', '.se-close'],
    ['#add-sequence-mission-btn', '.narrative-editor-form', '.ne-close'],
    ['#add-scenario-mission-btn', '.narrative-editor-form', '.ne-close'],
    ['#add-simulator-mission-btn', '.simulator-editor-form', '.sie-close'],
  ]) {
    await page.locator(buttonId).click()
    const editor = page.locator(formSelector)
    await expect(editor).toBeVisible()
    await expect(page.locator(closeSelector)).toBeFocused()
    const results = await new AxeBuilder({ page })
      .include('.mission-editor-card')
      .withTags(WCAG_AA_TAGS)
      .analyze()
    expect(results.violations).toEqual([])
    await page.keyboard.press('Escape')
    await expect(editor).toBeHidden()
    await expect(page.locator(buttonId)).toBeFocused()
  }
})

test('admin path editor traps focus, passes axe, and preserves unsaved edits across tabs', async ({ page }) => {
  await openAdminDashboard(page)
  await page.locator('[data-tab="path"]').click()
  await expect(page.locator('#pm-status')).toContainText('Test path')

  const editButton = page.locator('#pm-points .pm-edit')
  await editButton.click()
  await expect(page.locator('#point-modal')).toBeVisible()
  await expect(page.locator('#pf-title')).toBeFocused()

  const results = await new AxeBuilder({ page })
    .include('#point-modal')
    .withTags(WCAG_AA_TAGS)
    .analyze()
  expect(results.violations).toEqual([])

  await page.locator('#pf-title').fill('Unsaved point title')
  await page.locator('#pf-submit').click()
  await expect(page.locator('#point-modal')).toBeHidden()
  await expect(editButton).toBeFocused()
  await expect(page.locator('#pm-status')).toContainText('не збережено')

  await page.locator('[data-tab="overview"]').click()
  await page.locator('[data-tab="path"]').click()
  await expect(page.locator('#pm-points')).toContainText('Unsaved point title')

  await editButton.click()
  await page.keyboard.press('Escape')
  await expect(page.locator('#point-modal')).toBeHidden()
  await expect(editButton).toBeFocused()
})

test('shared certificate dialog is accessible from Admin results', async ({ page }) => {
  await openAdminDashboard(page)
  await page.locator('[data-tab="results"]').click()
  await page.locator('.btn-cert').click()
  await expect(page.locator('#cert-modal')).toBeVisible()

  const results = await new AxeBuilder({ page })
    .include('#cert-modal')
    .withTags(WCAG_AA_TAGS)
    .analyze()
  expect(results.violations).toEqual([])

  await page.locator('#cert-print-btn').click()
  await expect(page.locator('#cert-name-input')).toHaveClass(/cert-modal__input--invalid/)
})

test('axe: /teacher.html dashboard', async ({ page }) => {
  await openTeacherDashboard(page)

  const results = await new AxeBuilder({ page })
    .include('#dashboard-section')
    .withTags(WCAG_AA_TAGS)
    .analyze()

  expect(results.violations).toEqual([])
})

test('teacher school-game form stays accessible on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await openTeacherDashboard(page)
  await page.locator('#school-create-btn').click()
  await expect(page.locator('#school-live')).toBeVisible()
  const qr = page.locator('#school-join-qr')
  await expect(qr).toHaveAttribute('data-ready', 'true')
  const qrOpen = page.locator('#school-join-qr-open')
  await expect(qrOpen).toHaveAttribute('aria-label', 'Збільшити QR-код для гри ABC123')
  const qrPixels = await qr.evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    let dark = 0
    let light = 0
    for (let i = 0; i < data.length; i += 4) {
      const sum = data[i] + data[i + 1] + data[i + 2]
      if (sum < 180) dark++
      if (sum > 720) light++
    }
    return { dark, light }
  })
  expect(qrPixels.dark).toBeGreaterThan(500)
  expect(qrPixels.light).toBeGreaterThan(500)
  await expect(page.locator('.school-topic-stat__bar')).toHaveCount(3)
  await expect(page.locator('.school-topic-stat__bar').nth(0)).toHaveAttribute('value', '30')

  const results = await new AxeBuilder({ page })
    .include('#teacher-section-school')
    .withTags(WCAG_AA_TAGS)
    .analyze()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

  expect(results.violations).toEqual([])
  expect(overflow).toBeLessThanOrEqual(0)

  await qrOpen.click()
  const qrDialog = page.locator('#school-qr-dialog')
  await expect(qrDialog).toBeVisible()
  await expect(page.locator('#school-qr-dialog-code')).toHaveText('ABC123')
  await expect(page.locator('#school-join-qr-large')).toHaveAttribute('data-ready', 'true')
  await expect(page.locator('#school-join-qr-large')).toHaveAttribute('aria-label', 'QR-код для приєднання до гри ABC123')
  const largeQrBox = await page.locator('#school-join-qr-large').boundingBox()
  expect(largeQrBox?.width).toBeGreaterThanOrEqual(290)
  expect(largeQrBox?.width).toBeLessThanOrEqual(305)
  await expect(page.locator('#school-qr-dialog-close')).toBeFocused()
  const qrDialogResults = await new AxeBuilder({ page })
    .include('#school-qr-dialog')
    .withTags(WCAG_AA_TAGS)
    .analyze()
  expect(qrDialogResults.violations).toEqual([])
  await page.keyboard.press('Escape')
  await expect(qrDialog).toBeHidden()
  await expect(qrOpen).toBeFocused()

  await page.locator('#school-cancel-btn').click()
  await expect(page.locator('#app-modal')).toBeVisible()
  await page.locator('#modal-ok-btn').click()
  await expect(page.locator('#school-create-panel')).toBeVisible()
  await expect(page.locator('#school-live')).toBeHidden()
  await expect(page.locator('#school-topic')).toBeFocused()
})

test('teacher lobby keeps the game code and QR card contained on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await openTeacherDashboard(page)
  await page.locator('#school-create-btn').click()
  await expect(page.locator('#school-join-qr')).toHaveAttribute('data-ready', 'true')

  const metrics = await page.locator('.school-live__access').evaluate(access => {
    const codeCard = access.querySelector<HTMLElement>('.school-live__code-card')!
    const code = access.querySelector<HTMLElement>('.school-live__code')!
    const qrCard = access.querySelector<HTMLElement>('.school-live__qr-card')!
    const accessBox = access.getBoundingClientRect()
    const codeBox = code.getBoundingClientRect()
    const codeCardBox = codeCard.getBoundingClientRect()
    const qrCardBox = qrCard.getBoundingClientRect()
    return {
      codeContained: codeBox.left >= codeCardBox.left && codeBox.right <= codeCardBox.right,
      cardsAligned: Math.abs(codeCardBox.width - qrCardBox.width),
      accessContained: qrCardBox.right <= accessBox.right && codeCardBox.left >= accessBox.left,
    }
  })

  expect(metrics.codeContained).toBe(true)
  expect(metrics.cardsAligned).toBeLessThan(2)
  expect(metrics.accessContained).toBe(true)

  const actionMetrics = await page.locator('.school-live__join-info').evaluate(joinInfo => {
    const linkRow = joinInfo.querySelector<HTMLElement>('.school-live__link-row')!.getBoundingClientRect()
    const actions = joinInfo.querySelector<HTMLElement>('.school-live__actions')!.getBoundingClientRect()
    const start = joinInfo.querySelector<HTMLElement>('#school-start-btn')!.getBoundingClientRect()
    const cancel = joinInfo.querySelector<HTMLElement>('#school-cancel-btn')!.getBoundingClientRect()
    return {
      actionsBelowLink: actions.top > linkRow.bottom,
      actionsContained: actions.left >= joinInfo.getBoundingClientRect().left && actions.right <= joinInfo.getBoundingClientRect().right,
      actionsVisible: Math.max(start.bottom, cancel.bottom) <= window.innerHeight,
    }
  })
  expect(actionMetrics).toEqual({ actionsBelowLink: true, actionsContained: true, actionsVisible: true })

  await page.locator('#school-join-qr-open').click()
  const dialogMetrics = await page.locator('.school-qr-dialog__card').evaluate(card => {
    const hint = card.querySelector<HTMLElement>('.school-qr-dialog__hint')!.getBoundingClientRect()
    const cardBox = card.getBoundingClientRect()
    return {
      noInternalScroll: card.scrollHeight <= card.clientHeight,
      hintContained: hint.top >= cardBox.top && hint.bottom <= cardBox.bottom,
      cardContained: cardBox.top >= 0 && cardBox.bottom <= window.innerHeight,
    }
  })
  expect(dialogMetrics).toEqual({ noInternalScroll: true, hintContained: true, cardContained: true })

  await page.setViewportSize({ width: 1920, height: 1080 })
  const wideDialogMetrics = await page.locator('.school-qr-dialog__card').evaluate(card => {
    const hint = card.querySelector<HTMLElement>('.school-qr-dialog__hint')!.getBoundingClientRect()
    const cardBox = card.getBoundingClientRect()
    return {
      noInternalScroll: card.scrollHeight <= card.clientHeight,
      hintContained: hint.top >= cardBox.top && hint.bottom <= cardBox.bottom,
      cardContained: cardBox.top >= 0 && cardBox.bottom <= window.innerHeight,
    }
  })
  expect(wideDialogMetrics).toEqual({ noInternalScroll: true, hintContained: true, cardContained: true })
})

test('teacher can start an accessible projector game from the default screen', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await openTeacherDashboard(page)
  await page.locator('#school-projector-btn').click()
  await expect(page.locator('#school-projector')).toBeVisible()
  await expect(page.locator('#school-projector-question-text')).toHaveText('Що робить клавіатура?')
  await expect(page.getByText('Гра на великому екрані')).toHaveCount(0)
  await expect(page.locator('#school-projector-progress-text')).toHaveText('1 / 1')

  const image = page.locator('#school-projector-image')
  await expect(image).toBeVisible()
  await expect(image).toHaveAttribute('alt', 'Схематичне зображення клавіатури')

  const options = page.locator('#school-projector-options .quiz-option')
  await expect(options).toHaveCount(4)
  const boxes = await options.evaluateAll(nodes => nodes.map(node => {
    const box = node.getBoundingClientRect()
    return { width: box.width, height: box.height, top: box.top, left: box.left }
  }))
  expect(boxes.every(box => box.width >= 280 && box.height >= 72)).toBe(true)
  expect(Math.abs(boxes[0].top - boxes[1].top)).toBeLessThan(2)
  expect(boxes[1].left).toBeGreaterThan(boxes[0].left + boxes[0].width)

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

  const results = await new AxeBuilder({ page })
    .include('#school-projector')
    .withTags(WCAG_AA_TAGS)
    .analyze()

  expect(results.violations).toEqual([])
  expect(overflow).toBeLessThanOrEqual(0)
})

test.describe('axe accessibility scan: rendered question mechanics', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  for (const question of questionTypeFixtures) {
    test(`axe: rendered ${question.type} question`, async ({ page }) => {
      await startHomeMission(page, [question])

      const results = await new AxeBuilder({ page })
        .include('#mission-quiz')
        .withTags(WCAG_AA_TAGS)
        .analyze()

      expect(results.violations).toEqual([])
    })
  }
})
