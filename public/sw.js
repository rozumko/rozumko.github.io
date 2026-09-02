/**
 * sw.js — Service Worker для Розумко
 * ─────────────────────────────────────────────────────────────
 * Стратегія:
 *   - При install: кешуємо критичну статику (shell сайту)
 *   - При fetch навігації (HTML): network-first → якщо offline → offline.html
 *   - При fetch статики (JS/CSS/шрифти): cache-first → якщо немає → мережа
 *   - Cross-origin requests (API, Auth, CDN): never intercept
 *
 * При оновленні коду: змінити CACHE_NAME — старий кеш очиститься автоматично.
 * ─────────────────────────────────────────────────────────────
 */

const CACHE_NAME = 'rozumko-v5';

/**
 * Статичні ресурси що кешуються при першому завантаженні.
 * Все що потрібно для рендеру основних сторінок без мережі.
 */
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/school.html',
  '/home.html',
  '/parent.html',
  '/path.html',
  '/games.html',
  '/student.html',
  '/olympiad-enter.html',
  '/for-students.html',
  '/for-parents.html',
  '/for-teachers.html',
  '/terms.html',
  '/privacy.html',
  '/offline.html',
  '/404.html',
  '/manifest.json',
  '/favicon-32x32.png',
  '/favicon-16x16.png',
  '/apple-touch-icon.png',
];

// ─── Install: кешуємо shell сайту ────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // addAll падає якщо хоча б один ресурс недоступний — обходимо поштучно
      await Promise.allSettled(
        PRECACHE_URLS.map(url =>
          cache.add(url).catch(err => console.warn(`[SW] не вдалось закешувати ${url}:`, err))
        )
      );
    })
  );
  // Активуємо новий SW одразу, не чекаємо закриття вкладок
  self.skipWaiting();
});

// ─── Activate: видаляємо старі кеші ──────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log(`[SW] видаляємо старий кеш: ${key}`);
            return caches.delete(key);
          })
      )
    )
  );
  // Беремо контроль над вже відкритими вкладками без перезавантаження
  self.clients.claim();
});

// ─── Fetch: основна логіка перехоплення запитів ───────────────────────────────

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Пропускаємо не-HTTP запити (chrome-extension://, etc.)
  if (!url.protocol.startsWith('http')) return;

  // Never cache cross-origin requests. This keeps API/Auth/CDN behavior safe
  // when the frontend is moved away from the current providers.
  if (url.origin !== self.location.origin) return;

  // Будь-який бекенд-шлях (у т.ч. localhost:3000 у розробці): ніколи не кешуємо.
  // Cache-first для /api означав би вічно застиглий стан entitlement/звітів.
  if (url.pathname.startsWith('/api/')) return;

  // Dev-сервер Vite: перехоплення модулів ламає HMR і підсовує старий код.
  if (url.port === '5173' || url.port === '3000') return;

  // Пропускаємо POST/PUT/DELETE — тільки GET кешуємо
  if (event.request.method !== 'GET') return;

  const isNavigation = event.request.mode === 'navigate';

  if (isNavigation) {
    // Навігаційні запити (HTML-сторінки): network-first
    // Якщо мережі немає — показуємо offline.html
    event.respondWith(networkFirstWithOfflineFallback(event.request));
  } else if (url.pathname.startsWith('/questions/') || url.pathname.startsWith('/lessons/') || url.pathname.startsWith('/path/') || url.pathname.startsWith('/content-packs/')) {
    // Бандли питань, мікро-уроків, карт шляху й ігрового контенту — дані, що оновлюються
    // частіше за код. Network-first: онлайн завжди свіжий контент (cache-first
    // підсовував би старий бандл до зміни CACHE_NAME), офлайн — з кешу.
    event.respondWith(networkFirstWithCacheFallback(event.request));
  } else {
    // Статичні ресурси (JS, CSS, зображення): cache-first
    // Якщо немає в кеші — завантажуємо і кешуємо
    event.respondWith(cacheFirstWithNetworkFallback(event.request));
  }
});

// ─── Стратегії кешування ─────────────────────────────────────────────────────

/**
 * Network-first для HTML-навігації.
 * Намагається отримати свіжу версію сторінки.
 * При будь-якій помилці мережі — відповідає offline.html з кешу.
 */
async function networkFirstWithOfflineFallback(request) {
  try {
    const networkResponse = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return caches.match('/offline.html');
  }
}

/**
 * Cache-first для статичних ресурсів.
 * Спочатку шукає в кеші — якщо є, повертає миттєво.
 * Якщо немає — завантажує з мережі і додає в кеш.
 */
async function cacheFirstWithNetworkFallback(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    return new Response('Ресурс недоступний офлайн', { status: 503 });
  }
}

/**
 * Network-first для контенту, що оновлюється (бандли питань).
 * Онлайн: свіжа версія з мережі + оновлення кешу. Офлайн: остання з кешу.
 */
async function networkFirstWithCacheFallback(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Ресурс недоступний офлайн', { status: 503 });
  }
}
