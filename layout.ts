import './frontend-security.js'
import './register-sw.js'
import { isSurfaceAvailable, type ProductSurface } from './features/surfaces/availability.js'
// Unified header + footer for all public pages.
// Each page includes this module via <script type="module" src="layout.js">.
// Placeholders: <div id="site-header"></div> and <div id="site-footer"></div>

// Хедер тримаємо мінімальним: лише дві продуктові поверхні + CTA.
// Інформаційні сторінки (Для учнів/батьків/вчителів, Правила, Приватність)
// живуть тільки у футері, щоб не перевантажувати навігацію.
const NAV: Array<{ href: string; label: string; surface: ProductSurface }> = [
  { href: 'school.html', label: 'Я в класі', surface: 'school' },
  { href: 'home.html', label: 'Я вдома', surface: 'home' },
  { href: 'student.html', label: 'Олімпіада', surface: 'olympiad' },
]

function activePage(): string {
  return location.pathname.split('/').pop() || 'index.html'
}

function injectHeader(): void {
  const el = document.getElementById('site-header')
  if (!el) return

  const page = activePage()
  const isHome = page === 'home.html'
  const homeAvailable = isSurfaceAvailable('home')
  const links = NAV.map(({ href, label, surface }) => {
    const active = page === href ? ' site-header__link--active' : ''
    const available = isSurfaceAvailable(surface)
    const unavailable = available ? '' : ' site-header__link--coming-soon'
    const status = available ? '' : '<span class="site-header__status">Незабаром</span>'
    const aria = available ? '' : ` aria-label="${label}, незабаром"`
    return `<a href="${href}" class="site-header__link${active}${unavailable}"${aria}>${label}${status}</a>`
  }).join('')

  const ctaHref = homeAvailable && isHome ? 'parent.html' : homeAvailable ? 'home.html' : 'school.html'
  const ctaLabel = homeAvailable && isHome ? 'Кабінет батьків' : homeAvailable ? 'Почати гру →' : 'Ввести код →'

  el.outerHTML = `
    <header class="site-header">
      <div class="site-header__inner">
        <a href="index.html" class="site-header__logo" aria-label="Розумко — на головну">
          <img src="/rozumko-logo.svg" alt="Розумко" height="34" width="150" />
        </a>
        <button class="site-header__burger" aria-label="Відкрити меню" aria-expanded="false" aria-controls="site-nav">
          <span></span><span></span><span></span>
        </button>
        <nav id="site-nav" class="site-header__nav" aria-label="Навігація сайтом">${links}<a href="parent.html" class="site-header__link site-header__mobile-only">Кабінет батьків</a><a href="teacher.html" class="site-header__link site-header__mobile-only">Для вчителя</a></nav>
        <div class="site-header__actions">
          <a href="teacher.html" class="site-header__teacher">Для вчителя</a>
          <a href="${ctaHref}" class="site-header__cta">${ctaLabel}</a>
        </div>
      </div>
    </header>`

  // Бургер-логіка (після того як header вставлено в DOM)
  const header = document.querySelector<HTMLElement>('.site-header')
  const burger = document.querySelector<HTMLButtonElement>('.site-header__burger')
  if (!header || !burger) return

  const close = () => {
    header.classList.remove('is-open')
    burger.setAttribute('aria-expanded', 'false')
    burger.setAttribute('aria-label', 'Відкрити меню')
  }

  burger.addEventListener('click', (e) => {
    e.stopPropagation()
    const open = header.classList.toggle('is-open')
    burger.setAttribute('aria-expanded', String(open))
    burger.setAttribute('aria-label', open ? 'Закрити меню' : 'Відкрити меню')
  })

  // Закрити при кліку на посилання
  header.querySelectorAll('.site-header__link').forEach(link => {
    link.addEventListener('click', close)
  })

  // Закрити при кліку поза хедером
  document.addEventListener('click', (e) => {
    if (!header.contains(e.target as Node)) close()
  })

  // Закрити при Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close()
  })
}

function injectFooter(): void {
  const el = document.getElementById('site-footer')
  if (!el) return

  const homeLabel = isSurfaceAvailable('home') ? 'Кабінет батьків' : 'Домашній режим — незабаром'
  const olympiadLabel = isSurfaceAvailable('olympiad') ? 'Вхід учня за кодом' : 'Олімпіада — незабаром'

  el.outerHTML = `
    <footer class="site-footer">
      <div class="site-footer__inner">
        <nav class="site-footer__nav" aria-label="Навігація сайту">
          <div>
            <p class="footer-col__heading">Про сервіс</p>
            <ul class="footer-col__list">
              <li><a href="for-students.html">Для учнів</a></li>
              <li><a href="for-parents.html">Для батьків</a></li>
              <li><a href="for-teachers.html">Для вчителів</a></li>
              <li><a href="standards.html">Наші стандарти</a></li>
            </ul>
          </div>
          <div>
            <p class="footer-col__heading">Документи</p>
            <ul class="footer-col__list">
              <li><a href="privacy.html">Конфіденційність</a></li>
              <li><a href="terms.html">Правила та умови</a></li>
              <li><a href="transparency.html">Прозорість</a></li>
            </ul>
          </div>
          <div class="footer-col--wide">
            <p class="footer-col__heading">Кабінет</p>
            <ul class="footer-col__list">
              <li><a href="parent.html">${homeLabel}</a></li>
              <li><a href="teacher.html">Вхід для вчителя</a></li>
              <li><a href="student.html">${olympiadLabel}</a></li>
            </ul>
          </div>
        </nav>
        <div class="site-footer__copy">
          <p>&copy; 2026 Розумко. Усі права захищені.</p>
        </div>
      </div>
    </footer>`
}

export function renderSiteLayout(): void {
  injectHeader()
  injectFooter()
}

renderSiteLayout()
