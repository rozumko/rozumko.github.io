import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'

const frontendSecurity = await readFile(new URL('../../frontend-security.ts', import.meta.url), 'utf8')
const viteConfig = await readFile(new URL('../../vite.config.ts', import.meta.url), 'utf8')
const blockedPage = await readFile(new URL('../../framing-blocked.html', import.meta.url), 'utf8')
const securityModel = await readFile(new URL('../../docs/security-model.md', import.meta.url), 'utf8')
const architecture = await readFile(new URL('../../docs/architecture.md', import.meta.url), 'utf8')

test('frontend framing guard fails closed before app code continues', () => {
  assert.match(frontendSecurity, /FRAMING_BLOCKED_PATH = '\/framing-blocked\.html'/)
  assert.match(frontendSecurity, /export function isFramed/)
  assert.match(frontendSecurity, /win\.location\.replace/)
  assert.match(frontendSecurity, /throw new Error\('Rozumko page blocked inside a frame'\)/)
  assert.doesNotMatch(frontendSecurity, /window\.top!\.location/)
})

test('framing blocked page is shipped as a harmless public page', () => {
  assert.match(viteConfig, /'framing-blocked':\s+resolve\(__dirname,\s+'framing-blocked\.html'\)/)
  assert.match(blockedPage, /<html lang="uk">/)
  assert.match(blockedPage, /Сторінку заблоковано/)
  assert.doesNotMatch(blockedPage, /type="module"/)
})

test('security model documents the GitHub Pages framing boundary', () => {
  assert.match(securityModel, /GitHub Pages cannot enforce HTTP `frame-ancestors`/)
  assert.match(securityModel, /client-side guard/)
  assert.match(securityModel, /residual clickjacking risk/)
})

test('parent accounts preserve the Home ownership and trust boundaries', () => {
  assert.match(securityModel, /`GET \/api\/parent\/me` reads account status and ownership from/)
  assert.match(securityModel, /authenticated parent session, the valid domain-separated lead token/)
  assert.match(securityModel, /valid UUID without ownership\s+returns `404`/)
  assert.match(securityModel, /results marked `client-unverified` may be stored only as\s+practice progress/)
  assert.match(securityModel, /A child never receives Supabase Auth credentials/)

  assert.match(architecture, /separate `home_parent_accounts` identity/)
  assert.match(architecture, /existing non-null `lead_id` remains for demo\s+compatibility/)
  assert.match(architecture, /subscription remains account-level, while attempts, path progress and\s+reports remain child-profile-level/)
})

test('parent registration is built with the scoped Turnstile CSP', () => {
  assert.match(viteConfig, /ctx\.path\.endsWith\('parent\.html'\)/)
  assert.match(viteConfig, /usesTurnstile \? TEACHER_CSP : STRICT_CSP/)
})

test('every app HTML entry starts with a module that imports the framing guard', async () => {
  const inputMatches = [...viteConfig.matchAll(/^\s+([A-Za-z0-9'_-]+):\s+resolve\(__dirname,\s+'([^']+\.html)'\)/gm)]

  for (const [, entryName, htmlPath] of inputMatches) {
    if (htmlPath === 'offline.html' || htmlPath === 'framing-blocked.html') continue

    const html = await readFile(new URL(`../../${htmlPath}`, import.meta.url), 'utf8')
    const firstModule = html.match(/<script\s+type="module"\s+src="([^"]+\.js)"><\/script>/)
    assert.ok(firstModule, `${entryName} has no module script`)

    const sourcePath = firstModule[1].replace(/\.js$/, '.ts')
    const source = await readFile(new URL(`../../${sourcePath}`, import.meta.url), 'utf8')
    const firstExecutableLine = source
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(line => line && !line.startsWith('//'))

    assert.equal(
      firstExecutableLine,
      "import './frontend-security.js'",
      `${basename(resolve(sourcePath))} must import frontend-security first for ${htmlPath}`,
    )
  }
})
