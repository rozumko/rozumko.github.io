import './frontend-security.js'
import './register-sw.js'
// Unified header + footer for all public pages.
// Each page includes this module via <script type="module" src="layout.js">.
// Placeholders: <div id="site-header"></div> and <div id="site-footer"></div>

// Хедер тримаємо мінімальним: лише дві продуктові поверхні + CTA.
// Інформаційні сторінки (Для учнів/батьків/вчителів, Правила, Приватність)
// живуть тільки у футері, щоб не перевантажувати навігацію.
const NAV = [
  { href: 'home.html', label: 'Я вдома' },
  { href: 'school.html', label: 'Я в класі' },
]

function activePage(): string {
  return location.pathname.split('/').pop() || 'index.html'
}

function injectHeader(): void {
  const el = document.getElementById('site-header')
  if (!el) return

  const page = activePage()
  const links = NAV.map(({ href, label }) => {
    const active = page === href ? ' site-header__link--active' : ''
    return `<a href="${href}" class="site-header__link${active}">${label}</a>`
  }).join('')

  el.outerHTML = `
    <header class="site-header">
      <div class="site-header__inner">
        <a href="index.html" class="site-header__logo" aria-label="Розумко — на головну">Розумко</a>
        <button class="site-header__burger" aria-label="Відкрити меню" aria-expanded="false" aria-controls="site-nav">
          <span></span><span></span><span></span>
        </button>
        <nav id="site-nav" class="site-header__nav" aria-label="Навігація сайтом">${links}</nav>
        <a href="home.html" class="site-header__cta">Почати гру →</a>
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
              <li><a href="home.html">Домашні місії</a></li>
              <li><a href="school.html">Шкільний режим</a></li>
            </ul>
          </div>
          <div>
            <p class="footer-col__heading">Документи</p>
            <ul class="footer-col__list">
              <li><a href="privacy.html">Конфіденційність</a></li>
              <li><a href="terms.html">Правила та умови</a></li>
            </ul>
          </div>
          <div class="footer-col--wide">
            <p class="footer-col__heading">Кабінет</p>
            <ul class="footer-col__list">
              <li><a href="teacher.html">Вхід для вчителя</a></li>
              <li><a href="student.html">Вхід учня за кодом</a></li>
            </ul>
          </div>
        </nav>
        <div class="site-footer__copy">
          <p>&copy; 2024–2026 Розумко. Усі права захищені.</p>
        </div>
      </div>
    </footer>`
}

injectHeader()
injectFooter()
