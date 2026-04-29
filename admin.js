import { loginAdmin, logoutAdmin, onAdminAuthChanged } from './features/auth/admin-auth.js';
import { loadAdminStats } from './services/stats.js';
import { createEvent, getAllEvents, setEventStatus } from './services/events.js';
import { getAllTeachers, getAllResults } from './services/admin-data.js';
import { getQuestions, createQuestion, updateQuestion, deleteQuestion, duplicateQuestion, importFromJsFiles } from './services/questions.js';
import { createFocusTrap }  from './utils/focus-trap.js';
import { renderQuestion }   from './utils/question-renderer.js';

const appModal    = document.getElementById('app-modal');
let _appTrapRemove = null;
document.getElementById('modal-ok-btn').addEventListener('click', () => {
  _appTrapRemove?.(); _appTrapRemove = null;
  appModal.classList.add('hidden');
});

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
          <p class="text-white font-semibold">${esc(t.email)}</p>
          <p class="text-slate-400 text-sm">${esc(t.school || 'Школу не вказано')}</p>
        </div>
        <div class="text-right">
          <p class="text-slate-400 text-xs">${(t.classes || []).length} класів</p>
          <p class="text-slate-500 text-xs mt-0.5">${esc(t.createdAt?.toDate?.().toLocaleDateString('uk-UA') ?? '')}</p>
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
    const [results, events] = await Promise.all([getAllResults(), getAllEvents()]);
    const eventNames = Object.fromEntries(events.map(e => [e.id, e.title]));
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
      const eventLabel = eventNames[r.eventId] ?? r.eventId;
      el.innerHTML = `
        <div>
          <p class="text-white font-bold">${esc(r.studentCode)}</p>
          <p class="text-slate-400 text-sm">${esc(r.grade)} клас · ${esc(eventLabel)}</p>
          <p class="text-slate-500 text-xs mt-0.5">${esc(date)}</p>
        </div>
        <div class="text-right">
          <p class="text-2xl font-bold text-sky-400">${esc(r.score)}<span class="text-base text-slate-400">/${esc(r.totalQuestions)}</span></p>
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
  const TYPE = { choice: 'Вибір', sort: 'Порядок', algorithm: 'Алгоритм', sequence: 'Послідовність', match: 'Пари', truefalse: 'Так/Ні', input: 'Введення' };
  const DIFF = { easy: { label: 'Легке', cls: 'bg-emerald-800 text-emerald-200' }, medium: { label: 'Середнє', cls: 'bg-amber-800 text-amber-200' }, hard: { label: 'Складне', cls: 'bg-rose-900 text-rose-200' } };
  const d = DIFF[q.difficulty] ?? DIFF.medium;
  const el = document.createElement('div');
  el.className = 'bg-slate-800 border border-slate-700 rounded-2xl p-4';
  el.innerHTML = `
    <div class="flex items-start justify-between gap-3">
      <div class="flex-1 min-w-0">
        <div class="flex flex-wrap gap-2 mb-2">
          <span class="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">${q.grade} клас</span>
          <span class="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-900 text-indigo-200">${esc(TYPE[q.type ?? 'choice'] ?? q.type)}</span>
          <span class="text-xs font-bold px-2 py-0.5 rounded-full ${d.cls}">${d.label}</span>
          ${q.isOlympiad ? '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-sky-800 text-sky-200">Олімпіада</span>' : '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">Тренування</span>'}
        </div>
        <p class="text-white text-sm font-semibold leading-snug mb-1">${esc(q.q)}</p>
        ${q.code ? '<p class="text-emerald-400 text-xs font-mono truncate mb-1">' + esc(q.code.split('\n')[0]) + '…</p>' : ''}
        <p class="text-slate-400 text-xs">✓ ${esc(q.a?.[q.correct] ?? '—')}</p>
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

let _qModalTrapRemove = null;
function closeQuestionModal() {
  _qModalTrapRemove?.(); _qModalTrapRemove = null;
  questionModal.classList.add('hidden');
}
document.getElementById('qf-cancel').addEventListener('click', closeQuestionModal);
document.getElementById('add-question-btn').addEventListener('click', () => openQuestionModal(null));

