import { validateStudentCode, getStoredStudentCode } from './features/auth/student-code-auth.js';
import { findActiveEvent, checkSession, startSession, finishSession } from './features/olympiad/session.js';
import { saveOlympiadResult } from './features/olympiad/results.js';
import { loadQuestions, getModeConfig } from './features/olympiad/quiz-engine.js';

// --- Модальне вікно ---
const appModal = document.getElementById('app-modal');
document.getElementById('modal-ok-btn').addEventListener('click', () => appModal.classList.add('hidden'));
function showModal(msg) {
  document.getElementById('modal-message').textContent = msg;
  appModal.classList.remove('hidden');
}

// --- DOM: екрани ---
const screenEntry   = document.getElementById('screen-entry');
const screenActions = document.getElementById('screen-actions');

// --- DOM: вхід за кодом ---
const codeForm      = document.getElementById('student-code-form');
const codeInput     = document.getElementById('student-code-input');
const codeStatus    = document.getElementById('code-status');
const codeSuccess   = document.getElementById('code-success');
const codeSubmitBtn = document.getElementById('code-submit-btn');
const codeClearBtn  = document.getElementById('code-clear-btn');

// --- DOM: тренування ---
const gradeButtons      = document.querySelectorAll('.grade-btn');
const diffButtons       = document.querySelectorAll('.diff-btn');
const startPracticeBtn  = document.getElementById('start-practice-btn');

// --- Тренування: показати/сховати ---
document.getElementById('show-practice-btn').addEventListener('click', () => {
  const s = document.getElementById('practice-section');
  s.classList.toggle('hidden');
});

// --- DOM: quiz overlay ---
const quizOverlay     = document.getElementById('quiz-overlay');
const quizModeBadge   = document.getElementById('quiz-mode-badge');
const quizProgressTxt = document.getElementById('quiz-progress-text');
const quizProgressBar = document.getElementById('quiz-progress-bar');
const quizTimer       = document.getElementById('quiz-timer');
const quizTimerDisplay= document.getElementById('quiz-timer-display');
const quizQuestionEl  = document.getElementById('quiz-question-text');
const quizOptionsEl   = document.getElementById('quiz-options');
const quizFeedback    = document.getElementById('quiz-feedback');
const quizExplanation = document.getElementById('quiz-explanation');
const quizNextBtn     = document.getElementById('quiz-next-btn');
const quizQuitBtn     = document.getElementById('quiz-quit-btn');

// --- DOM: result overlay ---
const resultOverlay   = document.getElementById('result-overlay');
const resultTitle     = document.getElementById('result-title');
const resultModeLabel = document.getElementById('result-mode-label');
const resultScore     = document.getElementById('result-score');
const resultTotal     = document.getElementById('result-total');
const resultTime      = document.getElementById('result-time');
const resultSavedMsg  = document.getElementById('result-saved-msg');
const resultErrorMsg  = document.getElementById('result-error-msg');
const resultCloseBtn  = document.getElementById('result-close-btn');

// --- DOM: quit confirm ---
const quitConfirm    = document.getElementById('quit-confirm');
const quitConfirmYes = document.getElementById('quit-confirm-yes');
const quitConfirmNo  = document.getElementById('quit-confirm-no');

// --- Стан ---
let studentData   = null; // { code, grade, classId, teacherUid }
let selectedGrade = null;
let selectedDiff  = null;

// Quiz state
let questions    = [];
let currentIdx   = 0;
let score        = 0;
let answered     = false;
let timerInterval= null;
let secondsLeft  = 0;
let startedAt    = null;
let currentMode  = null;
let currentSessionId = null;

// ===================== ВІДНОВЛЕННЯ СЕСІЇ =====================

const storedCode = getStoredStudentCode();
if (storedCode) {
  showScreenActions(storedCode);
  // Блокуємо кнопки до завершення відновлення — studentData ще null
  document.getElementById('start-olympiad-btn').disabled = true;
  document.getElementById('start-demo-btn').disabled = true;

  validateStudentCode(storedCode)
    .then(data => {
      studentData = data;
      document.getElementById('start-olympiad-btn').disabled = false;
      document.getElementById('start-demo-btn').disabled = false;
      showActiveEventInfo(data.grade);
    })
    .catch(() => {
      showScreenEntry();
      codeStatus.textContent = 'Код більше не активний. Зверніться до вчителя.';
    });
}

// ===================== ВХІД ЗА КОДОМ =====================

codeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = codeInput.value.trim().toUpperCase();
  if (!code) { codeStatus.textContent = 'Введи код учня.'; return; }

  codeStatus.textContent = '';
  codeSubmitBtn.disabled = true;
  codeSubmitBtn.textContent = 'Перевірка…';

  try {
    studentData = await validateStudentCode(code);
    showScreenActions(code);
    showActiveEventInfo(studentData.grade);
  } catch (err) {
    codeStatus.textContent = err.message;
    codeSubmitBtn.disabled = false;
    codeSubmitBtn.textContent = 'Увійти →';
  }
});

function clearCode() {
  codeInput.value = '';
  codeInput.disabled = false;
  codeStatus.textContent = '';
  codeSuccess.textContent = '';
  codeSubmitBtn.disabled = false;
  codeSubmitBtn.textContent = 'Увійти →';
  studentData = null;
  showScreenEntry();
  codeInput.focus();
}

codeClearBtn.addEventListener('click', clearCode);
document.getElementById('code-clear-btn-2').addEventListener('click', clearCode);

// ===================== ЗАПУСК ОЛІМПІАДИ / ДЕМО =====================

document.getElementById('start-demo-btn').addEventListener('click', () => launchOlympiad('demo'));
document.getElementById('start-olympiad-btn').addEventListener('click', () => launchOlympiad('olympiad'));

async function launchOlympiad(mode) {
  const code = getStoredStudentCode();
  if (!code) { showModal('Спочатку введи код учня.'); return; }

  const btn = mode === 'olympiad'
    ? document.getElementById('start-olympiad-btn')
    : document.getElementById('start-demo-btn');
  btn.disabled = true;
  btn.textContent = 'Завантаження…';

  try {
    if (!studentData) throw new Error('Зачекай, дані завантажуються. Спробуй ще раз.');
    const grade      = studentData.grade;
    const teacherUid = studentData.teacherUid;
    // eventId береться з коду учня — не шукаємо окремо
    const codeEventId = studentData.eventId ?? null;

    // Знайти активну подію для параметрів (час, кількість питань)
    const event   = codeEventId
      ? await findActiveEvent(grade)   // беремо параметри з будь-якої активної або null
      : null;
    const eventId = codeEventId ?? event?.id ?? 'demo';

    if (mode === 'olympiad') {
      if (!codeEventId) throw new Error('Цей код не прив\'язаний до жодної олімпіади. Зверніться до вчителя.');
      const session = await checkSession(code, eventId);
      if (session?.status === 'completed' && !session?.retryAllowed) {
        throw new Error('Ти вже пройшов цю олімпіаду. Повторна спроба не дозволена.');
      }
      currentSessionId = await startSession(code, eventId, teacherUid, grade);
    }

    const cfg = getModeConfig(mode, event);
    const qs  = await loadQuestions(grade, mode, cfg.count);
    startQuiz(qs, mode, cfg, { code, eventId, teacherUid, grade, event });
  } catch (err) {
    showModal(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = mode === 'olympiad' ? 'Основна олімпіада' : 'Демо-версія';
  }
}

// ===================== ТРЕНУВАННЯ =====================

gradeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    gradeButtons.forEach(b => { b.classList.remove('bg-amber-100', 'border-amber-400'); b.setAttribute('aria-pressed', 'false'); });
    btn.classList.add('bg-amber-100', 'border-amber-400');
    btn.setAttribute('aria-pressed', 'true');
    selectedGrade = Number(btn.dataset.grade);
    updateStartBtn();
  });
});

diffButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    diffButtons.forEach(b => { b.classList.remove('bg-amber-100', 'border-amber-400'); b.setAttribute('aria-pressed', 'false'); });
    btn.classList.add('bg-amber-100', 'border-amber-400');
    btn.setAttribute('aria-pressed', 'true');
    selectedDiff = btn.dataset.difficulty;
    updateStartBtn();
  });
});

function updateStartBtn() {
  startPracticeBtn.disabled = !(selectedGrade && selectedDiff);
}

startPracticeBtn.addEventListener('click', async () => {
  startPracticeBtn.disabled = true;
  startPracticeBtn.textContent = 'Завантаження…';
  try {
    const cfg = getModeConfig('practice');
    const qs  = await loadQuestions(selectedGrade, 'practice', cfg.count);
    // Для тренування фільтруємо ще й по складності якщо вибрано
    const filtered = selectedDiff
      ? qs.filter(q => q.difficulty === selectedDiff).slice(0, cfg.count)
      : qs;
    if (filtered.length === 0) throw new Error('Питань для цих налаштувань немає.');
    startQuiz(filtered, 'practice', cfg, { grade: selectedGrade });
  } catch (err) {
    showModal(err.message);
  } finally {
    startPracticeBtn.disabled = false;
    startPracticeBtn.textContent = 'Почати тренування';
  }
});

