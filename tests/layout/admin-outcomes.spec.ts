import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { OutcomeValidationError, outcomeColumns, prepareOutcome } from '../../backend/src/lib/curriculum-outcome-rules'

const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']

interface Row {
  id: string
  subjectPackId: string
  code: string
  titleUk: string
  titleEn: string | null
  source: string
  sourceRef: string | null
  gradeBand: string | null
  mappings: { framework: string; ref: string }[]
  status: 'active' | 'archived'
  editVersion: number
  updatedAt: string
}

const seed = (): Row[] => [{
  id: 'int-files-organize', subjectPackId: 'informatics-ua-primary', code: 'INF-2-FILES-2',
  titleUk: 'Створює, перейменовує, переміщує та знаходить файли в тематичній папці', titleEn: null,
  source: 'internal', sourceRef: null, gradeBand: '1-2', mappings: [], status: 'active', editVersion: 1,
  updatedAt: '2026-09-24T10:00:00.000Z',
}]

/** Admin API with an in-memory outcome directory, validated by the real backend rules. */
async function mockAdmin(page: Page, options: { lessonEngine: boolean }) {
  const rows = seed()
  const writes: unknown[] = []
  await page.addInitScript(() => {
    sessionStorage.setItem('teacher_session', JSON.stringify({ accessToken: 'admin-test-token', refreshToken: '', email: 'admin@example.test' }))
  })
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path === '/api/teacher/me') return json({ id: 'admin-1', role: 'admin', name: 'Test Admin', features: { lessonEngine: options.lessonEngine } })
    if (path === '/api/admin/stats') return json({ teachers: 0, parents: 0, codes: 0, results: 0, events: 0 })
    if (path === '/api/admin/curriculum/packs') {
      return json({ packs: [{ id: 'informatics-ua-primary', subject: 'informatics', title: { uk: 'Розумко Інформатика 1–4' }, gradeRange: { min: 1, max: 4 } }] })
    }
    if (path === '/api/admin/curriculum/outcomes' && request.method() === 'GET') {
      return json({ outcomes: rows, usage: { 'int-files-organize': ['g2-m2-l8'] } })
    }
    try {
      if (path === '/api/admin/curriculum/outcomes' && request.method() === 'POST') {
        const body = request.postDataJSON() as { subjectPackId: string; id?: string; outcome: unknown }
        writes.push(body)
        const outcome = outcomeColumns(prepareOutcome(body.outcome))
        if (rows.some(r => r.code === outcome.code)) return json({ error: 'Результат з таким id або кодом уже є в цьому предметі' }, 409)
        const row: Row = { id: body.id ?? 'out-0123456789', subjectPackId: body.subjectPackId, ...outcome, status: 'active', editVersion: 1, updatedAt: '' }
        rows.push(row)
        return json({ outcome: row }, 201)
      }
      const statusMatch = /^\/api\/admin\/curriculum\/outcomes\/([a-z0-9-]+)\/status$/.exec(path)
      if (statusMatch) {
        const body = request.postDataJSON() as { status: Row['status']; expectedEditVersion: number }
        writes.push(body)
        const row = rows.find(r => r.id === statusMatch[1])!
        Object.assign(row, { status: body.status, editVersion: row.editVersion + 1 })
        return json({ outcome: row })
      }
      const editMatch = /^\/api\/admin\/curriculum\/outcomes\/([a-z0-9-]+)$/.exec(path)
      if (editMatch) {
        const body = request.postDataJSON() as { outcome: unknown; expectedEditVersion: number }
        writes.push(body)
        const row = rows.find(r => r.id === editMatch[1])!
        Object.assign(row, outcomeColumns(prepareOutcome(body.outcome)), { editVersion: row.editVersion + 1 })
        return json({ outcome: row })
      }
    } catch (err) {
      if (err instanceof OutcomeValidationError) return json({ error: err.message, issues: err.issues }, 400)
      throw err
    }
    // Other dashboard panels: empty but well-formed.
    return json({ teachers: [], parents: [], events: [], results: [], questions: [], lessons: [], missions: [], maps: [], runs: [], items: [] })
  })
  return { rows, writes }
}

