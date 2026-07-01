import { defineConfig, type Plugin } from 'vite'
import { resolve } from 'path'

// ── Content-Security-Policy ──────────────────────────────────────────────────
// Дозволені зовнішні джерела:
//   - Google Fonts:    fonts.googleapis.com (CSS) + fonts.gstatic.com (шрифти)
//   - Font Awesome:    cdnjs.cloudflare.com (CSS + webfonts)
//   - API бекенду:     rozumko-github-io.onrender.com
//   - Supabase Auth:   ivcufigpmamgkfxwulzl.supabase.co (логін/реєстрація вчителя)
// script-src 'self' — увесь JS лише з власного домену (модулі Vite). Інлайн-скриптів
// у HTML немає (SW-реєстрацію винесено в register-sw.ts); modulepreload-polyfill
// вимкнено нижче. style-src має 'unsafe-inline' через inline style-атрибути в розмітці.
const BASE_CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
  "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com",
  "img-src 'self' data:",
  "connect-src 'self' https://rozumko-github-io.onrender.com https://ivcufigpmamgkfxwulzl.supabase.co https://fonts.googleapis.com https://fonts.gstatic.com https://cdnjs.cloudflare.com",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
]

const STRICT_CSP = ["script-src 'self'", ...BASE_CSP].join('; ')

// teacher.html додатково вантажить Cloudflare Turnstile (захист реєстрації від ботів):
//   - script-src: api.js віджета
//   - frame-src:  Turnstile рендериться в iframe (без директиви впав би на default-src 'self')
//   - connect-src: віджет робить запити до challenges.cloudflare.com
// Розширення скоупимо ЛИШЕ на teacher.html, решта сторінок лишаються на STRICT_CSP.
const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com'
const TEACHER_CSP = [
  `script-src 'self' ${TURNSTILE_ORIGIN}`,
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
  "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com",
  "img-src 'self' data:",
  `connect-src 'self' https://rozumko-github-io.onrender.com https://ivcufigpmamgkfxwulzl.supabase.co https://fonts.googleapis.com https://fonts.gstatic.com https://cdnjs.cloudflare.com ${TURNSTILE_ORIGIN}`,
  `frame-src ${TURNSTILE_ORIGIN}`,
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

// offline.html обслуговується Service Worker без доступу до зовнішніх JS-бандлів,
// тому має власний інлайн-скрипт + onclick. Для цієї сторінки (статичної, без
// доступу до API/секретів) дозволяємо інлайн-скрипти.
const OFFLINE_CSP = ["script-src 'self' 'unsafe-inline'", ...BASE_CSP].join('; ')

// Інжектить <meta http-equiv="Content-Security-Policy"> у кожен HTML лише під час
// build (GitHub Pages не дозволяє ставити HTTP-заголовки). У dev не застосовується,
// щоб не ламати Vite HMR.
function cspPlugin(): Plugin {
  return {
    name: 'inject-csp-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const isOffline = ctx.path.endsWith('offline.html')
        const isTeacher = ctx.path.endsWith('teacher.html')
        const content = isOffline ? OFFLINE_CSP : isTeacher ? TEACHER_CSP : STRICT_CSP
        return {
          html,
          tags: [{
            tag: 'meta',
            attrs: {
              'http-equiv': 'Content-Security-Policy',
              content,
            },
            injectTo: 'head-prepend',
          }],
        }
      },
    },
  }
}

export default defineConfig({
  // GitHub Pages user site — base is /
  base: '/',

  // Static assets copied verbatim to dist/
  publicDir: 'public',

  plugins: [cspPlugin()],

  build: {
    outDir: 'dist',
    // modulepreload-polyfill — це інлайн-скрипт; вимикаємо, щоб тримати
    // script-src 'self' без 'unsafe-inline'. Сучасні браузери підтримують
    // modulepreload нативно.
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        index:            resolve(__dirname, 'index.html'),
        student:          resolve(__dirname, 'student.html'),
        'olympiad-enter': resolve(__dirname, 'olympiad-enter.html'),
        teacher:          resolve(__dirname, 'teacher.html'),
        admin:            resolve(__dirname, 'admin.html'),
        offline:          resolve(__dirname, 'offline.html'),
        home:             resolve(__dirname, 'home.html'),
        school:           resolve(__dirname, 'school.html'),
        'for-teachers':   resolve(__dirname, 'for-teachers.html'),
        'for-students':   resolve(__dirname, 'for-students.html'),
        'for-parents':    resolve(__dirname, 'for-parents.html'),
        privacy:          resolve(__dirname, 'privacy.html'),
        terms:            resolve(__dirname, 'terms.html'),
      },
    },
  },
})
