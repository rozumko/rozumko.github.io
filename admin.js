/**
 * admin.js — головний оркестратор адмін-панелі
 * ─────────────────────────────────────────────────────────────
 * Відповідає ТІЛЬКИ за:
 *   1. Auth (вхід / вихід / відстеження стану)
 *   2. Перемикання вкладок
 *   3. Статистика дашборду
 *   4. Ініціалізацію feature-модулів
 *
 * Вся логіка вкладок живе в features/admin/*-tab.js
 * Спільні UI-утиліти — в features/admin/ui.js
 * ─────────────────────────────────────────────────────────────
 */

// ─── Сервіси ──────────────────────────────────────────────────────────────────
import { loginAdmin, logoutAdmin, onAdminAuthChanged } from './features/auth/admin-auth.js';
import { loadAdminStats } from './services/stats.js';

// ─── Feature-модулі вкладок ───────────────────────────────────────────────────
import { initEventsTab,    loadEvents    } from './features/admin/events-tab.js';
import { initTeachersTab,  loadTeachers  } from './features/admin/teachers-tab.js';
import { initResultsTab,   loadResults   } from './features/admin/results-tab.js';
import { initQuestionsTab, loadQuestionsTab } from './features/admin/questions-tab.js';

// ─── Спільні утиліти ──────────────────────────────────────────────────────────
// showModal ініціалізується автоматично при імпорті ui.js (підвішує modal-ok-btn)
import { friendlyError } from './features/admin/ui.js';

// ─── DOM: auth-секція ─────────────────────────────────────────────────────────
const authSection  = document.getElementById('auth-section');
const adminPanel   = document.getElementById('admin-panel');
const loginForm    = document.getElementById('admin-login-form');
const loginError   = document.getElementById('admin-login-error');
const loginBtn     = document.getElementById('admin-login-btn');
const logoutBtn    = document.getElementById('admin-logout-btn');
const emailDisplay = document.getElementById('admin-email-display');

// ─── Auth: відстеження стану ──────────────────────────────────────────────────

// Firebase викликає callback одразу при завантаженні з кешованим станом,
// тому не потрібно окремо перевіряти auth при старті сторінки.
onAdminAuthChanged((user) => {
  if (user) showDashboard(user.email);
  else      showAuth();
});

// ─── Auth: вхід ───────────────────────────────────────────────────────────────

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email    = document.getElementById('admin-email').value.trim();
  const password = document.getElementById('admin-password').value;

  loginError.textContent = '';
  loginBtn.disabled      = true;
  loginBtn.textContent   = 'Вхід…';

  try {
    await loginAdmin(email, password);
    // onAdminAuthChanged автоматично викличе showDashboard після успішного входу
  } catch (err) {
    loginError.textContent = friendlyError(err.message);
    loginBtn.disabled      = false;
    loginBtn.textContent   = 'Увійти';
  }
});

// ─── Auth: вихід ──────────────────────────────────────────────────────────────

logoutBtn.addEventListener('click', async () => {
  await logoutAdmin();
  // onAdminAuthChanged автоматично викличе showAuth після виходу
});

// ─── Вкладки ──────────────────────────────────────────────────────────────────

/**
 * Обробник перемикання вкладок.
 * При кожному переключенні завантажує свіжі дані для відповідної вкладки.
 */
document.querySelectorAll('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    // Знімаємо активний стан з усіх вкладок і ховаємо всі панелі
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('tab-active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));

    // Активуємо обрану вкладку і показуємо її панель
    tab.classList.add('tab-active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');

    // Завантажуємо дані для вкладки при кожному переключенні — щоб дані були свіжі
    if (tab.dataset.tab === 'teachers')  loadTeachers();
    if (tab.dataset.tab === 'results')   loadResults();
    if (tab.dataset.tab === 'questions') loadQuestionsTab();
    // 'events' завантажується при showDashboard і після будь-яких змін всередині вкладки
  });
});

// ─── Дашборд ──────────────────────────────────────────────────────────────────

/**
 * Показати адмін-панель після успішного входу.
 * Ховає форму входу, показує панель, запускає початкове завантаження даних.
 *
 * @param {string} email — email авторизованого адміна
 */
function showDashboard(email) {
  authSection.classList.add('hidden');
  adminPanel.classList.remove('hidden');
  emailDisplay.textContent = email;

  // Завантажуємо всі дані паралельно для швидкого старту дашборду
  refreshStats();
  loadEvents();
  loadTeachers();
  loadResults();
}

/**
 * Показати форму входу (при виході або якщо не авторизований).
 */
function showAuth() {
  adminPanel.classList.add('hidden');
  authSection.classList.remove('hidden');
  loginBtn.disabled    = false;
  loginBtn.textContent = 'Увійти';
}

/**
 * Оновити лічильники статистики на дашборді.
 * Викликається при вході і після змін що впливають на статистику.
 * Помилки ігноруються тихо — статистика некритична для роботи.
 */
async function refreshStats() {
  try {
    const { teachers, students, results, events } = await loadAdminStats();
    document.getElementById('stat-teachers').textContent = teachers;
    document.getElementById('stat-students').textContent = students;
    document.getElementById('stat-results').textContent  = results;
    document.getElementById('stat-events').textContent   = events;
  } catch {
    // Firestore може бути недоступний до повної ініціалізації — не ламаємо UI
  }
}

// ─── Ініціалізація feature-модулів ───────────────────────────────────────────

// Передаємо refreshStats як залежність туди де він потрібен після змін
// (наприклад, після створення олімпіади лічильники мають оновитись)
initEventsTab({ refreshStats });
initTeachersTab();
initResultsTab();
initQuestionsTab();
