export type ProductSurface = 'school' | 'home' | 'olympiad'

export type SurfaceStatus = 'active' | 'coming-soon'

export const SURFACE_STATUS: Readonly<Record<ProductSurface, SurfaceStatus>> = {
  school: 'active',
  home: 'coming-soon',
  olympiad: 'coming-soon',
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export function isSurfaceAvailable(
  surface: ProductSurface,
  hostname = typeof location === 'undefined' ? '' : location.hostname,
): boolean {
  // Keep dormant surfaces testable during local development without exposing
  // a client-side production bypass.
  return SURFACE_STATUS[surface] === 'active' || LOOPBACK_HOSTS.has(hostname)
}

export function surfaceForPath(pathname: string): ProductSurface | null {
  const page = pathname.split('/').pop() || 'index.html'
  if (['home.html', 'parent.html', 'path.html', 'games.html'].includes(page)) return 'home'
  if (['student.html', 'olympiad-enter.html'].includes(page)) return 'olympiad'
  if (page === 'school.html') return 'school'
  return null
}
