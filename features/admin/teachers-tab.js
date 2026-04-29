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
      el.className = 'bg-slate-800 border border-slate-700 rounded-2xl p-5 flex items-center justify-between gap-4';

      // Дата реєстрації — форматуємо тільки якщо поле є
      const createdDate = t.createdAt?.toDate?.().toLocaleDateString('uk-UA') ?? '';

      el.innerHTML = `
        <div>
          <p class="text-white font-semibold">${esc(t.email)}</p>
          <p class="text-slate-400 text-sm">${esc(t.school || 'Школу не вказано')}</p>
        </div>
        <div class="text-right">
          <p class="text-slate-400 text-xs">${(t.classes || []).length} класів</p>
          <p class="text-slate-500 text-xs mt-0.5">${esc(createdDate)}</p>
        </div>`;

      list.appendChild(el);
    });
  } catch (err) {
    // Показуємо помилку прямо в списку, не ламаємо всю сторінку
    list.innerHTML = `<p class="text-rose-400 text-sm p-4">${err.message}</p>`;
  }
}
