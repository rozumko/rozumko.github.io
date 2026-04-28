import { loginTeacher, registerTeacher, logoutTeacher, onTeacherAuthChanged } from './features/auth/teacher-auth.js';
import { createClass, getTeacherProfile, generateStudentCodes, getStudentsByClass, getMyResults } from './services/teacher-data.js';

// --- DOM ---
const authSection = document.getElementById('auth-section');
const dashboardSection = document.getElementById('dashboard-section');
const loginForm = document.getElementById('teacher-login-form');
const loginError = document.getElementById('login-error');
const loginSubmitBtn = document.getElementById('login-submit-btn');
const registerSection = document.getElementById('register-section');
const registerForm = document.getElementById('teacher-register-form');
const registerError = document.getElementById('register-error');
const showRegisterBtn = document.getElementById('show-register-btn');
const hideRegisterBtn = document.getElementById('hide-register-btn');
const logoutBtn = document.getElementById('logout-btn');
const teacherEmailDisplay = document.getElementById('teacher-email-display');
const classesList = document.getElementById('classes-list');
const classFormSection = document.getElementById('class-form-section');
const classForm = document.getElementById('class-form');
const classFormError = document.getElementById('class-form-error');
const createClassBtn = document.getElementById('create-class-btn');
const cancelClassBtn = document.getElementById('cancel-class-btn');
const resultsList = document.getElementById('results-list');

// --- Стан сесії ---

onTeacherAuthChanged(async (user) => {
  if (user) {
    showDashboard(user.email);
    await loadClasses();
    await loadResults();
  } else {
    showAuth();
  }
});

// --- Вкладки ---

document.querySelectorAll('.teacher-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.teacher-tab').forEach(t => t.classList.remove('tab-active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    tab.classList.add('tab-active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');
  });
});

// --- Вхід ---

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  loginError.textContent = '';
  loginSubmitBtn.disabled = true;
  loginSubmitBtn.textContent = 'Вхід…';
  try {
    await loginTeacher(email, password);
  } catch (err) {
    loginError.textContent = friendlyError(err.message);
    loginSubmitBtn.disabled = false;
    loginSubmitBtn.textContent = 'Увійти';
  }
});

showRegisterBtn.addEventListener('click', () => {
  registerSection.classList.remove('hidden');
  showRegisterBtn.classList.add('hidden');
});

hideRegisterBtn.addEventListener('click', () => {
  registerSection.classList.add('hidden');
  showRegisterBtn.classList.remove('hidden');
  registerError.textContent = '';
});

// --- Реєстрація ---

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('reg-email').value.trim();
  const school = document.getElementById('reg-school').value.trim();
  const password = document.getElementById('reg-password').value;
  if (password.length < 8) { registerError.textContent = 'Пароль має бути мінімум 8 символів.'; return; }
  registerError.textContent = '';
  const btn = document.getElementById('register-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Створення…';
  try {
    await registerTeacher(email, password, school);
  } catch (err) {
    registerError.textContent = friendlyError(err.message);
    btn.disabled = false;
    btn.textContent = 'Створити кабінет';
  }
});

// --- Вихід ---

logoutBtn.addEventListener('click', async () => { await logoutTeacher(); });

// --- Класи ---

createClassBtn.addEventListener('click', () => {
  classFormSection.classList.remove('hidden');
  createClassBtn.classList.add('hidden');
  document.getElementById('class-name-input').focus();
});

cancelClassBtn.addEventListener('click', () => {
  classFormSection.classList.add('hidden');
  createClassBtn.classList.remove('hidden');
  classForm.reset();
  classFormError.textContent = '';
});

classForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('class-name-input').value.trim();
  const grade = document.getElementById('class-grade-input').value;
  if (!name) { classFormError.textContent = 'Введи назву класу.'; return; }
  classFormError.textContent = '';
  const btn = classForm.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Створення…';
  try {
    await createClass(name, grade);
    classFormSection.classList.add('hidden');
    createClassBtn.classList.remove('hidden');
    classForm.reset();
    await loadClasses();
  } catch (err) {
    classFormError.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Створити';
  }
});

