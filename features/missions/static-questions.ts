import { normalizeQuestion, type Question } from '../api/client.js'
import { pickMissionQuestions, type MissionPick } from './mission-pick.js'

export { pickMissionQuestions, type MissionPick } from './mission-pick.js'

// Статичний practice-бандл для активностей без реєстрації і без коду класу.
//
// Питання роздаються з GitHub Pages (public/questions/grade-N.json), а не з
// бекенду: жодного cold start для дитини, жодного анонімного навантаження на
// rate-limit (клас за одним шкільним NAT). Ключі відповідей у бандлі публічні
// свідомо — practice-режим і так віддає їх для локального фідбеку.
// Олімпіадні питання в бандл не потрапляють (guard в export-скрипті + тест).
//
// Бандл генерується з БД: cd backend && npm run export:questions

const bundleCache = new Map<number, Question[]>()

export async function loadStaticQuestions(grade: number, pick: MissionPick): Promise<Question[]> {
  let all = bundleCache.get(grade)
  if (!all) {
    let res: Response
    try {
      res = await fetch(`/questions/grade-${grade}.json`)
    } catch {
      throw new Error('Не вдалося завантажити місію. Перевірте інтернет.')
    }
    if (!res.ok) throw new Error(`Питань для ${grade} класу ще немає.`)
    all = (await res.json()) as Question[]
    bundleCache.set(grade, all)
  }

  const picked = pickMissionQuestions(all, pick)
  if (!picked.length) throw new Error(`Питань для ${grade} класу ще немає. Спробуй іншу місію.`)
  return picked.map(normalizeQuestion)
}