// ===================== QUIZ ENGINE =====================

function startQuiz(qs, mode, cfg, meta) {
  questions    = qs;
  currentIdx   = 0;
  score        = 0;
  answered     = false;
  currentMode  = mode;
  startedAt    = Date.now();
  Object.assign(startQuiz, { meta }); // зберігаємо мета для збереження результату

  // Бейдж режиму
  const labels = { practice: 'Тренування', demo: 'Демо', olympiad: 'Олімпіада' };
  const colors  = { practice: 'bg-amber-100 text-amber-700', demo: 'bg-sky-100 text-sky-700', olympiad: 'bg-rose-100 text-rose-700' };
  quizModeBadge.textContent = labels[mode];
  quizModeBadge.className = `text-xs font-bold px-3 py-1 rounded-full ${colors[mode]}`;

  // Таймер
  clearInterval(timerInterval);
  if (cfg.timeMinutes) {
    secondsLeft = cfg.timeMinutes * 60;
    quizTimer.classList.remove('hidden');
    quizTimer.classList.add('flex');
    updateTimerDisplay();
    timerInterval = setInterval(() => {
      secondsLeft--;
      updateTimerDisplay();
      if (secondsLeft <= 0) finishQuiz(true);
    }, 1000);
  } else {
    quizTimer.classList.add('hidden');
    quizTimer.classList.remove('flex');
  }

  showOverlay(quizOverlay);
  showQuestion();
}

function showQuestion() {
  const q = questions[currentIdx];
  answered = false;

  quizProgressTxt.textContent = `${currentIdx + 1} / ${questions.length}`;
  quizProgressBar.style.width = `${(currentIdx / questions.length) * 100}%`;
  quizQuestionEl.textContent = q.q;

  const codeBlock = document.getElementById('quiz-code-block');
  if (q.code) {
    codeBlock.textContent = q.code;
    codeBlock.classList.remove('hidden');
  } else {
    codeBlock.classList.add('hidden');
  }

  quizFeedback.textContent = '';
  quizExplanation.textContent = '';
  quizExplanation.classList.add('hidden');
  quizNextBtn.classList.add('hidden');
  quizOptionsEl.innerHTML = '';

  const type = q.type ?? 'choice';
  if (type === 'sort' || type === 'algorithm') renderSort(q);
  else if (type === 'sequence') renderSequence(q);
  else renderChoice(q);
}

// ── Рендерери ─────────────────────────────────────────────────────────────

function renderChoice(q) {
  q.a.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'btn w-full text-left px-5 py-5 rounded-2xl border-2 border-slate-200 bg-white text-slate-800 font-semibold text-base hover:border-violet-400 hover:bg-violet-50 transition-all';
    btn.textContent = opt;
    btn.addEventListener('click', () => {
      if (answered) return;
      answered = true;
      if (i === q.correct) score++;
      const opts = quizOptionsEl.querySelectorAll('button');
      opts.forEach(b => b.disabled = true);
      opts[i].classList.remove('border-slate-200','bg-white');
      opts[i].classList.add(...(i === q.correct ? ['border-emerald-400','bg-emerald-50'] : ['border-rose-400','bg-rose-50']));
      opts[q.correct].classList.remove('border-slate-200','bg-white');
      opts[q.correct].classList.add('border-emerald-400','bg-emerald-50');
      showFeedback(i === q.correct, q);
    });
    quizOptionsEl.appendChild(btn);
  });
}

function renderSequence(q) {
  // q.choices — масив варіантів, q.correct — індекс правильного
  q.choices.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'btn w-full text-left px-5 py-5 rounded-2xl border-2 border-slate-200 bg-white text-slate-800 font-semibold text-base hover:border-violet-400 hover:bg-violet-50 transition-all';
    btn.textContent = opt;
    btn.addEventListener('click', () => {
      if (answered) return;
      answered = true;
      const isCorrect = i === q.correct;
      if (isCorrect) score++;
      const opts = quizOptionsEl.querySelectorAll('button');
      opts.forEach(b => b.disabled = true);
      opts[i].classList.remove('border-slate-200','bg-white');
      opts[i].classList.add(...(isCorrect ? ['border-emerald-400','bg-emerald-50'] : ['border-rose-400','bg-rose-50']));
      opts[q.correct].classList.remove('border-slate-200','bg-white');
      opts[q.correct].classList.add('border-emerald-400','bg-emerald-50');
      showFeedback(isCorrect, q);
    });
    quizOptionsEl.appendChild(btn);
  });

  // Показуємо задану послідовність над варіантами
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
  quizOptionsEl.insertBefore(seq, quizOptionsEl.firstChild);
}

