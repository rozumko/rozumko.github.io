import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { validateLessonDefinition } from '../../backend/src/lib/curriculum-lesson-schema'

async function mockBuilder(page: Page, enabled = true) {
  const rows = new Map<string, any>()
  const calls: { path: string; body: any }[] = []
  await page.addInitScript(() => {
    sessionStorage.setItem('teacher_session', JSON.stringify({ accessToken: 'builder-admin-test', refreshToken: '', email: 'admin@example.test' }))
    sessionStorage.setItem('sandbox-parent-secret', 'do-not-share')
  })
  await page.route('**/api/**', async route => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    const body = req.method() === 'GET' ? null : req.postDataJSON()
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
    if (path === '/api/teacher/me') return json({ id: 'builder-admin', role: 'admin', name: 'Адмін', features: { lessonEngine: enabled } })
    if (path === '/api/admin/curriculum/packs') return json({ packs: [{ id: 'informatics-ua-primary', subject: 'informatics', title: { uk: 'Інформатика' }, gradeRange: { min: 1, max: 4 }, games: [{ key: 'windows', levels: ['easy'] }], tools: [] }] })
    if (path === '/api/admin/curriculum/outcomes') return json({ outcomes: [], usage: {} })
    if (path === '/api/admin/curriculum/lessons' && req.method() === 'GET') return json({ lessons: [...rows.values()].map(({ draftContent: _d, ...summary }) => summary) })
    if (path.startsWith('/api/admin/curriculum/lessons') && req.method() !== 'GET') calls.push({ path, body })
    if (path.endsWith('/validate')) {
      const valid = validateLessonDefinition(body.definition)
      return json({ ok: valid.ok, issues: valid.ok === true ? [] : valid.errors })
    }
    if ((path === '/api/admin/curriculum/lessons' && req.method() === 'POST') || (req.method() === 'PUT' && /\/lessons\/[^/]+$/.test(path))) {
      const valid = validateLessonDefinition(body.definition)
      if (valid.ok === false) return json({ error: 'Невірний урок', issues: valid.errors }, 400)
      const old = rows.get(valid.lesson.id)
      if (old && old.editVersion !== body.expectedEditVersion) return json({ error: 'Конфлікт редагування' }, 409)
      const lesson = {
        id: valid.lesson.id, title: valid.lesson.title.uk, subject: valid.lesson.subject, subjectPackId: valid.lesson.subjectPackId,
        grade: valid.lesson.grade, moduleId: valid.lesson.moduleId ?? null, lessonNumber: null, updatedAt: '', status: 'draft',
        editVersion: (old?.editVersion ?? 0) + 1, contentVersion: (old?.contentVersion ?? 0) + 1,
        publishedVersion: old?.publishedVersion ?? null, publishedSnapshot: old?.publishedSnapshot ?? null, draftContent: valid.lesson,
      }
      rows.set(lesson.id, lesson)
      return json({ lesson })
    }
    const match = /\/lessons\/([^/]+)$/.exec(path)
    if (match && req.method() === 'GET') return json({ lesson: rows.get(match[1]!) })
    return json({ teachers: [], parents: [], events: [], results: [], questions: [], lessons: [], missions: [], maps: [], items: [] })
  })
  return { rows, calls }
}

async function openBuilder(page: Page) {
  await page.goto('/admin.html#lesson-builder')
  await expect(page.getByRole('heading', { name: 'Конструктор уроків', exact: true })).toBeVisible()
  await expect(page.locator('#lb-sequence > li')).toHaveCount(1)
}

