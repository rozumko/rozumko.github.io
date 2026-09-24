import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']

/** Teacher API with in-memory classes and students; everything else answers empty. */
async function mockTeacher(page: Page, options: { lessonEngine?: boolean } = {}) {
  const classes: { id: string; name: string; grade: number }[] = []
  const students = new Map<string, { id: string; label: string; createdAt: string }[]>()
  let n = 0
  const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
  await page.addInitScript(() => {
    sessionStorage.setItem('teacher_session', JSON.stringify({ accessToken: 'teacher-token', refreshToken: '', email: 'teacher@example.test' }))
  })
  await page.route('**/api/**', async route => {
    const request = route.request()
    const method = request.method()
    const path = new URL(request.url()).pathname
    const body = method === 'GET' ? null : request.postDataJSON()
    const json = (payload: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) })
    if (path === '/api/teacher/me') return json({ id: 't1', role: 'teacher', name: 'Вчителька', email: 'teacher@example.test', features: { lessonEngine: options.lessonEngine ?? false } })
    if (path === '/api/teacher/classes' && method === 'GET') return json({ classes })
    if (path === '/api/teacher/classes' && method === 'POST') {
      const created = { id: uuid(), name: body.name.trim(), grade: body.grade }
      classes.unshift(created)
      return json({ class: created }, 201)
    }
    const classMatch = /^\/api\/teacher\/classes\/([0-9a-f-]{36})(\/students)?$/.exec(path)
    if (classMatch && !classMatch[2] && method === 'PUT') {
      const cls = classes.find(c => c.id === classMatch[1])!
      cls.name = body.name.trim()
      return json({ class: cls })
    }
    if (classMatch?.[2] && method === 'GET') return json({ students: students.get(classMatch[1]!) ?? [] })
    if (classMatch?.[2] && method === 'POST') {
      const list = students.get(classMatch[1]!) ?? []
      const student = { id: uuid(), label: body.label.trim(), createdAt: new Date().toISOString() }
      list.push(student)
      students.set(classMatch[1]!, list)
      return json({ student }, 201)
    }
    return json({ topics: [], sessions: [], questions: [], events: [], registrations: [], codes: [], results: [], counts: {} })
  })
  return { classes, students }
}

test('a new teacher starts in «Мої класи», creates a class, adds students and renames the class', async ({ page }) => {
  const { classes, students } = await mockTeacher(page, { lessonEngine: true })
  await page.goto('/teacher.html')

  const section = page.locator('#teacher-section-classes')
  await expect(section).toBeVisible()
  await expect(page.locator('[data-section="classes"]')).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('#teacher-start')).toBeVisible()
  // No "coming soon" label: a paused olympiad leaves the menu in production
  // (on loopback it stays available for development).
  await expect(page.getByText('незабаром')).toHaveCount(0)

  await section.getByLabel('Назва').fill('2-А')
  await section.getByLabel('Клас', { exact: true }).selectOption('2')
  await section.getByRole('button', { name: 'Додати клас' }).click()
  await expect(section.locator('#class-form-status')).toContainText('Тепер додайте учнів')
  await expect(page.locator('#teacher-start')).toBeHidden()

  // The new class is selected and the student field is ready.
  await expect(section.locator('.class-picker__item[aria-pressed="true"]')).toContainText('2-А')
  const studentInput = section.getByLabel('Додати учня')
  await expect(studentInput).toBeFocused()
  await studentInput.fill('Маша К.')
  await studentInput.press('Enter')
  await expect(section.locator('.student-row')).toHaveCount(1)
  await studentInput.fill('Учень 2')
  await section.getByRole('button', { name: 'Додати', exact: true }).click()
  await expect(section.locator('.student-row')).toHaveCount(2)
  expect(students.get(classes[0]!.id)!.map(s => s.label)).toEqual(['Маша К.', 'Учень 2'])
  await expect(section.getByRole('link', { name: 'Провести урок' })).toHaveAttribute('href', 'lesson-engine.html')

  await section.getByRole('button', { name: 'Перейменувати' }).click()
  const rename = section.getByLabel('Нова назва класу')
  await rename.fill('2-Б')
  await rename.press('Enter')
  await expect(section.locator('#class-detail-title')).toHaveText('2-Б')
  await expect(section.locator('.class-picker__item')).toHaveText(/2-Б/)
  expect(classes[0]!.name).toBe('2-Б')

  const results = await new AxeBuilder({ page }).include('#dashboard-section').withTags(WCAG_AA_TAGS).analyze()
  expect(results.violations.map(v => v.id)).toEqual([])
})

test('the cabinet reopens the last section and the menu follows the teacher’s work order', async ({ page }) => {
  await mockTeacher(page, { lessonEngine: true })
  await page.goto('/teacher.html')
  const labels = await page.locator('.dashboard-primary-nav .teacher-section-link:visible').allInnerTexts()
  // Olympiad is last; on loopback it is available for development.
  expect(labels.map(l => l.trim())).toEqual(['Мої класи', 'Уроки', 'Класна гра', 'Мої теми й питання', 'Результати ігор', 'Олімпіада'])

  await page.locator('[data-section="school"]').click()
  await expect(page.locator('#teacher-section-school')).toBeVisible()
  await page.reload()
  await expect(page.locator('#teacher-section-school')).toBeVisible()
  await expect(page.locator('#teacher-section-classes')).toBeHidden()
})

test('«Мої класи» fits a phone without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await mockTeacher(page)
  await page.goto('/teacher.html')
  const section = page.locator('#teacher-section-classes')
  await section.getByLabel('Назва').fill('1-В')
  await section.getByRole('button', { name: 'Додати клас' }).click()
  await expect(section.locator('#class-detail-title')).toHaveText('1-В')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  const results = await new AxeBuilder({ page }).include('#teacher-section-classes').withTags(WCAG_AA_TAGS).analyze()
  expect(results.violations.flatMap(v => v.nodes.map(n => `${v.id}: ${n.target.join(' ')} ${n.failureSummary}`))).toEqual([])
})
