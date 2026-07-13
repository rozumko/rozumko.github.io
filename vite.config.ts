import { defineConfig, type Plugin } from 'vite'
import { resolve } from 'path'

// ── Content-Security-Policy ──────────────────────────────────────────────────
// Шрифти (Nunito) self-hosted у public/fonts — жодних зовнішніх font-джерел.
// Дозволені зовнішні джерела:
//   - Font Awesome:    cdnjs.cloudflare.com (CSS + webfonts, лише doc-сторінки)
//   - API бекенду:     rozumko-github-io.onrender.com
//   - Supabase Auth:   ivcufigpmamgkfxwulzl.supabase.co (логін/реєстрація вчителя)
// script-src 'self' — увесь JS лише з власного домену (модулі Vite). Інлайн-скриптів
// у HTML немає (SW-реєстрацію винесено в register-sw.ts); modulepreload-polyfill
// вимкнено нижче. style-src має 'unsafe-inline' через inline style-атрибути в розмітці.
const BASE_CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
  "font-src 'self' https://cdnjs.cloudflare.com",
  "img-src 'self' data:",
  "connect-src 'self' https://rozumko-github-io.onrender.com https://ivcufigpmamgkfxwulzl.supabase.co https://cdnjs.cloudflare.com",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
]

const STRICT_CSP = ["script-src 'self'", ...BASE_CSP].join('; ')

const ANALYTICS_PAGES = new Set([
  'index.html',
  'for-parents.html',
  'for-teachers.html',
  'standards.html',
  'transparency.html',
])
const ANALYTICS_SCRIPT_ORIGIN = 'https://static.cloudflareinsights.com'
const ANALYTICS_CONNECT_ORIGIN = 'https://cloudflareinsights.com'
const ANALYTICS_TOKEN = process.env.CLOUDFLARE_WEB_ANALYTICS_TOKEN?.trim()
const ANALYTICS_CSP = [
  `script-src 'self' ${ANALYTICS_SCRIPT_ORIGIN}`,
  ...BASE_CSP.map((directive) => directive.startsWith('connect-src ')
    ? `${directive} ${ANALYTICS_CONNECT_ORIGIN}`
    : directive),
].join('; ')

function isAnalyticsPage(path: string): boolean {
  const fileName = path.split('/').pop() || 'index.html'
  return ANALYTICS_PAGES.has(fileName)
}

// teacher.html and parent.html additionally load Cloudflare Turnstile:
//   - script-src: api.js віджета
//   - frame-src:  Turnstile рендериться в iframe (без директиви впав би на default-src 'self')
//   - connect-src: віджет робить запити до challenges.cloudflare.com
// Розширення скоупимо лише на auth-сторінки, решта лишаються на STRICT_CSP.
const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com'
const TEACHER_CSP = [
  `script-src 'self' ${TURNSTILE_ORIGIN}`,
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
  "font-src 'self' https://cdnjs.cloudflare.com",
  "img-src 'self' data:",
  `connect-src 'self' https://rozumko-github-io.onrender.com https://ivcufigpmamgkfxwulzl.supabase.co https://cdnjs.cloudflare.com ${TURNSTILE_ORIGIN}`,
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
        const usesTurnstile = ctx.path.endsWith('teacher.html') || ctx.path.endsWith('parent.html')
        const usesAnalytics = Boolean(ANALYTICS_TOKEN) && isAnalyticsPage(ctx.path)
        const content = isOffline
          ? OFFLINE_CSP
          : usesTurnstile
            ? TEACHER_CSP
            : usesAnalytics
              ? ANALYTICS_CSP
              : STRICT_CSP
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

function analyticsPlugin(): Plugin {
  return {
    name: 'inject-cloudflare-web-analytics',
    apply: 'build',
    transformIndexHtml(html, ctx) {
      if (!ANALYTICS_TOKEN || !isAnalyticsPage(ctx.path)) return html
      if (!/^[a-z0-9]{32}$/i.test(ANALYTICS_TOKEN)) {
        throw new Error('CLOUDFLARE_WEB_ANALYTICS_TOKEN must be a 32-character alphanumeric site token')
      }

      return {
        html,
        tags: [{
          tag: 'script',
          attrs: {
            defer: true,
            src: `${ANALYTICS_SCRIPT_ORIGIN}/beacon.min.js`,
            'data-cf-beacon': JSON.stringify({ token: ANALYTICS_TOKEN }),
          },
          injectTo: 'body',
        }],
      }
    },
  }
}

export default defineConfig({
  // GitHub Pages user site — base is /
  base: '/',

  // Static assets copied verbatim to dist/
  publicDir: 'public',

  plugins: [cspPlugin(), analyticsPlugin()],

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
        parent:           resolve(__dirname, 'parent.html'),
        admin:            resolve(__dirname, 'admin.html'),
        'framing-blocked': resolve(__dirname, 'framing-blocked.html'),
        offline:          resolve(__dirname, 'offline.html'),
        home:             resolve(__dirname, 'home.html'),
        path:             resolve(__dirname, 'path.html'),
        games:            resolve(__dirname, 'games.html'),
        school:           resolve(__dirname, 'school.html'),
        'for-teachers':   resolve(__dirname, 'for-teachers.html'),
        'for-students':   resolve(__dirname, 'for-students.html'),
        'for-parents':    resolve(__dirname, 'for-parents.html'),
        privacy:          resolve(__dirname, 'privacy.html'),
        terms:            resolve(__dirname, 'terms.html'),
        transparency:     resolve(__dirname, 'transparency.html'),
        standards:        resolve(__dirname, 'standards.html'),
      },
    },
  },
})
