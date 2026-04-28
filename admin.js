import { loginAdmin, logoutAdmin, onAdminAuthChanged } from './features/auth/admin-auth.js';
import { loadAdminStats } from './services/stats.js';
import { createEvent, getAllEvents, setEventStatus } from './services/events.js';
import { getAllTeachers, getAllResults } from './services/admin-data.js';
import { getQuestions, createQuestion, updateQuestion, deleteQuestion, duplicateQuestion, importFromJsFiles } from './services/questions.js';

const appModal    = document.getElementById('app-modal');
document.getElementById('modal-ok-btn').addEventListener('click', () => appModal.classList.add('hidden'));

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
    if (tab.dataset.tab === 'results') loadResults();
    if (tab.dataset.tab === 'questions') loadQuestionsTab();
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
      showModal(err.message);
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
  loadResults();
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

async function loadResults() {
  const list = document.getElementById('results-list');
  try {
    const results = await getAllResults();
    if (!results.length) {
      list.innerHTML = `
        <div class="bg-slate-800 border border-slate-700 rounded-2xl p-10 text-center text-slate-500">
          <i class="fas fa-poll text-4xl mb-3 block"></i>
          <p class="font-semibold">Результатів ще немає</p>
          <p class="text-sm mt-1">Тут з'являться результати після проведення олімпіади.</p>
        </div>`;
      return;
    }
    list.innerHTML = '';
    const exportBtn = document.getElementById('export-results-btn');
    exportBtn.disabled = false;
    exportBtn.onclick = () => exportResultsCSV(results);

    results.forEach(r => {
      const el = document.createElement('div');
      el.className = 'bg-slate-800 border border-slate-700 rounded-2xl p-4 flex items-center justify-between gap-4';
      const date = r.completedAt?.toDate?.().toLocaleString('uk-UA', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) ?? '';
      el.innerHTML = `
        <div>
          <p class="text-white font-bold">${r.studentCode}</p>
          <p class="text-slate-400 text-sm">${r.grade} клас · ${r.eventId}</p>
          <p class="text-slate-500 text-xs mt-0.5">${date}</p>
        </div>
        <div class="text-right">
          <p class="text-2xl font-bold text-sky-400">${r.score}<span class="text-base text-slate-400">/${r.totalQuestions}</span></p>
          <p class="text-xs text-slate-500">${r.timeSpentSeconds ? Math.round(r.timeSpentSeconds / 60) + ' хв' : ''}</p>
        </div>`;
      list.appendChild(el);
    });
  } catch (err) {
    list.innerHTML = `<p class="text-rose-400 text-sm p-4">${err.message}</p>`;
  }
}

