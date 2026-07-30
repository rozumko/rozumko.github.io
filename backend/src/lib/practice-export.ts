// Guard-логіка статичного practice-бандла (чисті функції, без I/O).
//
// Публічні активності без реєстрації/коду роздаються з GitHub Pages як статичні
// JSON-файли. Це БЕЗПЕЧНО лише для practice-пулу: його ключі відповідей і так
// навмисно публічні (локальний фідбек). Олімпіадні питання НІКОЛИ не мають
// потрапити в бандл — це інваріант, який захищає ця функція і її тест.

export interface ExportableQuestionRow {
  id: string
  q: string
  code: string | null
  type: string
  options: unknown
  correct: number | null
  explanation: string | null
  img: string | null
  imageAlt: string | null
  difficulty: string | null
  track: string | null
  topic: string | null
  conceptKey: string | null
  progressionBand: string | null
  version: number
  grade: number | null
  isOlympiad: boolean
  channels: string[]
  meta: Record<string, unknown> | null
}

export type BundleQuestion =
  Omit<ExportableQuestionRow, 'isOlympiad' | 'channels' | 'grade' | 'meta'> & { grade: number }

/**
 * Нуль рядків означає дві різні речі: канал доставки свідомо порожній (контент
 * перезбирають) або роль експорту не бачить таблицю (RLS/GRANT). Відрізняє їх
 * лише кількість рядків БЕЗ фільтрів: якщо роль не бачить жодного питання
 * взагалі — це поломка доступу і експорт має впасти.
 */
export function assertQuestionsTableReadable(visibleRows: number): void {
  if (visibleRows > 0) return
  throw new Error(
    'The export role cannot read public.questions (RLS/GRANT): not a single row is visible.',
  )
}

/**
 * Пропускає в бандл лише не-олімпіадні питання з валідним класом.
 * isOlympiad=true → THROW (fail closed, а не тихий фільтр: якщо запит-джерело
 * зламався і приніс олімпіадне питання — експорт має впасти, не «підчистити»).
 * meta.purpose='olympiad-demo' → THROW з тієї ж причини: демо оцінюється на
 * сервері, тож його ключі не можуть лежати у статичному файлі.
 * grade=null → рядок пропускається (немає файла, куди його класти).
 * Сортує за id для стабільних git-диффів бандла.
 */
export function sanitizeForStaticBundle(rows: ExportableQuestionRow[]): BundleQuestion[] {
  const out: BundleQuestion[] = []
  for (const row of rows) {
    if (row.isOlympiad !== false) {
      throw new Error(`Question ${row.id} is not explicitly marked as training content`)
    }
    if (!row.channels.includes('olympiad_training')) {
      throw new Error(`Question ${row.id} is not assigned to the olympiad_training channel`)
    }
    if (row.meta?.purpose === 'olympiad-demo') {
      throw new Error(`Question ${row.id} belongs to the server-scored olympiad demo package`)
    }
    if (row.grade == null || row.grade < 1 || row.grade > 4) continue
    const { isOlympiad: _oly, channels: _channels, meta: _meta, ...rest } = row
    out.push({ ...rest, grade: row.grade })
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

/** Розкладає бандл по класах 1..4 (порожній клас → порожній масив, файл усе одно пишеться). */
export function groupByGrade(rows: BundleQuestion[]): Map<number, BundleQuestion[]> {
  const grouped = new Map<number, BundleQuestion[]>([[1, []], [2, []], [3, []], [4, []]])
  for (const row of rows) grouped.get(row.grade)!.push(row)
  return grouped
}
