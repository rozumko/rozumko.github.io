import { test, expect, type Page } from '@playwright/test'

// Projector (big classroom screen) contract for question mechanics:
// match rows stay horizontal with a readable left card, every mechanic and the
// completion screen fit 1366x768 without scrolling before AND after answering,
// every question shows an image (explicit or a default from
// public/assets/basics/), and answers reach the server mapped back to the
// ORIGINAL option indexes even though the deck is shuffled.

const MATCH_Q = {
  id: 'q-match',
  q: "З'єднай орган чуття з тим, що ним сприймають.",
  type: 'match',
  options: {},
  left: ['Очі', 'Вуха', 'Ніс'],
  right: ['Світло і колір', 'Звук', 'Запах'],
  topic: 'information',
}
const SORT_Q = {
  id: 'q-sort',
  q: 'Розстав кроки по порядку.',
  type: 'sort',
  options: {},
  items: ['Взяти хліб', 'Намастити масло', 'Покласти сир', "З'їсти"],
  conceptKey: 'algorithms',
}
const SEQ_Q = {
  id: 'q-seq',
  q: 'Світлофор перемикається по колу. Що після зеленого?',
  type: 'sequence',
  options: {},
  given: ['🔴', '🟡', '🟢'],
  choices: ['Червоний', 'Зелений', 'Жовтий'],
  conceptKey: 'patterns',
}
// The correct option is авторськи first — the projector must NOT show it there
// systematically; scoring uses original indexes.
const CHOICE_Q = {
  id: 'q-choice',
  q: 'На екрані вискочило віконце із чужою грою. Що робити?',
  type: 'choice',
  options: ['Покликати дорослого і нічого не натискати', 'Натискати всі кнопки підряд', 'Сховати планшет під подушку', 'Натиснути «Завантажити»'],
  topic: 'digital-safety',
}
// A real long stem from the bank. The projector scale is viewport-based, so
// this is the case that used to inflate the card and push the options off the
// screen — the class then had to scroll to see an option.
const LONG_Q = {
  id: 'q-long',
  q: 'Алгоритм: «якщо дощ — взяти парасолю, інакше — взяти сонцезахисні окуляри». Надворі сонячно. Що треба взяти?',
  type: 'choice',
  options: ['Сонцезахисні окуляри', 'Парасолю', 'І парасолю, і окуляри', 'Нічого'],
  topic: 'algorithms',
}
const QUESTIONS = [MATCH_Q, SORT_Q, SEQ_Q, CHOICE_Q, LONG_Q]

