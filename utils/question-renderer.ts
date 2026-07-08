/** Мінімальний тип питання для рендерера. Конкретні поля залежать від type. */
export interface RenderableQuestion {
  type?: string
  options?: string[] | Record<string, unknown>
  a?: string[]
  correct?: number | boolean | string
  explanation?: string | null
  // sort / algorithm
  items?: string[]
  correctOrder?: number[]
  // sequence
  given?: string[]
  choices?: string[]
  // match
  left?: string[]
  right?: string[]
  pairs?: number[]
  // input
  inputType?: string
  // опційне зображення до питання
  img?: string | null
  [key: string]: unknown
}

/**
 * Рендерить питання будь-якого типу в DOM-контейнер.
 *
 * @param q         — об'єкт питання
 * @param container — куди рендерити (очищується перед рендером)
 * @param opts.onAnswer — onAnswer(isCorrect | answerIndex) — викликається після відповіді
 * @param opts.preview  — true → статичний режим, правильна відповідь підсвічена
 */
export function renderQuestion(
  q: RenderableQuestion,
  container: HTMLElement,
  {
    onAnswer = null as ((result: boolean | number | number[] | string) => void) | null,
    preview = false,
    // preselect — попередня відповідь учня (olympiad/demo) для підсвічування при
    // поверненні. Візуальна підказка; питання лишається інтерактивним (можна змінити).
    preselect = null as boolean | number | number[] | string | null,
  } = {}
) {
  container.innerHTML = '';
  const type = q.type ?? 'choice';

  // Radio-механіки рендерять кнопки з role="radio" — контейнер має бути
  // radiogroup. Для решти типів role знімається (group без radio-дітей — помилка).
  if (type === 'choice' || type === 'truefalse' || type === 'sequence') {
    container.setAttribute('role', 'radiogroup');
  } else {
    container.removeAttribute('role');
  }

  if      (type === 'choice')                  renderChoice(q, container, onAnswer, preview, preselect);
  else if (type === 'truefalse')               renderTrueFalse(q, container, onAnswer, preview, preselect);
  else if (type === 'input')                   renderInput(q, container, onAnswer, preview, preselect);
  else if (type === 'sort' || type === 'algorithm') renderSort(q, container, onAnswer, preview, preselect);
  else if (type === 'sequence')                renderSequence(q, container, onAnswer, preview, preselect);
  else if (type === 'match')                   renderMatch(q, container, onAnswer, preview, preselect);
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

function prepareRadioOption(btn, checked = false) {
  btn.type = 'button';
  btn.setAttribute('role', 'radio');
  btn.setAttribute('aria-checked', String(checked));
}

function setRadioSelection(btns, selectedBtn) {
  btns.forEach(btn => btn.setAttribute('aria-checked', String(btn === selectedBtn)));
}

// ── choice ─────────────────────────────────────────────────────────────────

function renderChoice(q, container, onAnswer, preview, preselect = null) {
  let answered = false;
  const opts = q.options ?? q.a ?? [];
  // correct може бути відсутнім (олімпіадний режим — сервер перевіряє)
  const hasCorrect = q.correct != null && !Number.isNaN(Number(q.correct));
  const correct = hasCorrect ? Number(q.correct) : -1;
  const btns = [];

  opts.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = CLS.optionBtn;
    btn.textContent = opt;
    prepareRadioOption(btn);
    btns.push(btn);

    if (preview) {
      btn.disabled = true;
      btn.style.cursor = 'default';
      if (i === correct) { markCorrect(btn); btn.title = '✓ Правильна відповідь'; }
    } else {
      btn.addEventListener('click', () => {
        if (answered) return;
        answered = true;
        setRadioSelection(btns, btn);
        btns.forEach(b => b.disabled = true);
        if (hasCorrect) {
          const isCorrect = i === correct;
          isCorrect ? markCorrect(btn) : markIncorrect(btn);
          if (!isCorrect) markCorrect(btns[correct]);
          onAnswer?.(isCorrect);
        } else {
          // Олімпіадний режим: відповідь зберігається, правильність перевіряє сервер
          btn.classList.add('quiz-option--selected');
          onAnswer?.(i); // передаємо індекс замість boolean
        }
      });
    }

    container.appendChild(btn);
  });

  // Повернення: підсвітити раніше обраний варіант (лишається клікабельним).
  if (!preview && preselect != null && btns[Number(preselect)]) {
    btns[Number(preselect)].classList.add('quiz-option--selected');
    setRadioSelection(btns, btns[Number(preselect)]);
  }
}

// ── truefalse ──────────────────────────────────────────────────────────────

