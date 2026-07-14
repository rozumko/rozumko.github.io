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
          ? { teachers: 0, codes: 0, results: 0, events: 0 }
          : path === '/api/admin/teachers'
            ? { teachers: [] }
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
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
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
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
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
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()

  expect(results.violations).toEqual([])
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
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
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
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(results.violations).toEqual([])

  await page.locator('#cert-print-btn').click()
  await expect(page.locator('#cert-name-input')).toHaveClass(/cert-modal__input--invalid/)
})

test('axe: /teacher.html dashboard', async ({ page }) => {
  await openTeacherDashboard(page)

  const results = await new AxeBuilder({ page })
    .include('#dashboard-section')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()

  expect(results.violations).toEqual([])
})

test('teacher school-game form stays accessible on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await openTeacherDashboard(page)
  await page.locator('[data-tab="school"]').click()
  await page.locator('#school-create-btn').click()
  await expect(page.locator('#school-live')).toBeVisible()
  await expect(page.locator('.school-topic-stat__bar')).toHaveCount(3)
  await expect(page.locator('.school-topic-stat__bar').nth(0)).toHaveAttribute('value', '30')

  const results = await new AxeBuilder({ page })
    .include('#tab-school')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

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
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()

      expect(results.violations).toEqual([])
    })
  }
})