function exportResultsCSV(results) {
  const rows = [['Код', 'Клас', 'Подія', 'Бали', 'Всього', 'Час (хв)', 'Дата']];
  results.forEach(r => {
    const date = r.completedAt?.toDate?.().toLocaleString('uk-UA') ?? '';
    const mins = r.timeSpentSeconds ? Math.round(r.timeSpentSeconds / 60) : '';
    rows.push([r.studentCode, r.grade, r.eventId, r.score, r.totalQuestions, mins, date]);
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'results.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ─── Питання ────────────────────────────────────────────────────────────────

let currentQuestions = [];

async function loadQuestionsTab(filters = {}) {
  const list = document.getElementById('questions-list');
  list.innerHTML = `<p class="text-slate-400 text-sm p-4">Завантаження…</p>`;
  try {
    const grade      = filters.grade      ?? (document.getElementById('q-filter-grade').value      || undefined);
    const isOlympiad = filters.isOlympiad ?? (document.getElementById('q-filter-type').value !== '' ? document.getElementById('q-filter-type').value === 'true' : undefined);
    const difficulty = filters.difficulty ?? (document.getElementById('q-filter-difficulty').value || undefined);
    currentQuestions = await getQuestions({ grade: grade ? Number(grade) : undefined, isOlympiad, difficulty });
    document.getElementById('q-count').textContent = `${currentQuestions.length} питань`;
    if (!currentQuestions.length) {
      list.innerHTML = `<div class="bg-slate-800 border border-slate-700 rounded-2xl p-10 text-center text-slate-500"><i class="fas fa-question-circle text-4xl mb-3 block"></i><p class="font-semibold">Питань не знайдено</p></div>`;
      return;
    }
    list.innerHTML = '';
    currentQuestions.forEach(q => list.appendChild(buildQuestionCard(q)));
  } catch (err) {
    list.innerHTML = `<p class="text-rose-400 text-sm p-4">${err.message}</p>`;
  }
}

function buildQuestionCard(q) {
  const DIFF = { easy: { label: 'Легке', cls: 'bg-emerald-800 text-emerald-200' }, medium: { label: 'Середнє', cls: 'bg-amber-800 text-amber-200' }, hard: { label: 'Складне', cls: 'bg-rose-900 text-rose-200' } };
  const d = DIFF[q.difficulty] ?? DIFF.medium;
  const el = document.createElement('div');
  el.className = 'bg-slate-800 border border-slate-700 rounded-2xl p-4';
  el.innerHTML = `
    <div class="flex items-start justify-between gap-3">
      <div class="flex-1 min-w-0">
        <div class="flex flex-wrap gap-2 mb-2">
          <span class="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">${q.grade} клас</span>
          <span class="text-xs font-bold px-2 py-0.5 rounded-full ${d.cls}">${d.label}</span>
          ${q.isOlympiad ? '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-sky-800 text-sky-200">Олімпіада</span>' : '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">Тренування</span>'}
        </div>
        <p class="text-white text-sm font-semibold leading-snug mb-1">${q.q}</p>
        ${q.code ? '<p class="text-emerald-400 text-xs font-mono truncate mb-1">' + q.code.split('\n')[0] + '…</p>' : ''}
        <p class="text-slate-400 text-xs">✓ ${q.a?.[q.correct] ?? '—'}</p>
      </div>
      <div class="flex gap-1 flex-shrink-0">
        <button class="btn-q-edit btn text-xs py-1.5 px-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200" title="Редагувати"><i class="fas fa-pen"></i></button>
        <button class="btn-q-dup btn text-xs py-1.5 px-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200" title="Дублювати"><i class="fas fa-copy"></i></button>
        <button class="btn-q-del btn text-xs py-1.5 px-3 rounded-lg bg-rose-900 hover:bg-rose-800 text-rose-200" title="Видалити"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
  el.querySelector('.btn-q-edit').addEventListener('click', () => openQuestionModal(q));
  el.querySelector('.btn-q-dup').addEventListener('click', async () => {
    try { await duplicateQuestion(q); await loadQuestionsTab(); } catch (err) { showModal(err.message); }
  });
  el.querySelector('.btn-q-del').addEventListener('click', async () => {
    if (!confirm('Видалити питання?')) return;
    try { await deleteQuestion(q.id); await loadQuestionsTab(); } catch (err) { showModal(err.message); }
  });
  return el;
}

// ─── Модаль редагування питання ─────────────────────────────────────────────

const questionModal = document.getElementById('question-modal');
const questionForm  = document.getElementById('question-form');
const qfError       = document.getElementById('qf-error');
const qfSubmitBtn   = document.getElementById('qf-submit');

document.getElementById('qf-cancel').addEventListener('click', () => questionModal.classList.add('hidden'));
document.getElementById('add-question-btn').addEventListener('click', () => openQuestionModal(null));

document.getElementById('q-filter-apply').addEventListener('click', () => loadQuestionsTab());

document.getElementById('import-questions-btn').addEventListener('click', async () => {
  const btn = document.getElementById('import-questions-btn');
  btn.disabled = true;
  btn.textContent = 'Імпорт…';
  try {
    const total = await importFromJsFiles((n) => { btn.textContent = `Імпорт… ${n}`; });
    showModal(`Імпортовано ${total} питань.`);
    await loadQuestionsTab();
  } catch (err) {
    showModal(err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-file-import mr-2"></i>Імпорт з JS';
  }
});

function openQuestionModal(q) {
  document.getElementById('question-modal-title').textContent = q ? 'Редагувати питання' : 'Нове питання';
  document.getElementById('qf-id').value          = q?.id ?? '';
  document.getElementById('qf-grade').value       = q?.grade ?? '1';
  document.getElementById('qf-difficulty').value  = q?.difficulty ?? 'medium';
  document.getElementById('qf-olympiad').checked  = q?.isOlympiad ?? false;
  document.getElementById('qf-q').value           = q?.q ?? '';
  document.getElementById('qf-code').value        = q?.code ?? '';
  document.getElementById('qf-explanation').value = q?.explanation ?? '';
  document.querySelectorAll('.qf-opt').forEach((inp, i) => { inp.value = q?.a?.[i] ?? ''; });
  const radio = document.querySelector(`input[name="qf-correct"][value="${q?.correct ?? 0}"]`);
  if (radio) radio.checked = true;
  qfError.textContent = '';
  questionModal.classList.remove('hidden');
}

questionForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  qfError.textContent = '';
  const id         = document.getElementById('qf-id').value;
  const q          = document.getElementById('qf-q').value.trim();
  const opts       = [...document.querySelectorAll('.qf-opt')].map(i => i.value.trim());
  const correctEl  = document.querySelector('input[name="qf-correct"]:checked');
  if (!q)                          { qfError.textContent = 'Введи текст питання.'; return; }
  if (opts.some(o => !o))          { qfError.textContent = 'Заповни всі 4 варіанти.'; return; }
  if (!correctEl)                  { qfError.textContent = 'Вибери правильну відповідь.'; return; }

  const data = {
    q,
    code:        document.getElementById('qf-code').value.trim() || null,
    a:           opts,
    correct:     Number(correctEl.value),
    explanation: document.getElementById('qf-explanation').value.trim(),
    grade:       Number(document.getElementById('qf-grade').value),
    difficulty:  document.getElementById('qf-difficulty').value,
    isOlympiad:  document.getElementById('qf-olympiad').checked,
  };

  qfSubmitBtn.disabled = true;
  qfSubmitBtn.textContent = 'Збереження…';
  try {
    if (id) await updateQuestion(id, data);
    else    await createQuestion(data);
    questionModal.classList.add('hidden');
    await loadQuestionsTab();
  } catch (err) {
    qfError.textContent = err.message;
  } finally {
    qfSubmitBtn.disabled = false;
    qfSubmitBtn.textContent = 'Зберегти';
  }
});

function showModal(msg) {
  document.getElementById('modal-message').textContent = msg;
  document.getElementById('app-modal').classList.remove('hidden');
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
