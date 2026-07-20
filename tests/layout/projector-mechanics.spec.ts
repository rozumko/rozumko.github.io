import { test, expect, type Page } from '@playwright/test'

// Projector (big classroom screen) contract for non-choice mechanics:
// match rows stay horizontal with a readable left card, sort/match fit the
// 1366x768 screen without scrolling, and every question shows an image
// (explicit or a default from public/assets/basics/).

const QUESTIONS = [
  {
    id: 'q-match',
    q: "З'єднай орган чуття з тим, що ним сприймають.",
    type: 'match',
    options: {},
    left: ['Очі', 'Вуха', 'Ніс'],
    right: ['Світло і колір', 'Звук', 'Запах'],
    topic: 'information',
  },
  {
    id: 'q-sort',
    q: 'Розстав кроки по порядку.',
    type: 'sort',
    options: {},
    items: ['Взяти хліб', 'Намастити масло', 'Покласти сир', "З'їсти"],
    conceptKey: 'algorithms',
  },
  {
    id: 'q-choice',
    q: 'На екрані вискочило віконце із чужою грою. Що робити?',
    type: 'choice',
    options: ['Натискати всі кнопки підряд', 'Сховати планшет під подушку', 'Натиснути «Завантажити»', 'Покликати дорослого і нічого не натискати'],
    topic: 'digital-safety',
  },
]

async function openProjector(page: Page) {
  await page.addInitScript((questions) => {
    sessionStorage.setItem('teacher_session', JSON.stringify({
      accessToken: 'teacher-test-token', refreshToken: '', email: 'teacher@example.test',
    }))
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      if (!url.includes('/api/')) return originalFetch(input, init)
      const path = new URL(url).pathname
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
      const schoolSession = { id: 's1', joinCode: 'ABC123', grade: 2, difficulty: null, questionsCount: 2, status: 'lobby' }
      const body = path === '/api/teacher/me'
        ? { id: 't1', authUserId: 'a1', role: 'teacher', name: 'T' }
        : path === '/api/school/sessions' && method === 'POST' ? { session: schoolSession }
        : path === '/api/school/sessions/s1/questions' ? { questions }
        : path === '/api/school/sessions/s1/projector-answer' && method === 'POST' ? { correct: true }
        : path === '/api/school/sessions/s1/finish' && method === 'POST' ? { status: 'finished' }
        : path === '/api/school/sessions/s1/start' && method === 'POST' ? { status: 'active' }
        : {}
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
  }, QUESTIONS)
  await page.goto('/teacher.html')
  await expect(page.locator('#dashboard-section')).toBeVisible()
  await page.locator('#school-projector-btn').click()
  await expect(page.locator('#school-projector')).toBeVisible()
}

async function expectNoProjectorScroll(page: Page) {
  const overflow = await page.locator('#school-projector').evaluate(el =>
    el.scrollHeight - el.clientHeight)
  expect(overflow).toBeLessThanOrEqual(0)
}

test('projector match keeps horizontal rows and fits the screen', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await openProjector(page)

  await expect(page.locator('#school-projector-question-text')).toContainText("З'єднай")

  // Default image resolved by topic (no explicit img on the question)
  const image = page.locator('#school-projector-image')
  await expect(image).toBeVisible()
  await expect(image).toHaveAttribute('src', /\/assets\/basics\/pairs\.webp$/)

  const rows = page.locator('#school-projector-options .quiz-match-row')
  await expect(rows).toHaveCount(3)
  for (let i = 0; i < 3; i++) {
    const metrics = await rows.nth(i).evaluate(row => {
      const left = row.querySelector<HTMLElement>('.quiz-match-left')!.getBoundingClientRect()
      const select = row.querySelector<HTMLElement>('.quiz-select')!.getBoundingClientRect()
      return {
        leftWide: left.width,
        sideBySide: select.left >= left.right,
        sameBand: Math.abs(select.top - left.top) < left.height,
      }
    })
    // A squeezed left card wraps its word into a one-letter-per-line column
    expect(metrics.leftWide).toBeGreaterThan(200)
    expect(metrics.sideBySide).toBe(true)
    expect(metrics.sameBand).toBe(true)
  }

  const checkBox = await page.locator('#school-projector-options .quiz-check').boundingBox()
  expect(checkBox!.y + checkBox!.height).toBeLessThanOrEqual(768)
  await expectNoProjectorScroll(page)

  // Answer match: feedback + next button join the flow — still no scrolling
  const selects = page.locator('#school-projector-options select')
  for (let i = 0; i < 3; i++) await selects.nth(i).selectOption({ index: i + 1 })
  await page.locator('#school-projector-options .quiz-check').click()
  await expect(page.locator('#school-projector-next-btn')).toBeVisible()
  await expectNoProjectorScroll(page)
  await page.locator('#school-projector-next-btn').click()

  await expect(page.locator('#school-projector-question-text')).toContainText('Розстав')
  await expect(image).toHaveAttribute('src', /\/assets\/basics\/thinks_numbers\.webp$/)
  await expect(page.locator('#school-projector-options .quiz-sort-row')).toHaveCount(4)
  const sortCheck = await page.locator('#school-projector-options .quiz-check').boundingBox()
  expect(sortCheck!.y + sortCheck!.height).toBeLessThanOrEqual(768)
  await expectNoProjectorScroll(page)

  // Answer sort, then choice: the reported scrollbar case — answered state
  // with feedback and next must fit for choice as well
  await page.locator('#school-projector-options .quiz-check').click()
  await expect(page.locator('#school-projector-next-btn')).toBeVisible()
  await expectNoProjectorScroll(page)
  await page.locator('#school-projector-next-btn').click()

  await expect(page.locator('#school-projector-question-text')).toContainText('віконце')
  await expect(page.locator('#school-projector-options .quiz-option')).toHaveCount(4)
  await expectNoProjectorScroll(page)
  await page.locator('#school-projector-options .quiz-option').last().click()
  await expect(page.locator('#school-projector-next-btn')).toBeVisible()
  await expectNoProjectorScroll(page)
})
