import { test, expect, type Page } from '@playwright/test'
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

async function expectNoNodeOverlap(page: Page) {
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
}

test('grade 1 has its own nine-point path with one visual starting activity', async ({ page }) => {
  await page.goto('/path.html?grade=1')
  await expect(page.locator('#path-subtitle')).toContainText('Шлях 1 класу')
  await expect(page.locator('.path-node')).toHaveCount(9)
  await expect(page.locator('.path-node--open')).toHaveCount(1)
  await expect(page.locator('.path-node--open')).toHaveAccessibleName(/Знайди спільну ознаку/)
  await expect(page.locator('.path-node--locked')).toHaveCount(8)
})

test('grade-1 anonymous progress stops after the first point and asks for an adult', async ({ page }) => {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value),
    [STORAGE_KEY, progressWith(['g1-sort-start'])] as const)
  await page.goto('/path.html?grade=1')
  await expect(page.locator('.path-node--done')).toHaveCount(1)
  await expect(page.locator('.path-node--open')).toHaveCount(0)
  await expect(page.locator('#path-parent-gate')).toBeVisible()
  await expect(page.locator('#path-parent-gate-link')).toHaveAttribute('href', 'parent.html?continuePath=grade-1')
  await expect(page.getByRole('button', { name: /Свято трьох суперсил/ })).toBeDisabled()
})

for (const path of [
  { grade: 3, start: 'g3-algorithms-start', title: 'Команда за командою', final: 'Експедиція трьох напрямів' },
  { grade: 4, start: 'g4-safety-start', title: 'Захисти цифровий світ', final: 'Фінал цифрового дослідника' },
]) {
  test(`grade ${path.grade} has its own nine-point branching path`, async ({ page }) => {
    await page.goto(`/path.html?grade=${path.grade}`)
    await expect(page.locator('#path-subtitle')).toContainText(`Шлях ${path.grade} класу`)
    await expect(page.locator('.path-node')).toHaveCount(9)
    await expect(page.locator('.path-node--open')).toHaveCount(1)
    await expect(page.locator('.path-node--open')).toHaveAccessibleName(new RegExp(path.title))

    await page.evaluate(([key, value]) => localStorage.setItem(key, value),
      [STORAGE_KEY, progressWith([path.start])])
    await page.reload()
    await expect(page.locator('.path-node--done')).toHaveCount(1)
    await expect(page.locator('.path-node--open')).toHaveCount(0)
    await expect(page.locator('#path-parent-gate')).toBeVisible()
    await expect(page.getByRole('button', { name: new RegExp(path.final) })).toBeDisabled()
  })

}

test('unknown grade shows placeholder, not a fallback map', async ({ page }) => {
  await page.goto('/path.html?grade=9')
  await expect(page.locator('#path-subtitle')).toContainText('ще готується')
  await expect(page.locator('#path-map')).not.toBeVisible()
  await expect(page.locator('.path-node')).toHaveCount(0)
  await expect(page.getByRole('link', { name: '← На головну' })).toBeVisible()
})

test('свіжий профіль: 9 точок, відкрита лише стартова', async ({ page }) => {
  await page.goto('/path.html?grade=2')
  const nodes = page.locator('.path-node')
  await expect(nodes).toHaveCount(9)
  await expect(page.locator('.path-node--open')).toHaveCount(1)
  await expect(page.locator('.path-node--open')).toHaveAccessibleName(/Як ми отримуємо інформацію/)
  await expect(page.locator('.path-node--locked')).toHaveCount(8)
})

test('анонімна стартова точка показує adult gate замість відкритих гілок', async ({ page }) => {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value),
    [STORAGE_KEY, progressWith(['g2-info-start'])] as const)
  await page.goto('/path.html?grade=2')
  await expect(page.locator('.path-node--done')).toHaveCount(1)
  await expect(page.locator('.path-node--open')).toHaveCount(0)
  await expect(page.locator('#path-parent-gate')).toBeVisible()
  const done = page.locator('.path-node--done')
  await expect(done).toHaveAccessibleName(/виконано, 2 з 3 зірок/)
})

