/**
 * sw.js — Service Worker для Розумко
 * ─────────────────────────────────────────────────────────────
 * Стратегія:
 *   - При install: кешуємо критичну статику (shell сайту)
 *   - При fetch навігації (HTML): network-first → якщо offline → offline.html
 *   - При fetch статики (JS/CSS/шрифти): cache-first → якщо немає → мережа
 *   - Firebase API-запити: НЕ перехоплюємо (проксувати Firebase небезпечно)
 *
 * При оновленні коду: змінити CACHE_NAME — старий кеш очиститься автоматично.
 * ─────────────────────────────────────────────────────────────
 */

const CACHE_NAME = 'rozumko-v1';

/**
 * Статичні ресурси що кешуються при першому завантаженні.
 * Все що потрібно для рендеру основних сторінок без мережі.
 */
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/student.html',
  '/offline.html',
  '/style.css',
  '/manifest.json',
  '/favicon-32x32.png',
  '/favicon-16x16.png',
  '/apple-touch-icon.png',
];

/**
 * Хости що НЕ треба перехоплювати.
 * Firebase, Google APIs, CDN — вони мають власну надійність.
 */
const BYPASS_HOSTS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'recaptcha.net',
  'www.gstatic.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.tailwindcss.com',
  'cdnjs.cloudflare.com',
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
          .filter(key => key !== CACHE_NAME)   // всі кеші крім поточного
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

  // Пропускаємо Firebase та зовнішні API — вони не мають бути в кеші
  if (BYPASS_HOSTS.some(host => url.hostname.includes(host))) return;

  // Пропускаємо POST/PUT/DELETE — тільки GET кешуємо
  if (event.request.method !== 'GET') return;

  const isNavigation = event.request.mode === 'navigate';

  if (isNavigation) {
    // Навігаційні запити (HTML-сторінки): network-first
    // Якщо мережі немає — показуємо offline.html
    event.respondWith(networkFirstWithOfflineFallback(event.request));
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
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function networkFirstWithOfflineFallback(request) {
  try {
    const networkResponse = await fetch(request);
    // Оновлюємо кеш свіжою версією сторінки
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch {
    // Мережа недоступна — шукаємо в кеші
    const cached = await caches.match(request);
    if (cached) return cached;
    // Нема в кеші — показуємо offline.html
    return caches.match('/offline.html');
  }
}

/**
 * Cache-first для статичних ресурсів.
 * Спочатку шукає в кеші — якщо є, повертає миттєво.
 * Якщо немає — завантажує з мережі і додає в кеш.
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function cacheFirstWithNetworkFallback(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    // Кешуємо тільки успішні відповіді
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    // Нічого не можемо зробити — ресурс недоступний
    return new Response('Ресурс недоступний офлайн', { status: 503 });
  }
}
