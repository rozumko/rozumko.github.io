import { expect, test, type Locator, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import {
  CurriculumValidationError,
  curriculumDefinitionChanged,
  curriculumRevisionSnapshot,
  curriculumTransitionError,
  draftFromCurriculumRevision,
  prepareCurriculumDefinition,
} from '../../backend/src/routes/curriculum-editorial'
import { findSubjectPack, withOutcomes } from '../../backend/src/lib/subject-packs'
import type { LearningOutcome } from '../../backend/src/lib/curriculum-lesson-schema'

const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../../backend/src/lib/curriculum-fixtures/${name}`, import.meta.url), 'utf8'))
const PILOT_OUTCOMES = fixture('pilot-outcomes.json') as Record<string, LearningOutcome>
/** The pack as resolveSubjectPack() returns it with the seeded outcome directory. */
const PACK = withOutcomes(findSubjectPack('informatics-ua-primary')!, PILOT_OUTCOMES)

type Status = 'draft' | 'review' | 'published' | 'archived'
interface Row {
  id: string; subjectPackId: string; subject: string; grade: number; moduleId: string | null; lessonNumber: number | null
  title: string; status: Status; editVersion: number; contentVersion: number; publishedVersion: number | null
  draftContent: Record<string, unknown>; publishedSnapshot: Record<string, unknown> | null; publishedAt: string | null; updatedAt: string
}

function columns(lesson: Record<string, any>) {
  return {
    subjectPackId: lesson.subjectPackId, subject: lesson.subject, grade: lesson.grade,
    moduleId: lesson.moduleId ?? null, lessonNumber: lesson.lessonNumber ?? null, title: lesson.title.uk,
  }
}

/** Admin API backed by the real editorial rules (validation, transitions, change detection). */
async function mockCurriculumAdmin(page: Page) {
  const rows = new Map<string, Row>()
  const revisions = new Map<string, { editVersion: number; action: string; snapshot: Record<string, unknown>; createdAt: string }[]>()
  const calls: { method: string; path: string; body: any }[] = []
  const reference = prepareCurriculumDefinition(fixture('g2-m2-l8.lesson.json'), null, 1, PACK)
  const record = (row: Row, action: string) => {
    const list = revisions.get(row.id) ?? []
    list.unshift({ editVersion: row.editVersion, action, snapshot: curriculumRevisionSnapshot({ ...row }), createdAt: '2026-09-24T10:00:00.000Z' })
    revisions.set(row.id, list)
  }
  const seed: Row = {
    id: reference.id, ...columns(reference), status: 'draft', editVersion: 1, contentVersion: 1, publishedVersion: null,
    draftContent: reference as unknown as Record<string, unknown>, publishedSnapshot: null, publishedAt: null, updatedAt: '2026-09-24T10:00:00.000Z',
  }
  rows.set(seed.id, seed)
  record(seed, 'create')

  await page.addInitScript(() => {
    sessionStorage.setItem('teacher_session', JSON.stringify({ accessToken: 'admin-test-token', refreshToken: '', email: 'admin@example.test' }))
  })
  await page.route('**/api/**', async route => {
    const request = route.request()
    const method = request.method()
    const path = new URL(request.url()).pathname
    const body = method === 'GET' ? null : request.postDataJSON()
    const json = (payload: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) })
    if (path.startsWith('/api/admin/curriculum/')) calls.push({ method, path, body })
    try {
      if (path === '/api/teacher/me') return json({ id: 'admin-1', role: 'admin', name: 'Test Admin', features: { lessonEngine: true } })
      if (path === '/api/admin/stats') return json({ teachers: 0, parents: 0, codes: 0, results: 0, events: 0 })
      if (path === '/api/admin/curriculum/packs') {
        return json({ packs: [{
          id: PACK.id, subject: PACK.subject, title: PACK.title, gradeRange: PACK.gradeRange,
          tools: [{ key: 'itnauka-windows', title: { uk: 'Швидкісні вікна' } }],
          games: [{ key: 'windows', levels: ['easy', 'medium', 'hard'] }],
        }] })
      }
      if (path === '/api/admin/curriculum/outcomes') {
        return json({
          outcomes: Object.entries(PILOT_OUTCOMES).map(([id, o]) => ({
            id, subjectPackId: PACK.id, code: o.code, titleUk: o.title.uk, titleEn: null, source: o.source,
            sourceRef: null, gradeBand: o.gradeBand ?? null, mappings: [], status: 'active', editVersion: 1, updatedAt: '',
          })),
          usage: {},
        })
      }
      if (path === '/api/admin/curriculum/lessons' && method === 'GET') {
        return json({ lessons: [...rows.values()].map(({ draftContent: _d, publishedSnapshot: _p, publishedAt: _a, ...summary }) => summary) })
      }
      if (path === '/api/admin/curriculum/lessons/validate') {
        prepareCurriculumDefinition(body.definition, body.lessonId ?? null, 1, PACK)
        return json({ ok: true, issues: [] })
      }
      if (path === '/api/admin/curriculum/lessons' && method === 'POST') {
        const lesson = prepareCurriculumDefinition(body.definition, null, 1, PACK)
        if (rows.has(lesson.id)) return json({ error: 'Урок з таким id вже існує' }, 409)
        const row: Row = {
          id: lesson.id, ...columns(lesson), status: 'draft', editVersion: 1, contentVersion: 1, publishedVersion: null,
          draftContent: lesson as unknown as Record<string, unknown>, publishedSnapshot: null, publishedAt: null, updatedAt: '',
        }
        rows.set(row.id, row)
        record(row, 'create')
        return json({ lesson: row }, 201)
      }
      const match = /^\/api\/admin\/curriculum\/lessons\/([a-z0-9-]+)(\/status|\/revisions|\/restore)?$/.exec(path)
      const row = match ? rows.get(match[1]!) : undefined
      if (match && !row) return json({ error: 'Урок не знайдено' }, 404)
      if (row && !match![2] && method === 'GET') return json({ lesson: row })
      if (row && !match![2] && method === 'PUT') {
        if (body.expectedEditVersion !== row.editVersion) return json({ error: 'Урок уже змінив інший редактор.' }, 409)
        const lesson = prepareCurriculumDefinition(body.definition, row.id, row.contentVersion, PACK)
        if (!curriculumDefinitionChanged(row.draftContent, lesson)) return json({ lesson: row, changed: false })
        lesson.metadata.contentVersion = row.contentVersion + 1
        Object.assign(row, columns(lesson), {
          draftContent: lesson, contentVersion: row.contentVersion + 1, editVersion: row.editVersion + 1, status: 'draft',
        })
        record(row, 'update')
        return json({ lesson: row, changed: true })
      }
      if (row && match![2] === '/status') {
        if (body.expectedEditVersion !== row.editVersion) return json({ error: 'Урок уже змінив інший редактор.' }, 409)
        const error = curriculumTransitionError(row.status, body.status)
        if (error) return json({ error }, 409)
        if (body.status === 'published') {
          const lesson = prepareCurriculumDefinition(row.draftContent, row.id, row.contentVersion, PACK)
          Object.assign(row, { publishedVersion: row.contentVersion, publishedSnapshot: lesson, publishedAt: '2026-09-24T11:00:00.000Z' })
        }
        Object.assign(row, { status: body.status, editVersion: row.editVersion + 1 })
        record(row, 'status')
        return json({ lesson: row })
      }
      if (row && match![2] === '/revisions') return json({ revisions: (revisions.get(row.id) ?? []).map(r => ({ id: `${row.id}-${r.editVersion}`, lessonId: row.id, changedBy: null, ...r })) })
      if (row && match![2] === '/restore') {
        const revision = (revisions.get(row.id) ?? []).find(r => r.editVersion === body.revisionEditVersion)!
        const lesson = prepareCurriculumDefinition(draftFromCurriculumRevision(revision.snapshot), row.id, row.contentVersion + 1, PACK)
        Object.assign(row, columns(lesson), { draftContent: lesson, contentVersion: row.contentVersion + 1, editVersion: row.editVersion + 1, status: 'draft' })
        record(row, 'restore')
        return json({ lesson: row })
      }
    } catch (err) {
      if (err instanceof CurriculumValidationError) {
        if (path.endsWith('/validate')) return json({ ok: false, issues: err.issues })
        return json({ error: err.message, issues: err.issues }, 400)
      }
      throw err
    }
    return json({ teachers: [], parents: [], events: [], results: [], questions: [], lessons: [], missions: [], maps: [], items: [] })
  })
  return { rows, calls }
}

async function openCurriculumTab(page: Page) {
  await page.goto('/admin.html')
  await page.getByRole('button', { name: 'Уроки', exact: true }).click()
  await expect(page.locator('#cl-list .question-item')).toHaveCount(1)
}

const editorView = (page: Page) => page.locator('#cl-editor-view')
const block = (page: Page, id: string) => page.locator(`details[data-block-id="${id}"]`)

/** Opens the «+» after block `after` (0 = the top of the lesson) and picks a menu choice. */
async function insertBlock(view: Locator, after: number, choice: string) {
  const name = after === 0 ? 'Додати блок на початок уроку' : `Додати блок після блоку ${after}`
  await view.getByRole('button', { name, exact: true }).click()
  await view.getByRole('button', { name: choice }).click()
}

test('an admin fixes a lesson with the server’s help, saves it and publishes it in one step', async ({ page }) => {
  const { rows, calls } = await mockCurriculumAdmin(page)
  await openCurriculumTab(page)
  await page.locator('[data-lesson-id="g2-m2-l8"]').getByRole('button', { name: 'Редагувати' }).click()

  const view = editorView(page)
  await expect(view.getByRole('heading', { name: /Файли/ })).toBeVisible()
  await expect(view.locator('.cl-blocks > li')).toHaveCount(15)
  // Coverage: the evidence activity decides one outcome; the other is only practised.
  await expect(view.locator('[data-outcome-id="int-files-name-extension"]')).toHaveClass(/cl-coverage__item--ok/)
  await expect(view.locator('[data-outcome-id="int-files-organize"]')).toHaveClass(/cl-coverage__item--none/)

  // Bad content: HTML in a paragraph is caught by "Перевірити" and pinned to its block.
  const explanation = block(page, 'g2-m2-l8-b05')
  await explanation.locator(':scope > summary').click()
  await explanation.locator('.cl-advanced > summary').click()
  const content = explanation.getByLabel('Зміст блоку (JSON)')
  const original = await content.inputValue()
  await content.fill(original.replace('"paragraphs": [', '"paragraphs": [\n    { "uk": "<b>жирно</b>" },'))
  await view.getByRole('button', { name: 'Перевірити' }).click()
  await expect(view.locator('.cl-issues')).toContainText('Блок 5 (Пояснення): 1')
  await expect(explanation.locator('.cl-block-issues')).toContainText('без HTML')

  // Broken JSON blocks saving until fixed.
  await explanation.locator('.cl-advanced > summary').click()
  await content.fill('{ "heading": ')
  await expect(explanation.locator('.cl-json-error')).toContainText('Помилка JSON')
  await view.getByRole('button', { name: 'Зберегти' }).click()
  await expect(view.locator('.cl-ed-message')).toContainText('Спершу виправте JSON')
  expect(calls.some(c => c.method === 'PUT')).toBe(false)

  await content.fill(original)
  // Status changes wait for a save.
  await expect(view.getByRole('button', { name: 'Опублікувати' })).toBeDisabled()
  // Take the support block onto the board, with two points on its slide.
  const support = block(page, 'g2-m2-l8-b09')
  await support.locator(':scope > summary').click()
  await support.locator('.cl-advanced > summary').click()
  await support.getByLabel('Показувати на дошці').check()
  await support.getByLabel(/Тези на слайді/).fill('Назва підказує вміст\nРозширення — після крапки')
  await view.getByRole('button', { name: 'Зберегти' }).click()
  await expect(view.locator('.cl-ed-message')).toContainText('Збережено. Редакція 2')
  const saved = rows.get('g2-m2-l8')!.draftContent as any
  expect(saved.blocks[8].views.presentation).toBe(true)
  expect(saved.blocks[8].presentation).toEqual({ layout: 'concept', shortText: [{ uk: 'Назва підказує вміст' }, { uk: 'Розширення — після крапки' }] })

  const results = await new AxeBuilder({ page }).include('#tab-curriculum').withTags(WCAG_AA_TAGS).analyze()
  expect(results.violations.map(v => v.id)).toEqual([])

  // Single-editor publishing: review then publish, both through the real transition rules.
  await view.getByRole('button', { name: 'Опублікувати' }).click()
  await page.locator('#modal-ok-btn').click()
  await expect(view.locator('.cl-ed-message')).toContainText('Статус: Опубліковано')
  expect(calls.filter(c => c.path.endsWith('/status')).map(c => c.body.status)).toEqual(['review', 'published'])
  expect(rows.get('g2-m2-l8')!.publishedVersion).toBe(2)
  await expect(view.getByRole('button', { name: 'Зняти з публікації' })).toBeVisible()
})

test('a new lesson gets an activity linked to an outcome from the directory, and coverage follows it', async ({ page }) => {
  const { rows } = await mockCurriculumAdmin(page)
  await openCurriculumTab(page)
  const [templateDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Завантажити шаблон JSON' }).click(),
  ])
  const template = JSON.parse(readFileSync(await templateDownload.path(), 'utf8'))
  expect(template.blocks.map((entry: any) => entry.type)).toEqual(['hero', 'explanation', 'canvas', 'practice', 'activity'])
  expect(prepareCurriculumDefinition(template, null, 1, PACK).blocks).toHaveLength(5)
  await page.getByRole('button', { name: 'Створити з шаблону' }).click()

  const view = editorView(page)
  await expect(view.getByText('Ще не збережено')).toBeVisible()
  const id = view.getByLabel('ID уроку')
  await id.fill('g2-m3-l1')
  await id.press('Tab')
  await view.getByLabel('Назва уроку').fill('Алгоритми навколо нас')

  await insertBlock(view, 1, 'Тест: одна відповідь')
  const activity = block(page, 'g2-m3-l1-b02')
  await expect(activity).toHaveAttribute('open', '')
  await expect(activity.getByLabel('Надсилати на пристрої учнів')).toBeChecked()
  await activity.getByLabel('Запитання або інструкція').fill('Який крок перший?')
  await activity.getByRole('textbox', { name: 'Варіант 1' }).fill('Спланувати дії')
  await activity.getByRole('textbox', { name: 'Варіант 2' }).fill('Виконати дії')
  await activity.getByRole('radio', { name: 'Правильна відповідь: варіант 2' }).check()

  await activity.getByLabel('Пов’язати з результатом').fill('INF-2-FILES-2')
  await activity.getByRole('button', { name: 'Додати', exact: true }).click()
  const coverage = view.locator('[data-outcome-id="int-files-organize"]')
  await expect(coverage).toHaveClass(/cl-coverage__item--partial/)
  await expect(coverage).toContainText('Звіт покаже «Недостатньо даних»')

  await activity.getByLabel('Призначення').selectOption('evidence')
  await expect(view.locator('[data-outcome-id="int-files-organize"]')).toHaveClass(/cl-coverage__item--ok/)

  await view.getByRole('button', { name: 'Зберегти' }).click()
  await expect(view.locator('.cl-ed-message')).toContainText('Збережено. Редакція 1')
  const stored = rows.get('g2-m3-l1')!.draftContent as any
  expect(stored.title.uk).toBe('Алгоритми навколо нас')
  expect(stored.blocks.map((b: any) => b.id)).toEqual(['g2-m3-l1-b01', 'g2-m3-l1-b02'])
  expect(stored.blocks[1].activity).toMatchObject({ telemetry: 'evidence', outcomes: [{ outcomeId: 'int-files-organize', evidenceRole: 'primary' }] })
  expect(stored.blocks[1].activity.config.prompt.uk).toBe('Який крок перший?')
  expect(stored.blocks[1].activity.scoring.key.correctOptionId).toBe('b')
  expect(stored.learningOutcomes).toEqual([{ outcomeId: 'int-files-organize', role: 'practised' }])
  // Saved lessons keep their id.
  await expect(view.getByLabel('ID уроку')).toBeDisabled()

  // Preview shows the teacher document without answer keys.
  await view.getByRole('button', { name: 'Переглянути план' }).click()
  const preview = page.getByRole('dialog', { name: /Попередній перегляд/ })
  await expect(preview.locator('.le-document')).toContainText('Алгоритми навколо нас')
  await preview.getByRole('button', { name: 'Закрити' }).click()
  await expect(preview).toHaveCount(0)
})

test('a free block imports HTML into separate teacher, board and student views', async ({ page }) => {
  const { rows } = await mockCurriculumAdmin(page)
  await openCurriculumTab(page)
  await page.locator('[data-lesson-id="g2-m2-l8"]').getByRole('button', { name: 'Редагувати' }).click()
  const view = editorView(page)
  await insertBlock(view, 1, 'Текст і медіа')
  const canvas = view.locator('details[data-block-id]').filter({ has: page.getByRole('tab', { name: 'Учитель' }) })
  await expect(canvas).toHaveCount(1)
  await canvas.getByLabel('Назва блоку').fill('Таблиця для дослідження')
  await canvas.getByRole('tab', { name: 'Учень' }).click()
  await canvas.getByRole('button', { name: 'Початковий код HTML' }).click()
  await canvas.getByLabel('HTML для вкладки «Учень»').fill('<table><tr><th>Назва</th><th>Рік</th></tr><tr><td>Книга</td><td>2024</td></tr></table><script>alert(1)</script>')
  await expect(canvas.locator('.cl-rte__source .adm-field-hint')).toContainText('script')
  await canvas.getByRole('button', { name: 'Застосувати HTML до цієї вкладки' }).click()
  const studentEditor = canvas.getByRole('textbox', { name: 'Вміст для вкладки «Учень»' })
  await expect(studentEditor.locator('td').first()).toHaveText('Книга')
  await expect(canvas.locator('script')).toHaveCount(0)
  await canvas.getByRole('tab', { name: 'Презентація' }).click()
  await canvas.getByRole('textbox', { name: 'Вміст для вкладки «Презентація»' }).click()
  await page.keyboard.type('Коротка теза')
  await expect(canvas.locator('summary .question-item__badges')).toContainText('дошка')
  await view.getByRole('button', { name: 'Зберегти' }).click()
  await expect(view.locator('.cl-ed-message')).toContainText('Збережено')
  const saved = (rows.get('g2-m2-l8')!.draftContent as any).blocks.find((entry: any) => entry.type === 'canvas')
  expect(saved.content.student).toEqual([{ type: 'table', headers: [{ uk: 'Назва' }, { uk: 'Рік' }], rows: [[{ uk: 'Книга' }, { uk: '2024' }]] }])
  expect(saved.content.board).toEqual([{ type: 'paragraph', text: { uk: 'Коротка теза' } }])
  expect(saved.views).toMatchObject({ document: true, presentation: true, remote: true })
})

test('HTML import keeps inline text together, extracts links and keeps https images', async ({ page }) => {
  await page.route(/^https:\/\/(example\.com|i\.ytimg\.com)\//, route => route.abort())
  const { rows } = await mockCurriculumAdmin(page)
  await openCurriculumTab(page)
  await page.locator('[data-lesson-id="g2-m2-l8"]').getByRole('button', { name: 'Редагувати' }).click()
  const view = editorView(page)
  await insertBlock(view, 1, 'Текст і медіа')
  const canvas = view.locator('details[data-block-id]').filter({ has: page.getByRole('tab', { name: 'Учитель' }) })
  await canvas.getByRole('tab', { name: 'Учитель' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(canvas.getByRole('tab', { name: 'Презентація' })).toBeFocused()
  await expect(canvas.getByRole('tab', { name: 'Презентація' })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowLeft')
  await canvas.getByRole('button', { name: 'Початковий код HTML' }).click()
  await canvas.getByLabel('HTML для вкладки «Учитель»').fill(
    '<div>Спершу <b>подумай</b>, потім <a href="https://example.org/">читай</a>.<br>Далі — практика.</div>'
    + '<img src="http://example.com/x.png" alt="x"><img src="https://example.com/y.png" alt="Таблиця">',
  )
  await expect(canvas.locator('.cl-rte__source .adm-field-hint')).toContainText('https')
  await canvas.getByRole('button', { name: 'Застосувати HTML до цієї вкладки' }).click()
  // The formatting is visible in the editor, not as ** markers.
  await expect(canvas.getByRole('textbox', { name: 'Вміст для вкладки «Учитель»' }).locator('strong')).toHaveText('подумай')
  await view.getByRole('button', { name: 'Зберегти' }).click()
  await expect(view.locator('.cl-ed-message')).toContainText('Збережено')
  const saved = (rows.get('g2-m2-l8')!.draftContent as any).blocks.find((entry: any) => entry.type === 'canvas')
  expect(saved.content.teacher).toEqual([
    { type: 'paragraph', text: { uk: 'Спершу **подумай**, потім читай.\nДалі — практика.' } },
    { type: 'link', url: 'https://example.org/', label: { uk: 'читай' } },
    { type: 'image', src: 'https://example.com/y.png', alt: { uk: 'Таблиця' } },
  ])
})

test('the visual editor formats text and inserts media from the toolbar', async ({ page }) => {
  await page.route(/^https:\/\/(example\.com|i\.ytimg\.com)\//, route => route.abort())
  const { rows } = await mockCurriculumAdmin(page)
  await openCurriculumTab(page)
  await page.locator('[data-lesson-id="g2-m2-l8"]').getByRole('button', { name: 'Редагувати' }).click()
  const view = editorView(page)
  await insertBlock(view, 1, 'Текст і медіа')
  const canvas = view.locator('details[data-block-id]').filter({ has: page.getByRole('tab', { name: 'Учитель' }) })
  await canvas.getByRole('tab', { name: 'Презентація' }).click()
  const editor = canvas.getByRole('textbox', { name: 'Вміст для вкладки «Презентація»' })
  await editor.click()
  await canvas.getByRole('button', { name: 'Заголовок' }).click()
  await page.keyboard.type('Що таке інтернет')
  await page.keyboard.press('Enter')
  await canvas.getByRole('button', { name: 'Нумерований список' }).click()
  await page.keyboard.type('Комп’ютери')
  await page.keyboard.press('Enter')
  await canvas.getByRole('button', { name: 'Жирний' }).click()
  await expect(canvas.getByRole('button', { name: 'Жирний' })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.type('зв’язок')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')

  await canvas.getByRole('button', { name: 'Вставити відео YouTube' }).click()
  await canvas.getByLabel('Посилання на відео YouTube').fill('https://example.com/not-youtube')
  await canvas.getByRole('button', { name: 'Вставити', exact: true }).click()
  await expect(canvas.getByRole('alert')).toContainText('YouTube')
  await canvas.getByLabel('Посилання на відео YouTube').fill('https://youtu.be/abc123DEF45')
  await canvas.getByRole('button', { name: 'Вставити', exact: true }).click()
  await expect(editor.locator('[data-video-id="abc123DEF45"]')).toHaveCount(1)

  await canvas.getByRole('button', { name: 'Вставити зображення' }).click()
  await canvas.getByLabel('Адреса зображення (https://…)').fill('https://example.com/net.png')
  await canvas.getByLabel('Опис зображення для незрячих').fill('Схема мережі')
  await canvas.getByRole('button', { name: 'Вставити', exact: true }).click()
  await expect(canvas.locator('summary .question-item__badges')).toContainText('дошка')
  await expect(canvas.locator('.cl-rte__status')).toContainText('Елементів: 4')

  await view.getByRole('button', { name: 'Зберегти' }).click()
  await expect(view.locator('.cl-ed-message')).toContainText('Збережено')
  const saved = (rows.get('g2-m2-l8')!.draftContent as any).blocks.find((entry: any) => entry.type === 'canvas')
  expect(saved.content.board).toEqual([
    { type: 'heading', text: { uk: 'Що таке інтернет' } },
    { type: 'list', ordered: true, items: [{ uk: 'Комп’ютери' }, { uk: '**зв’язок**' }] },
    { type: 'video', videoId: 'abc123DEF45' },
    { type: 'image', src: 'https://example.com/net.png', alt: { uk: 'Схема мережі' } },
  ])
  expect(saved.views).toMatchObject({ presentation: true })
})

test('the «+» menu inserts content or a task anywhere, and blocks can be dragged into place', async ({ page }) => {
  const { rows } = await mockCurriculumAdmin(page)
  await openCurriculumTab(page)
  await page.locator('[data-lesson-id="g2-m2-l8"]').getByRole('button', { name: 'Редагувати' }).click()
  const view = editorView(page)
  const toggle = view.getByRole('button', { name: 'Додати блок на початок уроку', exact: true })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(view.getByRole('button', { name: /Текст і медіа/ })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(toggle).toBeFocused()

  await insertBlock(view, 0, 'Сортування по групах')
  const blocks = view.locator('.cl-blocks > li > details')
  await expect(blocks.first().locator('.cl-block__title')).toContainText('1. Інтерактив')
  const insertedId = await blocks.first().getAttribute('data-block-id')
  await blocks.first().locator('> summary').click()
  const movedId = await blocks.nth(2).getAttribute('data-block-id')
  await view.locator('.cl-blocks > li').nth(2).locator('> .cl-block__handle').dragTo(blocks.first().locator('> summary'), { targetPosition: { x: 40, y: 2 } })
  await expect(blocks.first()).toHaveAttribute('data-block-id', movedId!)
  await expect(blocks.nth(1)).toHaveAttribute('data-block-id', insertedId!)

  await view.getByRole('button', { name: 'Зберегти' }).click()
  await expect(view.locator('.cl-ed-message')).toContainText('Збережено')
  const saved = rows.get('g2-m2-l8')!.draftContent as any
  expect(saved.blocks.map((entry: any) => entry.id).slice(0, 2)).toEqual([movedId, insertedId])
  expect(saved.blocks[1].activity.mechanic).toBe('classify')
})

test('an old block turns into «Текст і медіа» in one click, and rare settings sit under «Додатково»', async ({ page }) => {
  const { rows } = await mockCurriculumAdmin(page)
  await openCurriculumTab(page)
  await page.locator('[data-lesson-id="g2-m2-l8"]').getByRole('button', { name: 'Редагувати' }).click()
  const view = editorView(page)
  // The «+» menu offers only the simple kinds.
  await view.getByRole('button', { name: 'Додати блок на початок уроку', exact: true }).click()
  await expect(view.getByRole('button', { name: /Перерва/ })).toBeVisible()
  await expect(view.getByText('Інші типи блоків')).toHaveCount(0)
  await page.keyboard.press('Escape')

  const explanation = block(page, 'g2-m2-l8-b05')
  await explanation.locator(':scope > summary').click()
  // Technical fields are folded away; the block id is not shown in the header.
  await expect(explanation.getByLabel('Формат')).toBeHidden()
  await expect(explanation.locator(':scope > summary')).not.toContainText('g2-m2-l8-b05')
  await explanation.getByRole('button', { name: 'Перетворити на «Текст і медіа»' }).click()
  await page.locator('#modal-ok-btn').click()

  const converted = block(page, 'g2-m2-l8-b05')
  await expect(converted.getByRole('tab', { name: 'Учитель' })).toHaveAttribute('aria-selected', 'true')
  await expect(converted.getByRole('textbox', { name: 'Вміст для вкладки «Учитель»' })).not.toBeEmpty()
  await view.getByRole('button', { name: 'Зберегти' }).click()
  await expect(view.locator('.cl-ed-message')).toContainText('Збережено')
  const saved = (rows.get('g2-m2-l8')!.draftContent as any).blocks.find((entry: any) => entry.id === 'g2-m2-l8-b05')
  expect(saved.type).toBe('canvas')
  expect(saved.content.teacher.length).toBeGreaterThan(0)
  expect(saved.views.presentation).toBe(true)
})

test('all old blocks of a lesson convert at once and the lesson still saves', async ({ page }) => {
  const { rows } = await mockCurriculumAdmin(page)
  await openCurriculumTab(page)
  await page.locator('[data-lesson-id="g2-m2-l8"]').getByRole('button', { name: 'Редагувати' }).click()
  const view = editorView(page)
  await view.getByRole('button', { name: /^Перетворити всі \(\d+\)$/ }).click()
  await page.locator('#modal-ok-btn').click()
  await expect(view.getByRole('button', { name: /^Перетворити всі/ })).toHaveCount(0)
  await view.getByRole('button', { name: 'Перевірити' }).click()
  await expect(view.locator('.cl-issues')).toHaveCount(0)
  await view.getByRole('button', { name: 'Зберегти' }).click()
  await expect(view.locator('.cl-ed-message')).toContainText('Збережено')
  const types = new Set((rows.get('g2-m2-l8')!.draftContent as any).blocks.map((entry: any) => entry.type))
  expect([...types].sort()).toEqual(expect.arrayContaining(['canvas']))
  for (const old of ['explanation', 'discussion', 'support', 'reflection', 'teacher-note']) expect(types.has(old)).toBe(false)
})
