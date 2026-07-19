import { test, expect } from '@playwright/test'

test('auth confirmation keeps the token out of history and continues only to the trusted Supabase endpoint', async ({ page }) => {
  const tokenHash = `pkce_${'a'.repeat(48)}`
  await page.goto('/auth-confirm.html')
  const redirectTo = `${new URL(page.url()).origin}/teacher.html`
  const requestPromise = page.waitForRequest(request => request.url().includes('/auth/v1/verify?'))
  await page.route('https://ivcufigpmamgkfxwulzl.supabase.co/auth/v1/verify?**', route => route.abort())

  await page.goto(`/auth-confirm.html?token_hash=${tokenHash}&type=recovery&redirect_to=${encodeURIComponent(redirectTo)}`)

  await expect(page).toHaveURL(/\/auth-confirm\.html$/)
  const action = page.getByRole('button', { name: 'Змінити пароль' })
  await expect(action).toBeVisible()
  await action.click()

  const requestUrl = new URL((await requestPromise).url())
  expect(requestUrl.origin).toBe('https://ivcufigpmamgkfxwulzl.supabase.co')
  expect(requestUrl.pathname).toBe('/auth/v1/verify')
  expect(requestUrl.searchParams.get('token')).toBe(tokenHash)
  expect(requestUrl.searchParams.get('type')).toBe('recovery')
  expect(requestUrl.searchParams.get('redirect_to')).toBe(redirectTo)
})

test('auth confirmation rejects an external redirect target', async ({ page }) => {
  await page.goto(`/auth-confirm.html?token_hash=${'a'.repeat(48)}&type=signup&redirect_to=https%3A%2F%2Fevil.example%2Fteacher.html`)

  await expect(page).toHaveURL(/\/auth-confirm\.html$/)
  await expect(page.getByRole('status')).toContainText('Посилання недійсне')
  await expect(page.locator('#auth-confirm-button')).toBeHidden()
})