async function openProjector(page: Page) {
  await page.addInitScript((questions) => {
    sessionStorage.setItem('teacher_session', JSON.stringify({
      accessToken: 'teacher-test-token', refreshToken: '', email: 'teacher@example.test',
    }))
    ;(window as unknown as { __projAnswers: unknown[] }).__projAnswers = []
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      if (!url.includes('/api/')) return originalFetch(input, init)
      const path = new URL(url).pathname
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
      if (path === '/api/school/sessions/s1/projector-answer' && method === 'POST') {
        ;(window as unknown as { __projAnswers: unknown[] }).__projAnswers.push(JSON.parse(String(init?.body ?? '{}')))
        return new Response(JSON.stringify({ correct: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      const schoolSession = { id: 's1', joinCode: 'ABC123', grade: 2, difficulty: null, questionsCount: 4, status: 'lobby' }
      const body = path === '/api/teacher/me'
        ? { id: 't1', authUserId: 'a1', role: 'teacher', name: 'T' }
        : path === '/api/school/sessions' && method === 'POST' ? { session: schoolSession }
        : path === '/api/school/sessions/s1/preview'
          ? { questions: questions.map((item, position) => ({
              id: item.id, position, q: item.q, code: null, type: item.type,
              topic: null, difficulty: null, options: item.options, correctOption: null,
              answerText: 'Правильна відповідь', explanation: null, img: null, imageAlt: null,
            })) }
        : path === '/api/school/sessions/s1/questions' ? { questions }
        : path === '/api/school/sessions/s1/finish' && method === 'POST' ? { status: 'finished' }
        : path === '/api/school/sessions/s1/start' && method === 'POST' ? { status: 'active' }
        : {}
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
  }, QUESTIONS)
  await page.goto('/teacher.html')
  await expect(page.locator('#dashboard-section')).toBeVisible()
  await page.locator('#school-projector-btn').click()
  await expect(page.locator('#school-preview')).toBeVisible()
  await page.locator('#school-preview-start-btn').click()
  await expect(page.locator('#school-projector')).toBeVisible()
}

async function expectNoProjectorScroll(page: Page) {
  const overflow = await page.locator('#school-projector').evaluate(el =>
    el.scrollHeight - el.clientHeight)
  expect(overflow).toBeLessThanOrEqual(0)
}

// No-scroll alone is not enough once the shell clips: the options must also be
// fully on screen, or a child simply never sees the one they need.
async function expectOptionsOnScreen(page: Page, ctx: string) {
  const box = await page.locator('#school-projector-options').boundingBox()
  const viewport = page.viewportSize()!
  expect(box, `${ctx}: варіанти відсутні`).not.toBeNull()
  expect(box!.y, `${ctx}: варіанти вилазять угору`).toBeGreaterThanOrEqual(0)
  expect(box!.y + box!.height, `${ctx}: варіанти нижче краю екрана`).toBeLessThanOrEqual(viewport.height + 1)
}

test('projector mechanics fit the screen and map answers to original indexes', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await openProjector(page)

  const image = page.locator('#school-projector-image')
  const options = page.locator('#school-projector-options')
  const nextBtn = page.locator('#school-projector-next-btn')

  // The deck is shuffled per session — identify each question by its text.
  for (let i = 0; i < QUESTIONS.length; i++) {
    const qText = (await page.locator('#school-projector-question-text').textContent())?.trim()
    const fixture = QUESTIONS.find(f => f.q === qText)
    expect(fixture, `невідоме питання: ${qText}`).toBeTruthy()
    await expectNoProjectorScroll(page)
    await expectOptionsOnScreen(page, `питання ${i + 1}`)

    if (fixture === MATCH_Q) {
      await expect(image).toHaveAttribute('src', /\/assets\/basics\/pairs\.webp$/)
      const rows = options.locator('.quiz-match-row')
      await expect(rows).toHaveCount(3)
      for (let r = 0; r < 3; r++) {
        const metrics = await rows.nth(r).evaluate(row => {
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
      const selects = options.locator('select')
      for (let s = 0; s < 3; s++) await selects.nth(s).selectOption({ index: s + 1 })
      await options.locator('.quiz-check').click()
    } else if (fixture === SORT_Q) {
      await expect(image).toHaveAttribute('src', /\/assets\/basics\/thinks_numbers\.webp$/)
      await expect(options.locator('.quiz-sort-row')).toHaveCount(4)
      await options.locator('.quiz-check').click()
    } else if (fixture === SEQ_Q) {
      // Sequence has no mechanic default — the concept (patterns) decides
      await expect(image).toHaveAttribute('src', /\/assets\/basics\/patterns\.webp$/)
      await expect(options.locator('.quiz-option')).toHaveCount(3)
      await options.locator('.quiz-option').first().click()
    } else if (fixture === LONG_Q) {
      // The long stem must be scaled down, not scrolled away from the options
      await expect(page.locator('#school-projector-question-text')).toHaveAttribute('data-qlength', 'long')
      await expect(options.locator('.quiz-option')).toHaveCount(4)
      await options.locator('.quiz-option', { hasText: 'Сонцезахисні окуляри' }).click()
    } else {
      await expect(options.locator('.quiz-option')).toHaveCount(4)
      // Click a specific option by TEXT — its displayed position is shuffled
      await options.locator('.quiz-option', { hasText: 'Покликати дорослого' }).click()
    }

    await expect(nextBtn).toBeVisible()
    await expectNoProjectorScroll(page)
    await expectOptionsOnScreen(page, `питання ${i + 1} (після відповіді)`)
    await nextBtn.click()
  }

  await expect(page.locator('#school-projector-complete')).toBeVisible()
  await expectNoProjectorScroll(page)

  // Server received the ORIGINAL index of the clicked choice option (0 in the
  // authored list), not its shuffled display position.
  const answers = await page.evaluate(() =>
    (window as unknown as { __projAnswers: { questionId: string; answer: unknown }[] }).__projAnswers)
  const choiceAnswer = answers.find(a => a.questionId === 'q-choice')
  expect(choiceAnswer?.answer).toBe(0)
})
