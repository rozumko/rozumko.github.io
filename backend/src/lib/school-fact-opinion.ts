export type SchoolFactOpinionChoice = 'fact' | 'opinion'

interface SchoolFactOpinionStatement {
  id: string
  text: string
  category: SchoolFactOpinionChoice
  explanation: string
}

export interface PublicSchoolFactOpinionStatement {
  id: string
  text: string
}

const PACKS: Record<number, readonly SchoolFactOpinionStatement[]> = {
  1: [
    { id: 'g1-01', text: 'У тижні сім днів.', category: 'fact', explanation: 'Це можна перевірити за календарем: у кожному тижні сім днів.' },
    { id: 'g1-02', text: 'Сонце — це зірка.', category: 'fact', explanation: 'Це науковий факт: Сонце є найближчою до Землі зіркою.' },
    { id: 'g1-03', text: 'Лід — це замерзла вода.', category: 'fact', explanation: 'Це перевірюваний факт про стан води.' },
    { id: 'g1-04', text: 'Комахи мають шість ніг.', category: 'fact', explanation: 'Шість ніг — одна з ознак комах.' },
    { id: 'g1-05', text: 'Столиця України — Київ.', category: 'fact', explanation: 'Це офіційно встановлений і перевірюваний факт.' },
    { id: 'g1-06', text: 'Полуничне морозиво найсмачніше.', category: 'opinion', explanation: 'Смак у кожної людини свій, тому це особиста думка.' },
    { id: 'g1-07', text: 'Зима — найкраща пора року.', category: 'opinion', explanation: 'Людям подобаються різні пори року, тож це думка.' },
    { id: 'g1-08', text: 'Сині олівці красивіші за зелені.', category: 'opinion', explanation: 'Красу кольорів кожен оцінює по-своєму.' },
    { id: 'g1-09', text: 'Усі казки цікаві.', category: 'opinion', explanation: 'Не всім подобаються однакові казки. Це узагальнена думка.' },
    { id: 'g1-10', text: 'Собаки — найкращі домашні тварини.', category: 'opinion', explanation: 'Вибір улюбленої тварини залежить від людини.' },
  ],
  2: [
    { id: 'g2-01', text: 'Земля обертається навколо Сонця.', category: 'fact', explanation: 'Це підтверджений астрономічними спостереженнями факт.' },
    { id: 'g2-02', text: 'У восьминога вісім щупалець.', category: 'fact', explanation: 'Це перевірювана особливість будови восьминога.' },
    { id: 'g2-03', text: 'Клавіатура є пристроєм введення.', category: 'fact', explanation: 'Клавіатурою вводять у комп’ютер літери, числа й команди.' },
    { id: 'g2-04', text: 'Рослинам потрібне світло для росту.', category: 'fact', explanation: 'Світло потрібне рослинам для фотосинтезу.' },
    { id: 'g2-05', text: 'У прямокутника чотири кути.', category: 'fact', explanation: 'Це властивість геометричної фігури, яку можна перевірити.' },
    { id: 'g2-06', text: 'Математика — найлегший предмет.', category: 'opinion', explanation: 'Різним учням легко даються різні предмети.' },
    { id: 'g2-07', text: 'Мультфільми завжди цікавіші за книжки.', category: 'opinion', explanation: 'Це залежить від уподобань людини.' },
    { id: 'g2-08', text: 'Малювати фарбами приємніше, ніж олівцями.', category: 'opinion', explanation: 'Це особисте відчуття, а не перевірюваний факт.' },
    { id: 'g2-09', text: 'Футбол — найцікавіший спорт.', category: 'opinion', explanation: 'Улюблений вид спорту кожен обирає сам.' },
    { id: 'g2-10', text: 'Домашні завдання завжди нудні.', category: 'opinion', explanation: 'Слово «нудні» передає оцінку, яка в різних людей відрізняється.' },
  ],
  3: [
    { id: 'g3-01', text: 'Вода складається з водню та кисню.', category: 'fact', explanation: 'Хімічна формула води H₂O описує два елементи — водень і кисень.' },
    { id: 'g3-02', text: 'Україна розташована в Європі.', category: 'fact', explanation: 'Це географічний факт, який можна перевірити на карті.' },
    { id: 'g3-03', text: 'Комп’ютер зберігає дані у файлах.', category: 'fact', explanation: 'Файл є способом зберігання даних у цифровому пристрої.' },
    { id: 'g3-04', text: 'Місяць відбиває світло Сонця.', category: 'fact', explanation: 'Місяць не виробляє власного видимого світла, а відбиває сонячне.' },
    { id: 'g3-05', text: 'Трикутник має три сторони.', category: 'fact', explanation: 'Це визначальна властивість трикутника.' },
    { id: 'g3-06', text: 'Паперові книжки кращі за електронні.', category: 'opinion', explanation: 'Обидва формати мають переваги, а слово «кращі» виражає оцінку.' },
    { id: 'g3-07', text: 'Усі комп’ютерні ігри марнують час.', category: 'opinion', explanation: 'Слово «усі» створює некоректне узагальнення: ігри бувають різними.' },
    { id: 'g3-08', text: 'Навчатися вранці приємніше, ніж увечері.', category: 'opinion', explanation: 'Зручний час навчання залежить від людини.' },
    { id: 'g3-09', text: 'Роботи виглядають цікавіше за тварин.', category: 'opinion', explanation: 'Цікавість — це особиста оцінка.' },
    { id: 'g3-10', text: 'Найкорисніший урок — інформатика.', category: 'opinion', explanation: 'Корисність предметів можна оцінювати по-різному залежно від мети.' },
  ],
  4: [
    { id: 'g4-01', text: 'Алгоритм — це послідовність команд для виконання завдання.', category: 'fact', explanation: 'Це загальноприйняте визначення алгоритму.' },
    { id: 'g4-02', text: 'Пароль із різних типів символів може бути стійкішим.', category: 'fact', explanation: 'За однакової довжини різноманітні символи збільшують кількість можливих комбінацій.' },
    { id: 'g4-03', text: 'Інтернет з’єднує між собою комп’ютерні мережі.', category: 'fact', explanation: 'Це перевірюваний опис принципу роботи Інтернету.' },
    { id: 'g4-04', text: 'Штучний інтелект може помилятися.', category: 'fact', explanation: 'Системи ШІ не гарантують правильності кожної відповіді.' },
    { id: 'g4-05', text: 'Особисті дані не варто повідомляти незнайомцям онлайн.', category: 'fact', explanation: 'Це правило цифрової безпеки, яке зменшує ризик зловживань.' },
    { id: 'g4-06', text: 'Відеоуроки завжди ефективніші за текстові пояснення.', category: 'opinion', explanation: 'Ефективність залежить від теми та способу навчання конкретної людини.' },
    { id: 'g4-07', text: 'Найновіша програма обов’язково найзручніша.', category: 'opinion', explanation: 'Новизна не доводить зручність; це оцінне припущення.' },
    { id: 'g4-08', text: 'Люди, які швидко друкують, краще знають інформатику.', category: 'opinion', explanation: 'Швидкість друку не визначає всі знання з інформатики.' },
    { id: 'g4-09', text: 'Будь-яку інформацію з першого сайту можна вважати правдивою.', category: 'opinion', explanation: 'Це необґрунтоване узагальнення: джерела потрібно перевіряти.' },
    { id: 'g4-10', text: 'Працювати в парі цікавіше, ніж самостійно.', category: 'opinion', explanation: 'Комусь подобається співпраця, а комусь — самостійна робота.' },
  ],
}

export function schoolFactOpinionPack(grade: number): readonly SchoolFactOpinionStatement[] {
  return PACKS[Math.max(1, Math.min(4, Math.trunc(grade)))] ?? PACKS[1]!
}

export function publicSchoolFactOpinionPack(grade: number): PublicSchoolFactOpinionStatement[] {
  return schoolFactOpinionPack(grade).map(({ id, text }) => ({ id, text }))
}

export function scoreSchoolFactOpinion(
  grade: number,
  statementId: string,
  choice: SchoolFactOpinionChoice,
): { correct: boolean; explanation: string } | null {
  const statement = schoolFactOpinionPack(grade).find(item => item.id === statementId)
  if (!statement) return null
  return { correct: statement.category === choice, explanation: statement.explanation }
}

