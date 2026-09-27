import { expect, test, type Locator, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import { validateLessonDefinition } from '../../backend/src/lib/curriculum-lesson-schema'
import { prepareMaterial } from '../../backend/src/lib/builder-materials'
import { withoutFilePayloads } from '../../backend/src/lib/curriculum-card-index'

const FIXTURE = JSON.parse(readFileSync(new URL('../../backend/src/lib/curriculum-fixtures/g2-m2-l8.lesson.json', import.meta.url), 'utf8'))
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1N0AAAAASUVORK5CYII=', 'base64')

function lessonRow(definition: any, old?: any) {
  return {
    id: definition.id, title: definition.title.uk, subject: definition.subject, subjectPackId: definition.subjectPackId,
    grade: definition.grade, moduleId: definition.moduleId ?? null, lessonNumber: null, updatedAt: '', status: old?.status ?? 'draft',
    editVersion: (old?.editVersion ?? 0) + 1, contentVersion: (old?.contentVersion ?? 0) + 1,
    publishedVersion: old?.publishedVersion ?? null, publishedSnapshot: old?.publishedSnapshot ?? null, draftContent: definition,
  }
}

/** An in-memory stand-in for the admin API; materials go through the real server validator. */
async function mockBuilder(page: Page, options: { enabled?: boolean; seedLessons?: any[] } = {}) {
  const rows = new Map<string, any>()
  for (const definition of options.seedLessons ?? []) rows.set(definition.id, lessonRow(definition))
  const boards = new Map<string, any>()
  const materials = new Map<string, any>()
  const calls: { method: string; path: string; body: any }[] = []
  let seq = 0
  const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
  await page.addInitScript(() => {
    sessionStorage.setItem('teacher_session', JSON.stringify({ accessToken: 'builder-admin-test', refreshToken: '', email: 'admin@example.test' }))
    sessionStorage.setItem('sandbox-parent-secret', 'do-not-share')
  })
  await page.route('**/api/**', async route => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname
    const method = req.method()
    const body = method === 'GET' || method === 'DELETE' ? null : req.postDataJSON()
    calls.push({ method, path, body })
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
    if (path === '/api/teacher/me') return json({ id: 'builder-admin', role: 'admin', name: 'Адмін', features: { lessonEngine: options.enabled ?? true } })
    if (path === '/api/admin/curriculum/packs') return json({ packs: [{ id: 'informatics-ua-primary', subject: 'informatics', title: { uk: 'Інформатика' }, gradeRange: { min: 1, max: 4 }, games: [{ key: 'windows', levels: ['easy'] }], tools: [] }] })
    if (path === '/api/admin/curriculum/outcomes') return json({ outcomes: [], usage: {} })
    if (path === '/api/admin/curriculum/cards') return json({ lessons: [...rows.values()].map(r => ({ id: r.id, status: r.status, editVersion: r.editVersion, definition: withoutFilePayloads(r.draftContent) })) })
    if (path === '/api/admin/curriculum/lessons' && method === 'GET') return json({ lessons: [...rows.values()].map(({ draftContent: _d, ...summary }) => summary) })
    if (path.endsWith('/validate')) {
      const valid = validateLessonDefinition(body.definition)
      return json({ ok: valid.ok, issues: valid.ok === true ? [] : valid.errors })
    }
    if ((path === '/api/admin/curriculum/lessons' && method === 'POST') || (method === 'PUT' && /\/lessons\/[^/]+$/.test(path))) {
      const valid = validateLessonDefinition(body.definition)
      if (valid.ok === false) return json({ error: 'Невірний урок', issues: valid.errors }, 400)
      const old = rows.get(valid.lesson.id)
      if (old && old.editVersion !== body.expectedEditVersion) return json({ error: 'Конфлікт редагування' }, 409)
      const lesson = lessonRow(valid.lesson, old)
      rows.set(lesson.id, lesson)
      return json({ lesson })
    }
    const lessonMatch = /\/curriculum\/lessons\/([^/]+)$/.exec(path)
    if (lessonMatch && method === 'GET') return json({ lesson: rows.get(lessonMatch[1]!) })

    // Builder boards
    const view = (m: any) => ({ id: m.id, boardId: m.boardId, title: m.title, kind: m.kind, items: m.items, x: m.x, y: m.y, updatedAt: m.updatedAt })
    const boardView = (b: any) => ({ ...b, materialCount: [...materials.values()].filter(m => m.boardId === b.id).length })
    if (path === '/api/admin/builder/boards' && method === 'GET') return json({ boards: [...boards.values()].map(boardView) })
    if (path === '/api/admin/builder/boards' && method === 'POST') {
      const board = { id: uuid(), title: body.title, updatedAt: new Date().toISOString() }
      boards.set(board.id, board)
      return json({ board: boardView(board) }, 201)
    }
    const boardMatch = /\/api\/admin\/builder\/boards\/([^/]+)(\/materials|\/positions)?$/.exec(path)
    if (boardMatch) {
      const board = boards.get(boardMatch[1]!)
      if (!board) return json({ error: 'Дошку не знайдено' }, 404)
      if (!boardMatch[2] && method === 'PATCH') { board.title = body.title; return json({ board }) }
      if (!boardMatch[2] && method === 'DELETE') {
        boards.delete(board.id)
        for (const [id, m] of materials) if (m.boardId === board.id) materials.delete(id)
        return route.fulfill({ status: 204 })
      }
      if (boardMatch[2] === '/materials' && method === 'GET') return json({ materials: [...materials.values()].filter(m => m.boardId === board.id).map(view) })
      if (boardMatch[2] === '/materials' && method === 'POST') {
        try {
          const prepared = prepareMaterial(body)
          const material = { id: uuid(), boardId: board.id, ...prepared, x: body.x, y: body.y, updatedAt: `v${seq}` }
          materials.set(material.id, material)
          return json({ material: view(material) }, 201)
        } catch (err: any) { return json({ error: err.message, issues: err.issues }, 400) }
      }
      if (boardMatch[2] === '/positions') {
        for (const p of body.positions) { const m = materials.get(p.id); if (m) { m.x = p.x; m.y = p.y } }
        return route.fulfill({ status: 204 })
      }
    }
    if (path === '/api/admin/builder/materials' && method === 'GET') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase()
      return json({ materials: [...materials.values()].filter(m => m.searchText.includes(q)).map(m => ({ ...view(m), boardTitle: boards.get(m.boardId)?.title })) })
    }
    if (path === '/api/admin/builder/materials/delete') {
      const deleted = body.ids.filter((id: string) => materials.delete(id))
      return json({ deleted })
    }
    const materialMatch = /\/api\/admin\/builder\/materials\/([^/]+)$/.exec(path)
    if (materialMatch && method === 'PATCH') {
      const material = materials.get(materialMatch[1]!)
      if (!material) return json({ error: 'Матеріал не знайдено' }, 404)
      if (body.title !== undefined || body.items !== undefined) Object.assign(material, prepareMaterial({ title: body.title ?? material.title, items: body.items ?? material.items }))
      for (const key of ['x', 'y', 'boardId']) if (body[key] !== undefined) material[key] = body[key]
      material.updatedAt = `v${++seq}`
      return json({ material: view(material) })
    }
    return json({ teachers: [], parents: [], events: [], results: [], questions: [], lessons: [], missions: [], maps: [], items: [] })
  })
  return { rows, boards, materials, calls }
}

