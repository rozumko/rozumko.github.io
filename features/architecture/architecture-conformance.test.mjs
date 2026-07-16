import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const API_CLIENT = resolve(ROOT, 'features/api/client.ts')

function isProductionSource(name) {
  return /\.(?:ts|js|mjs)$/.test(name)
    && !/\.test\.(?:ts|js|mjs)$/.test(name)
    && name !== 'vite.config.ts'
    && name !== 'playwright.config.ts'
}

async function productionTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...await productionTypeScriptFiles(path))
    else if (isProductionSource(entry.name)) files.push(path)
  }

  return files
}

test('frontend backend/auth endpoint calls stay inside features/api/client.ts', async () => {
  const violations = []
  const rootEntries = await readdir(ROOT, { withFileTypes: true })
  const files = rootEntries
    .filter(entry => entry.isFile() && isProductionSource(entry.name))
    .map(entry => resolve(ROOT, entry.name))
  files.push(...await productionTypeScriptFiles(resolve(ROOT, 'features')))
  files.push(...await productionTypeScriptFiles(resolve(ROOT, 'utils')))

  for (const path of files) {
    if (path === API_CLIENT) continue
    const source = await readFile(path, 'utf8')
    if (/['"`]\/api\//.test(source) || /\/auth\/v1\//.test(source) || /\/rest\/v1\//.test(source)) {
      violations.push(relative(ROOT, path))
    }
  }

  assert.deepEqual(violations, [], `HTTP boundary bypassed in: ${violations.join(', ')}`)
})

test('frontend endpoint origins remain deployment-configurable and feed CSP', async () => {
  const client = await readFile(API_CLIENT, 'utf8')
  const viteConfig = await readFile(resolve(ROOT, 'vite.config.ts'), 'utf8')
  const serviceWorker = await readFile(resolve(ROOT, 'public/sw.js'), 'utf8')

  assert.match(client, /ENV\.VITE_API_URL/)
  assert.match(client, /ENV\.VITE_SUPABASE_URL/)
  assert.match(viteConfig, /loadEnv\(mode, process\.cwd\(\), ''\)/)
  assert.match(viteConfig, /env\.VITE_API_URL/)
  assert.match(viteConfig, /env\.VITE_SUPABASE_URL/)
  assert.match(viteConfig, /connect-src 'self' \$\{apiOrigin\} \$\{supabaseOrigin\}/)
  assert.match(serviceWorker, /url\.origin !== self\.location\.origin/)
  assert.doesNotMatch(serviceWorker, /onrender\.com|supabase\.co/)
})

test('pull requests run the browser-backed layout and accessibility gate', async () => {
  const workflow = await readFile(resolve(ROOT, '.github/workflows/backend-ci.yml'), 'utf8')

  assert.match(workflow, /pull_request:/)
  assert.match(workflow, /playwright install --with-deps chromium/)
  assert.match(workflow, /npm run test:layout/)
})
