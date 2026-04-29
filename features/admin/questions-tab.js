/**
 * features/admin/questions-tab.js
 * ─────────────────────────────────────────────────────────────
 * Вкладка «Питання»: перегляд, фільтрація, CRUD, preview.
 *
 * Структура:
 *   initQuestionsTab()     — підвішує обробники, ініціалізує стан
 *   loadQuestionsTab()     — завантажує і рендерить список питань
 *   buildQuestionCard()    — будує картку одного питання
 *   openQuestionModal()    — відкриває форму (створення або редагування)
 *   closeQuestionModal()   — закриває форму (+ знімає focus trap)
 *   _buildQuestionFromForm() — читає форму → об'єкт питання (для preview)
 *   applyTypeUI()          — показує/ховає секцію форми під тип питання
 * ─────────────────────────────────────────────────────────────
 */

import { getQuestions, createQuestion, updateQuestion, deleteQuestion, duplicateQuestion, importFromJsFiles } from '../../services/questions.js';
import { createFocusTrap } from '../../utils/focus-trap.js';
import { renderQuestion }  from '../../utils/question-renderer.js';
import { esc, showModal }  from './ui.js';

// ─── Стан вкладки ─────────────────────────────────────────────────────────────

/** Поточний список завантажених питань (для доступу з обробників подій) */
let currentQuestions = [];

// ─── DOM: модаль форми питання ────────────────────────────────────────────────

const questionModal = document.getElementById('question-modal');
const questionForm  = document.getElementById('question-form');
const qfError       = document.getElementById('qf-error');
const qfSubmitBtn   = document.getElementById('qf-submit');

/** Функція для зняття focus trap модалі форми питання */
let _qModalTrapRemove = null;

// ─── DOM: модаль preview ──────────────────────────────────────────────────────

const previewModal = document.getElementById('preview-modal');

/** Функція для зняття focus trap модалі preview */
let _pvTrapRemove = null;

// ─── Мапи типів і секцій форми ────────────────────────────────────────────────

/**
 * Відображення значення <select> типу питання на id секції у формі.
 * При додаванні нового типу — додати рядок тут і секцію в admin.html.
 */
const QF_SECTIONS = {
  choice:    'qf-section-choice',
  sort:      'qf-section-sort',
  sequence:  'qf-section-sequence',
  match:     'qf-section-match',
  truefalse: 'qf-section-truefalse',
  input:     'qf-section-input',
};

/**
 * Людські назви типів для відображення в картках списку.
 */
const TYPE_LABELS = {
  choice:     'Вибір',
  sort:       'Порядок',
  algorithm:  'Алгоритм',   // аліас sort, залишено для зворотної сумісності
  sequence:   'Послідовність',
  match:      'Пари',
  truefalse:  'Так/Ні',
  input:      'Введення',
};

/**
 * Стилі бейджів складності.
 */
const DIFF_STYLES = {
  easy:   { label: 'Легке',    cls: 'bg-emerald-800 text-emerald-200' },
  medium: { label: 'Середнє',  cls: 'bg-amber-800 text-amber-200'    },
  hard:   { label: 'Складне',  cls: 'bg-rose-900 text-rose-200'      },
};

// ─── Ініціалізація ────────────────────────────────────────────────────────────

/**
 * Ініціалізація вкладки питань.
 * Підвішує всі статичні обробники подій.
 * Викликається один раз при завантаженні сторінки.
 */
