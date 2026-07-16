import { defineConfig, loadEnv, type Plugin } from 'vite'
import { resolve } from 'path'

// Content-Security-Policy. Nunito is self-hosted in public/fonts.
// Allowed external sources:
//   - Font Awesome:    cdnjs.cloudflare.com (CSS + webfonts, document pages only)
//   - Backend API:     origin from VITE_API_URL
//   - Supabase Auth:   origin from VITE_SUPABASE_URL
// script-src keeps application JavaScript same-origin. Service-worker
// registration is externalized in register-sw.ts and the modulepreload
// polyfill is disabled below. style-src still permits required inline styles.
const DEFAULT_API_URL = 'https://rozumko-github-io.onrender.com'
const DEFAULT_SUPABASE_URL = 'https://ivcufigpmamgkfxwulzl.supabase.co'

function externalOrigin(value: string, variableName: string): string {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('unsupported protocol')
    return url.origin
  } catch {
    throw new Error(`${variableName} must be an absolute http(s) URL`)
  }
}

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
function isAnalyticsPage(path: string): boolean {
  const fileName = path.split('/').pop() || 'index.html'
  return ANALYTICS_PAGES.has(fileName)
}

// teacher.html and parent.html additionally load Cloudflare Turnstile.
// Scope its script, frame and connection origins to authentication pages only.
const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com'
// GitHub Pages cannot set CSP headers, so inject a CSP meta tag at build time.
// Development remains unaffected to preserve Vite HMR.
function cspPlugin(apiOrigin: string, supabaseOrigin: string): Plugin {
  const BASE_CSP = [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
    "font-src 'self' https://cdnjs.cloudflare.com",
    "img-src 'self' data:",
    `connect-src 'self' ${apiOrigin} ${supabaseOrigin} https://cdnjs.cloudflare.com`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ]
  const STRICT_CSP = ["script-src 'self'", ...BASE_CSP].join('; ')
  const ANALYTICS_CSP = [
    `script-src 'self' ${ANALYTICS_SCRIPT_ORIGIN}`,
    ...BASE_CSP.map((directive) => directive.startsWith('connect-src ')
      ? `${directive} ${ANALYTICS_CONNECT_ORIGIN}`
      : directive),
  ].join('; ')
  const TEACHER_CSP = [
    `script-src 'self' ${TURNSTILE_ORIGIN}`,
    ...BASE_CSP.map((directive) => directive.startsWith('connect-src ')
      ? `${directive} ${TURNSTILE_ORIGIN}`
      : directive),
    `frame-src ${TURNSTILE_ORIGIN}`,
  ].join('; ')

  // offline.html is served by the Service Worker without external bundles.
  const OFFLINE_CSP = ["script-src 'self' 'unsafe-inline'", ...BASE_CSP].join('; ')

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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiOrigin = externalOrigin(env.VITE_API_URL?.trim() || DEFAULT_API_URL, 'VITE_API_URL')
  const supabaseOrigin = externalOrigin(env.VITE_SUPABASE_URL?.trim() || DEFAULT_SUPABASE_URL, 'VITE_SUPABASE_URL')

  return {
    // GitHub Pages user site.
    base: '/',

    // Static assets copied verbatim to dist/
    publicDir: 'public',

    plugins: [cspPlugin(apiOrigin, supabaseOrigin), analyticsPlugin()],

    build: {
      outDir: 'dist',
      // Disable the inline modulepreload polyfill to preserve script-src 'self'.
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
  }
})
