import { test, expect } from '@playwright/test'

test('teacher recovery callback exchanges a PKCE code and opens reset mode on a clean document', async ({ page }) => {
  await page.addInitScript(() => {
    if (location.search.includes('code=')) {
      localStorage.setItem('rozumko_auth_pkce_teacher', JSON.stringify({
        verifier: 'b'.repeat(64),
        flow: 'recovery',
        createdAt: Date.now(),
      }))
    }
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (!url.includes('/auth/v1/token?grant_type=pkce')) throw new Error(`Unexpected request: ${url}`)
      const body = JSON.parse(String(init?.body))
      if (body.auth_code !== 'teacher-code' || body.code_verifier !== 'b'.repeat(64)) {
        return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })
      }
      return new Response(JSON.stringify({
        access_token: 'teacher-recovery-access',
        refresh_token: 'teacher-recovery-refresh',
        user: { email: 'teacher@example.com' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
  })

  await page.goto('/teacher.html?code=teacher-code')

  await expect(page.locator('#reset-mode')).toBeVisible()
  await expect(page).toHaveURL(/\/teacher\.html$/)
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('teacher_session') ?? 'null')?.accessToken)).toBe('teacher-recovery-access')
  expect(await page.evaluate(() => localStorage.getItem('rozumko_auth_pkce_teacher'))).toBeNull()
  await expect(page.locator('script[src*="turnstile"]')).toHaveCount(0)
})

test('teacher rejects a forged legacy bearer fragment', async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as any).turnstile = {
      render: () => 'stub-widget',
      getResponse: () => 'stub-captcha-token',
      reset: () => {},
    }
  })

  await page.goto('/teacher.html#access_token=attacker-token&refresh_token=attacker-refresh&type=signup')

  await expect(page.locator('#login-error')).toContainText('застарілий формат')
  expect(await page.evaluate(() => sessionStorage.getItem('teacher_session'))).toBeNull()
  await expect(page).toHaveURL(/\/teacher\.html$/)
})

test('teacher leaves an authenticated document before loading the registration widget', async ({ page }) => {
  await page.addInitScript(() => {
    const loads = Number(sessionStorage.getItem('__teacher_auth_loads') ?? '0') + 1
    sessionStorage.setItem('__teacher_auth_loads', String(loads))
    if (loads === 1) {
      sessionStorage.setItem('teacher_session', JSON.stringify({
        accessToken: 'existing-access',
        refreshToken: 'existing-refresh',
        email: 'teacher@example.com',
      }))
    }
    ;(window as any).turnstile = {
      render: () => 'stub-widget',
      getResponse: () => 'stub-captcha-token',
      reset: () => {},
    }
    window.fetch = async input => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.endsWith('/api/teacher/me')) {
        return new Response(JSON.stringify({ error: 'Teacher account is not created', code: 'ACCOUNT_UNKNOWN' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/auth/v1/logout')) return new Response(null, { status: 204 })
      throw new Error(`Unexpected request: ${url}`)
    }
  })

  await page.goto('/teacher.html')
  await page.locator('#show-register-btn').click()

  await expect(page.locator('#register-mode')).toBeVisible()
  expect(await page.evaluate(() => Number(sessionStorage.getItem('__teacher_auth_loads')))).toBeGreaterThanOrEqual(2)
  expect(await page.evaluate(() => sessionStorage.getItem('teacher_session'))).toBeNull()
})
