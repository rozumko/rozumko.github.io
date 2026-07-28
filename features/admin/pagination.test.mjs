import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8')

const adminHtml   = readFileSync(new URL('../../admin.html', import.meta.url), 'utf8')
const apiClient   = readFileSync(new URL('../api/client.ts', import.meta.url), 'utf8')
const pager       = read('./pagination.ts')
const questionsTab = read('./questions-tab.ts')
const resultsTab   = read('./results-tab.ts')
const teachersTab  = read('./teachers-tab.ts')
const parentsTab   = read('./parents-tab.ts')
const eventsTab    = read('./events-tab.ts')
const missionsTab  = read('./missions-tab.ts')
const lessonsTab   = read('./lessons-tab.ts')
const pathTab      = read('./path-tab.ts')

test('every paginated admin list has a pager host to render into', () => {
  for (const id of [
    'questions-pager', 'results-pager', 'teachers-pager',
    'parents-pager', 'events-pager', 'missions-pager', 'lessons-pager',
  ]) assert.match(adminHtml, new RegExp(`id="${id}"`), `${id} missing from admin.html`)
})

test('admin list tabs request one page and draw the pager from the answer', () => {
  for (const [name, source] of Object.entries({
    questionsTab, resultsTab, teachersTab, parentsTab, eventsTab,
  })) {
    assert.match(source, /pager\.range\(\)/, `${name} must send the page range`)
    assert.match(source, /pager\.apply\(/, `${name} must draw the pager`)
  }
  // Bounded, client-filtered lists page over the fetched array instead.
  for (const [name, source] of Object.entries({ missionsTab, lessonsTab })) {
    assert.match(source, /slice\(offset, offset \+ limit\)/, `${name} must render one page of rows`)
    assert.match(source, /pager\.apply\(\{ total:/, `${name} must draw the pager`)
  }
})

test('question pickers walk every page instead of showing a truncated list', () => {
  for (const [name, source] of Object.entries({ eventsTab, missionsTab, pathTab })) {
    assert.match(source, /getAllAdminQuestions\(/, `${name} must fetch all pages`)
    assert.doesNotMatch(source, /[^l]getAdminQuestions\(/, `${name} must not use the single-page call`)
  }
  assert.match(apiClient, /export function getAllAdminQuestions/)
  assert.match(apiClient, /export async function fetchAllPages/)
})

// A CSV built from the visible page would silently lose rows.
test('results export covers every page', () => {
  assert.match(resultsTab, /fetchAllPages\(/)
})

test('admin list requests carry limit and offset', () => {
  for (const fn of ['getAdminParents', 'getAdminTeachers', 'getAdminResults', 'getAdminEvents']) {
    assert.match(apiClient, new RegExp(`${fn}\\(page: PageParams = \\{\\}\\)`), `${fn} must accept a page`)
  }
  assert.match(apiClient, /p\.set\('limit',\s+String\(params\.limit\)\)/)
  assert.match(apiClient, /p\.set\('offset',\s+String\(params\.offset\)\)/)
})

test('a page that no longer exists falls back instead of showing an empty list', () => {
  assert.match(pager, /page\.offset > 0 && page\.offset >= page\.total/)
})

// The bulk routes cap a selection at 200 ids; the editor says so before the
// confirmation rather than surfacing a schema error afterwards.
test('bulk actions state the selection cap', () => {
  assert.match(questionsTab, /const BULK_LIMIT = 200/)
  assert.match(questionsTab, /ids\.length > BULK_LIMIT/)
})
