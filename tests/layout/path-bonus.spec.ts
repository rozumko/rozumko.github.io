import { test, expect, type Page } from '@playwright/test'
import { PATHS_BY_GRADE } from '../../features/path/path-data'

// Бонусні активності (required: false): після обовʼязкових кроків точка
// пропонує вибір бонусів або завершення. Карта з бонус-кроком приходить
// через бандл public/path/ — тут його підміняє route-інтерцепт, тож тест
// заодно покриває шлях «бандл оновлює вбудовану карту».

const STORAGE_KEY = 'rozumko:path-progress:v1:local'

function bundleWithBonus() {
  const base = JSON.parse(JSON.stringify(PATHS_BY_GRADE[2])) as typeof PATHS_BY_GRADE[2]
  const start = base.points.find(point => point.id === 'g2-info-start')!
  // Короткі кроки, щоб тест не проходив повний ІнфоСорт: одна ситуація
  // обовʼязкова + одна бонусна.
  start.activities = [
    { id: 'required-scenarios', version: 1, title: 'Ситуація', activity: { kind: 'scenarios', count: 1 }, required: true },
    { id: 'bonus-scenarios', version: 1, title: 'Бонусна ситуація', activity: { kind: 'scenarios', count: 1 }, required: false },
  ]
  return { pathId: 'grade-2', grade: 2, version: (base.version ?? 1) + 1, title: base.title, points: base.points }
}

async function routeBonusBundle(page: Page) {
  await page.route('**/path/grade-2.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(bundleWithBonus()),
  }))
}

async function playScenario(page: Page) {
  await page.locator('.sc-answer').first().click()
  await page.locator('.sc__next').click()
}

test('бонус-екран: можна завершити точку без бонусу', async ({ page }) => {
  await routeBonusBundle(page)
  await page.goto('/path.html?grade=2')
  await expect(page.locator('.path-node--open')).toHaveCount(1)
  await page.locator('.path-node--open').click()

  await playScenario(page)
  await expect(page.locator('.path-bonus')).toBeVisible()
  await expect(page.locator('.path-bonus__item')).toHaveCount(1)

  await page.locator('.path-bonus__finish').click()
  await expect(page.locator('#path-done')).toBeVisible()

  const queue = await page.evaluate(key =>
    JSON.parse(localStorage.getItem(key) ?? '{}').queue ?? [], STORAGE_KEY)
  expect(queue).toHaveLength(1)
  expect(queue[0].result.activityId).toBe('path:g2-info-start:required-scenarios')
  expect(queue[0].pathVersion).toBeGreaterThanOrEqual(1)
})

test('бонус-екран: зіграний бонус потрапляє в той самий батч', async ({ page }) => {
  await routeBonusBundle(page)
  await page.goto('/path.html?grade=2')
  await expect(page.locator('.path-node--open')).toHaveCount(1)
  await page.locator('.path-node--open').click()

  await playScenario(page)
  await expect(page.locator('.path-bonus')).toBeVisible()
  await page.locator('.path-bonus__item').click()
  await expect(page.locator('#path-activity-title')).toContainText('Бонус:')

  await playScenario(page)
  // Єдиний бонус зіграно → точка завершується автоматично.
  await expect(page.locator('#path-done')).toBeVisible()

  const queue = await page.evaluate(key =>
    JSON.parse(localStorage.getItem(key) ?? '{}').queue ?? [], STORAGE_KEY)
  expect(queue).toHaveLength(2)
  const activityIds = queue.map((entry: { result: { activityId: string } }) => entry.result.activityId).sort()
  expect(activityIds).toEqual([
    'path:g2-info-start:bonus-scenarios',
    'path:g2-info-start:required-scenarios',
  ])
  const batchIds = new Set(queue.map((entry: { batchId?: string }) => entry.batchId))
  expect(batchIds.size).toBe(1)
})
