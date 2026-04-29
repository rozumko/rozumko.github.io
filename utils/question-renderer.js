/**
 * question-renderer.js
 * Рендерить питання будь-якого типу в DOM-контейнер.
 *
 * @param {object}   q          — об'єкт питання
 * @param {Element}  container  — куди рендерити (очищується перед рендером)
 * @param {object}   [opts]
 * @param {Function} [opts.onAnswer]  — onAnswer(isCorrect) — викликається після відповіді
 * @param {boolean}  [opts.preview]  — true → статичний режим, правильна відповідь підсвічена
 */
export function renderQuestion(q, container, { onAnswer = null, preview = false } = {}) {
  container.innerHTML = '';
  const type = q.type ?? 'choice';

  if      (type === 'choice')                  renderChoice(q, container, onAnswer, preview);
  else if (type === 'truefalse')               renderTrueFalse(q, container, onAnswer, preview);
  else if (type === 'input')                   renderInput(q, container, onAnswer, preview);
  else if (type === 'sort' || type === 'algorithm') renderSort(q, container, onAnswer, preview);
  else if (type === 'sequence')                renderSequence(q, container, onAnswer, preview);
  else if (type === 'match')                   renderMatch(q, container, onAnswer, preview);
}

// ── CSS-константи ──────────────────────────────────────────────────────────

// Семантичні класи з style.css — без Tailwind утиліт
const CLS = {
  optionBtn:  'quiz-option',
  checkBtn:   'quiz-check',
  correct:    ['quiz-option--correct'],
  incorrect:  ['quiz-option--incorrect'],
  neutral:    ['quiz-option'],   // базовий клас (для reset при знятті стану)
};

function markCorrect(el)   { el.classList.add('quiz-option--correct'); }
function markIncorrect(el) { el.classList.add('quiz-option--incorrect'); }

// ── choice ─────────────────────────────────────────────────────────────────

function renderChoice(q, container, onAnswer, preview) {
  let answered = false;

  q.a.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = CLS.optionBtn;
    btn.textContent = opt;

    if (preview) {
      btn.disabled = true;
      btn.style.cursor = 'default';
      if (i === q.correct) { markCorrect(btn); btn.title = '✓ Правильна відповідь'; }
    } else {
      btn.addEventListener('click', () => {
        if (answered) return;
        answered = true;
        const isCorrect = i === q.correct;
        const btns = container.querySelectorAll('button');
        btns.forEach(b => b.disabled = true);
        isCorrect ? markCorrect(btn) : markIncorrect(btn);
        if (!isCorrect) markCorrect(btns[q.correct]);
        onAnswer?.(isCorrect);
      });
    }

    container.appendChild(btn);
  });
}

// ── truefalse ──────────────────────────────────────────────────────────────

function renderTrueFalse(q, container, onAnswer, preview) {
  let answered = false;
  const OPTIONS = [{ label: '✅ Так', value: true }, { label: '❌ Ні', value: false }];

  OPTIONS.forEach(({ label, value }) => {
    const btn = document.createElement('button');
    btn.className = 'btn w-full py-6 rounded-2xl border-2 border-slate-200 bg-white text-slate-800 font-bold text-xl hover:border-violet-400 hover:bg-violet-50 transition-all';
    btn.textContent = label;
    btn.dataset.tfValue = String(value);

    if (preview) {
      btn.disabled = true;
      btn.style.cursor = 'default';
      if (value === q.correct) markCorrect(btn);
    } else {
      btn.addEventListener('click', () => {
        if (answered) return;
        answered = true;
        const isCorrect = value === q.correct;
        const btns = container.querySelectorAll('button');
        btns.forEach(b => b.disabled = true);
        isCorrect ? markCorrect(btn) : markIncorrect(btn);
        if (!isCorrect) {
          btns.forEach(b => { if (b.dataset.tfValue === String(q.correct)) markCorrect(b); });
        }
        onAnswer?.(isCorrect);
      });
    }

    container.appendChild(btn);
  });
}