test('without the Lesson Engine the outcomes tab stays hidden', async ({ page }) => {
  await mockAdmin(page, { lessonEngine: false })
  await page.goto('/admin.html')
  await expect(page.locator('#stat-teachers')).toHaveText('0')
  await expect(page.getByRole('button', { name: 'Результати навчання' })).toBeHidden()
})

test('an admin adds a NUSH outcome with a Cambridge mapping, sees server errors, edits and archives', async ({ page }) => {
  const { rows, writes } = await mockAdmin(page, { lessonEngine: true })
  await page.goto('/admin.html')
  await page.getByRole('button', { name: 'Результати навчання' }).click()

  const tab = page.locator('#tab-outcomes')
  await expect(tab.locator('.question-item')).toHaveCount(1)
  await expect(tab).toContainText('INF-2-FILES-2')
  await expect(tab).toContainText('уроків: 1')

  // New outcome: HTML in the wording is refused by the server rules with a readable message.
  await page.getByRole('button', { name: 'Додати результат' }).click()
  const modal = page.getByRole('dialog', { name: 'Новий результат навчання' })
  await expect(modal).toBeVisible()
  await modal.getByLabel('Код').fill('2 ІФО 2.1-1')
  await modal.getByLabel('Формулювання', { exact: true }).fill('<b>Складає</b> прості послідовності команд')
  await modal.getByRole('button', { name: 'Відповідність' }).click()
  await modal.getByLabel('Відповідність 1: документ (nush, cambridge…)').fill('cambridge')
  await modal.getByLabel('Відповідність 1: код або критерій').fill('3Pc.01')
  await modal.getByRole('button', { name: 'Зберегти' }).click()
  await expect(modal.locator('#of-error')).toContainText('Формулювання: без HTML-розмітки')

  const results = await new AxeBuilder({ page }).include('#outcome-modal').withTags(WCAG_AA_TAGS).analyze()
  expect(results.violations.map(v => v.id)).toEqual([])

  await modal.getByLabel('Формулювання', { exact: true }).fill('Складає прості послідовності команд')
  await modal.getByRole('button', { name: 'Зберегти' }).click()
  await expect(modal).toBeHidden()
  expect(writes[writes.length - 1]).toEqual({
    subjectPackId: 'informatics-ua-primary',
    outcome: {
      code: '2 ІФО 2.1-1', title: { uk: 'Складає прості послідовності команд' }, source: 'national-standard',
      mappings: [{ framework: 'cambridge', ref: '3Pc.01' }],
    },
  })
  await expect(tab.locator('.question-item')).toHaveCount(2)

  // Search by the Cambridge code finds it.
  await tab.getByLabel('Пошук результатів').fill('3pc.01')
  await expect(tab.locator('.question-item')).toHaveCount(1)
  const item = tab.locator('.question-item').first()
  await expect(item).toContainText('Державний стандарт (НУШ)')
  await expect(item).toContainText('не використовується')

  // Edit keeps the id and pack fixed.
  await item.getByRole('button', { name: 'Редагувати' }).click()
  const edit = page.getByRole('dialog', { name: 'Редагувати: 2 ІФО 2.1-1' })
  await expect(edit.getByLabel('ID (необов\'язково)')).toBeDisabled()
  await expect(edit.getByLabel('Предмет')).toBeDisabled()
  await edit.getByLabel('Класи').fill('1-2')
  await edit.getByRole('button', { name: 'Зберегти' }).click()
  await expect(edit).toBeHidden()
  expect(writes[writes.length - 1]).toMatchObject({ expectedEditVersion: 1, outcome: { gradeBand: '1-2' } })

  // Archiving an outcome a lesson uses warns about that lesson first.
  await tab.getByLabel('Пошук результатів').fill('')
  await tab.locator('[data-outcome-id="int-files-organize"]').getByRole('button', { name: 'Зняти з використання' }).click()
  await expect(page.locator('#modal-message')).toContainText('g2-m2-l8')
  await page.locator('#modal-ok-btn').click()
  await expect.poll(() => rows.find(r => r.id === 'int-files-organize')!.status).toBe('archived')
  await expect(tab.locator('.question-item')).toHaveCount(1)
  await tab.getByLabel('Стан результату').selectOption('archived')
  await expect(tab.locator('.question-item')).toHaveCount(1)
  await expect(tab).toContainText('INF-2-FILES-2')
})
