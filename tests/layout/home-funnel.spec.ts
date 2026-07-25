import { test, expect, type Page, type Request } from '@playwright/test'

// Воронка Домашнього режиму: що саме йде з браузера.
// Контракт (docs/home-demo-contract.md, docs/security-model.md): назовні летить
// лише крок і два грубих виміри; нічого, що ідентифікує відвідувача.
// Запити глушимо тут же — тест не має права стукати в справжній бекенд.

const FUNNEL_URL = '**/api/home/funnel'

function collectFunnel(page: Page): Array<Record<string, unknown>> {
  const sent: Array<Record<string, unknown>> = []
  page.route(FUNNEL_URL, async (route, request: Request) => {
    sent.push(JSON.parse(request.postData() ?? '{}'))
    await route.fulfill({ status: 204, body: '' })
  })
  return sent
}

async function routeQuestions(page: Page) {
  const fixture = [1, 2, 3, 4, 5, 6].map(n => ({
    id: `00000000-0000-4000-8000-00000000000${n}`,
    type: 'choice', grade: 3, track: 'computational-thinking', topic: 'algorithms',
    difficulty: 'medium', code: null, img: null,
    q: `Тестове питання ${n}`,
    options: ['А', 'Б', 'В', 'Г'], correct: 0,
    explanation: 'Пояснення.',
  }))
  await page.route('**/questions/grade-*.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(fixture),
  }))
}

test.describe('home funnel', () => {
  test('page load reports a single anonymous open step', async ({ page }) => {
    const sent = collectFunnel(page)
    await page.goto('/home.html')
    await page.locator('.home-grade-btn[data-grade="3"]').click()
    await expect.poll(() => sent.length).toBeGreaterThan(0)

    const open = sent.filter(e => e.step === 'home_open')
    expect(open, 'крок відкриття має надсилатися рівно раз').toHaveLength(1)
    // Зміна класу не має плодити нових "відкриттів".
    await page.locator('.home-grade-btn[data-grade="4"]').click()
    expect(sent.filter(e => e.step === 'home_open')).toHaveLength(1)
  })

  test('funnel payloads carry nothing that identifies a visitor', async ({ page }) => {
    const sent = collectFunnel(page)
    await routeQuestions(page)
    await page.goto('/home.html')
    await page.locator('.home-grade-btn[data-grade="3"]').click()
    await page.locator('.home-track-btn[data-track="computational-thinking"]').click()
    await expect(page.locator('body')).toHaveClass(/mission-active/)
    await expect.poll(() => sent.some(e => e.step === 'practice_start')).toBe(true)

    for (const payload of sent) {
      for (const key of Object.keys(payload)) {
        expect(['step', 'grade', 'track'], `зайве поле «${key}» у тілі воронки`).toContain(key)
      }
    }

    const start = sent.find(e => e.step === 'practice_start')!
    expect(start).toEqual({ step: 'practice_start', grade: 3, track: 'computational-thinking' })
  })

  test('completing a run reports the mission and the parent gate once each', async ({ page }) => {
    const sent = collectFunnel(page)
    await routeQuestions(page)
    await page.goto('/home.html')
    await page.locator('.home-grade-btn[data-grade="3"]').click()
    await page.locator('.home-track-btn[data-track="computational-thinking"]').click()

    for (let i = 0; i < 6; i++) {
      await page.locator('#quiz-options .quiz-option').first().click()
      await page.locator('#quiz-next-btn').click()
    }

    await expect(page.locator('#parent-gate')).toBeVisible()
    await expect.poll(() => sent.filter(e => e.step === 'practice_complete')).toHaveLength(1)
    expect(sent.filter(e => e.step === 'parent_gate_view')).toHaveLength(1)
  })

  test('a failing funnel endpoint never blocks the child', async ({ page }) => {
    await page.route(FUNNEL_URL, route => route.abort('failed'))
    await routeQuestions(page)
    const consoleErrors: string[] = []
    page.on('pageerror', e => consoleErrors.push(e.message))

    await page.goto('/home.html')
    await page.locator('.home-grade-btn[data-grade="3"]').click()
    await page.locator('.home-track-btn[data-track="computational-thinking"]').click()

    await expect(page.locator('body')).toHaveClass(/mission-active/)
    await expect(page.locator('#quiz-question-text')).not.toHaveText('')
    expect(consoleErrors, 'збій телеметрії не має валити сторінку').toEqual([])
  })
})
