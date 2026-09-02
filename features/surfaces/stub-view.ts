import type { ProductSurface } from './availability.js'

const COPY: Record<Exclude<ProductSurface, 'school'>, {
  eyebrow: string
  title: string
  description: string
  note: string
}> = {
  home: {
    eyebrow: 'Домашній режим · незабаром',
    title: 'Домашні місії ще готуються',
    description: 'Готуємо короткі домашні місії на увагу, логіку, алгоритми та безпечні основи ШІ.',
    note: 'Коли домашній шлях буде готовий до сімейного тестування, ми відкриємо його на цій самій сторінці.',
  },
  olympiad: {
    eyebrow: 'Олімпіадний режим · незабаром',
    title: 'Наступний сезон ще готується',
    description: 'Олімпіадні завдання та участь за кодом тимчасово недоступні.',
    note: 'Дату нового сезону оголосимо на цій самій сторінці.',
  },
}

export function renderSurfaceStub(
  container: HTMLElement,
  surface: Exclude<ProductSurface, 'school'>,
  compact = false,
): void {
  const copy = COPY[surface]
  container.innerHTML = `
    <section class="surface-stub${compact ? ' surface-stub--compact' : ''}" aria-labelledby="surface-stub-title">
      <span class="surface-stub__badge">${copy.eyebrow}</span>
      <div class="surface-stub__icon" aria-hidden="true">${surface === 'home' ? '🏠' : '🏆'}</div>
      <h1 id="surface-stub-title" class="surface-stub__title">${copy.title}</h1>
      <p class="surface-stub__description">${copy.description}</p>
      <p class="surface-stub__note">${copy.note}</p>
      <div class="surface-stub__actions">
        <a class="kid-action" href="school.html">Я в класі</a>
        <a class="btn-ghost" href="teacher.html">Створити гру для класу</a>
      </div>
    </section>`
}
