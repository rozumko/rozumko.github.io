// Cut the baked-in checkerboard "transparency" out of question asset webp files.
//
// The AI-generated source images ship a fake checkerboard background (light
// gray squares, ~244-255) baked into the pixels. Strategy, per image:
//   1. Flood fill from the borders across near-white pixels → alpha 0. The
//      artwork has dark outlines, so enclosed white parts (the mascot's body)
//      are never reached — same approach as whiteToTransparent in
//      optimize-images.mjs.
//   2. Remaining near-white pixels that the fill could not reach (checkerboard
//      pockets enclosed by the artwork, e.g. between an arm and a laptop) are
//      flattened to pure white — every surface shows these images on white
//      cards, so pockets read as clean background.
//
// Usage: node scripts/remove-checkerboard.mjs [dir ...]
//        (defaults to public/assets/{basics,devices,information,files})
// Rewrites .webp files in place — review with git diff / git checkout to undo.
import sharp from 'sharp'
import { readdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_DIRS = ['basics', 'devices', 'information', 'files']
  .map(d => join(root, 'public', 'assets', d))

// Near-white: checkerboard tones sit at 244-255; 232 matches optimize-images.mjs
// and tolerates webp compression noise around the squares.
const BG_MIN = 232

async function cutFile(path) {
  // Read into a buffer ourselves: sharp(path) keeps the file handle open on
  // Windows, which blocks the in-place overwrite below.
  const source = await readFile(path)
  const { data, info } = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  const isBg = (i) => data[i] >= BG_MIN && data[i + 1] >= BG_MIN && data[i + 2] >= BG_MIN

  // 1. Border flood fill → transparent
  const seen = new Uint8Array(w * h)
  const stack = []
  const pushIf = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const p = y * w + x
    if (seen[p]) return
    seen[p] = 1
    if (isBg(p * 4)) stack.push(p)
  }
  for (let x = 0; x < w; x++) { pushIf(x, 0); pushIf(x, h - 1) }
  for (let y = 0; y < h; y++) { pushIf(0, y); pushIf(w - 1, y) }
  let cleared = 0
  while (stack.length) {
    const p = stack.pop()
    data[p * 4 + 3] = 0
    cleared++
    const x = p % w, y = (p - x) / w
    pushIf(x + 1, y); pushIf(x - 1, y); pushIf(x, y + 1); pushIf(x, y - 1)
  }

  // 2. Enclosed near-white pockets → pure white
  let flattened = 0
  for (let p = 0; p < w * h; p++) {
    const i = p * 4
    if (data[i + 3] !== 0 && isBg(i) && (data[i] < 255 || data[i + 1] < 255 || data[i + 2] < 255)) {
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255
      flattened++
    }
  }

  const out = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .webp({ quality: 90, effort: 5 })
    .toBuffer()
  await writeFile(path, out)
  return { clearedPct: (cleared / (w * h)) * 100, flattenedPct: (flattened / (w * h)) * 100, bytes: out.length }
}

const dirs = process.argv.slice(2).map(d => join(root, d))
for (const dir of dirs.length ? dirs : DEFAULT_DIRS) {
  const files = (await readdir(dir)).filter(f => f.endsWith('.webp'))
  for (const f of files) {
    const { clearedPct, flattenedPct, bytes } = await cutFile(join(dir, f))
    const flag = clearedPct < 20 || clearedPct > 85 ? '  ← ПЕРЕВІР ОКОМ' : ''
    console.log(`${join(dir, f).replace(root, '').padEnd(55)} bg ${clearedPct.toFixed(0).padStart(2)}%  pockets ${flattenedPct.toFixed(1).padStart(4)}%  ${(bytes / 1024).toFixed(0).padStart(4)} KB${flag}`)
  }
}
console.log('Done. Переглянь позначені файли і git diff перед комітом.')