async function openBuilder(page: Page) {
  await page.goto('/admin.html#lesson-builder')
  await expect(page.getByRole('heading', { name: 'Конструктор уроків', exact: true })).toBeAttached()
  await expect(page.locator('#lb-sequence > li')).toHaveCount(1)
}

async function addMaterial(page: Page, kind: string) {
  await page.locator('.lb-add > summary').click()
  await page.locator('.lb-add').getByRole('button', { name: kind, exact: true }).click()
  return page.getByRole('dialog', { name: `Додати: ${kind}` })
}

async function addHtml(page: Page, code: string, title = 'Моя HTML-картка') {
  const dialog = await addMaterial(page, 'HTML-код')
  await dialog.getByLabel('Назва', { exact: true }).fill(title)
  await dialog.getByLabel('HTML, CSS та JavaScript').fill(code)
  await expect(dialog.frameLocator('iframe')).toBeTruthy()
  return dialog
}

/** Real pointer drag: press, move past the threshold, move to the target, release. */
async function drag(page: Page, source: Locator, target: Locator, position: 'top' | 'centre' = 'centre') {
  const from = (await source.boundingBox())!
  const to = (await target.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 12, { steps: 3 })
  await page.mouse.move(to.x + to.width / 2, position === 'top' ? to.y + 6 : to.y + to.height / 2, { steps: 10 })
  await page.mouse.up()
}