function renderTrueFalse(q, container, onAnswer, preview, preselect = null) {
  let answered = false;
  const OPTIONS = [{ label: '✅ Так', value: true }, { label: '❌ Ні', value: false }];

  OPTIONS.forEach(({ label, value }) => {
    const btn = document.createElement('button');
    btn.className = 'quiz-option quiz-option--tf';
    btn.textContent = label;
    prepareRadioOption(btn);
    // Так=0, Ні=1 — узгоджено з БД де correct зберігається як integer-індекс
    const answerIndex = value ? 0 : 1;
    btn.dataset.tfIndex = String(answerIndex);

    if (preview) {
      btn.disabled = true;
      btn.style.cursor = 'default';
      if (answerIndex === Number(q.correct)) markCorrect(btn);
    } else {
      btn.addEventListener('click', () => {
        if (answered) return;
        answered = true;
        const allBtns = container.querySelectorAll('button');
        setRadioSelection([...allBtns], btn);
        allBtns.forEach(b => b.disabled = true);
        if (q.correct != null) {
          // practice: correct є — порівнюємо індекси
          const isCorrect = answerIndex === Number(q.correct);
          isCorrect ? markCorrect(btn) : markIncorrect(btn);
          if (!isCorrect) {
            // підсвітити правильну кнопку: correctIndex === 0 → Так, 1 → Ні
            const correctIndex = Number(q.correct);
            allBtns.forEach(b => { if (Number(b.dataset.tfIndex) === correctIndex) markCorrect(b); });
          }
          onAnswer?.(isCorrect);
        } else {
          // Олімпіадний режим: correct відсутній, передаємо індекс
          btn.classList.add('quiz-option--selected');
          onAnswer?.(answerIndex);
        }
      });
    }

    container.appendChild(btn);
  });

  // Повернення: підсвітити раніше обраний варіант (Так=0 / Ні=1).
  if (!preview && preselect != null) {
    container.querySelectorAll('button').forEach(b => {
      if (Number((b as HTMLElement).dataset.tfIndex) === Number(preselect)) {
        b.classList.add('quiz-option--selected');
        b.setAttribute('aria-checked', 'true');
      }
    });
  }
}

// ── input ──────────────────────────────────────────────────────────────────

function renderInput(q, container, onAnswer, preview, preselect = null) {
  const answerKey = q.answer ?? q.correct;
  const isNum = q.inputType === 'number' || typeof answerKey === 'number';
  let answered = false;

  if (preview) {
    const placeholder = document.createElement('div');
    placeholder.className = 'quiz-input quiz-input--placeholder';
    placeholder.textContent = isNum ? 'Введи число…' : 'Введи відповідь…';
    container.appendChild(placeholder);
    const hint = document.createElement('p');
    hint.className = 'quiz-hint quiz-hint--correct';
    hint.textContent = `Правильна відповідь: ${answerKey}`;
    container.appendChild(hint);
    return;
  }

  const inp = document.createElement('input');
  inp.type = isNum ? 'number' : 'text';
  inp.placeholder = isNum ? 'Введи число…' : 'Введи відповідь…';
  inp.className = 'quiz-input';
  inp.setAttribute('autocomplete', 'off');
  inp.setAttribute('autocorrect', 'off');
  inp.setAttribute('spellcheck', 'false');
  if (preselect != null) inp.value = String(preselect); // повернення: відновити введене

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

    if (answerKey != null) {
      const isCorrect = isNum
        ? Math.abs(Number(raw) - Number(answerKey)) < 0.001
        : raw.toLowerCase() === String(answerKey).trim().toLowerCase();

      inp.classList.add(isCorrect ? 'quiz-input--correct' : 'quiz-input--incorrect');

      if (!isCorrect) {
        const hint = document.createElement('p');
        hint.className = 'quiz-hint';
        hint.textContent = `Правильна відповідь: ${answerKey}`;
        container.appendChild(hint);
      }
      onAnswer?.(isCorrect);
    } else {
      // Olympiad/demo: ключ стрипнуто сервером, надсилаємо сиру відповідь.
      onAnswer?.(raw);
    }
  }

  checkBtn.addEventListener('click', submit);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

  container.appendChild(inp);
  container.appendChild(checkBtn);
  inp.focus();
}

// ── sort / algorithm ───────────────────────────────────────────────────────

