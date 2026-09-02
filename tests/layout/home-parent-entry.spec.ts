import { test, expect } from '@playwright/test'

test('Home exposes the parent cabinet as the primary desktop action', async ({ page }) => {
  await page.goto('/home.html')
  const action = page.locator('.site-header__actions').getByRole('link', { name: 'Кабінет батьків' })
  await expect(action).toBeVisible()
  await expect(action).toHaveAttribute('href', 'parent.html')
})

test('mobile navigation exposes the parent cabinet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/home.html')
  await page.getByRole('button', { name: 'Відкрити меню' }).click()
  const action = page.locator('#site-nav').getByRole('link', { name: 'Кабінет батьків' })
  await expect(action).toBeVisible()
  await expect(action).toHaveAttribute('href', 'parent.html')
})

test('public parent entry points expose direct account registration', async ({ page }) => {
  await page.goto('/home.html')
  const signup = page.getByRole('link', { name: 'Створити батьківський акаунт' })
  await expect(signup).toBeVisible()
  await expect(signup).toHaveAttribute('href', 'parent.html?mode=register')
  await expect(signup).toHaveClass(/kid-action/)

  // for-parents.html carries the pilot copy: Home is announced as coming soon
  // instead of offering an account that the surface cannot serve yet.
  await page.goto('/for-parents.html')
  await expect(page.getByRole('link', { name: 'Дізнатися більше' })).toHaveAttribute('href', 'home.html')
  await expect(page.getByText('Домашні місії ще готуються')).toBeVisible()
})

test('Home path card follows all four ready grades', async ({ page }) => {
  await page.goto('/home.html')
  const card = page.locator('#home-path-card')
  await expect(card).toHaveAttribute('href', 'path.html?grade=1')
  await expect(page.locator('#home-path-card-title')).toHaveText('Карта пригод · 1 клас')
  await page.locator('.home-grade-btn[data-grade="2"]').click()
  await expect(card).toHaveAttribute('href', 'path.html?grade=2')
  await page.locator('.home-grade-btn[data-grade="3"]').click()
  await expect(card).toHaveAttribute('href', 'path.html?grade=3')
  await page.locator('.home-grade-btn[data-grade="4"]').click()
  await expect(card).toHaveAttribute('href', 'path.html?grade=4')
  await expect(page.locator('#home-path-card-title')).toHaveText('Карта пригод · 4 клас')
  await expect(card).toHaveAttribute('aria-disabled', 'false')
})

test('learning path is the primary Home choice before quick practice', async ({ page }) => {
  await page.goto('/home.html')
  const order = await page.evaluate(() => {
    const path = document.querySelector('#home-path-card')!
    const practice = document.querySelector('#demo-track-select')!
    return Boolean(path.compareDocumentPosition(practice) & Node.DOCUMENT_POSITION_FOLLOWING)
  })
  expect(order).toBe(true)
  await expect(page.getByRole('heading', { name: 'Обери свій шлях' })).toBeVisible()
  await expect(page.locator('#home-path-card')).toContainText('Почати шлях')
})

test('Home path-first layout has no horizontal phone overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/home.html')
  await expect(page.locator('#home-path-card')).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
