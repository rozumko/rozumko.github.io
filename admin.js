import { loginAdmin, logoutAdmin, onAdminAuthChanged } from './features/auth/admin-auth.js';

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
  });
});

// --- Форма олімпіадної події ---

const createEventBtn = document.getElementById('create-event-btn');
const cancelEventBtn = document.getElementById('cancel-event-btn');
const eventFormSection = document.getElementById('event-form-section');
const eventForm = document.getElementById('event-form');

createEventBtn.addEventListener('click', () => {
  eventFormSection.classList.remove('hidden');
  createEventBtn.classList.add('hidden');
});

cancelEventBtn.addEventListener('click', () => {
  eventFormSection.classList.add('hidden');
  createEventBtn.classList.remove('hidden');
  eventForm.reset();
});

eventForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  // TODO Фаза 3: зберегти olympiad_events у Firestore
  alert('Збереження олімпіадних подій — у розробці (Фаза 3)');
});

// --- Утиліти ---

function showDashboard(email) {
  authSection.classList.add('hidden');
  adminPanel.classList.remove('hidden');
  emailDisplay.textContent = email;
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
