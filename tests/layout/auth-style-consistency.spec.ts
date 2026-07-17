import { test, expect, type Page } from '@playwright/test'

interface AuthMetrics {
  cardWidth: number
  cardRadius: string
  inputHeight: number
  inputRadius: string
  buttonHeight: number
  buttonRadius: string
  headerColor: string
  buttonColor: string
  scrollWidth: number
  viewportWidth: number
}

async function authMetrics(page: Page): Promise<AuthMetrics> {
  return page.locator('.auth-card').evaluate(card => {
    const input = card.querySelector<HTMLElement>('.auth-input')!
    const button = card.querySelector<HTMLElement>('.auth-button--primary')!
    const header = card.querySelector<HTMLElement>('.auth-card__header')!
    const cardStyle = getComputedStyle(card)
    const inputStyle = getComputedStyle(input)
    const buttonStyle = getComputedStyle(button)

    return {
      cardWidth: card.getBoundingClientRect().width,
      cardRadius: cardStyle.borderRadius,
      inputHeight: input.getBoundingClientRect().height,
      inputRadius: inputStyle.borderRadius,
      buttonHeight: button.getBoundingClientRect().height,
      buttonRadius: buttonStyle.borderRadius,
      headerColor: getComputedStyle(header).backgroundColor,
      buttonColor: buttonStyle.backgroundColor,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }
  })
}

test('teacher and parent auth use one component geometry with distinct accents', async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as any).turnstile = {
      render: () => 'stub-widget',
      getResponse: () => 'stub-captcha-token',
      reset: () => {},
    }
  })

  await page.goto('/teacher.html')
  const teacher = await authMetrics(page)

  await page.goto('/parent.html')
  const parent = await authMetrics(page)

  expect(parent.cardWidth).toBeCloseTo(teacher.cardWidth, 0)
  expect(parent.cardRadius).toBe(teacher.cardRadius)
  expect(parent.inputHeight).toBeCloseTo(teacher.inputHeight, 0)
  expect(parent.inputRadius).toBe(teacher.inputRadius)
  expect(parent.buttonHeight).toBeCloseTo(teacher.buttonHeight, 0)
  expect(parent.buttonRadius).toBe(teacher.buttonRadius)
  expect(teacher.headerColor).toBe(teacher.buttonColor)
  expect(parent.headerColor).toBe(parent.buttonColor)
  expect(parent.headerColor).not.toBe(teacher.headerColor)

  await page.setViewportSize({ width: 390, height: 844 })

  await page.goto('/teacher.html')
  const teacherMobile = await authMetrics(page)

  await page.goto('/parent.html')
  const parentMobile = await authMetrics(page)

  expect(parentMobile.cardWidth).toBeCloseTo(teacherMobile.cardWidth, 0)
  expect(teacherMobile.scrollWidth).toBeLessThanOrEqual(teacherMobile.viewportWidth)
  expect(parentMobile.scrollWidth).toBeLessThanOrEqual(parentMobile.viewportWidth)
})
