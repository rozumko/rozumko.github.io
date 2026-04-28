import { loginAdmin, logoutAdmin, onAdminAuthChanged } from './features/auth/admin-auth.js';
import { loadAdminStats } from './services/stats.js';
import { createEvent, getAllEvents, setEventStatus } from './services/events.js';
import { getAllTeachers } from './services/admin-data.js';

const authSection = document.getElementById('auth-section');
const adminPanel = document.getElementById('admin-panel');
const loginForm = document.getElementById('admin-login-form');
const loginError = document.getElementById('admin-login-error');
const loginBtn = document.getElementById('admin-login-btn');
const logoutBtn = document.getElementById('admin-logout-btn');
const emailDisplay = document.getElementById('admin-email-display');

// --- Стан сесії ---

onAdminAuthChanged((user) => {
  if (user) showDashboard(user.email);
  else showAuth();
});

async function refreshStats() {
  try {
    const { teachers, students, results, events } = await loadAdminStats();
    document.getElementById('stat-teachers').textContent = teachers;
    document.getElementById('stat-students').textContent = students;
    document.getElementById('stat-results').textContent = results;
    document.getElementById('stat-events').textContent = events;
  } catch {
    // Firestore може бути недоступний до повної ініціалізації — тихо ігноруємо
  }
}

// --- Вхід ---

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('admin-email').value.trim();
  const password = document.getElementById('admin-password').value;

  loginError.textContent = '';
  loginBtn.disabled = true;
  loginBtn.textContent = 'Вхід…';

  try {
    await loginAdmin(email, password);
  } catch (err) {
    loginError.textContent = friendlyError(err.message);
    loginBtn.disabled = false;
    loginBtn.textContent = 'Увійти';
  }
});

// --- Вихід ---

logoutBtn.addEventListener('click', async () => {
  await logoutAdmin();
});

// --- Вкладки ---

document.querySelectorAll('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('tab-active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    tab.classList.add('tab-active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');
    if (tab.dataset.tab === 'teachers') loadTeachers();
  });
});

// --- Форма олімпіадної події ---

const createEventBtn   = document.getElementById('create-event-btn');
const cancelEventBtn   = document.getElementById('cancel-event-btn');
const eventFormSection = document.getElementById('event-form-section');
const eventForm        = document.getElementById('event-form');
const eventFormError   = document.getElementById('event-form-error');
const eventSubmitBtn   = document.getElementById('event-submit-btn');
const eventsList       = document.getElementById('events-list');

createEventBtn.addEventListener('click', () => {
  eventFormSection.classList.remove('hidden');
  createEventBtn.classList.add('hidden');
  document.getElementById('event-title').focus();
});

cancelEventBtn.addEventListener('click', () => {
  eventFormSection.classList.add('hidden');
  createEventBtn.classList.remove('hidden');
  eventForm.reset();
  eventFormError.textContent = '';
});

eventForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title    = document.getElementById('event-title').value.trim();
  const from     = document.getElementById('event-from').value;
  const to       = document.getElementById('event-to').value;
  const subject  = document.getElementById('event-subject').value;
  const count    = document.getElementById('event-questions').value;
  const time     = document.getElementById('event-time').value;
  const retry    = document.getElementById('event-allow-retry').checked;

  if (!title)       { eventFormError.textContent = 'Введи назву.'; return; }
  if (!from || !to) { eventFormError.textContent = 'Вкажи дати початку і кінця.'; return; }
  if (new Date(from) >= new Date(to)) { eventFormError.textContent = 'Дата початку має бути раніше кінця.'; return; }

  eventFormError.textContent = '';
  eventSubmitBtn.disabled = true;
  eventSubmitBtn.textContent = 'Збереження…';

  try {
    await createEvent({ title, subject, activeFrom: from, activeTo: to, questionsCount: count, timeMinutes: time, allowRetry: retry });
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

async function loadEvents() {
  const events = await getAllEvents();
  if (events.length === 0) {
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

function buildEventCard(ev) {
  const tpl = document.getElementById('event-card-template');
  const el  = tpl.content.cloneNode(true).querySelector('div');

  el.querySelector('.event-title').textContent     = ev.title;
  el.querySelector('.event-from').textContent      = formatDate(ev.activeFrom);
  el.querySelector('.event-to').textContent        = formatDate(ev.activeTo);
  el.querySelector('.event-questions').textContent = ev.questionsCount;
  el.querySelector('.event-time').textContent      = ev.timeMinutes;
  el.querySelector('.event-retry').textContent     = ev.allowRetry ? '↩ Повторний запуск дозволено' : '🔒 Один запуск';

  const badge     = el.querySelector('.event-status-badge');
  const btnActivate = el.querySelector('.btn-activate');
  const btnArchive  = el.querySelector('.btn-archive');
  const btnDraft    = el.querySelector('.btn-draft');

  const STATUS = {
    draft:    { label: 'Чернетка', cls: 'bg-slate-600 text-slate-200' },
    active:   { label: 'Активна',  cls: 'bg-emerald-500 text-white'   },
    archived: { label: 'Архів',    cls: 'bg-slate-700 text-slate-400' },
  };
  const s = STATUS[ev.status] ?? STATUS.draft;
  badge.textContent  = s.label;
  badge.className    = `event-status-badge text-xs font-bold px-2 py-0.5 rounded-full ${s.cls}`;

  // Показуємо кнопки залежно від поточного статусу
  if (ev.status === 'draft')    { btnActivate.classList.remove('hidden'); }
  if (ev.status === 'active')   { btnArchive.classList.remove('hidden'); }
  if (ev.status === 'archived') { btnDraft.classList.remove('hidden'); }

  const changeStatus = async (btn, status) => {
    btn.disabled = true;
    try {
      await setEventStatus(ev.id, status);
      await loadEvents();
      await refreshStats();
    } catch (err) {
      alert(err.message);
      btn.disabled = false;
    }
  };

  btnActivate.addEventListener('click', () => changeStatus(btnActivate, 'active'));
  btnArchive.addEventListener('click',  () => changeStatus(btnArchive,  'archived'));
  btnDraft.addEventListener('click',    () => changeStatus(btnDraft,    'draft'));

  return el;
}

function formatDate(val) {
  if (!val) return '—';
  const d = val?.toDate ? val.toDate() : new Date(val);
  return d.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// --- Утиліти ---

function showDashboard(email) {
  authSection.classList.add('hidden');
  adminPanel.classList.remove('hidden');
  emailDisplay.textContent = email;
  refreshStats();
  loadEvents();
  loadTeachers();
}

async function loadTeachers() {
  const list = document.getElementById('teachers-list');
  try {
    const teachers = await getAllTeachers();
    if (!teachers.length) {
      list.innerHTML = `
        <div class="bg-slate-800 border border-slate-700 rounded-2xl p-10 text-center text-slate-500">
          <i class="fas fa-users text-4xl mb-3 block"></i>
          <p class="font-semibold">Вчителів ще немає</p>
        </div>`;
      return;
    }
    list.innerHTML = '';
    teachers.forEach(t => {
      const el = document.createElement('div');
      el.className = 'bg-slate-800 border border-slate-700 rounded-2xl p-5 flex items-center justify-between gap-4';
      el.innerHTML = `
        <div>
          <p class="text-white font-semibold">${t.email}</p>
          <p class="text-slate-400 text-sm">${t.school || 'Школу не вказано'}</p>
        </div>
        <div class="text-right">
          <p class="text-slate-400 text-xs">${(t.classes || []).length} класів</p>
          <p class="text-slate-500 text-xs mt-0.5">${t.createdAt?.toDate?.().toLocaleDateString('uk-UA') ?? ''}</p>
        </div>`;
      list.appendChild(el);
    });
  } catch (err) {
    list.innerHTML = `<p class="text-rose-400 text-sm p-4">${err.message}</p>`;
  }
}

function showAuth() {
  adminPanel.classList.add('hidden');
  authSection.classList.remove('hidden');
  loginBtn.disabled = false;
  loginBtn.textContent = 'Увійти';
}

function friendlyError(msg) {
  if (msg.includes('invalid-credential') || msg.includes('wrong-password')) return 'Невірний email або пароль.';
  if (msg.includes('too-many-requests')) return 'Забагато спроб. Спробуй пізніше.';
  if (msg.includes('недостатньо прав')) return msg;
  return 'Помилка входу. Перевір дані.';
}
