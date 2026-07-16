import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const ROOT = new URL('../../', import.meta.url)

const PUBLIC_PAGES = [
  'index.html',
  'home.html',
  'school.html',
  'student.html',
  'teacher.html',
  'games.html',
  'for-parents.html',
  'for-teachers.html',
  'for-students.html',
  'privacy.html',
  'terms.html',
  'transparency.html',
  'standards.html',
  'olympiad-enter.html',
]

const FORM_CONTROL_PAGES = [
  'home.html',
  'school.html',
  'for-parents.html',
  'olympiad-enter.html',
  'teacher.html',
]

async function readRepoFile(path) {
  return readFile(new URL(path, ROOT), 'utf8')
}

function findTags(html, tagName) {
  return [...html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'gi'))].map(match => match[0])
}

function attr(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = tag.match(new RegExp(`\\s${escaped}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return match?.[2] ?? match?.[3] ?? match?.[4] ?? null
}

function hasAccessibleName(tag, html) {
  const type = attr(tag, 'type')?.toLowerCase()
  if (type === 'hidden') return true

  const id = attr(tag, 'id')
  const escapedId = id?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return Boolean(
    attr(tag, 'aria-label')?.trim()
    || attr(tag, 'aria-labelledby')?.trim()
    || attr(tag, 'title')?.trim()
    || (escapedId && new RegExp(`<label\\b[^>]*\\bfor\\s*=\\s*["']${escapedId}["']`, 'i').test(html))
    || (escapedId && new RegExp(`<label\\b[^>]*>[\\s\\S]*\\bid\\s*=\\s*["']${escapedId}["'][\\s\\S]*?<\\/label>`, 'i').test(html))
  )
}

test('public pages keep the Ukrainian language and skip-link/main landmark contract', async () => {
  for (const page of PUBLIC_PAGES) {
    const html = await readRepoFile(page)
    const skipTarget = html.match(/<a\b[^>]*\bhref="#([^"]+)"[^>]*\bclass="[^"]*\bskip-link\b/i)?.[1]

    assert.match(html, /<html\s+lang="uk"/i, `${page}: must declare lang="uk"`)
    assert.ok(skipTarget, `${page}: missing skip link`)
    assert.match(html, new RegExp(`<main\\b[^>]*\\bid="${skipTarget}"[^>]*>`, 'i'), `${page}: skip link must target a main landmark`)
  }
})

test('public forms keep programmatic names for visible inputs and selects', async () => {
  for (const page of FORM_CONTROL_PAGES) {
    const html = await readRepoFile(page)
    const controls = [
      ...findTags(html, 'input'),
      ...findTags(html, 'select'),
      ...findTags(html, 'textarea'),
    ]

    for (const control of controls) {
      assert.ok(
        hasAccessibleName(control, html),
        `${page}: form control needs an explicit label, aria-label, aria-labelledby, or title: ${control}`,
      )
    }
  }
})

test('accessibility documentation names the automated guardrails', async () => {
  const baseline = await readRepoFile('docs/accessibility-inclusion-baseline.md')
  const readme = await readRepoFile('README.md')

  assert.match(baseline, /WCAG 2\.2 AA/, 'baseline should name the target WCAG level')
  assert.match(baseline, /tests\/layout\/accessibility-smoke\.spec\.ts/, 'baseline should point to the browser accessibility smoke')
  assert.match(baseline, /npm run test:layout/, 'baseline should document the layout/accessibility command')
  assert.match(readme, /Accessibility and inclusion baseline/, 'README should link the accessibility baseline')
})

test('axe coverage follows every production HTML entry or an explicit exception', async () => {
  const viteConfig = await readRepoFile('vite.config.ts')
  const accessibilitySmoke = await readRepoFile('tests/layout/accessibility-smoke.spec.ts')
  const productionEntries = [...viteConfig.matchAll(/resolve\(__dirname,\s*'([^']+\.html)'\)/g)]
    .map(match => `/${match[1] === 'index.html' ? '' : match[1]}`)
  const axeBlock = accessibilitySmoke.match(/const AXE_PAGES = \[([\s\S]*?)\]/)?.[1] ?? ''
  const axePages = [...axeBlock.matchAll(/'([^']+)'/g)].map(match => match[1])
  const explicitExceptions = new Set(['/offline.html', '/framing-blocked.html'])
  const uncovered = productionEntries.filter(page => !axePages.includes(page) && !explicitExceptions.has(page))
  const unknown = axePages.filter(page => !productionEntries.includes(page))

  assert.deepEqual(uncovered, [], `production pages missing axe coverage: ${uncovered.join(', ')}`)
  assert.deepEqual(unknown, [], `axe pages missing from Vite production entries: ${unknown.join(', ')}`)
  assert.match(accessibilitySmoke, /'wcag22aa'/, 'axe scans must include the WCAG 2.2 AA tag')
})