async function save(page: Page) {
  await page.getByRole('button', { name: 'Зберегти', exact: true }).click()
  await expect(page.locator('#lb-save-state')).toHaveText('Збережено')
}

test('HTML code renders and runs interactively but cannot read the platform or make network requests', async ({ page }, testInfo) => {
  const { materials } = await mockBuilder(page)
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
  await dialog.getByRole('button', { name: 'Додати на дошку' }).click()
  await expect(page.locator('.bc-card')).toHaveCount(1)
  // Thumbnails never run authored code.
  await expect(page.locator('.bc-card iframe')).toHaveCount(0)
  expect([...materials.values()][0].kind).toBe('html')
  await page.screenshot({ path: testInfo.outputPath('builder-board.png') })
})

test('an HTML card with external resources warns that they will not load', async ({ page }) => {
  await mockBuilder(page)
  await openBuilder(page)
  const dialog = await addHtml(page, '<script src="https://cdn.tailwindcss.com"></script><h1>Tailwind</h1>')
  await expect(dialog.locator('.lb-warning')).toContainText('не завантажаться')
})

test('a board card dragged into the outline lands at the chosen step; conflicts keep the draft', async ({ page }) => {
  const { rows } = await mockBuilder(page)
  await openBuilder(page)
  const dialog = await addHtml(page, '<h1>Картка для перетягування</h1>')
  await dialog.getByRole('button', { name: 'Додати на дошку' }).click()
  await drag(page, page.locator('.bc-card').first(), page.locator('#lb-sequence > li').first(), 'top')
  await expect(page.locator('#lb-sequence > li')).toHaveCount(2)
  await expect(page.locator('#lb-sequence > li').first().locator('.lb-step__card')).toHaveAttribute('title', /^1\. Моя HTML-картка/)
  // The card stays on the board: collecting and structuring are separate.
  await expect(page.locator('.bc-card')).toHaveCount(1)
  await save(page)
  const saved = [...rows.values()][0]
  saved.editVersion++
  await page.locator('#lb-root').getByLabel('Назва уроку', { exact: true }).fill('Моя незбережена редакція')
  await page.getByRole('button', { name: 'Зберегти', exact: true }).click()
  await expect(page.locator('.lb-toast--error')).toContainText('Урок уже змінив інший редактор')
  await expect(page.locator('#lb-root').getByLabel('Назва уроку', { exact: true })).toHaveValue('Моя незбережена редакція')
  expect(saved.title).toBe('Новий урок')
})