function renderSort(q, container, onAnswer, preview, preselect = null) {
  if (preview) {
    q.correctOrder.forEach((itemIdx, pos) => {
      const row = document.createElement('div');
      row.className = 'quiz-sort-row';
      const num = document.createElement('span');
      num.className = 'quiz-sort-num';
      num.textContent = (pos + 1) + '.';
      const block = document.createElement('div');
      block.className = 'quiz-sort-item quiz-sort-item--correct';
      block.textContent = q.items[itemIdx];
      row.appendChild(num); row.appendChild(block);
      container.appendChild(row);
    });
    return;
  }

  let answered = false;
  // Повернення: відновити раніше складений порядок; інакше — випадковий.
  const order = Array.isArray(preselect) && preselect.length === q.items.length
    ? [...preselect]
    : [...q.items.keys()].sort(() => Math.random() - 0.5);

  const rebuild = () => {
    container.innerHTML = '';

    order.forEach((itemIdx, pos) => {
      const row = document.createElement('div');
      row.className = 'quiz-sort-row';

      const num = document.createElement('span');
      num.className = 'quiz-sort-num';
      num.textContent = (pos + 1) + '.';

      const block = document.createElement('div');
      block.className = 'quiz-sort-item';
      block.textContent = q.items[itemIdx];

      const arrows = document.createElement('div');
      arrows.className = 'quiz-move-group';

      const up = document.createElement('button');
      up.className = 'quiz-move';
      up.textContent = '↑';
      up.setAttribute('aria-label', `Перемістити "${q.items[itemIdx]}" вгору`);
      if (pos === 0) {
        up.classList.add('quiz-move--hidden');
        up.disabled = true;
        up.setAttribute('aria-hidden', 'true');
      }
      up.addEventListener('click', () => { [order[pos], order[pos-1]] = [order[pos-1], order[pos]]; rebuild(); });

      const dn = document.createElement('button');
      dn.className = 'quiz-move';
      dn.textContent = '↓';
      dn.setAttribute('aria-label', `Перемістити "${q.items[itemIdx]}" вниз`);
      if (pos === order.length - 1) {
        dn.classList.add('quiz-move--hidden');
        dn.disabled = true;
        dn.setAttribute('aria-hidden', 'true');
      }
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

      // Олімпіадний режим: correctOrder стрипнуто сервером → оцінює сервер.
      // Зберігаємо порядок учня (масив індексів елементів) і виходимо без локального фідбеку.
      if (!Array.isArray(q.correctOrder)) {
        order.forEach((itemIdx, pos) => {
          const block = container.children[pos]?.querySelector('div');
          block?.classList.add('quiz-option--selected');
        });
        onAnswer?.([...order]);
        return;
      }

      const isCorrect = q.correctOrder.every((correctIdx, pos) => order[pos] === correctIdx);

      container.innerHTML = '';
      order.forEach((itemIdx, pos) => {
        const ok = q.correctOrder[pos] === itemIdx;
        const row = document.createElement('div');
        row.className = 'quiz-sort-row';
        const num = document.createElement('span');
        num.className = 'quiz-sort-num';
        num.textContent = (pos + 1) + '.';
        const block = document.createElement('div');
        block.className = `quiz-sort-item ${ok ? 'quiz-sort-item--correct' : 'quiz-sort-item--incorrect'}`;
        block.textContent = q.items[itemIdx];
        const icon = document.createElement('span');
        icon.textContent = ok ? '✓' : '✗';
        icon.className = 'quiz-sort-icon';
        row.appendChild(num); row.appendChild(block); row.appendChild(icon);
        container.appendChild(row);
      });

      if (!isCorrect) {
        const correctRow = document.createElement('div');
        correctRow.className = 'quiz-sort-solution';
        correctRow.innerHTML = '<p class="quiz-sort-solution__title">Правильний порядок:</p>' +
          q.correctOrder.map((idx, pos) => `<span>${pos+1}. ${_esc(q.items[idx])}</span>`).join('<br>');
        container.appendChild(correctRow);
      }

      onAnswer?.(isCorrect);
    });
    container.appendChild(checkBtn);
  };

  rebuild();
}

// ── sequence ───────────────────────────────────────────────────────────────