async function addHtml(page: Page, code: string, title = 'Моя HTML-картка') {
  const menu = page.locator('.lb-add-menu')
  if (await menu.getAttribute('open') === null) await menu.locator('summary').click()
  await page.getByRole('button', { name: '+ HTML-код', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Додати: HTML-код' })
  await dialog.getByLabel('Назва картки / опис').fill(title)
  await dialog.getByLabel('HTML, CSS та JavaScript').fill(code)
  await dialog.getByRole('button', { name: 'Оновити перегляд HTML' }).click()
  return dialog
}

test('HTML code renders and runs interactively but cannot read the platform or make network requests', async ({ page }, testInfo) => {
  await mockBuilder(page)
  await openBuilder(page)
  const code = `<style>h1{color:rgb(180,0,0)}</style><h1>Мій HTML</h1><button id="count">Натисни</button><p id="result">0</p>
<script>
document.getElementById('count').onclick=()=>document.getElementById('result').textContent='1';
try { parent.document.body.dataset.escaped='yes'; } catch { document.body.dataset.parentBlocked='yes'; }
try { sessionStorage.getItem('sandbox-parent-secret'); } catch { document.body.dataset.storageBlocked='yes'; }
fetch('https://example.org/private').catch(()=>document.body.dataset.networkBlocked='yes');
</script>`
  const dialog = await addHtml(page, code)
  const frame = dialog.frameLocator('iframe')
  await expect(frame.locator('body')).toHaveAttribute('data-parent-blocked', 'yes')
  await expect(frame.locator('body')).toHaveAttribute('data-storage-blocked', 'yes')
  await expect(frame.locator('body')).toHaveAttribute('data-network-blocked', 'yes')
  await expect(frame.getByText('Ця картка відкривається всередині уроку.')).toHaveCount(0)
  await frame.getByRole('button', { name: 'Натисни' }).click()
  await expect(frame.locator('#result')).toHaveText('1')
  expect(await page.locator('body').getAttribute('data-escaped')).toBeNull()
  await dialog.getByRole('button', { name: 'Додати картку' }).click()
  await expect(page.locator('#lb-sequence > li')).toHaveCount(2)
  await page.getByRole('button', { name: 'Зберегти урок', exact: true }).click()
  await expect(page.locator('#lb-save-state')).toHaveText('Збережено на сервері')
  await page.screenshot({ path: testInfo.outputPath('builder-desktop.png'), fullPage: true })
})

test('saved HTML survives reload, remains editable and is projected through the existing board window', async ({ page }) => {
  const { rows } = await mockBuilder(page)
  await openBuilder(page)
  const dialog = await addHtml(page, '<h1>Власний матеріал</h1><button>Кнопка</button>')
  await dialog.getByRole('button', { name: 'Додати картку' }).click()
  await page.locator('#lb-root').getByLabel('Назва уроку', { exact: true }).fill('Урок із HTML')
  await page.getByRole('button', { name: 'Зберегти урок', exact: true }).click()
  await expect(page.locator('#lb-save-state')).toHaveText('Збережено на сервері')
  expect(rows.size).toBe(1)
  await page.reload()
  await page.getByRole('button', { name: 'Збережені уроки', exact: true }).click()
  await page.getByRole('dialog', { name: 'Збережені уроки' }).getByRole('button', { name: 'Відкрити', exact: true }).click()
  await expect(page.locator('#lb-root').getByLabel('Назва уроку', { exact: true })).toHaveValue('Урок із HTML')
  await page.locator('#lb-sequence > li').nth(1).locator('.lb-step-title').click()
  await page.locator('#lb-sequence > li').nth(1).getByRole('button', { name: 'Редагувати', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Редагувати: Моя HTML-картка' })
  await editor.getByLabel('HTML, CSS та JavaScript').fill('<h1>Змінений матеріал</h1>')
  await editor.getByLabel('Показувати учням під час цього кроку').check()
  await editor.getByRole('button', { name: 'Застосувати' }).click()
  await page.getByRole('button', { name: 'Розпочати урок', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Пульт уроку' })).toBeVisible()
  // The console replaces the workspace; stale edits there would not reach the board.
  await expect(page.locator('.lb-layout')).toBeHidden()
  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Відкрити на проєкторі', exact: true }).click()
  const popup = await popupPromise
  await expect(popup.locator('.le-slide')).toBeVisible()
  await page.locator('.lb-console-card').nth(1).click()
  await expect(popup.frameLocator('iframe.le-canvas__html').getByRole('heading', { name: 'Змінений матеріал' })).toBeVisible()
  const saved = [...rows.values()][0].draftContent.blocks[1]
  expect(saved.views.remote).toBe(true)
  expect(saved.content.student[0].html).toBe('<h1>Змінений матеріал</h1>')
  await popup.close()
  await page.getByRole('button', { name: 'Повернутися до конструктора' }).click()
  await expect(page.locator('.lb-layout')).toBeVisible()
  await expect(page.locator('#lb-console')).toBeHidden()
})

test('native activity editor, duplication, keyboard reordering and undo preserve distinct identities', async ({ page }) => {
  const { rows } = await mockBuilder(page)
  await openBuilder(page)
  await page.locator('.lb-add-menu summary').click()
  await page.getByRole('button', { name: '+ Тест / активність', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Готово', exact: true }).click()
  const step = page.locator('#lb-sequence > li').nth(1)
  await step.locator('.lb-step-title').click()
  await step.getByRole('button', { name: 'Копія', exact: true }).click()
  await expect(page.locator('#lb-sequence > li')).toHaveCount(3)
  await page.locator('#lb-sequence > li').nth(2).locator('.lb-step-title').click()
  await page.getByRole('button', { name: 'Перемістити картку 3 вище' }).click()
  await page.getByRole('button', { name: '↶ Скасувати', exact: true }).click()
  await page.getByRole('button', { name: 'Зберегти урок', exact: true }).click()
  await expect(page.locator('#lb-save-state')).toHaveText('Збережено на сервері')
  const tasks = [...rows.values()][0].draftContent.blocks.filter((b: any) => b.activity)
  expect(tasks).toHaveLength(2)
  expect(tasks[0].id).not.toBe(tasks[1].id)
  expect(tasks[0].activity.instanceId).not.toBe(tasks[1].activity.instanceId)
  expect(tasks[0].activity.scoring.key).toBeTruthy()
})

test('a pasted LearningApps link and uploaded image become persistent material cards', async ({ page }) => {
  const { rows } = await mockBuilder(page)
  await openBuilder(page)
  await page.locator('.lb-capture').evaluate(node => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/plain', 'https://learningapps.org/view12345')
    node.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
  })
  await page.getByLabel('Завантажити файли', { exact: true }).setInputFiles({
    name: 'sample.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1N0AAAAASUVORK5CYII=', 'base64'),
  })
  await expect(page.locator('#lb-sequence > li')).toHaveCount(3)
  await page.getByRole('button', { name: 'Зберегти урок', exact: true }).click()
  await expect(page.locator('#lb-save-state')).toHaveText('Збережено на сервері')
  const blocks = [...rows.values()][0].draftContent.blocks
  expect(blocks[1].content.board[0]).toEqual({ type: 'learningapps', appId: '12345' })
  expect(blocks[2].content.board[0].type).toBe('file')
  await page.reload()
  await expect(page.locator('#lb-library-cards').getByRole('heading', { name: 'sample.png', exact: true })).toBeVisible()
})

test('builder fits a narrow viewport and has no WCAG AA violations', async ({ page }) => {
  await mockBuilder(page)
  await openBuilder(page)
  const result = await new AxeBuilder({ page }).include('#tab-lesson-builder').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(result.violations).toEqual([])
  await page.getByRole('button', { name: 'Темна тема', exact: true }).click()
  const dark = await new AxeBuilder({ page }).include('#tab-lesson-builder').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(dark.violations).toEqual([])
  await page.setViewportSize({ width: 375, height: 812 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
})

test('HTML runner refuses direct navigation and unsandboxed same-origin embedding', async ({ page }) => {
  const payload = encodeURIComponent('<script>document.body.dataset.escaped="yes"</script><h1>Unsafe</h1>')
  await page.goto(`/lesson-html.html#${payload}`)
  await expect(page.getByText('Ця картка відкривається всередині уроку.')).toBeVisible()
  expect(await page.locator('body').getAttribute('data-escaped')).toBeNull()
  await mockBuilder(page)
  await openBuilder(page)
  await page.evaluate(hash => {
    const iframe = document.createElement('iframe')
    iframe.src = `/lesson-html.html#${hash}`
    document.body.append(iframe)
  }, payload)
  await expect(page.frameLocator('iframe').getByText('Ця картка відкривається всередині уроку.')).toBeVisible()
  // An unsandboxed frame never gets a path to execute the supplied fragment
  // as platform-origin code.
  expect(await page.locator('body').getAttribute('data-escaped')).toBeNull()
})

test('embedded PDF files have a bounded native preview and download fallback', async ({ page }) => {
  const { rows } = await mockBuilder(page)
  await openBuilder(page)
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 0 /Kids [] >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF')
  await page.getByLabel('Завантажити файли', { exact: true }).setInputFiles({ name: 'lesson.pdf', mimeType: 'application/pdf', buffer: pdf })
  await expect(page.locator('#lb-sequence > li')).toHaveCount(2)
  await page.locator('#lb-sequence > li').nth(1).locator('.lb-step-title').click()
  await page.locator('#lb-sequence > li').nth(1).getByRole('button', { name: 'Переглянути', exact: true }).click()
  await expect(page.locator('.lb-dialog-preview iframe.le-canvas__document')).toHaveAttribute('src', /^data:application\/pdf;base64,/)
  await expect(page.locator('.lb-dialog-preview a[download]')).toHaveAttribute('download', 'lesson.pdf')
  await page.getByRole('dialog').getByRole('button', { name: 'Закрити', exact: true }).click()
  await page.getByRole('button', { name: 'Зберегти урок', exact: true }).click()
  await expect(page.locator('#lb-save-state')).toHaveText('Збережено на сервері')
  expect([...rows.values()][0].draftContent.blocks[1].content.board[0].mime).toBe('application/pdf')
})

test('the constructor respects the existing Lesson Engine feature flag', async ({ page }) => {
  await mockBuilder(page, false)
  await page.goto('/admin.html')
  await expect(page.getByRole('button', { name: 'Конструктор уроків', exact: true })).toBeHidden()
})

test('dragging a library material inserts it at the chosen step and conflicts preserve the draft', async ({ page }) => {
  const { rows } = await mockBuilder(page)
  await openBuilder(page)
  const dialog = await addHtml(page, '<h1>Картка для перетягування</h1>')
  await dialog.getByRole('button', { name: 'Додати картку' }).click()
  const library = page.locator('#lb-library-cards article').first()
  await library.dragTo(page.locator('#lb-sequence > li').first())
  await expect(page.locator('#lb-sequence > li')).toHaveCount(3)
  await expect(page.locator('#lb-sequence > li').first()).toContainText('Моя HTML-картка')
  await page.getByRole('button', { name: 'Зберегти урок', exact: true }).click()
  await expect(page.locator('#lb-save-state')).toHaveText('Збережено на сервері')
  const saved = [...rows.values()][0]
  saved.editVersion++
  await page.locator('#lb-root').getByLabel('Назва уроку', { exact: true }).fill('Моя незбережена редакція')
  await page.getByRole('button', { name: 'Зберегти урок', exact: true }).click()
  await expect(page.locator('#lb-message')).toContainText('Урок уже змінив інший редактор')
  await expect(page.locator('#lb-root').getByLabel('Назва уроку', { exact: true })).toHaveValue('Моя незбережена редакція')
  expect(saved.title).toBe('Новий урок')
})

test('mixed HTML and text survive editing in the shared rich-text editor', async ({ page }) => {
  const { rows } = await mockBuilder(page)
  await openBuilder(page)
  const code = '<h1>Код, який треба зберегти</h1>'
  const dialog = await addHtml(page, code)
  await dialog.getByRole('button', { name: 'Додати картку' }).click()
  await page.getByRole('button', { name: 'Зберегти урок', exact: true }).click()
  await expect(page.locator('#lb-save-state')).toHaveText('Збережено на сервері')
  const saved = [...rows.values()][0]
  const content = saved.draftContent.blocks[1].content
  for (const surface of ['teacher', 'board']) content[surface].push({ type: 'paragraph', text: { uk: 'Пояснення' } })
  await page.reload()
  await page.getByRole('button', { name: 'Збережені уроки', exact: true }).click()
  await page.getByRole('dialog', { name: 'Збережені уроки' }).getByRole('button', { name: 'Відкрити', exact: true }).click()
  await page.locator('#lb-sequence > li').nth(1).locator('.lb-step-title').click()
  await page.locator('#lb-sequence > li').nth(1).getByRole('button', { name: 'Редагувати', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Редагувати: Моя HTML-картка' })
  const rich = editor.getByRole('textbox', { name: 'Вміст для вкладки «Презентація»' })
  await expect(rich.locator('[data-canvas-item]')).toHaveCount(1)
  // Edit the paragraph explicitly: clicking the atomic HTML node and typing
  // replaces that selected node by design in a rich-text editor.
  await rich.locator('p').filter({ hasText: 'Пояснення' }).click()
  await rich.press('End')
  await rich.pressSequentially(' доповнене')
  await editor.getByRole('button', { name: 'Застосувати', exact: true }).click()
  await page.getByRole('button', { name: 'Зберегти урок', exact: true }).click()
  await expect(page.locator('#lb-save-state')).toHaveText('Збережено на сервері')
  const updated = [...rows.values()][0].draftContent.blocks[1].content.board
  expect(updated.filter((item: any) => item.type === 'html')).toEqual([{ type: 'html', html: code }])
  expect(updated.some((item: any) => item.type === 'paragraph' && item.text.uk.includes('доповнене'))).toBe(true)
  expect(updated.some((item: any) => item.type === 'paragraph' && item.text.uk.includes('Пояснення'))).toBe(true)
})


test('compact workspace shows seven columns, conjunctive filters and a bounded long lesson', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  const { rows } = await mockBuilder(page)
  await openBuilder(page)
  const dialog = await addHtml(page, '<style>body{background:#f9dc88}</style><h1>Дроби</h1><p>Знайди половину</p>')
  await dialog.getByRole('button', { name: 'Додати картку' }).click()
  await page.getByRole('button', { name: 'Зберегти урок', exact: true }).click()
  await expect(page.locator('#lb-save-state')).toHaveText('Збережено на сервері')
  const template = structuredClone([...rows.values()][0])
  rows.clear()
  for (let i = 0; i < 28; i++) {
    const row = structuredClone(template)
    row.id = 'material-' + i; row.title = 'Матеріал ' + String(i).padStart(2, '0')
    row.grade = i < 24 ? 1 : 2; row.moduleId = i < 24 ? 'fractions' : 'geometry'
    row.draftContent.id = row.id; row.draftContent.title.uk = row.title
    row.draftContent.grade = row.grade; row.draftContent.moduleId = row.moduleId
    rows.set(row.id, row)
  }
  await page.getByRole('button', { name: 'Оновити бібліотеку', exact: true }).click()
  await expect(page.locator('#lb-library-cards > .lb-card')).toHaveCount(29)
  const first = await page.locator('#lb-library-cards > .lb-card').nth(0).boundingBox()
  const seventh = await page.locator('#lb-library-cards > .lb-card').nth(6).boundingBox()
  expect(first!.y).toBe(seventh!.y)
  expect(first!.width).toBeLessThan(230)
  await expect(page.locator('#lb-sequence .lb-step-actions:visible')).toHaveCount(0)
  const filterBoxes = await page.locator('.lb-filters .adm-input').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().top))
  expect(new Set(filterBoxes).size).toBe(1)
  await page.getByLabel('Пошук матеріалів', { exact: true }).fill('немає такого матеріалу')
  await page.getByLabel('Тип картки', { exact: true }).selectOption('html')
  await expect(page.locator('#lb-library-cards .lb-card')).toHaveCount(0)
  await page.getByLabel('Пошук матеріалів', { exact: true }).fill('')
  await page.locator('#lb-root').getByLabel('Клас', { exact: true }).selectOption('2')
  await expect(page.locator('#lb-library-cards .lb-card')).toHaveCount(4)
  await page.getByLabel('Тема / модуль', { exact: true }).fill('fractions')
  await expect(page.locator('#lb-library-cards .lb-card')).toHaveCount(0)
  await page.locator('#lb-root').getByLabel('Клас', { exact: true }).selectOption('1')
  await expect(page.locator('#lb-library-cards .lb-card')).toHaveCount(24)
  await page.getByLabel('Пошук матеріалів', { exact: true }).fill('Матеріал 03')
  await expect(page.locator('#lb-library-cards .lb-card')).toHaveCount(1)
  await page.getByLabel('Пошук матеріалів', { exact: true }).fill('')
  await page.getByLabel('Тема / модуль', { exact: true }).fill('')
  await page.locator('#lb-root').getByLabel('Клас', { exact: true }).selectOption('')
  await page.getByLabel('Тип картки', { exact: true }).selectOption('')
  await page.locator('#lb-library-cards > .lb-card').first().dragTo(page.locator('#lb-sequence > li').first(), { targetPosition: { x: 20, y: 3 } })
  await expect(page.locator('#lb-sequence > li')).toHaveCount(3)
  await expect(page.locator('#lb-sequence > li').first().locator('.lb-step-title')).toHaveText('1. Моя HTML-картка')
  for (let i = 0; i < 16; i++) {
    await page.locator('#lb-sequence > li').last().locator('.lb-step-title').click()
    await page.locator('#lb-sequence > li').last().getByRole('button', { name: 'Копія', exact: true }).click()
  }
  const outline = await page.locator('#lb-sequence').evaluate(node => ({ height: node.clientHeight, scrollHeight: node.scrollHeight }))
  expect(outline.scrollHeight).toBeGreaterThan(outline.height)
  const save = await page.getByRole('button', { name: 'Зберегти урок', exact: true }).boundingBox()
  expect(save!.y + save!.height).toBeLessThan(1080)
  await page.locator('#lb-sequence').evaluate(node => { node.scrollTop = 0 })
  await expect(page.locator('#lb-library-cards .lb-thumb iframe').first()).toBeAttached()
  const caption = await page.locator('#lb-library-cards > .lb-card').nth(1).locator(':scope > h3').boundingBox()
  expect(caption!.height).toBeGreaterThanOrEqual(30)
  await page.screenshot({ path: testInfo.outputPath('compact-builder-light.png') })
  await page.getByRole('button', { name: 'Темна тема', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('compact-builder-dark.png') })
})


test('pending site changes stay in a compact header indicator', async ({ page }) => {
  await mockBuilder(page)
  await page.route('**/api/admin/content-publications', route => route.fulfill({
    json: { publications: [], deliveryState: { pendingChanges: true, activePublicationId: null, activePublicationStatus: null, activeMatchesCurrent: false } },
  }))
  await openBuilder(page)
  const indicator = page.locator('.admin-header #content-delivery-banner')
  await expect(indicator).toBeVisible()
  await expect(indicator.locator('#content-delivery-title')).toHaveText('Є зміни для сайту')
  await expect(indicator.getByRole('button', { name: 'Оновити сайт', exact: true })).toBeEnabled()
  await expect(page.locator('#main-content #content-delivery-banner')).toHaveCount(0)
  expect((await indicator.boundingBox())!.height).toBeLessThan(50)
})


test('a failed definition fetch finishes loading and can be retried from the library toolbar', async ({ page }) => {
  const { rows } = await mockBuilder(page)
  await openBuilder(page)
  const dialog = await addHtml(page, '<h1>Повторне завантаження</h1>')
  await dialog.getByRole('button', { name: 'Додати картку' }).click()
  await page.getByRole('button', { name: 'Зберегти урок', exact: true }).click()
  await expect(page.locator('#lb-save-state')).toHaveText('Збережено на сервері')
  const saved = [...rows.values()][0]
  let unavailable = true
  await page.route('**/api/admin/curriculum/lessons/' + saved.id, route => route.fulfill({
    status: unavailable ? 503 : 200, json: unavailable ? { error: 'Матеріал тимчасово недоступний' } : { lesson: saved },
  }))
  await page.getByRole('button', { name: 'Оновити бібліотеку', exact: true }).click()
  await page.getByLabel('Тип картки', { exact: true }).selectOption('html')
  await expect(page.locator('#lb-library-cards').getByText('Частину карток не завантажено.', { exact: false })).toBeVisible()
  await expect(page.locator('#lb-library-cards .lb-loading')).toHaveCount(0)
  unavailable = false
  await page.getByRole('button', { name: 'Оновити бібліотеку', exact: true }).click()
  await expect(page.locator('#lb-library-cards .lb-card')).toHaveCount(2)
  await expect(page.locator('#lb-library-cards .lb-loading')).toHaveCount(0)
})