const QF_SECTIONS = {
  choice: 'qf-section-choice', sort: 'qf-section-sort',
  sequence: 'qf-section-sequence', match: 'qf-section-match',
  truefalse: 'qf-section-truefalse', input: 'qf-section-input',
};
document.getElementById('qf-type').addEventListener('change', (e) => applyTypeUI(e.target.value));

// ── Preview питання ────────────────────────────────────────────────────────
const previewModal = document.getElementById('preview-modal');
let _pvTrapRemove = null;

function closePreview() { _pvTrapRemove?.(); _pvTrapRemove = null; previewModal.classList.add('hidden'); }
document.getElementById('preview-close').addEventListener('click', closePreview);
previewModal.addEventListener('click', (e) => { if (e.target === previewModal) closePreview(); });

document.getElementById('qf-preview').addEventListener('click', () => {
  const type = document.getElementById('qf-type').value;
  const q = _buildQuestionFromForm();
  if (!q) return;

  // Картка питання
  document.getElementById('pv-question-text').textContent = q.q || '(текст питання)';
  const pvImg = document.getElementById('pv-image');
  if (q.img) { pvImg.src = q.img; pvImg.classList.remove('hidden'); } else { pvImg.classList.add('hidden'); pvImg.src = ''; }

  // Код
  const pvCode = document.getElementById('pv-code');
  if (q.code) { pvCode.textContent = q.code; pvCode.classList.remove('hidden'); } else { pvCode.classList.add('hidden'); }

  // Варіанти — через спільний рендерер
  const pvOpts = document.getElementById('pv-options');
  pvOpts.className = type === 'choice' ? 'grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4'
    : type === 'truefalse' ? 'grid grid-cols-2 gap-3 mb-4'
    : 'flex flex-col gap-3 mb-4';
  renderQuestion(q, pvOpts, { preview: true });

  // Пояснення
  const explWrap = document.getElementById('pv-explanation-wrap');
  if (q.explanation) { document.getElementById('pv-explanation').textContent = q.explanation; explWrap.classList.remove('hidden'); }
  else { explWrap.classList.add('hidden'); }

  previewModal.classList.remove('hidden');
  _pvTrapRemove?.();
  _pvTrapRemove = createFocusTrap(previewModal, closePreview);
});

/** Збирає об'єкт питання з поточного стану форми (без валідації, для preview) */
function _buildQuestionFromForm() {
  const type = document.getElementById('qf-type').value;
  const base = {
    type,
    q:           document.getElementById('qf-q').value.trim() || '(текст питання)',
    img:         document.getElementById('qf-img').value.trim() || null,
    explanation: document.getElementById('qf-explanation').value.trim(),
    code:        document.getElementById('qf-code').value.trim() || null,
  };
  if (type === 'choice') {
    const correctEl = document.querySelector('input[name="qf-correct"]:checked');
    return { ...base, a: [...document.querySelectorAll('.qf-opt')].map(i => i.value.trim() || '…'), correct: correctEl ? Number(correctEl.value) : 0 };
  }
  if (type === 'truefalse') {
    const tfEl = document.querySelector('input[name="qf-tf-correct"]:checked');
    return { ...base, correct: tfEl ? tfEl.value === 'true' : true };
  }
  if (type === 'input') {
    const correctVal = document.getElementById('qf-input-correct').value.trim();
    const inputType  = document.getElementById('qf-input-type').value;
    return { ...base, correct: inputType === 'number' ? Number(correctVal) || 0 : correctVal, inputType };
  }
  if (type === 'sort' || type === 'algorithm') {
    const items = document.getElementById('qf-items').value.split('\n').map(s => s.trim()).filter(Boolean);
    const correctOrder = document.getElementById('qf-correct-order').value.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
    return { ...base, items: items.length ? items : ['Елемент 1', 'Елемент 2'], correctOrder: correctOrder.length ? correctOrder : [0, 1] };
  }
  if (type === 'sequence') {
    const given = document.getElementById('qf-given').value.split(',').map(s => s.trim()).filter(Boolean);
    const choices = [...document.querySelectorAll('.qf-seq-opt')].map(i => i.value.trim() || '…');
    const seqEl = document.querySelector('input[name="qf-seq-correct"]:checked');
    return { ...base, given: given.length ? given : ['?'], choices, correct: seqEl ? Number(seqEl.value) : 0 };
  }
  if (type === 'match') {
    const left  = document.getElementById('qf-left').value.split('\n').map(s => s.trim()).filter(Boolean);
    const right = document.getElementById('qf-right').value.split('\n').map(s => s.trim()).filter(Boolean);
    const pairs = document.getElementById('qf-pairs').value.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
    return { ...base, left: left.length ? left : ['Ліво'], right: right.length ? right : ['Право'], pairs: pairs.length ? pairs : [0] };
  }
  return base;
}