// ── input ──────────────────────────────────────────────────────────────────

function renderInput(q, container, onAnswer, preview) {
  const isNum = q.inputType === 'number' || typeof q.correct === 'number';
  let answered = false;

  if (preview) {
    const placeholder = document.createElement('div');
    placeholder.className = 'w-full px-5 py-4 rounded-2xl border-2 border-slate-200 bg-white text-slate-400 text-center font-semibold text-lg';
    placeholder.textContent = isNum ? 'Введи число…' : 'Введи відповідь…';
    container.appendChild(placeholder);
    const hint = document.createElement('p');
    hint.className = 'text-center text-sm font-semibold text-emerald-600 mt-2';
    hint.textContent = `Правильна відповідь: ${q.correct}`;
    container.appendChild(hint);
    return;
  }

  const inp = document.createElement('input');
  inp.type = isNum ? 'number' : 'text';
  inp.placeholder = isNum ? 'Введи число…' : 'Введи відповідь…';
  inp.className = 'w-full px-5 py-4 rounded-2xl border-2 border-slate-200 bg-white text-slate-800 font-semibold text-lg focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 text-center';
  inp.setAttribute('autocomplete', 'off');
  inp.setAttribute('autocorrect', 'off');
  inp.setAttribute('spellcheck', 'false');

  const checkBtn = document.createElement('button');
  checkBtn.className = CLS.checkBtn;
  checkBtn.textContent = 'Перевірити';

  function submit() {
    if (answered) return;
    const raw = inp.value.trim();
    if (!raw) { inp.focus(); return; }
    answered = true;
    inp.disabled = true;
    checkBtn.disabled = true;

    const isCorrect = isNum
      ? Math.abs(Number(raw) - Number(q.correct)) < 0.001
      : raw.toLowerCase() === String(q.correct).trim().toLowerCase();

    inp.classList.remove('border-slate-200');
    inp.classList.add(isCorrect ? 'border-emerald-400' : 'border-rose-400');

    if (!isCorrect) {
      const hint = document.createElement('p');
      hint.className = 'text-center text-sm font-semibold text-slate-500 mt-1';
      hint.textContent = `Правильна відповідь: ${q.correct}`;
      container.appendChild(hint);
    }
    onAnswer?.(isCorrect);
  }

  checkBtn.addEventListener('click', submit);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

  container.appendChild(inp);
  container.appendChild(checkBtn);
  inp.focus();
}

// ── sort / algorithm ───────────────────────────────────────────────────────

