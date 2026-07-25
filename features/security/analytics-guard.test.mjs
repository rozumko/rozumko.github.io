import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const viteConfig = await readFile(new URL('../../vite.config.ts', import.meta.url), 'utf8')
const indexHtml = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
const privacyHtml = await readFile(new URL('../../privacy.html', import.meta.url), 'utf8')
const deployWorkflow = await readFile(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8')

test('legacy Google Analytics tracker is removed', () => {
  assert.doesNotMatch(indexHtml, /googletagmanager|\bgtag\b|G-DR4YL3J2RE/)
})

test('Cloudflare analytics is token-gated and fails closed', () => {
  assert.match(viteConfig, /process\.env\.CLOUDFLARE_WEB_ANALYTICS_TOKEN\?\.trim\(\)/)
  assert.match(viteConfig, /if \(!ANALYTICS_TOKEN \|\| !isAnalyticsPage\(ctx\.path\)\) return html/)
  assert.match(viteConfig, /\^\[a-z0-9\]\{32\}\$/)
  assert.match(viteConfig, /ANALYTICS_SCRIPT_ORIGIN = 'https:\/\/static\.cloudflareinsights\.com'/)
  assert.match(viteConfig, /ANALYTICS_CONNECT_ORIGIN = 'https:\/\/cloudflareinsights\.com'/)
  assert.match(viteConfig, /\$\{ANALYTICS_SCRIPT_ORIGIN\}\/beacon\.min\.js/)
  assert.match(viteConfig, /directive\.startsWith\('connect-src '\)[\s\S]*\$\{ANALYTICS_CONNECT_ORIGIN\}/)
  assert.match(deployWorkflow, /CLOUDFLARE_WEB_ANALYTICS_TOKEN: \$\{\{ vars\.CLOUDFLARE_WEB_ANALYTICS_TOKEN \}\}/)
})

test('analytics allowlist excludes child and application surfaces', () => {
  const allowlist = viteConfig.match(/const ANALYTICS_PAGES = new Set\(\[([\s\S]*?)\]\)/)?.[1] || ''

  for (const page of ['index.html', 'for-parents.html', 'for-teachers.html', 'standards.html', 'transparency.html']) {
    assert.match(allowlist, new RegExp(`'${page.replace('.', '\\.')}'`))
  }

  for (const page of ['student.html', 'school.html', 'home.html', 'olympiad-enter.html', 'games.html', 'path.html']) {
    assert.doesNotMatch(allowlist, new RegExp(`'${page.replace('.', '\\.')}'`))
  }
})

test('first-party home funnel counters are disclosed and stay non-identifying', async () => {
  const client = await readFile(new URL('../api/client.ts', import.meta.url), 'utf8')
  const funnel = client.match(/export function recordHomeFunnelStep[\s\S]*?\n\}/)?.[0] ?? ''

  assert.ok(funnel, 'recordHomeFunnelStep не знайдено у клієнті')
  // Лічильник відправляє лише крок і два грубих виміри — нічого про людину.
  assert.doesNotMatch(funnel, /localStorage|sessionStorage|document\.cookie|crypto\.randomUUID|navigator\./)
  assert.match(funnel, /body\.grade = dims\.grade/)
  assert.match(funnel, /body\.track = dims\.track/)

  // Політика має описувати цей збір до того, як він почне працювати.
  assert.match(privacyHtml, /власні знеособлені лічильники кроків/)
  assert.match(privacyHtml, /Жодного ідентифікатора відвідувача, IP-адреси, cookie чи localStorage/)
})

test('public privacy copy matches the analytics boundary', () => {
  assert.match(indexHtml, /Без рекламних трекерів, cookie й профілювання дітей/)
  assert.match(privacyHtml, /Cloudflare Web Analytics/)
  assert.match(privacyHtml, /не використовує cookie чи localStorage/)
  assert.match(privacyHtml, /не підключається на сторінках дитячих місій, Шкільного режиму, Домашнього режиму або олімпіад/)
})
