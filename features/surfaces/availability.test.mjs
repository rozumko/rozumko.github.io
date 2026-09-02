import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { isSurfaceAvailable, surfaceForPath, SURFACE_STATUS } from './availability.ts'

const repoFile = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

test('production exposes School while Home and Olympiad remain coming soon', () => {
  assert.equal(SURFACE_STATUS.school, 'active')
  assert.equal(SURFACE_STATUS.home, 'coming-soon')
  assert.equal(SURFACE_STATUS.olympiad, 'coming-soon')
  assert.equal(isSurfaceAvailable('school', 'rozumko.com'), true)
  assert.equal(isSurfaceAvailable('home', 'rozumko.com'), false)
  assert.equal(isSurfaceAvailable('olympiad', 'rozumko.com'), false)
})

test('loopback keeps dormant surfaces available for development and browser tests', () => {
  for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
    assert.equal(isSurfaceAvailable('home', hostname), true)
    assert.equal(isSurfaceAvailable('olympiad', hostname), true)
  }
})

test('every dormant product route resolves to the shared surface entry', async () => {
  const routes = {
    'home.html': 'home',
    'parent.html': 'home',
    'path.html': 'home',
    'games.html': 'home',
    'student.html': 'olympiad',
    'olympiad-enter.html': 'olympiad',
  }

  for (const [path, surface] of Object.entries(routes)) {
    assert.equal(surfaceForPath(`/${path}`), surface)
    const html = await repoFile(path)
    assert.match(html, /<script type="module" src="surface-entry\.js"><\/script>/)
  }
})

test('School no longer sends children into the dormant Home surface', async () => {
  const school = await repoFile('school.html')
  assert.doesNotMatch(school, /href="home\.html"/)
  assert.match(school, /домашні місії поки готуються/i)
})

test('teacher Olympiad navigation is gated before data loading', async () => {
  const teacher = await repoFile('teacher.ts')
  assert.match(teacher, /const olympiadAvailable = isSurfaceAvailable\('olympiad'\)/)
  assert.match(teacher, /if \(!olympiadAvailable\) return/)
  assert.match(teacher, /configureOlympiadStub\(\)/)
})