function renderSort(q) {
  // order[pos] = індекс елемента q.items який зараз на позиції pos
  const order = [...q.items.keys()].sort(() => Math.random() - 0.5);

  const rebuild = () => {
    quizOptionsEl.innerHTML = '';

    order.forEach((itemIdx, pos) => {
      const row = document.createElement('div');
      row.className = 'flex items-center gap-3';

      const num = document.createElement('span');
      num.className = 'text-slate-400 font-bold w-6 text-right flex-shrink-0 text-base';
      num.textContent = pos + 1 + '.';

      const block = document.createElement('div');
      block.className = 'flex-1 bg-white border-2 border-slate-200 rounded-2xl px-5 py-4 text-slate-800 font-semibold text-base';
      block.textContent = q.items[itemIdx];

      const arrows = document.createElement('div');
      arrows.className = 'flex flex-col gap-1 flex-shrink-0';

      const up = document.createElement('button');
      up.className = 'w-10 h-10 rounded-xl bg-slate-100 hover:bg-violet-100 hover:text-violet-600 text-slate-500 font-bold text-lg flex items-center justify-center';
      up.textContent = '↑';
      if (pos === 0) up.classList.add('invisible');
      up.addEventListener('click', () => { [order[pos], order[pos-1]] = [order[pos-1], order[pos]]; rebuild(); });

      const dn = document.createElement('button');
      dn.className = 'w-10 h-10 rounded-xl bg-slate-100 hover:bg-violet-100 hover:text-violet-600 text-slate-500 font-bold text-lg flex items-center justify-center';
      dn.textContent = '↓';
      if (pos === order.length - 1) dn.classList.add('invisible');
      dn.addEventListener('click', () => { [order[pos], order[pos+1]] = [order[pos+1], order[pos]]; rebuild(); });

      arrows.appendChild(up);
      arrows.appendChild(dn);
      row.appendChild(num);
      row.appendChild(block);
      row.appendChild(arrows);
      quizOptionsEl.appendChild(row);
    });

    // Кнопка перевірки
    const checkBtn = document.createElement('button');
    checkBtn.className = 'btn w-full px-5 py-4 rounded-2xl bg-violet-500 hover:bg-violet-600 text-white font-bold text-base mt-2';
    checkBtn.textContent = 'Перевірити';
    checkBtn.addEventListener('click', () => {
      if (answered) return;
      answered = true;

      const isCorrect = q.correctOrder.every((correctItemIdx, pos) => order[pos] === correctItemIdx);
      if (isCorrect) score++;

      // Перемальовуємо з підсвіткою
      quizOptionsEl.innerHTML = '';
      order.forEach((itemIdx, pos) => {
        const ok = q.correctOrder[pos] === itemIdx;
        const row = document.createElement('div');
        row.className = 'flex items-center gap-3';
        const num = document.createElement('span');
        num.className = 'text-slate-400 font-bold w-6 text-right flex-shrink-0 text-base';
        num.textContent = pos + 1 + '.';
        const block = document.createElement('div');
        block.className = `flex-1 border-2 rounded-2xl px-5 py-4 font-semibold text-base ${ok ? 'bg-emerald-50 border-emerald-400 text-emerald-800' : 'bg-rose-50 border-rose-400 text-rose-800'}`;
        block.textContent = q.items[itemIdx];
        const icon = document.createElement('span');
        icon.textContent = ok ? '✓' : '✗';
        icon.className = 'text-xl flex-shrink-0';
        row.appendChild(num);
        row.appendChild(block);
        row.appendChild(icon);
        quizOptionsEl.appendChild(row);
      });

      // Якщо неправильно — показуємо правильний порядок
      if (!isCorrect) {
        const correctRow = document.createElement('div');
        correctRow.className = 'mt-2 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl';
        correctRow.innerHTML = '<p class="text-xs text-emerald-700 font-semibold mb-1">Правильний порядок:</p>' +
          q.correctOrder.map((idx, pos) => `<span class="text-xs text-emerald-800">${pos+1}. ${q.items[idx]}</span>`).join('<br>');
        quizOptionsEl.appendChild(correctRow);
      }

      showFeedback(isCorrect, q);
    });
    quizOptionsEl.appendChild(checkBtn);
  };

  rebuild();
}

// ── Спільний фідбек ────────────────────────────────────────────────────────

