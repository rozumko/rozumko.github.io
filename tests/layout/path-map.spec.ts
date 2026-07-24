import { test, expect, type Page } from '@playwright/test'
import { INFO_SORT_LEVELS } from '../../features/games/sorting-data'
import { GRADE2_PATH } from '../../features/path/path-data'

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

async function expectElementInViewport(page: Page, selector: string) {
  await expect.poll(() => page.locator(selector).evaluate((el) => {
    const box = el.getBoundingClientRect()
    return box.top >= 0 && box.bottom <= window.innerHeight
  })).toBe(true)
}

test('grade 1 has its own nine-point path with one visual starting activity', async ({ page }) => {
  await page.goto('/path.html?grade=1')
  await expect(page.locator('#path-subtitle')).toContainText('Шлях 1 класу')
  await expect(page.locator('.path-node')).toHaveCount(9)
  await expect(page.locator('.path-node--open')).toHaveCount(1)
  await expect(page.locator('.path-node--open')).toHaveAccessibleName(/Знайди спільну ознаку/)
  await expect(page.locator('.path-node--locked')).toHaveCount(8)
  await expect(page.locator('.path-node--locked').first()).toHaveAccessibleName(/попереду/)
  await expect(page.locator('.path-node--locked .path-node__badge').first()).not.toHaveText('🔒')
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

test('grade 1 sorting activity keeps its child-friendly presentation', async ({ page }) => {
  await page.goto('/path.html?grade=1')
  await page.locator('.path-node--open').click()

  await expect(page.locator('.sg__item')).toBeVisible()
  const presentation = await page.evaluate(() => {
    const item = document.querySelector<HTMLElement>('.sg__item')!
    const bin = document.querySelector<HTMLElement>('.sg__bin')!
    return {
      itemBackground: getComputedStyle(item).backgroundColor,
      itemRadius: parseFloat(getComputedStyle(item).borderRadius),
      binBorder: parseFloat(getComputedStyle(bin).borderTopWidth),
      binHeight: bin.getBoundingClientRect().height,
    }
  })

  expect(presentation.itemBackground).not.toBe('rgba(0, 0, 0, 0)')
  expect(presentation.itemRadius).toBeGreaterThanOrEqual(16)
  expect(presentation.binBorder).toBeGreaterThan(0)
  expect(presentation.binHeight).toBeGreaterThanOrEqual(44)
})

test('grade 2 lesson activity keeps its card and primary action presentation', async ({ page }) => {
  await page.goto('/path.html?grade=2')
  await page.locator('.path-node--open').click()

  await expect(page.locator('.lsn-card')).toBeVisible()
  const presentation = await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>('.lsn-card')!
    const next = document.querySelector<HTMLElement>('.lsn__next')!
    return {
      cardBackground: getComputedStyle(card).backgroundColor,
      cardRadius: parseFloat(getComputedStyle(card).borderRadius),
      cardBorder: parseFloat(getComputedStyle(card).borderTopWidth),
      nextHeight: next.getBoundingClientRect().height,
      nextBackgroundColor: getComputedStyle(next).backgroundColor,
      nextBackground: getComputedStyle(next).backgroundImage,
    }
  })

  expect(presentation.cardBackground).not.toBe('rgba(0, 0, 0, 0)')
  expect(presentation.cardRadius).toBeGreaterThanOrEqual(16)
  expect(presentation.cardBorder).toBeGreaterThan(0)
  expect(presentation.nextHeight).toBeGreaterThanOrEqual(44)
  expect(
    presentation.nextBackgroundColor !== 'rgba(0, 0, 0, 0)' || presentation.nextBackground !== 'none',
  ).toBe(true)
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

  test(`grade ${path.grade} mission uses the shared quiz presentation`, async ({ page }) => {
    await page.goto(`/path.html?grade=${path.grade}`)
    await page.locator('.path-node--open').click()

    await expect(page.locator('#mission-quiz')).toBeVisible()
    await expect(page.locator('.quiz-question-card')).toBeVisible()
    const presentation = await page.locator('#mission-quiz').evaluate((mission) => {
      const card = mission.querySelector<HTMLElement>('.quiz-question-card')!
      const answer = mission.querySelector<HTMLElement>('.quiz-option, .quiz-sort-item')!
      const check = mission.querySelector<HTMLElement>('.quiz-check')
      const cardStyle = getComputedStyle(card)
      const answerStyle = getComputedStyle(answer)
      const checkStyle = check ? getComputedStyle(check) : null
      return {
        cardBackground: cardStyle.backgroundColor,
        cardBackgroundImage: cardStyle.backgroundImage,
        cardRadius: parseFloat(cardStyle.borderRadius),
        cardShadow: cardStyle.boxShadow,
        answerBorder: parseFloat(answerStyle.borderTopWidth),
        answerRadius: parseFloat(answerStyle.borderRadius),
        answerDisplay: answerStyle.display,
        checkHeight: check ? check.getBoundingClientRect().height : null,
        checkBackground: checkStyle?.backgroundColor ?? null,
      }
    })

    expect(
      presentation.cardBackground !== 'rgba(0, 0, 0, 0)' || presentation.cardBackgroundImage !== 'none',
    ).toBe(true)
    expect(presentation.cardRadius).toBeGreaterThanOrEqual(16)
    expect(presentation.cardShadow).not.toBe('none')
    expect(presentation.answerBorder).toBeGreaterThanOrEqual(2)
    expect(presentation.answerRadius).toBeGreaterThanOrEqual(12)
    expect(presentation.answerDisplay).not.toBe('inline')
    if (presentation.checkHeight !== null) {
      expect(presentation.checkHeight).toBeGreaterThanOrEqual(44)
      expect(presentation.checkBackground).not.toBe('rgba(0, 0, 0, 0)')
    }
  })

}

test('unknown grade shows placeholder, not a fallback map', async ({ page }) => {
  await page.goto('/path.html?grade=9')
  await expect(page.locator('#path-subtitle')).toContainText('ще готується')
  await expect(page.locator('#path-map')).not.toBeVisible()
  await expect(page.locator('.path-node')).toHaveCount(0)
  await expect(page.getByRole('link', { name: '← На головну' })).toBeVisible()
})

test('свіжий профіль: 8 точок першого острова, відкрита лише стартова', async ({ page }) => {
  await page.goto('/path.html?grade=2')
  const nodes = page.locator('.path-node')
  await expect(nodes).toHaveCount(8)
  await expect(page.locator('.path-node--open')).toHaveCount(1)
  await expect(page.locator('.path-node--open')).toHaveAccessibleName(/Як ми отримуємо інформацію/)
  await expect(page.locator('.path-node--locked')).toHaveCount(7)
  await expect(page.locator('.path-node--locked').first()).toHaveAccessibleName(/попереду/)
  await expect(page.locator('.path-node--locked .path-node__badge').first()).not.toHaveText('🔒')
})

test('розпочата точка має неповну обводку і не відкриває наступну', async ({ page }) => {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value),
    [STORAGE_KEY, JSON.stringify({
      version: 1,
      points: {
        'g2-info-start': {
          pointId: 'g2-info-start',
          status: 'started',
          bestStars: 0,
          attempts: 0,
          startedAt: '2026-07-10T09:55:00Z',
          updatedAt: '2026-07-10T09:55:00Z',
        },
      },
      queue: [],
    })] as const)
  await page.goto('/path.html?grade=2')
  await expect(page.locator('.path-node--started')).toHaveCount(1)
  await expect(page.locator('.path-node--started')).toHaveAccessibleName(/розпочато/)
  await expect(page.locator('.path-node--open')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Подай інформацію по-різному/ })).toBeDisabled()
})

