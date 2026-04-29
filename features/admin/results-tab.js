/**
 * features/admin/results-tab.js
 * ─────────────────────────────────────────────────────────────
 * Вкладка «Результати»: перегляд усіх результатів олімпіад + CSV-експорт.
 * ─────────────────────────────────────────────────────────────
 */

import { getAllResults } from '../../services/admin-data.js';
import { getAllEvents }  from '../../services/events.js';
import { esc } from './ui.js';

/**
 * Ініціалізація вкладки результатів.
 * Кнопка експорту активується динамічно після завантаження даних.
 */
export function initResultsTab() {
  // Кнопка «Експорт CSV» прив'язується в loadResults() після отримання даних,
  // бо нам потрібен масив results для передачі в exportResultsCSV.
  // Тут можна додати фільтри, якщо знадобляться в майбутньому.
}

/**
 * Завантажити всі результати олімпіад і відрендерити список.
 * Паралельно завантажує події для відображення назви замість eventId.
 *
 * Викликається з admin.js при перемиканні на вкладку «Результати».
 */
export async function loadResults() {
  const list = document.getElementById('results-list');
  try {
    // Завантажуємо результати і події одночасно для швидкості
    const [results, events] = await Promise.all([getAllResults(), getAllEvents()]);

    // Будуємо словник eventId → назва події для читабельного відображення
    const eventNames = Object.fromEntries(events.map(e => [e.id, e.title]));

    if (!results.length) {
      // Порожній стан — підказка що чекати
      list.innerHTML = `
        <div class="bg-slate-800 border border-slate-700 rounded-2xl p-10 text-center text-slate-500">
          <i class="fas fa-poll text-4xl mb-3 block"></i>
          <p class="font-semibold">Результатів ще немає</p>
          <p class="text-sm mt-1">Тут з'являться результати після проведення олімпіади.</p>
        </div>`;
      return;
    }

    list.innerHTML = '';

    // Активуємо кнопку CSV тільки коли є дані — передаємо масив через closure
    const exportBtn = document.getElementById('export-results-btn');
    exportBtn.disabled = false;
    exportBtn.onclick = () => exportResultsCSV(results);

    results.forEach(r => {
      const el = document.createElement('div');
      el.className = 'admin-result-row';

      const date = r.completedAt?.toDate?.().toLocaleString('uk-UA', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }) ?? '';

      const eventLabel = eventNames[r.eventId] ?? r.eventId;

      el.innerHTML = `
        <div class="admin-row__main">
          <p class="admin-row__title">${esc(r.studentCode)}</p>
          <p class="admin-row__meta">${esc(r.grade)} клас · ${esc(eventLabel)}</p>
          <p class="admin-row__meta" style="font-size:var(--font-size-xs); margin-top:2px;">${esc(date)}</p>
        </div>
        <div style="text-align:right">
          <p class="admin-row__score">${esc(r.score)}<span>/${esc(r.totalQuestions)}</span></p>
          <p class="admin-row__meta" style="font-size:var(--font-size-xs);">${r.timeSpentSeconds ? Math.round(r.timeSpentSeconds / 60) + ' хв' : ''}</p>
        </div>`;

      list.appendChild(el);
    });
  } catch (err) {
    list.innerHTML = `<p class="text-rose-400 text-sm p-4">${err.message}</p>`;
  }
}

/**
 * Генерує і завантажує CSV-файл з усіма результатами.
 * BOM (﻿) додається щоб Excel коректно відкривав кирилицю.
 *
 * @param {object[]} results — масив результатів з Firestore
 */
function exportResultsCSV(results) {
  // Заголовок + рядки даних
  const rows = [['Код', 'Клас', 'Подія', 'Бали', 'Всього', 'Час (хв)', 'Дата']];

  results.forEach(r => {
    const date = r.completedAt?.toDate?.().toLocaleString('uk-UA') ?? '';
    const mins = r.timeSpentSeconds ? Math.round(r.timeSpentSeconds / 60) : '';
    rows.push([r.studentCode, r.grade, r.eventId, r.score, r.totalQuestions, mins, date]);
  });

  const csv  = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);

  // Програмний клік для завантаження без відкриття нової вкладки
  const a = document.createElement('a');
  a.href = url;
  a.download = 'results.csv';
  a.click();

  // Звільняємо пам'ять після завантаження
  URL.revokeObjectURL(url);
}
