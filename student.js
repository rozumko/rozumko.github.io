import { validateStudentCode, getStoredStudentCode } from './features/auth/student-code-auth.js';
import { findActiveEvent, checkSession, startSession, finishSession } from './features/olympiad/session.js';
import { saveOlympiadResult } from './features/olympiad/results.js';
import { loadQuestions, getModeConfig } from './features/olympiad/quiz-engine.js';
import { renderQuestion } from './utils/question-renderer.js';
import { showModal }      from './utils/ui.js';

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
  document.getElementById('code-card').classList.add('hidden');
  document.getElementById('practice-section').classList.remove('hidden');
});
document.getElementById('hide-practice-btn').addEventListener('click', () => {
  document.getElementById('practice-section').classList.add('hidden');
  document.getElementById('code-card').classList.remove('hidden');
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

// --- Lightbox ---
const quizImage    = document.getElementById('quiz-image');
const imgLightbox  = document.getElementById('img-lightbox');
const imgLightboxImg = document.getElementById('img-lightbox-img');

function openLightbox(src, alt) {
  imgLightboxImg.src = src;
  imgLightboxImg.alt = alt || '';
  imgLightbox.classList.remove('hidden');
  imgLightbox.focus();
}
function closeLightbox() {
  imgLightbox.classList.add('hidden');
  imgLightboxImg.src = '';
}
imgLightbox.addEventListener('click', (e) => {
  if (e.target === imgLightbox || e.target === document.getElementById('img-lightbox-close') || e.target.closest('#img-lightbox-close')) closeLightbox();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !imgLightbox.classList.contains('hidden')) closeLightbox();
});

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

// ===================== ERROR BOUNDARY =====================
// Глобальний перехоплювач критичних помилок.
// Захищає учня від білого екрану при несподіваних збоях під час квізу.

/**
 * Показати error boundary overlay з повідомленням.
 * Якщо є активний backup олімпіади — виводить дані для вчителя.
 *
 * @param {string} [msg] — опціональне технічне повідомлення (для логування)
 */
function showErrorBoundary(msg = '') {
  try {
    const overlay = document.getElementById('error-boundary');
    if (!overlay) return; // якщо DOM ще не готовий — нічого не робимо

    // Перевіряємо чи є backup олімпіади — якщо так, показуємо дані для вчителя
    const backupDiv  = document.getElementById('error-boundary-backup');
    const backupText = document.getElementById('error-boundary-backup-text');
    try {
      const raw = localStorage.getItem('rozumko_quiz_backup');
      if (raw) {
        const b = JSON.parse(raw);
        // Показуємо backup тільки якщо він актуальний (менше 3 годин)
        const fresh = b?.startedAt && Date.now() - b.startedAt < 3 * 60 * 60 * 1000;
        if (fresh && b.meta?.code) {
          backupText.textContent =
            `Код: ${b.meta.code} · Результат на момент збою: ${b.score ?? '?'}/${b.meta?.totalQuestions ?? '?'}`;
          backupDiv.classList.remove('hidden');
        }
      }
    } catch { /* ігноруємо помилки localStorage */ }

    overlay.classList.remove('hidden');
    // Зупиняємо таймер квізу якщо він іде — щоб час не спливав поки учень бачить помилку
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    console.error('[Розумко] Критична помилка:', msg);
  } catch { /* якщо навіть error boundary зламався — мовчимо */ }
}

// Ловимо необроблені Promise-помилки (async functions без try/catch)
window.addEventListener('unhandledrejection', (event) => {
  // Ігноруємо помилки від Firebase App Check та зовнішніх скриптів
  const msg = event.reason?.message ?? String(event.reason ?? '');
  if (msg.includes('AppCheck') || msg.includes('recaptcha') || msg.includes('net::')) return;

  // Показуємо boundary тільки якщо квіз активний (є timerInterval або currentMode)
  // Для звичайних помилок входу/завантаження — є свої try/catch блоки
  if (currentMode && currentIdx > 0) {
    showErrorBoundary(msg);
    event.preventDefault(); // не логуємо в консоль двічі
  }
});

// Ловимо синхронні помилки JS (ReferenceError, TypeError тощо)
window.addEventListener('error', (event) => {
  const msg = `${event.message} (${event.filename}:${event.lineno})`;
  if (currentMode && currentIdx > 0) {
    showErrorBoundary(msg);
  }
});

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

// ===================== LOCALSTORAGE BACKUP =====================

const QUIZ_BACKUP_KEY = 'rozumko_quiz_backup';

function saveQuizBackup() {
  if (currentMode !== 'olympiad' || !currentSessionId) return;
  try {
    localStorage.setItem(QUIZ_BACKUP_KEY, JSON.stringify({
      sessionId:   currentSessionId,
      mode:        currentMode,
      currentIdx,
      score,
      secondsLeft,
      startedAt,
      meta:        startQuiz.meta,
      savedAt:     Date.now()
    }));
  } catch { /* localStorage недоступний */ }
}

function clearQuizBackup() {
  try { localStorage.removeItem(QUIZ_BACKUP_KEY); } catch { /* ігноруємо */ }
}

function getQuizBackup() {
  try {
    const raw = localStorage.getItem(QUIZ_BACKUP_KEY);
    if (!raw) return null;
    const b = JSON.parse(raw);
    // Ігноруємо бекап старший за 3 години
    if (Date.now() - b.savedAt > 3 * 60 * 60 * 1000) { clearQuizBackup(); return null; }
    return b;
  } catch { return null; }
}

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

  // Зображення
  if (q.img) {
    quizImage.src = q.img;
    quizImage.classList.remove('hidden');
    quizImage.onclick = () => openLightbox(q.img, q.q);
  } else {
    quizImage.classList.add('hidden');
    quizImage.src = '';
    quizImage.onclick = null;
  }

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
  quizOptionsEl.className = (type === 'choice')
    ? 'grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4'
    : type === 'truefalse'
      ? 'grid grid-cols-2 gap-4 mb-4'
      : 'flex flex-col gap-3 mb-4';

  renderQuestion(q, quizOptionsEl, {
    onAnswer: (isCorrect) => {
      answered = true;
      if (isCorrect) score++;
      showFeedback(isCorrect, q);
    },
  });
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
  saveQuizBackup();
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
      clearQuizBackup();
      resultSavedMsg.classList.remove('hidden');
    } catch (err) {
      // Результат не вдалось зберегти — повідомляємо учня що робити
      const backup = { score, total: questions.length, code: meta.code };
      try { localStorage.setItem(QUIZ_BACKUP_KEY + '_failed', JSON.stringify(backup)); } catch { /* ігноруємо */ }
      resultErrorMsg.innerHTML =
        `⚠️ Немає зв'язку — результат не збережено автоматично.<br>
         <strong>Скажи вчителю:</strong> код <strong>${meta.code}</strong>, результат <strong>${score}/${questions.length}</strong>.<br>
         <span class="text-xs opacity-70">Коли з'явиться інтернет — оновлення сторінки може відновити збереження.</span>`;
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
