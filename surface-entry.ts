import './frontend-security.js'
import './surface-stub.css'
import { renderSiteLayout } from './layout.js'
import { isSurfaceAvailable, surfaceForPath } from './features/surfaces/availability.js'
import { renderSurfaceStub } from './features/surfaces/stub-view.js'

const page = location.pathname.split('/').pop() || 'index.html'
const surface = surfaceForPath(location.pathname)

async function startAvailableSurface(): Promise<void> {
  switch (page) {
    case 'home.html':
      await import('./home-demo.js')
      break
    case 'parent.html':
      await import('./parent.js')
      break
    case 'path.html':
      await import('./path.js')
      break
    case 'games.html':
      await import('./games.js')
      break
    case 'student.html':
      await import('./student.js')
      break
    case 'olympiad-enter.html':
      await import('./olympiad-enter.js')
      break
  }
}

async function showUnavailableSurface(): Promise<void> {
  if (surface !== 'home' && surface !== 'olympiad') return
  document.title = surface === 'home'
    ? 'Домашні місії готуються — Розумко'
    : 'Олімпіадний режим готується — Розумко'
  document.body.className = 'surface-stub-page'
  document.body.innerHTML = `
    <a href="#main-content" class="skip-link">Перейти до основного вмісту</a>
    <div id="site-header"></div>
    <main id="main-content" class="surface-stub-shell" tabindex="-1"></main>
    <div id="site-footer"></div>`
  renderSurfaceStub(document.getElementById('main-content')!, surface)
  renderSiteLayout()
}

if (surface && isSurfaceAvailable(surface)) {
  void startAvailableSurface()
} else {
  void showUnavailableSurface()
}