function renderSequence(q, container, onAnswer, preview, preselect = null) {
  // Рядок із заданою послідовністю
  const seq = document.createElement('div');
  seq.className = 'quiz-seq';
  q.given.forEach(item => {
    const chip = document.createElement('span');
    chip.className = 'quiz-seq-chip';
    chip.textContent = item;
    seq.appendChild(chip);
    const arrow = document.createElement('span');
    arrow.className = 'quiz-seq-arrow';
    arrow.textContent = '→';
    seq.appendChild(arrow);
  });
  const qmark = document.createElement('span');
  qmark.className = 'quiz-seq-qmark';
  qmark.textContent = '?';
  seq.appendChild(qmark);
  container.appendChild(seq);

  // Варіанти
  let answered = false;
  // correct може бути відсутнім (олімпіадний режим — сервер перевіряє)
  const hasCorrect = q.correct != null && !Number.isNaN(Number(q.correct));
  const seqCorrect = hasCorrect ? Number(q.correct) : -1;
  const seqBtns = [];
  q.choices.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = CLS.optionBtn;
    btn.textContent = opt;
    prepareRadioOption(btn);
    seqBtns.push(btn);

    if (preview) {
      btn.disabled = true;
      btn.style.cursor = 'default';
      if (i === seqCorrect) markCorrect(btn);
    } else {
      btn.addEventListener('click', () => {
        if (answered) return;
        answered = true;
        setRadioSelection(seqBtns, btn);
        seqBtns.forEach(b => b.disabled = true);
        if (hasCorrect) {
          const isCorrect = i === seqCorrect;
          isCorrect ? markCorrect(btn) : markIncorrect(btn);
          if (!isCorrect) markCorrect(seqBtns[seqCorrect]);
          onAnswer?.(isCorrect);
        } else {
          // Олімпіадний режим: зберігаємо індекс, правильність перевіряє сервер
          btn.classList.add('quiz-option--selected');
          onAnswer?.(i);
        }
      });
    }

    container.appendChild(btn);
  });

  // Повернення: підсвітити раніше обраний варіант.
  if (!preview && preselect != null && seqBtns[Number(preselect)]) {
    seqBtns[Number(preselect)].classList.add('quiz-option--selected');
    setRadioSelection(seqBtns, seqBtns[Number(preselect)]);
  }
}

// ── match ──────────────────────────────────────────────────────────────────

function renderMatch(q, container, onAnswer, preview, preselect = null) {
  if (preview) {
    q.left.forEach((l, i) => {
      const row = document.createElement('div');
      row.className = 'quiz-match-row';
      row.innerHTML = `<span class="quiz-match-left">${_esc(l)}</span><span class="quiz-match-arrow">→</span><span class="quiz-match-left quiz-match-left--correct">${_esc(q.right[q.pairs[i]] ?? '?')}</span>`;
      container.appendChild(row);
    });
    return;
  }

  const shuffled = q.right.map((item, index) => ({ item, index })).sort(() => Math.random() - 0.5);
  let answered = false;

  q.left.forEach((leftItem) => {
    const row = document.createElement('div');
    row.className = 'quiz-match-row';

    const leftEl = document.createElement('div');
    leftEl.className = 'quiz-match-left';
    leftEl.textContent = leftItem;

    const arrow = document.createElement('span');
    arrow.className = 'quiz-match-arrow';
    arrow.textContent = '→';

    const select = document.createElement('select');
    select.className = 'quiz-select';
    select.setAttribute('aria-label', `Пара для "${leftItem}"`);

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Обери…';
    select.appendChild(placeholder);
    shuffled.forEach(({ item, index }) => {
      const opt = document.createElement('option');
      opt.value = String(index);
      opt.textContent = item;
      select.appendChild(opt);
    });

    row.appendChild(leftEl); row.appendChild(arrow); row.appendChild(select);
    container.appendChild(row);
  });

  // Повернення: відновити раніше обрані пари.
  if (!preview && Array.isArray(preselect)) {
    const selects = container.querySelectorAll('select');
    preselect.forEach((val, i) => { if (selects[i]) (selects[i] as HTMLSelectElement).value = String(val); });
  }

  const checkBtn = document.createElement('button');
  checkBtn.className = CLS.checkBtn;
  checkBtn.textContent = 'Перевірити';
  checkBtn.addEventListener('click', () => {
    if (answered) return;
    const selects = [...container.querySelectorAll('select')];
    if (selects.some(s => !s.value)) return;
    answered = true;

    // Олімпіадний режим: pairs стрипнуто сервером → оцінює сервер.
    // Зберігаємо вибір учня як масив індексів правого стовпця (за оригінальним q.right).
    if (!Array.isArray(q.pairs)) {
      const chosen = selects.map(sel => Number(sel.value));
      selects.forEach(sel => {
        sel.disabled = true;
        sel.classList.add('quiz-option--selected');
      });
      onAnswer?.(chosen);
      return;
    }

    let allCorrect = true;
    selects.forEach((sel, i) => {
      const ok = Number(sel.value) === q.pairs[i];
      if (!ok) allCorrect = false;
      sel.disabled = true;
      const leftEl = sel.parentElement.querySelector('div');
      leftEl.classList.add(ok ? 'quiz-match-left--correct' : 'quiz-match-left--incorrect');
      sel.classList.add(ok ? 'quiz-select--correct' : 'quiz-select--incorrect');
    });
    onAnswer?.(allCorrect);
  });
  container.appendChild(checkBtn);
}

// ── Утіліта ────────────────────────────────────────────────────────────────

function _esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
