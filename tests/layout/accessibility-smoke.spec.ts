import { expect, test, type Page } from '@playwright/test'

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
