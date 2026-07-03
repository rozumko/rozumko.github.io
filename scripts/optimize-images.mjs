// Оптимізація ілюстрацій маскота й аватарів для деплою.
// Джерело: images/ (сирі PNG ~1.2 МБ, ~1250px) — НЕ деплоїться (у .gitignore).
// Вихід: public/ (стиснуті PNG, розмір під реальний показ) — деплоїться Vite.
// Запуск: npm run optimize:images
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(root, 'images')
const OUT = join(root, 'public')

// Аватари учнів: слаг = токен імені файлу (rozumko_<slug>.png). Показ ~88px → 2x.
const AVATAR_SLUGS = [
  'astronaut', 'wizard', 'detective', 'explorer', 'gamer',
  'hero', 'ninja', 'pirat', 'princess', 'artist',
]

const pngOpts = { compressionLevel: 9, quality: 80, palette: true, effort: 10 }

// Ілюстрації маскота йдуть з суцільним білим фоном (без alpha). Робот має темний
// контур, тож flood-fill від країв прибирає лише фоновий білий, з'єднаний з рамкою,
// і не чіпає білі частини самого робота (вони замкнені всередині контуру).
async function whiteToTransparent(srcPath) {
  const { data, info } = await sharp(srcPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  const isBg = (i) => data[i] >= 232 && data[i + 1] >= 232 && data[i + 2] >= 232
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
  while (stack.length) {
    const p = stack.pop()
    data[p * 4 + 3] = 0 // прозорий
    const x = p % w, y = (p - x) / w
    pushIf(x + 1, y); pushIf(x - 1, y); pushIf(x, y + 1); pushIf(x, y - 1)
  }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).trim()
}

async function optimizeAvatars() {
  await mkdir(join(OUT, 'avatars'), { recursive: true })
  for (const slug of AVATAR_SLUGS) {
    const src = join(SRC, 'avatars', `rozumko_${slug}.png`)
    const dst = join(OUT, 'avatars', `${slug}.png`)
    const info = await sharp(src)
      .resize(176, 176, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png(pngOpts)
      .toFile(dst)
    console.log(`avatar ${slug.padEnd(10)} → ${(info.size / 1024).toFixed(1)} KB`)
  }
}

async function optimizeMascot() {
  const dst = join(OUT, 'mascot-greeting.png')
  const cut = await whiteToTransparent(join(SRC, 'roozumk_greatings.png'))
  const info = await cut
    .resize(null, 440, { fit: 'inside' })
    .png(pngOpts)
    .toFile(dst)
  console.log(`mascot greeting → ${(info.size / 1024).toFixed(1)} KB`)
}

await optimizeAvatars()
await optimizeMascot()
console.log('Done.')
