/**
 * features/admin/events-tab.js
 * ─────────────────────────────────────────────────────────────
 * Вкладка «Олімпіади»: список подій, форма створення, зміна статусу.
 * ─────────────────────────────────────────────────────────────
 */

import { createEvent, getAllEvents, setEventStatus } from '../../services/events.js';
import { formatDate, showModal } from './ui.js';

// DOM-елементи форми та списку
const createEventBtn   = document.getElementById('create-event-btn');
const cancelEventBtn   = document.getElementById('cancel-event-btn');
const eventFormSection = document.getElementById('event-form-section');
const eventForm        = document.getElementById('event-form');
const eventFormError   = document.getElementById('event-form-error');
const eventSubmitBtn   = document.getElementById('event-submit-btn');
const eventsList       = document.getElementById('events-list');

/**
 * Ініціалізація вкладки подій.
 * Підвішує всі обробники і виконує початкове завантаження списку.
 *
 * @param {{ refreshStats: () => Promise<void> }} deps
 *   refreshStats — оновлює лічильники на дашборді після змін
 */
export function initEventsTab({ refreshStats }) {

  // Показати форму створення нової олімпіади
  createEventBtn.addEventListener('click', () => {
    eventFormSection.classList.remove('hidden');
    createEventBtn.classList.add('hidden');
    document.getElementById('event-title').focus();
  });

  // Сховати форму без збереження
  cancelEventBtn.addEventListener('click', () => {
    eventFormSection.classList.add('hidden');
    createEventBtn.classList.remove('hidden');
    eventForm.reset();
    eventFormError.textContent = '';
  });

  // Збереження нової олімпіади
  eventForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title   = document.getElementById('event-title').value.trim();
    const from    = document.getElementById('event-from').value;
    const to      = document.getElementById('event-to').value;
    const subject = document.getElementById('event-subject').value;
    const count   = document.getElementById('event-questions').value;
    const time    = document.getElementById('event-time').value;
    const retry   = document.getElementById('event-allow-retry').checked;

    // Базова валідація перед відправкою
    if (!title)       { eventFormError.textContent = 'Введи назву.'; return; }
    if (!from || !to) { eventFormError.textContent = 'Вкажи дати початку і кінця.'; return; }
    if (new Date(from) >= new Date(to)) {
      eventFormError.textContent = 'Дата початку має бути раніше кінця.';
      return;
    }

    eventFormError.textContent = '';
    eventSubmitBtn.disabled = true;
    eventSubmitBtn.textContent = 'Збереження…';

    try {
      await createEvent({ title, subject, activeFrom: from, activeTo: to, questionsCount: count, timeMinutes: time, allowRetry: retry });
      // Ховаємо форму і оновлюємо список та статистику
      eventFormSection.classList.add('hidden');
      createEventBtn.classList.remove('hidden');
      eventForm.reset();
      await loadEvents();
      await refreshStats();
    } catch (err) {
      eventFormError.textContent = err.message;
    } finally {
      eventSubmitBtn.disabled = false;
      eventSubmitBtn.textContent = 'Зберегти';
    }
  });

  // Початкове завантаження списку подій при відкритті дашборду
  loadEvents();
}

/**
 * Завантажити і відрендерити список усіх олімпіадних подій.
 * Викликається при ініціалізації та після будь-яких змін.
 */
export async function loadEvents() {
  const events = await getAllEvents();

  if (events.length === 0) {
    // Порожній стан — підказка адміну
    eventsList.innerHTML = `
      <div class="bg-slate-800 border border-slate-700 rounded-2xl p-6 flex items-center justify-center py-16 text-slate-500">
        <div class="text-center">
          <i class="fas fa-calendar-times text-4xl mb-3 block"></i>
          <p class="font-semibold">Олімпіадних подій ще немає</p>
          <p class="text-sm mt-1">Натисни «Нова олімпіада», щоб створити першу.</p>
        </div>
      </div>`;
    return;
  }

  eventsList.innerHTML = '';
  events.forEach(ev => eventsList.appendChild(buildEventCard(ev)));
}

/**
 * Побудувати картку однієї олімпіадної події на основі HTML-шаблону.
 * Підвішує обробники кнопок зміни статусу (draft → active → archived).
 *
 * @param {object} ev — об'єкт події з Firestore
 * @returns {HTMLElement}
 */
function buildEventCard(ev) {
  // Клонуємо <template> з admin.html — не дублюємо верстку в JS
  const tpl = document.getElementById('event-card-template');
  const el  = tpl.content.cloneNode(true).querySelector('div');

  // Заповнюємо поля картки
  el.querySelector('.event-title').textContent     = ev.title;
  el.querySelector('.event-from').textContent      = formatDate(ev.activeFrom);
  el.querySelector('.event-to').textContent        = formatDate(ev.activeTo);
  el.querySelector('.event-questions').textContent = ev.questionsCount;
  el.querySelector('.event-time').textContent      = ev.timeMinutes;
  el.querySelector('.event-retry').textContent     = ev.allowRetry ? '↩ Повторний запуск дозволено' : '🔒 Один запуск';

  // Бейдж статусу — колір та текст залежать від поточного статусу
  const STATUS = {
    draft:    { label: 'Чернетка', cls: 'bg-slate-600 text-slate-200' },
    active:   { label: 'Активна',  cls: 'bg-emerald-500 text-white'   },
    archived: { label: 'Архів',    cls: 'bg-slate-700 text-slate-400' },
  };
  const badge = el.querySelector('.event-status-badge');
  const s = STATUS[ev.status] ?? STATUS.draft;
  badge.textContent = s.label;
  badge.className   = `event-status-badge text-xs font-bold px-2 py-0.5 rounded-full ${s.cls}`;

  // Показуємо тільки релевантні кнопки для поточного статусу
  const btnActivate = el.querySelector('.btn-activate');
  const btnArchive  = el.querySelector('.btn-archive');
  const btnDraft    = el.querySelector('.btn-draft');

  if (ev.status === 'draft')    btnActivate.classList.remove('hidden');
  if (ev.status === 'active')   btnArchive.classList.remove('hidden');
  if (ev.status === 'archived') btnDraft.classList.remove('hidden');

  // Спільний хендлер зміни статусу — блокує кнопку щоб уникнути подвійного кліку
  const changeStatus = async (btn, status) => {
    btn.disabled = true;
    try {
      await setEventStatus(ev.id, status);
      await loadEvents();
    } catch (err) {
      showModal(err.message);
      btn.disabled = false;
    }
  };

  btnActivate.addEventListener('click', () => changeStatus(btnActivate, 'active'));
  btnArchive.addEventListener('click',  () => changeStatus(btnArchive,  'archived'));
  btnDraft.addEventListener('click',    () => changeStatus(btnDraft,    'draft'));

  return el;
}