test('анонімна стартова точка показує adult gate замість відкритих гілок', async ({ page }) => {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value),
    [STORAGE_KEY, progressWith(['g2-info-start'])] as const)
  await page.goto('/path.html?grade=2')
  await expect(page.locator('.path-node--done')).toHaveCount(1)
  await expect(page.locator('.path-node--open')).toHaveCount(0)
  await expect(page.locator('#path-parent-gate')).toBeVisible()
  const gateAndMap = await page.evaluate(() => {
    const gate = document.querySelector('#path-parent-gate')!.getBoundingClientRect()
    const map = document.querySelector('#path-map')!.getBoundingClientRect()
    return { gateBottom: gate.bottom, mapTop: map.top }
  })
  expect(gateAndMap.gateBottom).toBeLessThanOrEqual(gateAndMap.mapTop)
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
      'g2-info-start', 'g2-info-presentation', 'g2-info-processes',
      'g2-info-signs-carriers', 'g2-fact-opinion', 'g2-info-check-protect',
    ])] as const)
  await page.goto('/path.html?grade=2')
  const final = page.getByRole('button', { name: /Згадай факти й повідомлення/ })
  await expect(final).toBeDisabled()
  // Even a legacy local history with all prerequisites cannot unlock more
  // content without an explicitly selected parent-owned profile.
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value),
    [STORAGE_KEY, progressWith([
      'g2-info-start', 'g2-info-presentation', 'g2-info-processes',
      'g2-info-signs-carriers', 'g2-fact-opinion', 'g2-info-check-protect',
      'g2-info-check',
    ])] as const)
  await page.reload()
  await expect(page.getByRole('button', { name: /Згадай факти й повідомлення/ })).toBeDisabled()
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

test('yearly preview renders all four 40-point paths', async ({ page }) => {
  await page.goto('/path.html?preview=yearly')
  await expect(page.locator('.yearly-grade')).toHaveCount(4)
  await expect(page.locator('.yearly-island-slider')).toHaveCount(4)
  await expect(page.locator('.yearly-island')).toHaveCount(20)
  await expect(page.locator('.yearly-point')).toHaveCount(160)
  await expect(page.locator('.yearly-point--placeholder')).not.toHaveCount(0)
  await page.locator('.yearly-point').first().click()
  await expect(page.locator('.yearly-point--selected')).toHaveCount(1)
})