function showFeedback(isCorrect, q) {
  quizFeedback.textContent = isCorrect ? '✓ Правильно!' : '✗ Неправильно';
  quizFeedback.className = `font-semibold text-base mb-2 ${isCorrect ? 'text-emerald-600' : 'text-rose-600'}`;
  const cfg = getModeConfig(currentMode);
  if (cfg.showExplanation && q.explanation) {
    quizExplanation.textContent = q.explanation;
    quizExplanation.classList.remove('hidden');
  }
  quizNextBtn.classList.remove('hidden');
  quizNextBtn.textContent = currentIdx + 1 < questions.length ? 'Далі' : 'Завершити';
}

quizNextBtn.addEventListener('click', () => {
  currentIdx++;
  if (currentIdx < questions.length) {
    showQuestion();
  } else {
    finishQuiz(false);
  }
});

async function finishQuiz(timeUp) {
  clearInterval(timerInterval);
  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  hideOverlay(quizOverlay);

  // Показуємо результат
  const labels = { practice: 'Тренування', demo: 'Демо-версія', olympiad: 'Олімпіада' };
  resultModeLabel.textContent = labels[currentMode];
  resultTitle.textContent = timeUp ? 'Час вийшов!' : (score >= questions.length * 0.8 ? 'Відмінно!' : score >= questions.length * 0.5 ? 'Добре!' : 'Спробуй ще!');
  resultScore.textContent = score;
  resultTotal.textContent = questions.length;
  resultTime.textContent = `Час: ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
  resultSavedMsg.classList.add('hidden');
  resultErrorMsg.classList.add('hidden');
  showOverlay(resultOverlay);

  // Зберігаємо результат якщо олімпіада
  if (currentMode === 'olympiad' && currentSessionId) {
    const meta = startQuiz.meta;
    try {
      await saveOlympiadResult({
        eventId: meta.eventId,
        studentCode: meta.code,
        teacherUid: meta.teacherUid,
        grade: meta.grade,
        score,
        totalQuestions: questions.length,
        timeSpentSeconds: elapsed,
        penalizedCount: 0,
        sessionId: currentSessionId
      });
      await finishSession(currentSessionId);
      resultSavedMsg.classList.remove('hidden');
    } catch (err) {
      resultErrorMsg.textContent = `Помилка збереження: ${err.message}`;
      resultErrorMsg.classList.remove('hidden');
    }
    currentSessionId = null;
  }
}

// ===================== ВИХІД З ТЕСТУ =====================

quizQuitBtn.addEventListener('click', () => showOverlay(quitConfirm));
quitConfirmNo.addEventListener('click', () => hideOverlay(quitConfirm));
quitConfirmYes.addEventListener('click', () => {
  clearInterval(timerInterval);
  hideOverlay(quitConfirm);
  hideOverlay(quizOverlay);
  if (currentSessionId) finishSession(currentSessionId).catch(() => {});
  currentSessionId = null;
});

resultCloseBtn.addEventListener('click', () => {
  hideOverlay(resultOverlay);
});

// ===================== УТИЛІТИ =====================

function updateTimerDisplay() {
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  quizTimerDisplay.textContent = `${m}:${String(s).padStart(2, '0')}`;
  if (secondsLeft <= 60) {
    quizTimer.classList.remove('bg-orange-100', 'text-orange-700');
    quizTimer.classList.add('bg-rose-100', 'text-rose-700');
  }
}

function showOverlay(el) { el.classList.remove('hidden'); el.classList.add('flex'); }
function hideOverlay(el) { el.classList.add('hidden'); el.classList.remove('flex'); }

function showScreenEntry() {
  screenActions.classList.add('hidden');
  screenEntry.classList.remove('hidden');
}

function showScreenActions(code) {
  screenEntry.classList.add('hidden');
  screenActions.classList.remove('hidden');
  // Показуємо код в полі для контексту (якщо потрібно)
  const successEl = document.getElementById('code-success');
  if (successEl) { successEl.textContent = `Код: ${code}`; }
}

async function showActiveEventInfo(grade) {
  const infoBox   = document.getElementById('active-event-info');
  const titleEl   = document.getElementById('active-event-title');
  const metaEl    = document.getElementById('active-event-meta');
  const olympiadBtn = document.getElementById('start-olympiad-btn');

  try {
    const event = await findActiveEvent(grade);
    if (event) {
      titleEl.textContent = `🏆 ${event.title}`;
      metaEl.textContent  = `${event.questionsCount} питань · ${event.timeMinutes} хв`;
      infoBox.classList.remove('hidden');
      olympiadBtn.classList.remove('opacity-40');
    } else {
      // Немає активної події — деактивуємо кнопку олімпіади
      olympiadBtn.classList.add('opacity-40');
      olympiadBtn.title = 'Зараз немає активної олімпіади';
    }
  } catch {
    // Firestore недоступний — не показуємо нічого зайвого
  }
}