// img preview
document.getElementById('qf-img').addEventListener('input', (e) => {
  const prev = document.getElementById('qf-img-preview');
  const url = e.target.value.trim();
  if (url) { prev.src = url; prev.classList.remove('hidden'); }
  else { prev.classList.add('hidden'); prev.src = ''; }
});

function applyTypeUI(type) {
  Object.values(QF_SECTIONS).forEach(id => document.getElementById(id).classList.add('hidden'));
  document.getElementById(QF_SECTIONS[type] ?? 'qf-section-choice').classList.remove('hidden');
  // Код Равлика тільки для choice/sort
  document.getElementById('qf-code-wrap').classList.toggle('hidden', !['choice','sort','algorithm'].includes(type));
}

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
  document.getElementById('qf-explanation').value = q?.explanation ?? '';

  const type = q?.type ?? 'choice';
  document.getElementById('qf-type').value = type;
  applyTypeUI(type);

  // choice
  document.getElementById('qf-code').value = q?.code ?? '';
  document.querySelectorAll('.qf-opt').forEach((inp, i) => { inp.value = q?.a?.[i] ?? ''; });
  const radio = document.querySelector(`input[name="qf-correct"][value="${q?.correct ?? 0}"]`);
  if (radio) radio.checked = true;

  // sort
  document.getElementById('qf-items').value        = (q?.items ?? []).join('\n');
  document.getElementById('qf-correct-order').value= (q?.correctOrder ?? []).join(',');

  // sequence
  document.getElementById('qf-given').value = (q?.given ?? []).join(',');
  document.querySelectorAll('.qf-seq-opt').forEach((inp, i) => { inp.value = q?.choices?.[i] ?? ''; });
  const seqRadio = document.querySelector(`input[name="qf-seq-correct"][value="${q?.correct ?? 0}"]`);
  if (seqRadio) seqRadio.checked = true;

  // match
  document.getElementById('qf-left').value  = (q?.left  ?? []).join('\n');
  document.getElementById('qf-right').value = (q?.right ?? []).join('\n');
  document.getElementById('qf-pairs').value = (q?.pairs ?? []).join(',');

  // truefalse
  const tfVal = String(q?.correct ?? 'true');
  const tfRadio = document.querySelector(`input[name="qf-tf-correct"][value="${tfVal}"]`);
  if (tfRadio) tfRadio.checked = true;

  // input
  document.getElementById('qf-input-correct').value = q?.correct ?? '';
  document.getElementById('qf-input-type').value    = q?.inputType ?? 'text';

  // img
  const imgUrl = q?.img ?? '';
  document.getElementById('qf-img').value = imgUrl;
  const prev = document.getElementById('qf-img-preview');
  if (imgUrl) { prev.src = imgUrl; prev.classList.remove('hidden'); }
  else { prev.classList.add('hidden'); prev.src = ''; }

  qfError.textContent = '';
  questionModal.classList.remove('hidden');
  _qModalTrapRemove?.();
  _qModalTrapRemove = createFocusTrap(questionModal, closeQuestionModal);
}

questionForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  qfError.textContent = '';
  const id  = document.getElementById('qf-id').value;
  const q   = document.getElementById('qf-q').value.trim();
  const opts      = [...document.querySelectorAll('.qf-opt')].map(i => i.value.trim());
  const correctEl = document.querySelector('input[name="qf-correct"]:checked');
  const type = document.getElementById('qf-type').value;
  if (!q) { qfError.textContent = 'Введи текст питання.'; return; }
  const imgUrl = document.getElementById('qf-img').value.trim() || null;
  const base = {
    type,
    q,
    ...(imgUrl ? { img: imgUrl } : {}),
    explanation: document.getElementById('qf-explanation').value.trim(),
    grade:       Number(document.getElementById('qf-grade').value),
    difficulty:  document.getElementById('qf-difficulty').value,
    isOlympiad:  document.getElementById('qf-olympiad').checked,
  };

  let data;
  if (type === 'sort' || type === 'algorithm') {
    const items = document.getElementById('qf-items').value.split('\n').map(s => s.trim()).filter(Boolean);
    const correctOrder = document.getElementById('qf-correct-order').value.split(',').map(s => Number(s.trim()));
    if (items.length < 2) { qfError.textContent = 'Додай мінімум 2 елементи.'; qfSubmitBtn.disabled = false; qfSubmitBtn.textContent = 'Зберегти'; return; }
    data = { ...base, items, correctOrder };
  } else if (type === 'sequence') {
    const given = document.getElementById('qf-given').value.split(',').map(s => s.trim()).filter(Boolean);
    const choices = [...document.querySelectorAll('.qf-seq-opt')].map(i => i.value.trim());
    const seqCorrect = document.querySelector('input[name="qf-seq-correct"]:checked');
    if (given.length < 2) { qfError.textContent = 'Введи мінімум 2 елементи послідовності.'; qfSubmitBtn.disabled = false; qfSubmitBtn.textContent = 'Зберегти'; return; }
    if (choices.some(c => !c)) { qfError.textContent = 'Заповни всі 4 варіанти.'; qfSubmitBtn.disabled = false; qfSubmitBtn.textContent = 'Зберегти'; return; }
    if (!seqCorrect) { qfError.textContent = 'Вибери правильну відповідь.'; qfSubmitBtn.disabled = false; qfSubmitBtn.textContent = 'Зберегти'; return; }
    data = { ...base, given, choices, correct: Number(seqCorrect.value) };
  } else if (type === 'match') {
    const left  = document.getElementById('qf-left').value.split('\n').map(s => s.trim()).filter(Boolean);
    const right = document.getElementById('qf-right').value.split('\n').map(s => s.trim()).filter(Boolean);
    const pairs = document.getElementById('qf-pairs').value.split(',').map(s => Number(s.trim()));
    if (left.length < 2 || right.length < 2) { qfError.textContent = 'Мінімум 2 пари.'; qfSubmitBtn.disabled = false; qfSubmitBtn.textContent = 'Зберегти'; return; }
    data = { ...base, left, right, pairs };
  } else if (type === 'truefalse') {
    const tfEl = document.querySelector('input[name="qf-tf-correct"]:checked');
    if (!tfEl) { qfError.textContent = 'Вибери правильну відповідь.'; qfSubmitBtn.disabled = false; qfSubmitBtn.textContent = 'Зберегти'; return; }
    data = { ...base, correct: tfEl.value === 'true' };
  } else if (type === 'input') {
    const correctVal = document.getElementById('qf-input-correct').value.trim();
    const inputType  = document.getElementById('qf-input-type').value;
    if (!correctVal) { qfError.textContent = 'Введи правильну відповідь.'; qfSubmitBtn.disabled = false; qfSubmitBtn.textContent = 'Зберегти'; return; }
    data = { ...base, correct: inputType === 'number' ? Number(correctVal) : correctVal, inputType };
  } else {
    // choice (default)
    if (opts.some(o => !o)) { qfError.textContent = 'Заповни всі 4 варіанти.'; qfSubmitBtn.disabled = false; qfSubmitBtn.textContent = 'Зберегти'; return; }
    if (!correctEl) { qfError.textContent = 'Вибери правильну відповідь.'; qfSubmitBtn.disabled = false; qfSubmitBtn.textContent = 'Зберегти'; return; }
    const code = document.getElementById('qf-code').value.trim() || null;
    data = { ...base, ...(code ? { code } : {}), a: opts, correct: Number(correctEl.value) };
  }

  qfSubmitBtn.disabled = true;
  qfSubmitBtn.textContent = 'Збереження…';
  try {
    if (id) await updateQuestion(id, data);
    else    await createQuestion(data);
    closeQuestionModal();
    await loadQuestionsTab();
  } catch (err) {
    qfError.textContent = err.message;
  } finally {
    qfSubmitBtn.disabled = false;
    qfSubmitBtn.textContent = 'Зберегти';
  }
});

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showModal(msg) {
  document.getElementById('modal-message').textContent = msg;
  appModal.classList.remove('hidden');
  _appTrapRemove?.();
  _appTrapRemove = createFocusTrap(appModal, () => {
    _appTrapRemove?.(); _appTrapRemove = null;
    appModal.classList.add('hidden');
  });
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