function renderSort(q, container, onAnswer, preview) {
  if (preview) {
    q.correctOrder.forEach((itemIdx, pos) => {
      const row = document.createElement('div');
      row.className = 'flex items-center gap-3';
      const num = document.createElement('span');
      num.className = 'text-slate-400 font-bold w-6 text-right flex-shrink-0';
      num.textContent = (pos + 1) + '.';
      const block = document.createElement('div');
      block.className = 'flex-1 border-2 rounded-2xl px-5 py-4 font-semibold text-base bg-emerald-50 border-emerald-300 text-emerald-800';
      block.textContent = q.items[itemIdx];
      row.appendChild(num); row.appendChild(block);
      container.appendChild(row);
    });
    return;
  }

  let answered = false;
  const order = [...q.items.keys()].sort(() => Math.random() - 0.5);

  const rebuild = () => {
    container.innerHTML = '';

    order.forEach((itemIdx, pos) => {
      const row = document.createElement('div');
      row.className = 'flex items-center gap-3';

      const num = document.createElement('span');
      num.className = 'text-slate-400 font-bold w-6 text-right flex-shrink-0 text-base';
      num.textContent = (pos + 1) + '.';

      const block = document.createElement('div');
      block.className = 'flex-1 bg-white border-2 border-slate-200 rounded-2xl px-5 py-4 text-slate-800 font-semibold text-base';
      block.textContent = q.items[itemIdx];

      const arrows = document.createElement('div');
      arrows.className = 'flex flex-col gap-1 flex-shrink-0';

      const up = document.createElement('button');
      up.className = 'w-10 h-10 rounded-xl bg-slate-100 hover:bg-violet-100 hover:text-violet-600 text-slate-500 font-bold text-lg flex items-center justify-center';
      up.textContent = '↑';
      up.setAttribute('aria-label', `Перемістити "${q.items[itemIdx]}" вгору`);
      if (pos === 0) up.classList.add('invisible');
      up.addEventListener('click', () => { [order[pos], order[pos-1]] = [order[pos-1], order[pos]]; rebuild(); });

      const dn = document.createElement('button');
      dn.className = 'w-10 h-10 rounded-xl bg-slate-100 hover:bg-violet-100 hover:text-violet-600 text-slate-500 font-bold text-lg flex items-center justify-center';
      dn.textContent = '↓';
      dn.setAttribute('aria-label', `Перемістити "${q.items[itemIdx]}" вниз`);
      if (pos === order.length - 1) dn.classList.add('invisible');
      dn.addEventListener('click', () => { [order[pos], order[pos+1]] = [order[pos+1], order[pos]]; rebuild(); });

      arrows.appendChild(up); arrows.appendChild(dn);
      row.appendChild(num); row.appendChild(block); row.appendChild(arrows);
      container.appendChild(row);
    });

    const checkBtn = document.createElement('button');
    checkBtn.className = CLS.checkBtn;
    checkBtn.textContent = 'Перевірити';
    checkBtn.addEventListener('click', () => {
      if (answered) return;
      answered = true;

      const isCorrect = q.correctOrder.every((correctIdx, pos) => order[pos] === correctIdx);

      container.innerHTML = '';
      order.forEach((itemIdx, pos) => {
        const ok = q.correctOrder[pos] === itemIdx;
        const row = document.createElement('div');
        row.className = 'flex items-center gap-3';
        const num = document.createElement('span');
        num.className = 'text-slate-400 font-bold w-6 text-right flex-shrink-0 text-base';
        num.textContent = (pos + 1) + '.';
        const block = document.createElement('div');
        block.className = `flex-1 border-2 rounded-2xl px-5 py-4 font-semibold text-base ${ok ? 'bg-emerald-50 border-emerald-400 text-emerald-800' : 'bg-rose-50 border-rose-400 text-rose-800'}`;
        block.textContent = q.items[itemIdx];
        const icon = document.createElement('span');
        icon.textContent = ok ? '✓' : '✗';
        icon.className = 'text-xl flex-shrink-0';
        row.appendChild(num); row.appendChild(block); row.appendChild(icon);
        container.appendChild(row);
      });

      if (!isCorrect) {
        const correctRow = document.createElement('div');
        correctRow.className = 'mt-2 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl';
        correctRow.innerHTML = '<p class="text-xs text-emerald-700 font-semibold mb-1">Правильний порядок:</p>' +
          q.correctOrder.map((idx, pos) => `<span class="text-xs text-emerald-800">${pos+1}. ${_esc(q.items[idx])}</span>`).join('<br>');
        container.appendChild(correctRow);
      }

      onAnswer?.(isCorrect);
    });
    container.appendChild(checkBtn);
  };

  rebuild();
}

// ── sequence ───────────────────────────────────────────────────────────────

