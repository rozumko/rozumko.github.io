import { test, expect } from '@playwright/test'
import { INFO_SORT_LEVELS } from '../../features/games/sorting-data'

// Карта пригод (path.html): вузли, поступове відкривання, відсутність
// горизонтального скролу. Прогрес інжектиться через localStorage-контракт
// progress-store (schema v1).

const STORAGE_KEY = 'rozumko:path-progress:v1:local'

function progressWith(pointIds: string[]) {
  const points: Record<string, unknown> = {}
  for (const id of pointIds) {
    points[id] = { pointId: id, status: 'completed', bestStars: 2, attempts: 1, updatedAt: '2026-07-10T10:00:00Z' }
  }
  return JSON.stringify({ version: 1, points, queue: [] })
}

test('свіжий профіль: 9 точок, відкрита лише стартова', async ({ page }) => {
  await page.goto('/path.html')
  const nodes = page.locator('.path-node')
  await expect(nodes).toHaveCount(9)
  await expect(page.locator('.path-node--open')).toHaveCount(1)
  await expect(page.locator('.path-node--open')).toHaveAccessibleName(/Як ми отримуємо інформацію/)
  await expect(page.locator('.path-node--locked')).toHaveCount(8)
})

test('виконана стартова точка відкриває гілки (сортування, факт/думка, збірка)', async ({ page }) => {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value),
    [STORAGE_KEY, progressWith(['g2-info-start'])] as const)
  await page.goto('/path.html')
  await expect(page.locator('.path-node--done')).toHaveCount(1)
  await expect(page.locator('.path-node--open')).toHaveCount(3)
  const done = page.locator('.path-node--done')
  await expect(done).toHaveAccessibleName(/виконано, 2 з 3 зірок/)
})

test('фінал зачинений, поки не пройдено всі три гілки', async ({ page }) => {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value),
    [STORAGE_KEY, progressWith([
      'g2-info-start', 'g2-ct-multisort', 'g2-fact-opinion',
      'g2-ct-patterns', 'g2-ai-perception', 'g2-digital-safety',
    ])] as const)
  await page.goto('/path.html')
  const final = page.getByRole('button', { name: /Фінальна місія/ })
  await expect(final).toBeDisabled()
  // Проходимо останню передумову — фінал відкривається. (addInitScript, бо
  // init-скрипти повторюються на reload і перетерли б localStorage.setItem.)
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value),
    [STORAGE_KEY, progressWith([
      'g2-info-start', 'g2-ct-multisort', 'g2-fact-opinion',
      'g2-ct-patterns', 'g2-ai-perception', 'g2-digital-safety', 'g2-ct-algorithms',
    ])] as const)
  await page.reload()
  await expect(page.getByRole('button', { name: /Фінальна місія.*доступно/ })).toBeEnabled()
})

for (const vp of [{ name: 'mobile-375', width: 375, height: 812 }, { name: 'desktop-1280', width: 1280, height: 800 }]) {
  test(`без горизонтального скролу @ ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto('/path.html')
    await expect(page.locator('.path-node').first()).toBeVisible()
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
}

test('mobile map nodes do not overlap', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/path.html?grade=2')
  const boxes = await page.locator('.path-node').evaluateAll(nodes => nodes.map(node => {
    const box = node.getBoundingClientRect()
    return { label: node.getAttribute('aria-label'), left: box.left, right: box.right, top: box.top, bottom: box.bottom }
  }))
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const overlapWidth = Math.min(boxes[i].right, boxes[j].right) - Math.max(boxes[i].left, boxes[j].left)
      const overlapHeight = Math.min(boxes[i].bottom, boxes[j].bottom) - Math.max(boxes[i].top, boxes[j].top)
      expect(overlapWidth > 0 && overlapHeight > 0, `${boxes[i].label} overlaps ${boxes[j].label}`).toBe(false)
    }
  }
})

test('a real activity completes the point, persists progress and opens branches', async ({ page }) => {
  const binByItem = new Map<string, string>()
  for (const level of INFO_SORT_LEVELS) {
    const labels = new Map(level.bins.map(bin => [bin.id, bin.label]))
    for (const item of level.items) binByItem.set(item.label, labels.get(item.bin)!)
  }

  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/path.html?grade=2')
  await page.locator('.path-node--open').click()
  await expect(page.locator('#site-header')).toBeHidden()
  await expect(page.locator('#site-footer')).toBeHidden()
  await expect(page.locator('#path-activity')).toHaveCSS('position', 'fixed')

  const totalItems = INFO_SORT_LEVELS.reduce((total, level) => total + level.items.length, 0)
  for (let i = 0; i < totalItems; i += 1) {
    const item = await page.locator('.sg__item-label').textContent()
    const bin = item ? binByItem.get(item) : undefined
    expect(bin, `missing bin for ${item}`).toBeTruthy()
    await page.locator('.sg__bin', { hasText: bin! }).click()
  }

  await expect(page.locator('#path-done')).toBeVisible()
  await page.locator('#path-done-map-btn').click()
  await expect(page.locator('.path-node--done')).toHaveCount(1)
  await expect(page.locator('.path-node--open')).toHaveCount(3)
  const stored = await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)
  expect(stored).toContain('g2-info-start')
})

test('selected parent profile loads its server snapshot without mixing local profile data', async ({ page }) => {
  const profileId = '00000000-0000-4000-8000-0000000000a3'
  await page.addInitScript(({ profileId }) => {
    sessionStorage.setItem('parent_session', JSON.stringify({
      accessToken: 'parent-access', refreshToken: 'parent-refresh', email: 'mama@example.com',
      activeChildProfileId: profileId,
    }))
    localStorage.setItem('rozumko:path-progress:v1:local', JSON.stringify({
      version: 1,
      points: { 'g2-final': { pointId: 'g2-final', status: 'completed', bestStars: 3, attempts: 1, updatedAt: '2026-07-10T09:00:00Z' } },
      queue: [],
    }))
    const originalFetch = window.fetch.bind(window)
    ;(window as any).__parentRequests = []
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes(`/api/parent/profiles/${profileId}/path-progress`)) {
        const headers = new Headers(init?.headers)
        ;(window as any).__parentRequests.push(headers.get('Authorization') ?? '')
        return new Response(JSON.stringify({ childProfileId: profileId, pathId: 'grade-2', progress: [
          { pointId: 'g2-info-start', status: 'completed', bestStars: 2, attempts: 1, updatedAt: '2026-07-10T10:00:00Z' },
        ] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return originalFetch(input, init)
    }
  }, { profileId })

  await page.goto('/path.html?grade=2')
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('parent_session') ?? 'null')?.activeChildProfileId)).toBe(profileId)
  await expect.poll(() => page.evaluate(() => (window as any).__parentRequests.length)).toBeGreaterThan(0)
  await expect(page.locator('.path-node--done')).toHaveCount(1)
  await expect(page.locator('.path-node--open')).toHaveCount(3)
  await expect(page.getByRole('button', { name: /Фінальна місія/ })).toBeDisabled()
  expect(await page.evaluate(() => (window as any).__parentRequests)).toContain('Bearer parent-access')
})
