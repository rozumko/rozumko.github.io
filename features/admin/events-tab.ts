// Events tab — placeholder (events table not yet in DB)

export function initEventsTab(_deps) {
  document.getElementById('create-event-btn')?.addEventListener('click', () => {
    document.getElementById('event-form-section').classList.remove('hidden')
  })
  document.getElementById('cancel-event-btn')?.addEventListener('click', () => {
    document.getElementById('event-form-section').classList.add('hidden')
  })
}

export function loadEvents() {
  const list = document.getElementById('events-list')
  if (!list) return
  list.innerHTML = `
    <div class="admin-empty-state">
      <div>
        <i class="fas fa-calendar-times admin-empty-state__icon"></i>
        <p class="admin-empty-state__title">Олімпіади — в розробці</p>
        <p class="admin-empty-state__sub">Функціонал подій буде додано в наступній версії.</p>
      </div>
    </div>`
}
