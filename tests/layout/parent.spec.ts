import { test, expect } from '@playwright/test'

test('parent logs in, creates a child profile and explicitly selects it', async ({ page }) => {
  await page.addInitScript(() => {
    // Login requires a Turnstile token (Supabase captcha covers the password
    // grant). Stub the API so loadTurnstile never injects the real script.
    ;(window as any).turnstile = {
      render: () => 'stub-widget',
      getResponse: () => 'stub-captcha-token',
      reset: () => {},
    }
    const originalFetch = window.fetch.bind(window)
    ;(window as any).__parentProfiles = []
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('/auth/v1/token?grant_type=password')) {
        return new Response(JSON.stringify({
          access_token: 'parent-access', refresh_token: 'parent-refresh',
          user: { email: 'mama@example.com' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.includes('/api/parent/register')) {
        return new Response(JSON.stringify({ status: 'active', email: 'mama@example.com', emailVerified: true }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.endsWith('/api/parent/profiles') && init?.method === 'POST') {
        const payload = JSON.parse(String(init.body))
        const profile = { id: '00000000-0000-4000-8000-0000000000a3', displayName: payload.displayName, grade: payload.grade }
        ;(window as any).__parentProfiles.push(profile)
        return new Response(JSON.stringify(profile), { status: 201, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.endsWith('/api/parent/profiles')) {
        return new Response(JSON.stringify({ profiles: (window as any).__parentProfiles }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.endsWith('/api/parent/entitlement')) {
        return new Response(JSON.stringify({ status: 'none', hasAccess: false, currentPeriodEnd: null }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.endsWith('/reports')) {
        return new Response(JSON.stringify({
          childProfileId: '00000000-0000-4000-8000-0000000000a3', reports: [],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.includes('/path-progress')) {
        return new Response(JSON.stringify({ childProfileId: '00000000-0000-4000-8000-0000000000a3', pathId: 'grade-2', progress: [] }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/api/parent/')) throw new Error(`Unexpected parent API request: ${url}`)
      return originalFetch(input, init)
    }
  })

  await page.goto('/parent.html')
  await expect(page.getByRole('heading', { name: 'Кабінет батьків' })).toBeVisible()
  await page.locator('#parent-login-email').fill('mama@example.com')
  await page.locator('#parent-login-password').fill('correct-password')
  await page.locator('#parent-login-submit').click()

  await expect(page.getByRole('heading', { name: 'Хто сьогодні грає?' })).toBeVisible()
  await expect(page.locator('#parent-dashboard-status')).toContainText('Додайте перший профіль')

  await page.locator('#parent-child-name').fill('Марійка')
  await page.locator('#parent-child-grade').selectOption('2')
  await page.locator('#parent-profile-submit').click()
  await expect(page.locator('.parent-profile-card')).toHaveCount(1)
  await expect(page.locator('.parent-profile-card')).toContainText('Марійка')

  await page.getByRole('button', { name: 'Обрати й грати' }).click()
  await expect(page).toHaveURL(/path\.html\?grade=2/)
  const activeProfile = await page.evaluate(() => JSON.parse(sessionStorage.getItem('parent_session') ?? 'null')?.activeChildProfileId)
  expect(activeProfile).toBe('00000000-0000-4000-8000-0000000000a3')
})

test('grade-3 profile opens the grade-3 path', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('parent_session', JSON.stringify({
      accessToken: 'parent-access', refreshToken: 'parent-refresh', email: 'mama@example.com', activeChildProfileId: null,
    }))
    window.fetch = async input => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const data = url.includes('/register')
        ? { status: 'active', email: 'mama@example.com', emailVerified: true }
        : { profiles: [{ id: '00000000-0000-4000-8000-0000000000b3', displayName: 'Оленка', grade: 3 }] }
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
  })
  await page.goto('/parent.html')
  await page.getByRole('button', { name: 'Обрати й грати' }).click()
  await expect(page).toHaveURL(/path\.html\?grade=3/)
})

test('grade-1 child profile can open its own path', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('parent_session', JSON.stringify({
      accessToken: 'parent-access', refreshToken: 'parent-refresh', email: 'mama@example.com', activeChildProfileId: null,
    }))
    window.fetch = async input => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const data = url.includes('/register')
        ? { status: 'active', email: 'mama@example.com', emailVerified: true }
        : url.endsWith('/entitlement')
          ? { status: 'none', hasAccess: false, currentPeriodEnd: null }
          : url.endsWith('/reports')
            ? { childProfileId: '00000000-0000-4000-8000-0000000000c3', reports: [] }
            : { profiles: [{ id: '00000000-0000-4000-8000-0000000000c3', displayName: 'Софійка', grade: 1 }] }
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
  })
  await page.goto('/parent.html')
  await page.getByRole('button', { name: 'Обрати й грати' }).click()
  await expect(page).toHaveURL(/path\.html\?grade=1/)
})

test('profile without a map grade shows disabled "Шлях готується" button', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('parent_session', JSON.stringify({
      accessToken: 'parent-access', refreshToken: 'parent-refresh', email: 'mama@example.com', activeChildProfileId: null,
    }))
    window.fetch = async input => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const data = url.includes('/register')
        ? { status: 'active', email: 'mama@example.com', emailVerified: true }
        // Inject a grade=5 profile to simulate a future grade not yet in PATHS_BY_GRADE
        : { profiles: [{ id: '00000000-0000-4000-8000-0000000000f3', displayName: 'Майбутній', grade: 5 }] }
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
  })
  await page.goto('/parent.html')
  const button = page.getByRole('button', { name: 'Шлях для 5 класу ще готується' })
  await expect(button).toBeVisible()
  await expect(button).toBeDisabled()
})

test('parent auth stays usable without horizontal scroll on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/parent.html')
  await expect(page.locator('#parent-login-email')).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('parent overview shows server entitlement and latest child report', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('parent_session', JSON.stringify({
      accessToken: 'parent-access', refreshToken: 'parent-refresh', email: 'mama@example.com', activeChildProfileId: null,
    }))
    window.fetch = async input => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      let data: unknown
      if (url.includes('/api/parent/register')) {
        data = { status: 'active', email: 'mama@example.com', emailVerified: true }
      } else if (url.endsWith('/api/parent/profiles')) {
        data = { profiles: [{ id: '00000000-0000-4000-8000-0000000000a3', displayName: 'Марійка', grade: 2 }] }
      } else if (url.endsWith('/api/parent/entitlement')) {
        data = { status: 'active', hasAccess: true, currentPeriodEnd: '2026-08-10T00:00:00.000Z' }
      } else if (url.endsWith('/reports')) {
        data = {
          childProfileId: '00000000-0000-4000-8000-0000000000a3',
          reports: [{
            missionId: 'ct-practice-1', track: 'computational-thinking', grade: 2,
            kind: 'practice', createdAt: '2026-07-10T10:00:00.000Z',
            report: {
              correct: 5, total: 6,
              strengths: ['Добре знаходить закономірності.'],
              struggles: [], patterns: [],
              nextMission: { missionId: 'ct-practice-2', reason: 'Потренувати уважне читання умов.' },
            },
          }],
        }
      } else {
        data = {}
      }
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
  })

  await page.goto('/parent.html')
  await expect(page.locator('#parent-entitlement')).toContainText('Домашній доступ активний')
  const report = page.locator('.parent-report-card')
  await expect(report).toContainText('Марійка')
  await expect(report).toContainText('5 із 6 завдань')
  await expect(report).toContainText('Добре знаходить закономірності.')
  await expect(report).toContainText('Потренувати уважне читання умов.')
})

test('parent edits an owned child profile and incompatible active grade is cleared', async ({ page }) => {
  await page.addInitScript(() => {
    const profile = { id: '00000000-0000-4000-8000-0000000000a3', displayName: 'Марійка', grade: 2 }
    ;(window as any).__editableProfile = profile
    sessionStorage.setItem('parent_session', JSON.stringify({
      accessToken: 'parent-access', refreshToken: 'parent-refresh', email: 'mama@example.com', activeChildProfileId: profile.id,
    }))
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      let data: unknown
      if (url.includes('/api/parent/register')) {
        data = { status: 'active', email: 'mama@example.com', emailVerified: true }
      } else if (url.endsWith(`/api/parent/profiles/${profile.id}`) && init?.method === 'PATCH') {
        Object.assign((window as any).__editableProfile, JSON.parse(String(init.body)))
        data = (window as any).__editableProfile
      } else if (url.endsWith('/api/parent/profiles')) {
        data = { profiles: [(window as any).__editableProfile] }
      } else if (url.endsWith('/api/parent/entitlement')) {
        data = { status: 'none', hasAccess: false, currentPeriodEnd: null }
      } else if (url.endsWith('/reports')) {
        data = { childProfileId: profile.id, reports: [] }
      } else {
        data = {}
      }
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
  })

  await page.goto('/parent.html')
  await page.getByRole('button', { name: 'Редагувати профіль' }).click()
  const form = page.getByRole('form', { name: 'Редагувати профіль Марійка' })
  await form.getByLabel('Ім’я профілю').fill('Марта')
  await form.getByLabel('Клас').selectOption('3')
  await form.getByRole('button', { name: 'Зберегти' }).click()

  await expect(page.locator('.parent-profile-card')).toContainText('Марта')
  await expect(page.locator('.parent-profile-card')).toContainText('3 клас')
  const activeProfile = await page.evaluate(() => JSON.parse(sessionStorage.getItem('parent_session') ?? 'null')?.activeChildProfileId)
  expect(activeProfile).toBeNull()
})

test('parent explicitly imports only the anonymous first mission into a matching profile', async ({ page }) => {
  const profileId = '00000000-0000-4000-8000-0000000000d3'
  await page.addInitScript(({ profileId }) => {
    if (!sessionStorage.getItem('__parentFixtureSeeded')) {
      sessionStorage.setItem('parent_session', JSON.stringify({
        accessToken: 'parent-access', refreshToken: 'parent-refresh', email: 'mama@example.com', activeChildProfileId: null,
      }))
      sessionStorage.setItem('__parentFixtureSeeded', '1')
    }
    if (!sessionStorage.getItem('__anonymousFixtureSeeded')) {
      localStorage.setItem('rozumko:path-progress:v1:local', JSON.stringify({
        version: 1,
        points: { 'g1-sort-start': { pointId: 'g1-sort-start', status: 'completed', bestStars: 3, attempts: 1, updatedAt: '2026-07-11T08:00:00.000Z' } },
        queue: [{
          key: 'g1-start-result', pointId: 'g1-sort-start',
          result: {
            type: 'game', activityId: 'path:g1-sort-start:attributes', activityVersion: 1,
            stars: 3, correct: 8, total: 8, completedAt: '2026-07-11T08:00:00.000Z',
          },
        }],
      }))
      sessionStorage.setItem('__anonymousFixtureSeeded', '1')
    }
    if (!sessionStorage.getItem('__importPayloads')) sessionStorage.setItem('__importPayloads', '[]')
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      let data: unknown = {}
      let status = 200
      if (url.includes('/api/parent/register')) {
        data = { status: 'active', email: 'mama@example.com', emailVerified: true }
      } else if (url.endsWith('/api/parent/profiles')) {
        data = { profiles: [
          { id: profileId, displayName: 'Софійка', grade: 1 },
          { id: '00000000-0000-4000-8000-0000000000e3', displayName: 'Марко', grade: 2 },
        ] }
      } else if (url.endsWith('/api/parent/entitlement')) {
        data = { status: 'none', hasAccess: false, currentPeriodEnd: null }
      } else if (url.endsWith('/reports')) {
        data = { childProfileId: profileId, reports: [] }
      } else if (url.includes(`/api/parent/profiles/${profileId}/path-progress`) && init?.method === 'POST') {
        const payloads = JSON.parse(sessionStorage.getItem('__importPayloads') ?? '[]')
        payloads.push(JSON.parse(String(init.body)))
        sessionStorage.setItem('__importPayloads', JSON.stringify(payloads))
        data = { pointId: 'g1-sort-start', status: 'completed', bestStars: 3, attempts: 1, updatedAt: '2026-07-11T08:00:00.000Z', trust: 'client-unverified', duplicate: false }
        status = 201
      } else if (url.includes('/path-progress')) {
        data = { childProfileId: profileId, pathId: 'grade-1', progress: [] }
      }
      return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
    }
  }, { profileId })

  await page.goto('/parent.html?continuePath=grade-1')
  await expect(page.locator('#parent-path-import')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Зберегти першу місію тут' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Зберегти першу місію тут' }).click()
  await expect(page).toHaveURL(/path\.html\?grade=1/)
  const result = await page.evaluate(() => ({
    payloads: JSON.parse(sessionStorage.getItem('__importPayloads') ?? '[]'),
    anonymous: localStorage.getItem('rozumko:path-progress:v1:local'),
    active: JSON.parse(sessionStorage.getItem('parent_session') ?? 'null')?.activeChildProfileId,
  }))
  expect(result.payloads).toHaveLength(1)
  expect(result.payloads[0].pointId).toBe('g1-sort-start')
  expect(result.payloads[0].results[0].trust).toBe('client-unverified')
  // clearPoint видаляє лише імпортовану точку, а не весь ключ
  const anonymousState = result.anonymous ? JSON.parse(result.anonymous) : null
  expect(anonymousState?.points?.['g1-sort-start']).toBeUndefined()
  expect(anonymousState?.queue ?? []).toHaveLength(0)
  expect(result.active).toBe(profileId)
})
