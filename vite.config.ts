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
        return {
          html,
          tags: [{
            tag: 'meta',
            attrs: {
              'http-equiv': 'Content-Security-Policy',
              content: isOffline ? OFFLINE_CSP : STRICT_CSP,
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
        'for-teachers':   resolve(__dirname, 'for-teachers.html'),
        'for-students':   resolve(__dirname, 'for-students.html'),
        'for-parents':    resolve(__dirname, 'for-parents.html'),
        privacy:          resolve(__dirname, 'privacy.html'),
        terms:            resolve(__dirname, 'terms.html'),
      },
    },
  },
})
