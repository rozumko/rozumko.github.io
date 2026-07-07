import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const rootLock = JSON.parse(await readFile(new URL('../../package-lock.json', import.meta.url), 'utf8'))

function semverParts(version) {
  return version.split('.').map(part => Number(part))
}

test('supply-chain: root Vite lockfile stays above known high-severity advisory range', () => {
  const vite = rootLock.packages?.['node_modules/vite']
  assert.ok(vite?.version, 'Vite must be present in the root lockfile')

  const [major, minor, patch] = semverParts(vite.version)
  const isKnownVulnerableRange = major === 6 && minor === 4 && patch <= 2

  assert.equal(isKnownVulnerableRange, false, `vite@${vite.version} is in the GitHub npm-audit vulnerable range`)
})
