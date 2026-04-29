/**
 * features/admin/teachers-tab.js
 * ─────────────────────────────────────────────────────────────
 * Вкладка «Вчителі»: список усіх зареєстрованих вчителів.
 * Тільки перегляд — редагування не передбачено в MVP.
 * ─────────────────────────────────────────────────────────────
 */

import { getAllTeachers } from '../../services/admin-data.js';
import { esc } from './ui.js';

/**
 * Ініціалізація вкладки вчителів.
 * Для цієї вкладки немає інтерактивних форм — тільки завантаження списку.
 * Функція існує для симетрії з іншими вкладками (всі викликаються через init).
 */
export function initTeachersTab() {
  // Вкладка не має форм чи фільтрів, тому init порожній.
  // Завантаження відбувається через loadTeachers(), яка викликається
  // при перемиканні на вкладку або при відкритті дашборду.
}

/**
 * Завантажити і відрендерити список вчителів.
 * Викликається з admin.js при перемиканні на вкладку «Вчителі».
 */
export async function loadTeachers() {
  const list = document.getElementById('teachers-list');
  try {
    const teachers = await getAllTeachers();

    if (!teachers.length) {
      // Порожній стан
      list.innerHTML = `
        <div class="bg-slate-800 border border-slate-700 rounded-2xl p-10 text-center text-slate-500">
          <i class="fas fa-users text-4xl mb-3 block"></i>
          <p class="font-semibold">Вчителів ще немає</p>
        </div>`;
      return;
    }

    list.innerHTML = '';
    teachers.forEach(t => {
      const el = document.createElement('div');
      el.className = 'admin-teacher-row';

      const createdDate = t.createdAt?.toDate?.().toLocaleDateString('uk-UA') ?? '';

      el.innerHTML = `
        <div class="admin-row__main">
          <p class="admin-row__title">${esc(t.email)}</p>
          <p class="admin-row__meta">${esc(t.school || 'Школу не вказано')}</p>
        </div>
        <div style="text-align:right">
          <p class="admin-row__meta">${(t.classes || []).length} класів</p>
          <p class="admin-row__meta" style="font-size:var(--font-size-xs); margin-top:2px;">${esc(createdDate)}</p>
        </div>`;

      list.appendChild(el);
    });
  } catch (err) {
    // Показуємо помилку прямо в списку, не ламаємо всю сторінку
    list.innerHTML = `<p class="text-rose-400 text-sm p-4">${err.message}</p>`;
  }
}