export function initQuestionsTab() {

  // Кнопка «Додати питання» — відкриває порожню форму
  document.getElementById('add-question-btn').addEventListener('click', () => openQuestionModal(null));

  // Скасування у формі питання
  document.getElementById('qf-cancel').addEventListener('click', closeQuestionModal);

  // Закриття preview-модалі
  document.getElementById('preview-close').addEventListener('click', closePreview);
  previewModal.addEventListener('click', (e) => { if (e.target === previewModal) closePreview(); });

  // Перемикання типу питання → показуємо відповідну секцію форми
  document.getElementById('qf-type').addEventListener('change', (e) => applyTypeUI(e.target.value));

  // Фільтр питань
  document.getElementById('q-filter-apply').addEventListener('click', () => loadQuestionsTab());

  // Preview зображення при введенні URL
  document.getElementById('qf-img').addEventListener('input', (e) => {
    const prev = document.getElementById('qf-img-preview');
    const url  = e.target.value.trim();
    if (url) { prev.src = url; prev.classList.remove('hidden'); }
    else     { prev.classList.add('hidden'); prev.src = ''; }
  });

  // Імпорт питань з JS-файлів (fallback банк)
  document.getElementById('import-questions-btn').addEventListener('click', async () => {
    const btn = document.getElementById('import-questions-btn');
    btn.disabled = true;
    btn.textContent = 'Імпорт…';
    try {
      // Callback оновлює текст кнопки щоб показати прогрес
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

  // Збереження форми питання (submit)
  questionForm.addEventListener('submit', handleQuestionFormSubmit);

  // Кнопка «Переглянути» — preview поточного стану форми
  document.getElementById('qf-preview').addEventListener('click', handlePreviewClick);
}

// ─── Список питань ────────────────────────────────────────────────────────────

/**
 * Завантажити питання з Firestore з урахуванням фільтрів і відрендерити список.
 * Зчитує поточні значення фільтрів з DOM якщо filters не передані явно.
 *
 * @param {object} [filters={}] — опціональний override фільтрів
 */
export async function loadQuestionsTab(filters = {}) {
  const list = document.getElementById('questions-list');
  list.innerHTML = `<p class="admin-loading-text">Завантаження…</p>`;

  try {
    // Читаємо фільтри з DOM або використовуємо передані значення
    const grade = filters.grade ?? (document.getElementById('q-filter-grade').value || undefined);
    const typeRaw = document.getElementById('q-filter-type').value;
    const isOlympiad = filters.isOlympiad ?? (typeRaw !== '' ? typeRaw === 'true' : undefined);
    const difficulty = filters.difficulty ?? (document.getElementById('q-filter-difficulty').value || undefined);

    currentQuestions = await getQuestions({
      grade: grade ? Number(grade) : undefined,
      isOlympiad,
      difficulty,
    });

    // Лічильник результатів
    document.getElementById('q-count').textContent = `${currentQuestions.length} питань`;

    if (!currentQuestions.length) {
      list.innerHTML = `
        <div class="bg-slate-800 border border-slate-700 rounded-2xl p-10 text-center text-slate-500">
          <i class="fas fa-question-circle text-4xl mb-3 block"></i>
          <p class="font-semibold">Питань не знайдено</p>
        </div>`;
      return;
    }

    list.innerHTML = '';
    currentQuestions.forEach(q => list.appendChild(buildQuestionCard(q)));
  } catch (err) {
    list.innerHTML = `<p class="text-rose-400 text-sm p-4">${err.message}</p>`;
  }
}

// ─── Картка питання ───────────────────────────────────────────────────────────

/**
 * Побудувати DOM-картку для одного питання зі списку.
 * Містить бейджі метаданих, текст питання, кнопки дій.
 *
 * @param {object} q — об'єкт питання з Firestore
 * @returns {HTMLElement}
 */
function buildQuestionCard(q) {
  const d  = DIFF_STYLES[q.difficulty] ?? DIFF_STYLES.medium;
  const el = document.createElement('div');
  el.className = 'question-item';

  const correctHint = q.a?.[q.correct] ?? '—';

  el.innerHTML = `
    <div class="question-item__left">
      <div style="display:flex; flex-wrap:wrap; gap:var(--sp-2); margin-bottom:var(--sp-2);">
        <span class="qi-badge qi-badge--grade">${q.grade} клас</span>
        <span class="qi-badge qi-badge--type">${esc(TYPE_LABELS[q.type ?? 'choice'] ?? q.type)}</span>
        <span class="qi-badge qi-badge--${q.difficulty ?? 'medium'}">${d.label}</span>
        ${q.isOlympiad
          ? '<span class="qi-badge qi-badge--olympiad">Олімпіада</span>'
          : '<span class="qi-badge qi-badge--practice">Тренування</span>'}
      </div>
      <p class="question-item__text">${esc(q.q)}</p>
      ${q.code ? `<p class="question-item__code">${esc(q.code.split('\n')[0])}…</p>` : ''}
      <p class="question-item__meta">✓ ${esc(correctHint)}</p>
    </div>
    <div class="question-item__actions">
      <button class="btn-q-edit btn-adm-slate btn-icon" title="Редагувати"><i class="fas fa-pen"></i></button>
      <button class="btn-q-dup  btn-adm-slate btn-icon" title="Дублювати"><i class="fas fa-copy"></i></button>
      <button class="btn-q-del  btn-adm-danger btn-icon" title="Видалити"><i class="fas fa-trash"></i></button>
    </div>`;

  // Кнопки дій — кожна окремо для ясності
  el.querySelector('.btn-q-edit').addEventListener('click', () => openQuestionModal(q));

  el.querySelector('.btn-q-dup').addEventListener('click', async () => {
    try {
      await duplicateQuestion(q);
      await loadQuestionsTab();
    } catch (err) {
      showModal(err.message);
    }
  });

  el.querySelector('.btn-q-del').addEventListener('click', async () => {
    if (!confirm('Видалити питання?')) return;
    try {
      await deleteQuestion(q.id);
      await loadQuestionsTab();
    } catch (err) {
      showModal(err.message);
    }
  });

  return el;
}

// ─── Модаль форми питання ─────────────────────────────────────────────────────

/**
 * Відкрити модаль форми питання.
 * Якщо передано q — режим редагування (заповнює поля).
 * Якщо q === null — режим створення (очищає форму).
 *
 * @param {object|null} q — питання для редагування або null для нового
 */
export function openQuestionModal(q) {
  // Заголовок модалі залежить від режиму
  document.getElementById('question-modal-title').textContent = q ? 'Редагувати питання' : 'Нове питання';

  // Базові поля — спільні для всіх типів
  document.getElementById('qf-id').value          = q?.id ?? '';
  document.getElementById('qf-grade').value       = q?.grade ?? '1';
  document.getElementById('qf-difficulty').value  = q?.difficulty ?? 'medium';
  document.getElementById('qf-olympiad').checked  = q?.isOlympiad ?? false;
  document.getElementById('qf-q').value           = q?.q ?? '';
  document.getElementById('qf-explanation').value = q?.explanation ?? '';

  // Тип питання — визначає яку секцію показати
  const type = q?.type ?? 'choice';
  document.getElementById('qf-type').value = type;
  applyTypeUI(type);

  // ── Секція: choice ──────────────────────────────────────────────────────────
  document.getElementById('qf-code').value = q?.code ?? '';
  document.querySelectorAll('.qf-opt').forEach((inp, i) => { inp.value = q?.a?.[i] ?? ''; });
  const radio = document.querySelector(`input[name="qf-correct"][value="${q?.correct ?? 0}"]`);
  if (radio) radio.checked = true;

  // ── Секція: sort ────────────────────────────────────────────────────────────
  document.getElementById('qf-items').value         = (q?.items ?? []).join('\n');
  document.getElementById('qf-correct-order').value = (q?.correctOrder ?? []).join(',');

  // ── Секція: sequence ────────────────────────────────────────────────────────
  document.getElementById('qf-given').value = (q?.given ?? []).join(',');
  document.querySelectorAll('.qf-seq-opt').forEach((inp, i) => { inp.value = q?.choices?.[i] ?? ''; });
  const seqRadio = document.querySelector(`input[name="qf-seq-correct"][value="${q?.correct ?? 0}"]`);
  if (seqRadio) seqRadio.checked = true;

  // ── Секція: match ────────────────────────────────────────────────────────────
  document.getElementById('qf-left').value  = (q?.left  ?? []).join('\n');
  document.getElementById('qf-right').value = (q?.right ?? []).join('\n');
  document.getElementById('qf-pairs').value = (q?.pairs ?? []).join(',');

  // ── Секція: truefalse ────────────────────────────────────────────────────────
  // Конвертуємо boolean → рядок для порівняння з value атрибутом radio
  const tfVal   = String(q?.correct ?? 'true');
  const tfRadio = document.querySelector(`input[name="qf-tf-correct"][value="${tfVal}"]`);
  if (tfRadio) tfRadio.checked = true;

  // ── Секція: input ────────────────────────────────────────────────────────────
  document.getElementById('qf-input-correct').value = q?.correct ?? '';
  document.getElementById('qf-input-type').value    = q?.inputType ?? 'text';

  // ── Зображення ───────────────────────────────────────────────────────────────
  const imgUrl = q?.img ?? '';
  document.getElementById('qf-img').value = imgUrl;
  const prev = document.getElementById('qf-img-preview');
  if (imgUrl) { prev.src = imgUrl; prev.classList.remove('hidden'); }
  else        { prev.classList.add('hidden'); prev.src = ''; }

  // Скидаємо помилку і відкриваємо модаль
  qfError.textContent = '';
  questionModal.classList.remove('hidden');

  // Focus trap — Tab/Shift+Tab тримає фокус всередині, Escape закриває
  _qModalTrapRemove?.();
  _qModalTrapRemove = createFocusTrap(questionModal, closeQuestionModal);
}

/**
 * Закрити модаль форми питання і зняти focus trap.
 */
export function closeQuestionModal() {
  _qModalTrapRemove?.();
  _qModalTrapRemove = null;
  questionModal.classList.add('hidden');
}

// ─── Збереження форми ─────────────────────────────────────────────────────────

/**
 * Обробник submit форми питання.
 * Валідує дані, збирає об'єкт питання і зберігає в Firestore.
 *
 * @param {SubmitEvent} e
 */
async function handleQuestionFormSubmit(e) {
  e.preventDefault();
  qfError.textContent = '';

  const id   = document.getElementById('qf-id').value;
  const q    = document.getElementById('qf-q').value.trim();
  const type = document.getElementById('qf-type').value;

  // Текст питання обов'язковий для всіх типів
  if (!q) { qfError.textContent = 'Введи текст питання.'; return; }

  const imgUrl = document.getElementById('qf-img').value.trim() || null;

  // Базовий об'єкт — спільні поля для всіх типів
  const base = {
    type,
    q,
    // img зберігаємо тільки якщо є — не засмічуємо Firestore полем img: null
    ...(imgUrl ? { img: imgUrl } : {}),
    explanation: document.getElementById('qf-explanation').value.trim(),
    grade:       Number(document.getElementById('qf-grade').value),
    difficulty:  document.getElementById('qf-difficulty').value,
    isOlympiad:  document.getElementById('qf-olympiad').checked,
  };

  // Збираємо дані залежно від типу + валідуємо специфічні поля
  let data;
  try {
    data = buildDataByType(type, base);
  } catch (validationMsg) {
    // buildDataByType кидає рядок-повідомлення при помилці валідації
    qfError.textContent = validationMsg;
    return;
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
}

/**
 * Зібрати і валідувати дані форми залежно від типу питання.
 * Кидає рядок-повідомлення про помилку якщо валідація не пройшла.
 *
 * @param {string} type — тип питання
 * @param {object} base — базові поля (вже зібрані)
 * @returns {object} повний об'єкт питання для збереження
 * @throws {string} повідомлення про помилку валідації
 */
function buildDataByType(type, base) {
  if (type === 'sort' || type === 'algorithm') {
    const items = document.getElementById('qf-items').value
      .split('\n').map(s => s.trim()).filter(Boolean);
    const correctOrder = document.getElementById('qf-correct-order').value
      .split(',').map(s => Number(s.trim()));
    if (items.length < 2) throw 'Додай мінімум 2 елементи.';
    return { ...base, items, correctOrder };
  }

  if (type === 'sequence') {
    const given   = document.getElementById('qf-given').value.split(',').map(s => s.trim()).filter(Boolean);
    const choices = [...document.querySelectorAll('.qf-seq-opt')].map(i => i.value.trim());
    const seqCorrect = document.querySelector('input[name="qf-seq-correct"]:checked');
    if (given.length < 2)      throw 'Введи мінімум 2 елементи послідовності.';
    if (choices.some(c => !c)) throw 'Заповни всі 4 варіанти.';
    if (!seqCorrect)           throw 'Вибери правильну відповідь.';
    return { ...base, given, choices, correct: Number(seqCorrect.value) };
  }

  if (type === 'match') {
    const left  = document.getElementById('qf-left').value.split('\n').map(s => s.trim()).filter(Boolean);
    const right = document.getElementById('qf-right').value.split('\n').map(s => s.trim()).filter(Boolean);
    const pairs = document.getElementById('qf-pairs').value.split(',').map(s => Number(s.trim()));
    if (left.length < 2 || right.length < 2) throw 'Мінімум 2 пари.';
    return { ...base, left, right, pairs };
  }

  if (type === 'truefalse') {
    const tfEl = document.querySelector('input[name="qf-tf-correct"]:checked');
    if (!tfEl) throw 'Вибери правильну відповідь.';
    return { ...base, correct: tfEl.value === 'true' };
  }

  if (type === 'input') {
    const correctVal = document.getElementById('qf-input-correct').value.trim();
    const inputType  = document.getElementById('qf-input-type').value;
    if (!correctVal) throw 'Введи правильну відповідь.';
    return { ...base, correct: inputType === 'number' ? Number(correctVal) : correctVal, inputType };
  }

  // choice (default)
  const opts      = [...document.querySelectorAll('.qf-opt')].map(i => i.value.trim());
  const correctEl = document.querySelector('input[name="qf-correct"]:checked');
  if (opts.some(o => !o)) throw 'Заповни всі 4 варіанти.';
  if (!correctEl)         throw 'Вибери правильну відповідь.';
  const code = document.getElementById('qf-code').value.trim() || null;
  return { ...base, ...(code ? { code } : {}), a: opts, correct: Number(correctEl.value) };
}

// ─── Preview питання ──────────────────────────────────────────────────────────

/**
 * Обробник кнопки «Переглянути» у формі.
 * Збирає питання з форми (без валідації) і рендерить в preview-модалі.
 */
function handlePreviewClick() {
  const type = document.getElementById('qf-type').value;
  const q = _buildQuestionFromForm();
  if (!q) return;

  // Текст питання
  document.getElementById('pv-question-text').textContent = q.q || '(текст питання)';

  // Зображення — показуємо або ховаємо блок
  const pvImg = document.getElementById('pv-image');
  if (q.img) { pvImg.src = q.img; pvImg.classList.remove('hidden'); }
  else       { pvImg.classList.add('hidden'); pvImg.src = ''; }

  // Псевдокод Равлика
  const pvCode = document.getElementById('pv-code');
  if (q.code) { pvCode.textContent = q.code; pvCode.classList.remove('hidden'); }
  else        { pvCode.classList.add('hidden'); }

  // Варіанти відповідей — через спільний рендерер з прапором preview
  // preview: true → підсвічує правильну відповідь, не дозволяє кліки
  const pvOpts = document.getElementById('pv-options');
  pvOpts.className = type === 'choice'    ? 'pv-options pv-options--grid'
    : type === 'truefalse'               ? 'pv-options pv-options--two'
    : 'pv-options';
  renderQuestion(q, pvOpts, { preview: true });

  // Пояснення
  const explWrap = document.getElementById('pv-explanation-wrap');
  if (q.explanation) {
    document.getElementById('pv-explanation').textContent = q.explanation;
    explWrap.classList.remove('hidden');
  } else {
    explWrap.classList.add('hidden');
  }

  previewModal.classList.remove('hidden');
  _pvTrapRemove?.();
  _pvTrapRemove = createFocusTrap(previewModal, closePreview);
}

/**
 * Закрити preview-модаль і зняти focus trap.
 */
function closePreview() {
  _pvTrapRemove?.();
  _pvTrapRemove = null;
  previewModal.classList.add('hidden');
}

/**
 * Зібрати об'єкт питання з поточного стану форми БЕЗ валідації.
 * Використовується тільки для preview — не для збереження в Firestore.
 * Повертає розумні дефолти якщо поля порожні.
 *
 * @returns {object} об'єкт питання для передачі в renderQuestion
 */
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
    return {
      ...base,
      a:       [...document.querySelectorAll('.qf-opt')].map(i => i.value.trim() || '…'),
      correct: correctEl ? Number(correctEl.value) : 0,
    };
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
    const correctOrder = document.getElementById('qf-correct-order').value
      .split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
    return {
      ...base,
      items:        items.length ? items : ['Елемент 1', 'Елемент 2'],
      correctOrder: correctOrder.length ? correctOrder : [0, 1],
    };
  }

  if (type === 'sequence') {
    const given   = document.getElementById('qf-given').value.split(',').map(s => s.trim()).filter(Boolean);
    const choices = [...document.querySelectorAll('.qf-seq-opt')].map(i => i.value.trim() || '…');
    const seqEl   = document.querySelector('input[name="qf-seq-correct"]:checked');
    return { ...base, given: given.length ? given : ['?'], choices, correct: seqEl ? Number(seqEl.value) : 0 };
  }

  if (type === 'match') {
    const left  = document.getElementById('qf-left').value.split('\n').map(s => s.trim()).filter(Boolean);
    const right = document.getElementById('qf-right').value.split('\n').map(s => s.trim()).filter(Boolean);
    const pairs = document.getElementById('qf-pairs').value
      .split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
    return {
      ...base,
      left:  left.length  ? left  : ['Ліво'],
      right: right.length ? right : ['Право'],
      pairs: pairs.length ? pairs : [0],
    };
  }

  return base;
}

// ─── UI-хелпери ───────────────────────────────────────────────────────────────

/**
 * Показати секцію форми для обраного типу питання.
 * Ховає всі інші секції, щоб форма не була перевантажена.
 * Також ховає/показує блок псевдокоду Равлика (тільки для choice/sort).
 *
 * @param {string} type — значення з <select id="qf-type">
 */
export function applyTypeUI(type) {
  // Ховаємо всі секції
  Object.values(QF_SECTIONS).forEach(id => document.getElementById(id).classList.add('hidden'));

  // Показуємо потрібну (або choice як fallback якщо тип невідомий)
  document.getElementById(QF_SECTIONS[type] ?? 'qf-section-choice').classList.remove('hidden');

  // Псевдокод Равлика показуємо тільки для типів де він має сенс
  const showCode = ['choice', 'sort', 'algorithm'].includes(type);
  document.getElementById('qf-code-wrap').classList.toggle('hidden', !showCode);
}
