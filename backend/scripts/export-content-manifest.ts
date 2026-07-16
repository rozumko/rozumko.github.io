// Export and verify the exact version manifest for an audited publication.

import { appendFileSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { buildContentPublicationManifest, contentManifestSha256 } from '../src/lib/content-publication.js'

const manifest = await buildContentPublicationManifest()
const manifestSha256 = contentManifestSha256(manifest)
const expected = process.env.EXPECTED_MANIFEST_SHA256
if (expected && expected !== manifestSha256) {
  throw new Error(`Published content changed while queued: expected ${expected}, got ${manifestSha256}`)
}
const outDir = join(dirname(fileURLToPath(import.meta.url)), '../../public')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'content-manifest.json'), JSON.stringify({ manifestSha256, manifest }, null, 2) + '\n', 'utf8')
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `manifest_sha256=${manifestSha256}\n`, 'utf8')
console.log(`content-manifest.json: ${manifestSha256}`)
process.exit(0)
