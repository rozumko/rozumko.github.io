import { test, expect } from '@playwright/test'

test('parent logs in, creates a child profile and explicitly selects it', async ({ page }) => {
  await page.addInitScript(() => {
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
      if (url.includes('/path-progress')) {
        return new Response(JSON.stringify({ childProfileId: '00000000-0000-4000-8000-0000000000a3', pathId: 'grade-2', progress: [] }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        })
      }
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

test('grades without a map are shown honestly and cannot start the grade-2 pilot', async ({ page }) => {
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
  const unavailable = page.getByRole('button', { name: 'Шлях для 3 класу ще готується' })
  await expect(unavailable).toBeDisabled()
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