test('grade-1 completion does not block grade-2 anonymous start', async ({ page }) => {
  // Progress of grade-1 first point must not trigger the adult gate on the grade-2 map.
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value),
    [STORAGE_KEY, progressWith(['g1-sort-start'])] as const)
  await page.goto('/path.html?grade=2')
  await expect(page.locator('#path-parent-gate')).toBeHidden()
  await expect(page.locator('.path-node--open')).toHaveCount(1)
  await expect(page.locator('.path-node--open')).toHaveAccessibleName(/Як ми отримуємо інформацію/)
})

test('anonymous local history cannot bypass the adult gate', async ({ page }) => {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value),
    [STORAGE_KEY, progressWith([
      'g2-info-start', 'g2-ct-multisort', 'g2-fact-opinion',
      'g2-ct-patterns', 'g2-ai-perception', 'g2-digital-safety',
    ])] as const)
  await page.goto('/path.html?grade=2')
  const final = page.getByRole('button', { name: /Фінальна місія/ })
  await expect(final).toBeDisabled()
  // Even a legacy local history with all prerequisites cannot unlock more
  // content without an explicitly selected parent-owned profile.
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value),
    [STORAGE_KEY, progressWith([
      'g2-info-start', 'g2-ct-multisort', 'g2-fact-opinion',
      'g2-ct-patterns', 'g2-ai-perception', 'g2-digital-safety', 'g2-ct-algorithms',
    ])] as const)
  await page.reload()
  await expect(page.getByRole('button', { name: /Фінальна місія/ })).toBeDisabled()
  await expect(page.locator('#path-parent-gate')).toBeVisible()
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

for (const grade of [1, 2, 3, 4]) {
  test(`grade ${grade} mobile map nodes do not overlap`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/path.html?grade=${grade}`)
    await expectNoNodeOverlap(page)
  })
}

/** Проходить мікро-урок точки: картки — «Далі», перевірочні питання — перша відповідь + «Далі». */
async function completeLessonTheory(page: Page) {
  await expect(page.locator('.lsn')).toBeVisible()
  // Крок або показує кнопку «Далі» одразу (картка/відео), або чекає відповіді (квіз).
  while (await page.locator('.lsn').count()) {
    if (await page.locator('.lsn-answer:not(:disabled)').count()) {
      await page.locator('.lsn-answer').first().click()
    }
    const next = page.locator('.lsn__next')
    if (!await next.isVisible()) break
    const label = await next.textContent()
    await next.click()
    if (label?.includes('До практики')) break
  }
}

test('a real anonymous activity persists the first point and shows the adult gate', async ({ page }) => {
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

  // Крок 1/2: теорія перед практикою.
  await expect(page.locator('#path-activity-title')).toContainText('1/2: Теорія')
  await completeLessonTheory(page)
  await expect(page.locator('#path-activity-title')).toContainText('2/2: ІнфоСорт')

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
  await expect(page.locator('.path-node--open')).toHaveCount(0)
  await expect(page.locator('#path-parent-gate')).toBeVisible()
  const stored = await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)
  expect(stored).toContain('g2-info-start')
})

for (const vp of [{ name: 'mobile-375', width: 375, height: 812 }, { name: 'desktop-1280', width: 1280, height: 800 }]) {
  test(`екран теорії вміщується без прокрутки @ ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto('/path.html?grade=2')
    await page.locator('.path-node--open').click()
    await expect(page.locator('.lsn-card__text')).toBeVisible()
    await expect(page.locator('.lsn__next')).toBeVisible()
    const overflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    }))
    expect(overflow.x).toBeLessThanOrEqual(0)
    expect(overflow.y).toBeLessThanOrEqual(0)
  })
}

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
