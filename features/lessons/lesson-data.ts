// Мікро-урок: теорія перед випробуванням на карті шляху (Home Mode).
// Точка шляху посилається на урок явним lessonId (без автопідбору за
// track/topic — рішення «варіант А»): уроків мало, кожен стоїть у сюжеті
// карти, редакційний контроль важливіший за масштабування пулу.
//
// Файли уроків: public/lessons/<lessonId>.json (патерн practice-бандла).
// Перевірочні питання формувальні: фідбек локальний, ключі публічні свідомо.

export interface LessonCard {
  /** Заголовок картки; порожній — картка без заголовка. */
  title?: string
  text: string
  /** Шлях до ілюстрації, напр. "/lessons/assets/laptop.svg". */
  image?: string
  imageAlt?: string
}

export interface LessonCheckQuestion {
  question: string
  options: string[]
  /** Індекс правильної відповіді в options. */
  correct: number
  explanation?: string
}

export interface MicroLesson {
  id: string
  version: number
  title: string
  cards: LessonCard[]
  /** Вертикальне відео ≤90с (self-hosted); відсутнє — урок лише текстовий. */
  videoUrl?: string
  check: LessonCheckQuestion[]
}

/** Підсумок проходження уроку (для адаптера ActivityResult). */
export interface LessonSummary {
  /** Правильні з першої спроби у мікро-квізі. */
  correct: number
  total: number
  skipped: boolean
}
