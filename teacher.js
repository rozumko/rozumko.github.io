import { loginTeacher, registerTeacher, logoutTeacher, onTeacherAuthChanged } from './features/auth/teacher-auth.js';

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

// --- Стан сесії ---

onTeacherAuthChanged((user) => {
  if (user) showDashboard(user.email);
  else showAuth();
});

// --- Перемикання форм ---

showRegisterBtn.addEventListener('click', () => {
  registerSection.classList.remove('hidden');
  showRegisterBtn.classList.add('hidden');
});

hideRegisterBtn.addEventListener('click', () => {
  registerSection.classList.add('hidden');
  showRegisterBtn.classList.remove('hidden');
  registerError.textContent = '';
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

// --- Реєстрація ---

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('reg-email').value.trim();
  const school = document.getElementById('reg-school').value.trim();
  const password = document.getElementById('reg-password').value;

  if (password.length < 8) {
    registerError.textContent = 'Пароль має бути мінімум 8 символів.';
    return;
  }

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

logoutBtn.addEventListener('click', async () => {
  await logoutTeacher();
});

// --- Утиліти ---

function showDashboard(email) {
  authSection.classList.add('hidden');
  dashboardSection.classList.remove('hidden');
  teacherEmailDisplay.textContent = email;
}

function showAuth() {
  dashboardSection.classList.add('hidden');
  authSection.classList.remove('hidden');
}

function friendlyError(msg) {
  if (msg.includes('invalid-credential') || msg.includes('wrong-password')) return 'Невірний email або пароль.';
  if (msg.includes('email-already-in-use')) return 'Цей email вже зареєстровано.';
  if (msg.includes('too-many-requests')) return 'Забагато спроб. Спробуй пізніше.';
  if (msg.includes('Акаунт вчителя')) return msg;
  return 'Помилка. Перевір дані і спробуй знову.';
}
