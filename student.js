import { validateStudentCode, startAnonymousSession, getStoredStudentCode } from './features/auth/student-code-auth.js';

const codeForm = document.getElementById('student-code-form');
const codeInput = document.getElementById('student-code-input');
const codeStatus = document.getElementById('code-status');
const codeSuccess = document.getElementById('code-success');
const codeSubmitBtn = document.getElementById('code-submit-btn');
const codeClearBtn = document.getElementById('code-clear-btn');
const olympiadActions = document.getElementById('olympiad-actions');

const gradeButtons = document.querySelectorAll('.grade-btn');
const diffButtons = document.querySelectorAll('.diff-btn');
const startPracticeBtn = document.getElementById('start-practice-btn');

let selectedGrade = null;
let selectedDifficulty = null;
let validatedStudentData = null;

// --- Відновити сесію якщо код вже введений ---

const storedCode = getStoredStudentCode();
if (storedCode) {
  codeInput.value = storedCode;
  codeInput.disabled = true;
  codeSubmitBtn.classList.add('hidden');
  codeClearBtn.classList.remove('hidden');
  codeSuccess.textContent = `Код підтверджено: ${storedCode}`;
  codeSuccess.classList.remove('hidden');
  olympiadActions.classList.remove('hidden');
}

// --- Вхід за кодом ---

codeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = codeInput.value.trim().toUpperCase();
  if (!code) { codeStatus.textContent = 'Введи код учня.'; return; }

  codeStatus.textContent = '';
  codeSubmitBtn.disabled = true;
  codeSubmitBtn.textContent = 'Перевірка…';

  try {
    validatedStudentData = await validateStudentCode(code);
    await startAnonymousSession(code);

    codeInput.disabled = true;
    codeSubmitBtn.classList.add('hidden');
    codeClearBtn.classList.remove('hidden');
    codeSuccess.textContent = `Код підтверджено: ${code} (${validatedStudentData.grade} клас)`;
    codeSuccess.classList.remove('hidden');
    olympiadActions.classList.remove('hidden');
  } catch (err) {
    codeStatus.textContent = err.message || 'Помилка перевірки коду.';
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
  validatedStudentData = null;
  codeInput.focus();
});

document.getElementById('start-demo-btn').addEventListener('click', () => {
  // TODO Фаза 2: запустити демо-версію олімпіади
  alert('Демо-версія — у розробці (Фаза 2)');
});

document.getElementById('start-olympiad-btn').addEventListener('click', () => {
  // TODO Фаза 2: перевірити olympiad_sessions і запустити основну олімпіаду
  alert('Основна олімпіада — у розробці (Фаза 2)');
});

// --- Тренування ---

gradeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    gradeButtons.forEach(b => { b.classList.remove('bg-amber-100', 'border-amber-400'); b.setAttribute('aria-pressed', 'false'); });
    btn.classList.add('bg-amber-100', 'border-amber-400');
    btn.setAttribute('aria-pressed', 'true');
    selectedGrade = Number(btn.dataset.grade);
    updateStartButton();
  });
});

diffButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    diffButtons.forEach(b => { b.classList.remove('bg-amber-100', 'border-amber-400'); b.setAttribute('aria-pressed', 'false'); });
    btn.classList.add('bg-amber-100', 'border-amber-400');
    btn.setAttribute('aria-pressed', 'true');
    selectedDifficulty = btn.dataset.difficulty;
    updateStartButton();
  });
});

function updateStartButton() {
  startPracticeBtn.disabled = !(selectedGrade && selectedDifficulty);
}

startPracticeBtn.addEventListener('click', () => {
  // TODO Фаза 2: запустити тренувальний тест
  alert(`Тренування: ${selectedGrade} клас, ${selectedDifficulty} — у розробці (Фаза 2)`);
});
