import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const frontendSecurity = await readFile(new URL('../../frontend-security.ts', import.meta.url), 'utf8')
const viteConfig = await readFile(new URL('../../vite.config.ts', import.meta.url), 'utf8')
const blockedPage = await readFile(new URL('../../framing-blocked.html', import.meta.url), 'utf8')
const securityModel = await readFile(new URL('../../docs/security-model.md', import.meta.url), 'utf8')

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
