import { test, expect } from '@playwright/test'

test('admin parent directory shows only adult account summaries', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('teacher_session', JSON.stringify({
      accessToken: 'admin-test-token',
      refreshToken: '',
      email: 'admin@example.test',
    }))
    window.fetch = async input => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const path = new URL(url).pathname
      const payload = path === '/api/teacher/me'
        ? { id: 'admin-1', role: 'admin', name: 'Test Admin' }
        : path === '/api/admin/stats'
          ? { teachers: 0, parents: 1, codes: 0, results: 0, events: 0 }
          : path === '/api/admin/parents'
            ? { parents: [{
                email: 'parent@example.com',
                status: 'active',
                emailVerified: true,
                profileCount: 2,
                createdAt: '2026-07-17T12:00:00.000Z',
              }] }
            : path === '/api/admin/teachers'
              ? { teachers: [] }
              : path === '/api/admin/events'
                ? { events: [] }
                : path === '/api/admin/results'
                  ? { results: [] }
                  : null
      if (payload == null) throw new Error(`Unexpected request: ${url}`)
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
  })

  await page.goto('/admin.html')
  await page.getByRole('button', { name: 'Батьки' }).click()

  const tab = page.locator('#tab-parents')
  await expect(tab).toBeVisible()
  await expect(tab).toContainText('parent@example.com')
  await expect(tab).toContainText('email підтверджено · профілів дітей: 2')
  await expect(tab).toContainText('Активний')
  await expect(tab).not.toContainText('Марійка')
  await expect(page.locator('#stat-parents')).toHaveText('1')
})
