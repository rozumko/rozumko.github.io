import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const ROOT = new URL('../../', import.meta.url)

async function readRepoFile(path) {
  return readFile(new URL(path, ROOT), 'utf8')
}

test('global styles use palette tokens instead of literal hex colors', async () => {
  const css = await readRepoFile('style.css')
  const literals = [...css.matchAll(/#[0-9a-f]{3,8}\b/gi)].map(match => match[0])

  assert.deepEqual(literals, [], 'style.css: move global color values to tokens.css')
})

test('semantic color roles reuse the canonical palette', async () => {
  const tokens = await readRepoFile('tokens.css')
  const aliases = [
    ['clr-primary', 'clr-brand'],
    ['clr-primary-dark', 'clr-brand-dark'],
    ['clr-student', 'clr-emerald'],
    ['clr-student-dark', 'clr-emerald-dark'],
    ['clr-teacher', 'clr-sky'],
    ['clr-teacher-dark', 'clr-sky-dark'],
    ['clr-mascot', 'clr-warning'],
    ['clr-amber-dark', 'clr-warning'],
  ]

  for (const [role, palette] of aliases) {
    assert.match(
      tokens,
      new RegExp(`--${role}:\\s*var\\(--${palette}\\)`),
      `tokens.css: --${role} should reuse --${palette}`,
    )
  }
})

test('teacher buttons use the shared component variants', async () => {
  const [html, script, teacherCss] = await Promise.all([
    readRepoFile('teacher.html'),
    readRepoFile('teacher.ts'),
    readRepoFile('style-teacher.css'),
  ])
  const legacyVariant = /\bbtn-(sky|emerald|secondary|adm-(danger|emerald|slate)|sm)\b/

  assert.doesNotMatch(html, legacyVariant, 'teacher.html: use shared .btn variants')
  assert.doesNotMatch(html, /\bstyle\s*=/, 'teacher.html: static presentation belongs in style-teacher.css')
  assert.doesNotMatch(script, legacyVariant, 'teacher.ts: use shared .btn variants')
  assert.doesNotMatch(teacherCss, /\.btn-(sky|emerald|secondary)\b/, 'style-teacher.css: shared variants belong in style.css')
})

test('admin buttons share sizing utilities and avoid inline component styles', async () => {
  const [html, resultsTab, teachersTab, adminCss, tokens] = await Promise.all([
    readRepoFile('admin.html'),
    readRepoFile('features/admin/results-tab.ts'),
    readRepoFile('features/admin/teachers-tab.ts'),
    readRepoFile('style-admin.css'),
    readRepoFile('tokens.css'),
  ])

  assert.doesNotMatch(`${html}\n${resultsTab}\n${teachersTab}`, /\bbtn-sm\b/, 'admin buttons: use shared .btn--sm sizing')
  assert.doesNotMatch(html, /\bstyle\s*=/, 'admin.html: static presentation belongs in style-admin.css')
  assert.doesNotMatch(adminCss, /\.btn-sm\b/, 'style-admin.css: shared sizing belongs in style.css')
  assert.doesNotMatch(tokens, /--adm-sky-hover\b/, 'tokens.css: remove unused palette aliases')
})

test('parent styles use the shared tokens without local palette fallbacks', async () => {
  const css = await readRepoFile('style-parent.css')

  assert.doesNotMatch(css, /var\(--[^,)]+,/, 'style-parent.css: tokens.css is required, so local fallbacks drift')
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|\brgb\(/i, 'style-parent.css: move colors to tokens.css')
  assert.doesNotMatch(css, /var\(--sp-7\)/, 'style-parent.css: use the defined spacing scale')
  assert.doesNotMatch(css, /font-weight:\s*(850|900)\b/, 'style-parent.css: Nunito is loaded only through weight 800')
})

test('child actions keep one shared accessible component contract', async () => {
  const [appCss, pathCss] = await Promise.all([
    readRepoFile('style-app.css'),
    readRepoFile('style-path.css'),
  ])
  const actionRules = [...appCss.matchAll(/\.kid-action\s*\{[^}]+\}/gs)].map(match => match[0])
  const actionRule = actionRules.find(rule => /display:\s*inline-flex/.test(rule)) ?? ''

  assert.match(actionRule, /min-height:\s*var\(--kid-tap\)/, 'kid actions should use the child touch-target token')
  assert.match(actionRule, /color:\s*var\(--clr-text-inverse\)/, 'kid actions should use the inverse-text token')
  assert.match(actionRule, /text-decoration:\s*none/, 'button and link actions should share presentation')
  assert.doesNotMatch(pathCss, /\.path-parent-gate \.kid-action\s*\{[^}]*\bdisplay\s*:/s, 'path styles should not replace the shared action layout')
})

test('mission cards use shared presentation and semantic palette roles', async () => {
  const [appCss, homeHtml] = await Promise.all([
    readRepoFile('style-app.css'),
    readRepoFile('home.html'),
  ])
  const cardRule = appCss.match(/\.mission-card\s*\{[^}]+\}/s)?.[0] ?? ''
  const difficultyRules = appCss.match(/\.mission-card--warmup[^\n]+|\.mission-card--training[^\n]+|\.mission-card--challenge[^\n]+/g) ?? []

  assert.match(cardRule, /text-decoration:\s*none/, 'button and link cards should share presentation')
  assert.doesNotMatch(homeHtml, /class="[^"]*mission-card[^"]*"[^>]*\bstyle=/, 'mission cards should not need inline component styles')
  assert.doesNotMatch(difficultyRules.join('\n'), /#[0-9a-f]{3,8}\b/i, 'difficulty cards should reuse semantic palette roles')
})

test('child app pages keep static presentation out of inline styles', async () => {
  const pages = await Promise.all([
    readRepoFile('home.html'),
    readRepoFile('school.html'),
    readRepoFile('games.html'),
    readRepoFile('path.html'),
    readRepoFile('student.html'),
    readRepoFile('olympiad-enter.html'),
  ])

  for (const page of pages) {
    assert.doesNotMatch(page, /\bstyle\s*=/, 'child app pages should use shared CSS classes for static presentation')
  }
})

test('teacher and admin runtime templates use component classes', async () => {
  const sources = await Promise.all([
    readRepoFile('teacher.ts'),
    readRepoFile('features/admin/events-tab.ts'),
    readRepoFile('features/admin/missions-tab.ts'),
    readRepoFile('features/admin/questions-tab.ts'),
    readRepoFile('features/admin/results-tab.ts'),
    readRepoFile('features/admin/teachers-tab.ts'),
  ])

  for (const source of sources) {
    assert.doesNotMatch(source, /\bstyle\s*=|\.style\./, 'runtime templates should use shared CSS classes')
  }
})

test('document pages use the shared palette and avoid inline presentation', async () => {
  const [docsCss, ...pages] = await Promise.all([
    readRepoFile('style-docs.css'),
    readRepoFile('for-students.html'),
    readRepoFile('privacy.html'),
    readRepoFile('terms.html'),
    readRepoFile('public/404.html'),
  ])

  assert.doesNotMatch(docsCss, /#[0-9a-f]{3,8}\b/i, 'style-docs.css: reuse shared palette tokens')
  for (const page of pages) {
    assert.doesNotMatch(page, /\bstyle\s*=/, 'document pages should use CSS classes for static presentation')
  }
})

test('shared certificate dialog is platform-neutral', async () => {
  const [script, globalCss, adminCss] = await Promise.all([
    readRepoFile('utils/certificate.ts'),
    readRepoFile('style.css'),
    readRepoFile('style-admin.css'),
  ])

  assert.doesNotMatch(script, /\bbtn-adm-|\.style\./, 'certificate dialog should use shared components')
  assert.match(globalCss, /\.cert-modal-overlay\s*\{/, 'certificate dialog styles should be globally available')
  assert.doesNotMatch(adminCss, /\.cert-modal-overlay\s*\{/, 'certificate dialog should not depend on Admin CSS')
})