test('yearly preview uses desktop island slides with varied routes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/path.html?preview=yearly&grade=2')
  await expect(page.locator('.yearly-island-slider')).toHaveCount(1)
  await expect(page.locator('.yearly-island-slider__dot')).toHaveCount(5)
  await expect(page.locator('.yearly-island-slider')).toHaveAttribute('data-active-island', '1')
  const routeShapes = await page.locator('.yearly-island__route path').evaluateAll(paths =>
    paths.slice(0, 2).map(path => path.getAttribute('d')))
  expect(routeShapes[0]).not.toBe(routeShapes[1])

  await page.getByRole('button', { name: 'Наступний острів' }).click()
  await expect(page.locator('.yearly-island-slider')).toHaveAttribute('data-active-island', '2')
  const activeOffset = await page.locator('.yearly-island-slider__track')
    .evaluate(track => getComputedStyle(track).getPropertyValue('--active-island').trim())
  expect(activeOffset).toBe('1')
})

test('yearly preview can focus on one grade without horizontal scroll on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/path.html?preview=yearly&grade=2')
  await expect(page.locator('.yearly-grade')).toHaveCount(1)
  await expect(page.locator('.yearly-island')).toHaveCount(5)
  await expect(page.locator('.yearly-island-slider__controls')).toBeHidden()
  await expect(page.locator('.yearly-point')).toHaveCount(40)
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

for (const grade of [1, 2, 3, 4]) {
  test(`grade ${grade} mobile map nodes do not overlap`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/path.html?grade=${grade}`)
    await expectNoNodeOverlap(page)
  })
}

test('map edges stay below the node presentation layer', async ({ page }) => {
  await page.goto('/path.html?grade=2')
  const layers = await page.evaluate(() => ({
    edges: Number(getComputedStyle(document.querySelector('.path-map__edges')!).zIndex),
    nodes: Number(getComputedStyle(document.querySelector('.path-map__nodes')!).zIndex),
    badgeBg: getComputedStyle(document.querySelector('.path-node__badge')!).backgroundColor,
    labelBg: getComputedStyle(document.querySelector('.path-node__label')!).backgroundColor,
  }))
  expect(layers.edges).toBeLessThan(layers.nodes)
  expect(layers.badgeBg).not.toBe('rgba(0, 0, 0, 0)')
  expect(layers.labelBg).not.toBe('rgba(0, 0, 0, 0)')
})

test('lesson next button keeps a stable position across text lengths', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/path.html?grade=2')
  await page.locator('.path-node--open').click()
  await expect(page.locator('.lsn__next')).toBeVisible()
  const first = await page.locator('.lsn__next').boundingBox()
  expect(first).not.toBeNull()

  await page.locator('.lsn__next').click()
  await expect(page.locator('.lsn__next')).toBeVisible()
  const second = await page.locator('.lsn__next').boundingBox()

  await page.locator('.lsn__next').click()
  await expect(page.locator('.lsn__next')).toBeVisible()
  const third = await page.locator('.lsn__next').boundingBox()

  expect(Math.abs(second!.y - first!.y)).toBeLessThanOrEqual(2)
  expect(Math.abs(third!.y - first!.y)).toBeLessThanOrEqual(2)
})

test('a downloaded map revision waits until the active point is closed', async ({ page }) => {
  let releaseBundle!: () => void
  const bundleReady = new Promise<void>(resolve => { releaseBundle = resolve })
  const freshMap = {
    ...GRADE2_PATH,
    version: GRADE2_PATH.version + 1,
    title: 'Deferred map revision',
    points: GRADE2_PATH.points.map((point, index) => index === 0
      ? { ...point, title: 'Fresh first point' }
      : point),
  }

  await page.route('**/path/grade-2.json', async route => {
    await bundleReady
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(freshMap) })
  })
  await page.goto('/path.html?grade=2')
  await page.locator('.path-node--open').click()
  await expect(page.locator('#path-activity')).toBeVisible()

  releaseBundle()
  await expect.poll(() => page.evaluate(() => document.querySelector('#path-subtitle')?.textContent))
    .not.toContain('Deferred map revision')

  await page.locator('#path-back-btn').click()
  await expect(page.locator('#path-subtitle')).toContainText('Deferred map revision')
  await expect(page.locator('.path-node').first()).toHaveAccessibleName(/Fresh first point/)
})

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
  await expectElementInViewport(page, '#path-parent-gate')
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
      points: { 'g2-review-info-1': { pointId: 'g2-review-info-1', status: 'completed', bestStars: 3, attempts: 1, updatedAt: '2026-07-10T09:00:00Z' } },
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
  await expect(page.locator('.path-node--open')).toHaveCount(1)
  await expect(page.locator('.path-node--open')).toHaveAccessibleName(/Подай інформацію по-різному/)
  await expect(page.getByRole('button', { name: /Згадай факти й повідомлення/ })).toBeDisabled()
  expect(await page.evaluate(() => (window as any).__parentRequests)).toContain('Bearer parent-access')
})
