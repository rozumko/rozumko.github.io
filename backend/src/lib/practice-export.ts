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
  difficulty: string | null
  grade: number | null
  isOlympiad: boolean | null
}

export type BundleQuestion = Omit<ExportableQuestionRow, 'isOlympiad' | 'grade'> & { grade: number }

/**
 * Пропускає в бандл лише не-олімпіадні питання з валідним класом.
 * isOlympiad=true → THROW (fail closed, а не тихий фільтр: якщо запит-джерело
 * зламався і приніс олімпіадне питання — експорт має впасти, не «підчистити»).
 * grade=null → рядок пропускається (немає файла, куди його класти).
 * Сортує за id для стабільних git-диффів бандла.
 */
export function sanitizeForStaticBundle(rows: ExportableQuestionRow[]): BundleQuestion[] {
  const out: BundleQuestion[] = []
  for (const row of rows) {
    if (row.isOlympiad === true) {
      throw new Error(`Олімпіадне питання ${row.id} не може потрапити в статичний бандл`)
    }
    if (row.grade == null || row.grade < 1 || row.grade > 4) continue
    const { isOlympiad: _oly, ...rest } = row
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
