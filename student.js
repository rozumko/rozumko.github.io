import { validateStudentCode, getStoredStudentCode } from './features/auth/student-code-auth.js';
import { findActiveEvent, checkSession, startSession, finishSession } from './features/olympiad/session.js';
import { saveOlympiadResult } from './features/olympiad/results.js';
import { loadQuestions, getModeConfig } from './features/olympiad/quiz-engine.js';

// --- DOM: вхід за кодом ---
const codeForm       = document.getElementById('student-code-form');
const codeInput      = document.getElementById('student-code-input');
const codeStatus     = document.getElementById('code-status');
const codeSuccess    = document.getElementById('code-success');
const codeSubmitBtn  = document.getElementById('code-submit-btn');
const codeClearBtn   = document.getElementById('code-clear-btn');
const olympiadActions= document.getElementById('olympiad-actions');

// --- DOM: тренування ---
const gradeButtons      = document.querySelectorAll('.grade-btn');
const diffButtons       = document.querySelectorAll('.diff-btn');
const startPracticeBtn  = document.getElementById('start-practice-btn');

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
  codeInput.value = storedCode;
  codeInput.disabled = true;
  codeSubmitBtn.classList.add('hidden');
  codeClearBtn.classList.remove('hidden');
  codeSuccess.textContent = `Код підтверджено: ${storedCode}`;
  codeSuccess.classList.remove('hidden');
  olympiadActions.classList.remove('hidden');

  // Блокуємо кнопки до завершення відновлення — studentData ще null
  document.getElementById('start-olympiad-btn').disabled = true;
  document.getElementById('start-demo-btn').disabled = true;

  // Відновлюємо studentData з Firestore щоб клас і teacherUid були правильними
  validateStudentCode(storedCode)
    .then(data => {
      studentData = data;
      document.getElementById('start-olympiad-btn').disabled = false;
      document.getElementById('start-demo-btn').disabled = false;
      showActiveEventInfo(data.grade);
    })
    .catch(() => {
      // Код міг бути деактивований — показуємо попередження
      codeSuccess.classList.add('hidden');
      codeStatus.textContent = 'Код більше не активний. Зверніться до вчителя.';
      olympiadActions.classList.add('hidden');
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

    codeInput.disabled = true;
    codeSubmitBtn.classList.add('hidden');
    codeClearBtn.classList.remove('hidden');
    codeSuccess.textContent = `Код підтверджено: ${code} (${studentData.grade} клас)`;
    codeSuccess.classList.remove('hidden');
    olympiadActions.classList.remove('hidden');
    showActiveEventInfo(studentData.grade);
  } catch (err) {
    codeStatus.textContent = err.message;
    codeSubmitBtn.disabled = false;
    codeSubmitBtn.textContent = 'Підтвердити код';
  }
});

codeClearBtn.addEventListener('click', () => {
  codeInput.value = '';
  codeInput.disabled = false;
  codeStatus.textContent = '';
  codeSuccess.textContent = '';
  codeSuccess.classList.add('hidden');
  codeClearBtn.classList.add('hidden');
  codeSubmitBtn.classList.remove('hidden');
  codeSubmitBtn.disabled = false;
  codeSubmitBtn.textContent = 'Підтвердити код';
  olympiadActions.classList.add('hidden');
  studentData = null;
  codeInput.focus();
});

// ===================== ЗАПУСК ОЛІМПІАДИ / ДЕМО =====================

document.getElementById('start-demo-btn').addEventListener('click', () => launchOlympiad('demo'));
document.getElementById('start-olympiad-btn').addEventListener('click', () => launchOlympiad('olympiad'));

async function launchOlympiad(mode) {
  const code = getStoredStudentCode();
  if (!code) { alert('Спочатку введи код учня.'); return; }

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
    alert(err.message);
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
    alert(err.message);
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
  quizFeedback.textContent = '';
  quizExplanation.textContent = '';
  quizExplanation.classList.add('hidden');
  quizNextBtn.classList.add('hidden');

  quizOptionsEl.innerHTML = '';
  q.a.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'btn w-full text-left px-4 py-3 rounded-2xl border-2 border-slate-200 bg-white text-slate-800 font-medium text-sm hover:border-sky-400 hover:bg-sky-50 transition-all';
    btn.textContent = opt;
    btn.addEventListener('click', () => selectAnswer(i, q));
    quizOptionsEl.appendChild(btn);
  });
}

function selectAnswer(idx, q) {
  if (answered) return;
  answered = true;

  const opts = quizOptionsEl.querySelectorAll('button');
  opts.forEach(b => b.disabled = true);

  const isCorrect = idx === q.correct;
  if (isCorrect) score++;

  opts[idx].className = opts[idx].className.replace('border-slate-200 bg-white', isCorrect ? 'border-emerald-400 bg-emerald-50' : 'border-rose-400 bg-rose-50');
  opts[q.correct].className = opts[q.correct].className.replace('border-slate-200 bg-white', 'border-emerald-400 bg-emerald-50');

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
