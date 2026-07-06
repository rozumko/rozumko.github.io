// Обраний клас (1–4) — спільний для всіх активностей вдома. Дитина обирає його
// раз на «Я вдома», і вибір підхоплюється в іграх/головоломках без зайвих кліків.
// Зберігаємо лише число класу — жодних персональних даних.
const KEY = 'rozumko:grade'

export function getSavedGrade(): number {
  try {
    const n = Number(localStorage.getItem(KEY))
    if (n >= 1 && n <= 4) return n
  } catch { /* приватний режим / вимкнений storage — тихо ігноруємо */ }
  return 1
}

export function saveGrade(grade: number): void {
  if (grade >= 1 && grade <= 4) {
    try { localStorage.setItem(KEY, String(grade)) } catch { /* ignore */ }
  }
}