async function loadClasses() {
  const profile = await getTeacherProfile();
  const classes = profile.classes || [];
  if (classes.length === 0) {
    classesList.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400">
        <i class="fas fa-users text-4xl mb-3 block"></i>
        <p class="font-semibold">Класів ще немає</p>
        <p class="text-sm mt-1">Натисни «Новий клас», щоб почати.</p>
      </div>`;
    return;
  }
  classesList.innerHTML = '';
  for (const cls of classes) {
    const students = await getStudentsByClass(cls.id);
    classesList.appendChild(buildClassCard(cls, students));
  }
}

function buildClassCard(cls, students) {
  const template = document.getElementById('class-card-template');
  const card = template.content.cloneNode(true);
  const el = card.querySelector('div');

  el.querySelector('.class-card-name').textContent = cls.name;
  el.querySelector('.class-card-grade').textContent = `${cls.grade} клас`;
  el.querySelector('.class-card-count').textContent = `${students.length} учнів`;

  const header = el.querySelector('.class-card-header');
  const body = el.querySelector('.class-card-body');
  const chevron = el.querySelector('.class-card-chevron');
  const codesList = el.querySelector('.codes-list');
  const statusEl = el.querySelector('.generate-status');
  const copyAllBtn = el.querySelector('.copy-all-btn');

  header.addEventListener('click', () => {
    const open = !body.classList.contains('hidden');
    body.classList.toggle('hidden', open);
    chevron.classList.toggle('rotate-180', !open);
  });

  renderCodes(codesList, students, copyAllBtn);

  const generateBtn = el.querySelector('.generate-codes-btn');
  const countInput = el.querySelector('.codes-count-input');

  generateBtn.addEventListener('click', async () => {
    const count = Math.min(40, Math.max(1, Number(countInput.value) || 1));
    generateBtn.disabled = true;
    generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Генерація…';
    statusEl.textContent = '';
    try {
      const newCodes = await generateStudentCodes(cls.id, cls.grade, count);
      const updated = await getStudentsByClass(cls.id);
      el.querySelector('.class-card-count').textContent = `${updated.length} учнів`;
      renderCodes(codesList, updated, copyAllBtn);
      statusEl.textContent = `✓ Додано ${newCodes.length} кодів`;
      statusEl.className = 'generate-status text-sm mb-3 text-emerald-600';
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.className = 'generate-status text-sm mb-3 text-rose-600';
    } finally {
      generateBtn.disabled = false;
      generateBtn.innerHTML = '<i class="fas fa-key mr-1"></i> Згенерувати коди';
    }
  });

  copyAllBtn.addEventListener('click', () => {
    const allCodes = students.map(s => s.code).join('\n');
    navigator.clipboard.writeText(allCodes).then(() => {
      copyAllBtn.textContent = '✓ Скопійовано';
      setTimeout(() => { copyAllBtn.innerHTML = '<i class="fas fa-copy mr-1"></i> Копіювати всі'; }, 2000);
    });
  });

  return el;
}

function renderCodes(container, students, copyAllBtn) {
  container.innerHTML = '';
  if (students.length === 0) return;
  const template = document.getElementById('code-chip-template');
  students.forEach(s => {
    const chip = template.content.cloneNode(true).querySelector('div');
    chip.querySelector('.code-value').textContent = s.code;
    const statusBadge = chip.querySelector('.code-status');
    if (s.isActive) {
      statusBadge.textContent = 'активний';
      statusBadge.className = 'code-status text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700';
    } else {
      statusBadge.textContent = 'вимкнений';
      statusBadge.className = 'code-status text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-500';
      chip.classList.add('opacity-50');
    }
    container.appendChild(chip);
  });
  copyAllBtn.classList.remove('hidden');
}

// --- Результати ---

async function loadResults() {
  try {
    const results = await getMyResults();
    if (results.length === 0) return;
    resultsList.innerHTML = '';
    results.forEach(r => {
      const row = document.createElement('div');
      row.className = 'bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between gap-4';
      row.innerHTML = `
        <div>
          <p class="font-bold text-slate-900">${r.studentCode}</p>
          <p class="text-sm text-slate-500">${r.grade} клас · ${r.eventId}</p>
        </div>
        <div class="text-right">
          <p class="text-2xl font-bold text-sky-600">${r.score}<span class="text-base text-slate-400">/${r.totalQuestions}</span></p>
          <p class="text-xs text-slate-400">${r.timeSpentSeconds ? Math.round(r.timeSpentSeconds / 60) + ' хв' : ''}</p>
        </div>`;
      resultsList.appendChild(row);
    });
  } catch {
    // Результатів ще немає — залишаємо заглушку
  }
}

// --- Утиліти ---

function showDashboard(email) {
  authSection.classList.add('hidden');
  dashboardSection.classList.remove('hidden');
  teacherEmailDisplay.textContent = email;
}

function showAuth() {
  dashboardSection.classList.add('hidden');
  authSection.classList.remove('hidden');
  loginSubmitBtn.disabled = false;
  loginSubmitBtn.textContent = 'Увійти';
}

function friendlyError(msg) {
  if (msg.includes('invalid-credential') || msg.includes('wrong-password')) return 'Невірний email або пароль.';
  if (msg.includes('email-already-in-use')) return 'Цей email вже зареєстровано.';
  if (msg.includes('too-many-requests')) return 'Забагато спроб. Спробуй пізніше.';
  if (msg.includes('Акаунт вчителя')) return msg;
  return 'Помилка. Перевір дані і спробуй знову.';
}