function renderSequence(q, container, onAnswer, preview) {
  // Рядок із заданою послідовністю
  const seq = document.createElement('div');
  seq.className = 'flex items-center gap-2 flex-wrap justify-center bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 mb-4';
  q.given.forEach(item => {
    const chip = document.createElement('span');
    chip.className = 'text-3xl';
    chip.textContent = item;
    seq.appendChild(chip);
    const arrow = document.createElement('span');
    arrow.className = 'text-slate-400 font-bold text-lg';
    arrow.textContent = '→';
    seq.appendChild(arrow);
  });
  const qmark = document.createElement('span');
  qmark.className = 'w-12 h-12 rounded-2xl bg-violet-100 border-2 border-violet-300 text-violet-600 font-extrabold text-2xl flex items-center justify-center';
  qmark.textContent = '?';
  seq.appendChild(qmark);
  container.appendChild(seq);

  // Варіанти
  let answered = false;
  q.choices.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = CLS.optionBtn;
    btn.textContent = opt;

    if (preview) {
      btn.disabled = true;
      btn.style.cursor = 'default';
      if (i === q.correct) markCorrect(btn);
    } else {
      btn.addEventListener('click', () => {
        if (answered) return;
        answered = true;
        const isCorrect = i === q.correct;
        const btns = container.querySelectorAll('button');
        btns.forEach(b => b.disabled = true);
        isCorrect ? markCorrect(btn) : markIncorrect(btn);
        if (!isCorrect) markCorrect(btns[q.correct]);
        onAnswer?.(isCorrect);
      });
    }

    container.appendChild(btn);
  });
}

// ── match ──────────────────────────────────────────────────────────────────

function renderMatch(q, container, onAnswer, preview) {
  if (preview) {
    q.left.forEach((l, i) => {
      const row = document.createElement('div');
      row.className = 'flex items-center gap-3';
      row.innerHTML = `<span class="flex-1 px-3 py-2 rounded-xl bg-white border-2 border-slate-200 font-semibold text-sm text-slate-800">${_esc(l)}</span><span class="text-slate-400">→</span><span class="flex-1 px-3 py-2 rounded-xl bg-emerald-50 border-2 border-emerald-300 text-sm font-semibold text-emerald-800">${_esc(q.right[q.pairs[i]] ?? '?')}</span>`;
      container.appendChild(row);
    });
    return;
  }

  const shuffled = [...q.right].sort(() => Math.random() - 0.5);
  let answered = false;

  q.left.forEach((leftItem) => {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-3';

    const leftEl = document.createElement('div');
    leftEl.className = 'flex-1 bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 font-semibold text-base text-slate-800';
    leftEl.textContent = leftItem;

    const arrow = document.createElement('span');
    arrow.className = 'text-slate-400 font-bold text-xl flex-shrink-0';
    arrow.textContent = '→';

    const select = document.createElement('select');
    select.className = 'flex-1 px-4 py-3 rounded-2xl border-2 border-slate-200 bg-white text-slate-800 font-semibold text-sm focus:outline-none focus:border-violet-400';
    select.setAttribute('aria-label', `Пара для "${leftItem}"`);

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Обери…';
    select.appendChild(placeholder);
    shuffled.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item;
      opt.textContent = item;
      select.appendChild(opt);
    });

    row.appendChild(leftEl); row.appendChild(arrow); row.appendChild(select);
    container.appendChild(row);
  });

  const checkBtn = document.createElement('button');
  checkBtn.className = CLS.checkBtn;
  checkBtn.textContent = 'Перевірити';
  checkBtn.addEventListener('click', () => {
    if (answered) return;
    const selects = [...container.querySelectorAll('select')];
    if (selects.some(s => !s.value)) return;
    answered = true;

    let allCorrect = true;
    selects.forEach((sel, i) => {
      const ok = sel.value === q.right[q.pairs[i]];
      if (!ok) allCorrect = false;
      sel.disabled = true;
      const leftEl = sel.parentElement.querySelector('div');
      leftEl.classList.remove('border-slate-200');
      leftEl.classList.add(ok ? 'border-emerald-400' : 'border-rose-400');
      sel.classList.remove('border-slate-200');
      sel.classList.add(ok ? 'border-emerald-400' : 'border-rose-400');
    });
    if (allCorrect) container.querySelectorAll('div').forEach(d => d.classList.add('bg-emerald-50'));
    onAnswer?.(allCorrect);
  });
  container.appendChild(checkBtn);
}

// ── Утіліта ────────────────────────────────────────────────────────────────

function _esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