test('saved HTML survives reload, remains editable and is projected through the existing board window', async ({ page }) => {
  const { rows } = await mockBuilder(page)
  await openBuilder(page)
  const dialog = await addHtml(page, '<h1>Власний матеріал</h1><button>Кнопка</button>')
  await dialog.getByRole('button', { name: 'Додати на дошку' }).click()
  await page.locator('.bc-card').first().click()
  await page.getByRole('dialog', { name: 'Моя HTML-картка' }).getByRole('button', { name: 'Додати в урок' }).click()
  await page.locator('#lb-root').getByLabel('Назва уроку', { exact: true }).fill('Урок із HTML')
  await save(page)
  expect(rows.size).toBe(1)
  await page.reload()
  await page.locator('.lb-lesson-head .lb-menu > summary').click()
  await page.getByRole('button', { name: 'Відкрити урок…', exact: true }).click()
  await page.getByRole('dialog', { name: 'Відкрити урок' }).getByRole('button', { name: /Урок із HTML/ }).click()
  await expect(page.locator('#lb-root').getByLabel('Назва уроку', { exact: true })).toHaveValue('Урок із HTML')
  await page.locator('#lb-sequence .lb-step__card').nth(1).click()
  const step = page.getByRole('dialog', { name: '2. Моя HTML-картка' })
  await step.getByLabel('Де показувати').selectOption('both')
  await step.getByRole('button', { name: 'Редагувати', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Редагувати: Моя HTML-картка' })
  await editor.getByLabel('HTML, CSS та JavaScript').fill('<h1>Змінений матеріал</h1>')
  await editor.getByRole('button', { name: 'Застосувати' }).click()
  await page.getByRole('button', { name: 'Провести урок', exact: true }).click()
  await page.getByRole('dialog', { name: 'Провести урок' }).getByRole('button', { name: /Лише проєктор/ }).click()
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
  expect(saved.views.presentation).toBe(true)
  expect(saved.content.student[0].html).toBe('<h1>Змінений матеріал</h1>')
  await popup.close()
  await page.getByRole('button', { name: 'Повернутися до конструктора' }).click()
  await expect(page.locator('.lb-layout')).toBeVisible()
  await expect(page.locator('#lb-console')).toBeHidden()
})

test('a task, its copy right after it, reordering and undo keep distinct identities', async ({ page }) => {
  const { rows } = await mockBuilder(page)
  await openBuilder(page)
  await page.getByRole('button', { name: '+ Завдання', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Готово', exact: true }).first().click()
  await page.getByRole('button', { name: '+ Текстовий слайд', exact: true }).click()
  const text = page.getByRole('dialog', { name: 'Додати: Текст' })
  await text.getByLabel('Заголовок слайда').fill('Підсумок')
  await text.getByLabel(/Текст/).fill('Що ми дізналися')
  await text.getByRole('button', { name: 'Додати в урок' }).click()
  await expect(page.locator('#lb-sequence > li')).toHaveCount(3)
  await page.locator('#lb-sequence .lb-step__card').nth(1).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Копія', exact: true }).click()
  await expect(page.locator('#lb-sequence > li')).toHaveCount(4)
  // The copy follows its original, before the summary slide.
  await expect(page.locator('#lb-sequence .lb-step__card').nth(3)).toHaveAttribute('title', /^4\. Підсумок/)
  await page.locator('#lb-sequence .lb-step__card').nth(3).click()
  await page.getByRole('dialog').getByRole('button', { name: '↑ Вище', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Закрити', exact: true }).click()
  await expect(page.locator('#lb-sequence .lb-step__card').nth(2)).toHaveAttribute('title', /^3\. Підсумок/)
  await page.getByRole('button', { name: 'Скасувати', exact: true }).click()
  await expect(page.locator('#lb-sequence .lb-step__card').nth(3)).toHaveAttribute('title', /^4\. Підсумок/)
  await save(page)
  const tasks = [...rows.values()][0].draftContent.blocks.filter((b: any) => b.activity)
  expect(tasks).toHaveLength(2)
  expect(tasks[0].id).not.toBe(tasks[1].id)
  expect(tasks[0].activity.instanceId).not.toBe(tasks[1].activity.instanceId)
  expect(tasks[0].activity.scoring.key).toBeTruthy()
})

test('a pasted LearningApps link and an uploaded image become server-side board materials', async ({ page }) => {
  const { materials, boards } = await mockBuilder(page)
  await openBuilder(page)
  await page.locator('.bc-viewport').evaluate(node => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/plain', 'https://learningapps.org/view12345')
    node.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
  })
  await page.getByLabel('Завантажити файли', { exact: true }).setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.locator('.bc-card')).toHaveCount(2)
  expect([...boards.values()].map(b => b.title)).toEqual(['Мої матеріали'])
  const saved = [...materials.values()]
  expect(saved[0].items[0]).toEqual({ type: 'learningapps', appId: '12345' })
  expect(saved[1].items[0].type).toBe('file')
  // Cards do not overlap and survive a reload.
  expect(saved[0].x !== saved[1].x || saved[0].y !== saved[1].y).toBe(true)
  await page.reload()
  await expect(page.locator('.bc-card')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'sample', exact: true })).toBeVisible()
})

test('dragging a card moves it on the board; Shift-selecting several and Delete can be undone', async ({ page }) => {
  const { materials } = await mockBuilder(page)
  await openBuilder(page)
  for (const title of ['Перший', 'Другий']) {
    const dialog = await addMaterial(page, 'Текст')
    await dialog.getByLabel('Заголовок слайда').fill(title)
    await dialog.getByLabel(/Текст/).fill(`Текст: ${title}`)
    await dialog.getByRole('button', { name: 'Додати на дошку' }).click()
  }
  await expect(page.locator('.bc-card')).toHaveCount(2)
  const first = page.getByRole('button', { name: 'Перший', exact: true })
  const before = (await first.boundingBox())!
  await page.mouse.move(before.x + 40, before.y + 40)
  await page.mouse.down()
  await page.mouse.move(before.x + 140, before.y + 240, { steps: 8 })
  await page.mouse.up()
  await expect.poll(() => [...materials.values()].find(m => m.title === 'Перший').y).toBeGreaterThan(100)
  // A dragged card stays selected; Shift+click adds another (a plain click opens the card).
  await expect(first).toHaveClass(/bc-card--selected/)
  await page.getByRole('button', { name: 'Другий', exact: true }).click({ modifiers: ['Shift'] })
  await expect(page.locator('.bc-card--selected')).toHaveCount(2)
  await first.click({ modifiers: ['Shift'] })
  await expect(page.locator('.bc-card--selected')).toHaveCount(1)
  await first.click({ modifiers: ['Shift'] })
  await expect(page.locator('.bc-card--selected')).toHaveCount(2)
  await page.keyboard.press('Delete')
  await expect(page.locator('.bc-card')).toHaveCount(0)
  expect(materials.size).toBe(0)
  await page.getByRole('button', { name: 'Повернути', exact: true }).click()
  await expect(page.locator('.bc-card')).toHaveCount(2)
})

test('search spans every board: this board is dimmed, other boards list their matches', async ({ page }) => {
  await mockBuilder(page)
  await openBuilder(page)
  const add = async (title: string) => {
    const dialog = await addMaterial(page, 'Текст')
    await dialog.getByLabel('Заголовок слайда').fill(title)
    await dialog.getByLabel(/Текст/).fill(title)
    await dialog.getByRole('button', { name: 'Додати на дошку' }).click()
  }
  await add('Підводні кабелі')
  await page.getByRole('button', { name: '+ Дошка', exact: true }).click()
  await page.getByRole('dialog', { name: 'Нова дошка' }).getByLabel('Назва дошки (тема)').fill('Космос')
  await page.getByRole('dialog', { name: 'Нова дошка' }).getByRole('button', { name: 'Створити' }).click()
  await expect(page.getByRole('tab', { name: 'Космос' })).toHaveAttribute('aria-selected', 'true')
  await add('Супутник на орбіті')
  await add('Сонячна система')
  await page.getByRole('tab', { name: 'Мої матеріали' }).click()
  await expect(page.locator('.bc-card')).toHaveCount(1)
  await page.getByLabel('Пошук матеріалів по всіх дошках').fill('супутник')
  await expect(page.locator('.lb-found__strip .lb-mini')).toHaveCount(1)
  await expect(page.locator('.bc-card--dim')).toHaveCount(1)
  await page.locator('.lb-found__strip .lb-mini').click()
  await page.getByRole('dialog', { name: 'Супутник на орбіті' }).getByRole('button', { name: 'Відкрити дошку «Космос»' }).click()
  await expect(page.getByRole('tab', { name: 'Космос' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.bc-card--dim')).toHaveCount(1)
  await page.getByLabel('Пошук матеріалів по всіх дошках').fill('')
  await expect(page.locator('.bc-card--dim')).toHaveCount(0)
})

test('cards from saved lessons load in one request and bring their task and outcomes into the lesson', async ({ page }) => {
  const { rows, calls } = await mockBuilder(page, { seedLessons: [FIXTURE] })
  await openBuilder(page)
  await page.getByRole('button', { name: 'З уроків', exact: true }).click()
  const drawer = page.getByRole('complementary', { name: 'Картки з уроків' })
  await drawer.getByRole('button', { name: 'Тест / активність', exact: true }).click()
  const cards = drawer.locator('.lb-mini')
  await expect(cards.first()).toBeVisible()
  expect(calls.filter(c => c.path === '/api/admin/curriculum/cards')).toHaveLength(1)
  expect(calls.filter(c => /\/curriculum\/lessons\/g2-m2-l8$/.test(c.path))).toHaveLength(0)
  await drag(page, cards.first(), page.locator('#lb-sequence > li').first(), 'centre')
  await expect(page.locator('#lb-sequence > li')).toHaveCount(2)
  await save(page)
  const saved = [...rows.values()].find(r => r.id !== 'g2-m2-l8').draftContent
  const task = saved.blocks.find((b: any) => b.activity)
  expect(task.activity.scoring.key).toBeTruthy()
  for (const outcome of task.activity.outcomes ?? []) expect(saved.learningOutcomes.some((o: any) => o.outcomeId === outcome.outcomeId)).toBe(true)
})

test('the old browser-only library moves to a server board once', async ({ page }) => {
  const { materials, boards } = await mockBuilder(page)
  await page.addInitScript(() => {
    const request = indexedDB.open('rozumko-builder-materials', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('inbox')
    request.onsuccess = () => {
      const tx = request.result.transaction('inbox', 'readwrite')
      const store = tx.objectStore('inbox')
      const get = store.get('builder-admin')
      get.onsuccess = () => {
        if (sessionStorage.getItem('seeded')) return
        sessionStorage.setItem('seeded', '1')
        store.put([{ id: 'legacy', title: 'Старий матеріал', subjectPackId: 'informatics-ua-primary', grade: 1, topic: '', items: [{ type: 'paragraph', text: { uk: 'З браузера' } }] }], 'builder-admin')
      }
    }
  })
  await openBuilder(page)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Старий матеріал', exact: true })).toBeVisible()
  expect(materials.size).toBe(1)
  expect([...boards.values()][0].title).toBe('Мої матеріали')
  await page.reload()
  await expect(page.locator('.bc-card')).toHaveCount(1)
  expect(materials.size).toBe(1)
})

test('builder fits a narrow viewport and has no WCAG AA violations', async ({ page }) => {
  await mockBuilder(page, { seedLessons: [FIXTURE] })
  await openBuilder(page)
  const dialog = await addMaterial(page, 'Текст')
  await dialog.getByLabel('Заголовок слайда').fill('Доступність')
  await dialog.getByLabel(/Текст/).fill('Текст')
  await dialog.getByRole('button', { name: 'Додати на дошку' }).click()
  const result = await new AxeBuilder({ page }).include('#tab-lesson-builder').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(result.violations).toEqual([])
  await page.getByRole('button', { name: 'Темна тема', exact: true }).click()
  // Buttons animate their colours; measure contrast once the theme has settled.
  await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== 'running'))
  const dark = await new AxeBuilder({ page }).include('#tab-lesson-builder').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(dark.violations.map(v => `${v.id}: ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
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
  await expect(page.frameLocator('body > iframe').getByText('Ця картка відкривається всередині уроку.')).toBeVisible()
  // An unsandboxed frame never gets a path to execute the supplied fragment
  // as platform-origin code.
  expect(await page.locator('body').getAttribute('data-escaped')).toBeNull()
})

test('embedded PDF files have a bounded native preview and download fallback', async ({ page }) => {
  const { rows } = await mockBuilder(page)
  await openBuilder(page)
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 0 /Kids [] >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF')
  await page.getByLabel('Завантажити файли', { exact: true }).setInputFiles({ name: 'lesson.pdf', mimeType: 'application/pdf', buffer: pdf })
  await expect(page.locator('.bc-card')).toHaveCount(1)
  await page.locator('.bc-card').first().click()
  const dialog = page.getByRole('dialog', { name: 'lesson' })
  await expect(dialog.locator('.lb-dialog-preview iframe.le-canvas__document')).toHaveAttribute('src', /^data:application\/pdf;base64,/)
  await expect(dialog.locator('.lb-dialog-preview a[download]')).toHaveAttribute('download', 'lesson.pdf')
  await dialog.getByRole('button', { name: 'Додати в урок' }).click()
  await save(page)
  expect([...rows.values()][0].draftContent.blocks[1].content.board[0].mime).toBe('application/pdf')
})

test('the constructor respects the existing Lesson Engine feature flag', async ({ page }) => {
  await mockBuilder(page, { enabled: false })
  await page.goto('/admin.html')
  await expect(page.getByRole('button', { name: 'Конструктор уроків', exact: true })).toBeHidden()
})

test('mixed HTML and text survive editing in the shared rich-text editor', async ({ page }) => {
  const { rows } = await mockBuilder(page)
  await openBuilder(page)
  const code = '<h1>Код, який треба зберегти</h1>'
  const dialog = await addHtml(page, code)
  await dialog.getByRole('button', { name: 'Додати на дошку' }).click()
  await drag(page, page.locator('.bc-card').first(), page.locator('#lb-sequence'), 'centre')
  await save(page)
  const saved = [...rows.values()][0]
  const content = saved.draftContent.blocks[1].content
  for (const surface of ['teacher', 'board']) content[surface].push({ type: 'paragraph', text: { uk: 'Пояснення' } })
  await page.reload()
  await page.locator('.lb-lesson-head .lb-menu > summary').click()
  await page.getByRole('button', { name: 'Відкрити урок…', exact: true }).click()
  await page.getByRole('dialog', { name: 'Відкрити урок' }).getByRole('button', { name: /Новий урок/ }).click()
  await page.locator('#lb-sequence .lb-step__card').nth(1).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Редагувати', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Редагувати: Моя HTML-картка' })
  const rich = editor.getByRole('textbox', { name: 'Вміст для вкладки «Презентація»' })
  await expect(rich.locator('[data-canvas-item]')).toHaveCount(1)
  // Edit the paragraph explicitly: clicking the atomic HTML node and typing
  // replaces that selected node by design in a rich-text editor.
  await rich.locator('p').filter({ hasText: 'Пояснення' }).click()
  await rich.press('End')
  await rich.pressSequentially(' доповнене')
  await editor.getByRole('button', { name: 'Застосувати', exact: true }).click()
  await save(page)
  const updated = [...rows.values()][0].draftContent.blocks[1].content.board
  expect(updated.filter((item: any) => item.type === 'html')).toEqual([{ type: 'html', html: code }])
  expect(updated.some((item: any) => item.type === 'paragraph' && item.text.uk.includes('доповнене'))).toBe(true)
  expect(updated.some((item: any) => item.type === 'paragraph' && item.text.uk.includes('Пояснення'))).toBe(true)
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
