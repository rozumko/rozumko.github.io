# Таксономія навчального вмісту

Статус: **впроваджено** (2026-07-04). Схема — міграція 0021; серверна валідація
— `backend/src/lib/taxonomy.ts`; UI-копія — `features/admin/taxonomy.ts`.
Банк: 458 розмічених питань (informatics 256, computational-thinking 106,
ai-basics 96). Джерела імпорту — `backend/scripts/import-temp-content.ts`
(ct_quiz, alt_cs, ai_basics, informatics_extra, ct_extra).

Дві незалежні осі класифікації питання:

- **`topic`** — предметна тема в межах напрямку (`track`). Обов'язкове для нового
  вмісту (адмінка/API), nullable у схемі для legacy.
- **`concept_key`** — CT-навичка, яку тренує питання (опційне для informatics/ai-basics,
  обов'язкове для computational-thinking). Дає крос-напрямковий «профіль мислення».

Супутні колонки (0021): `progression_band` (recognize/apply/reason), `version`
(інкремент бекендом при змістовній правці), `meta jsonb` (редакційні дані:
reviewStatus, isCore, джерело імпорту).

Джерела: типова програма НУШ (інформатична освітня галузь, 1–4 кл.),
Cambridge Primary Computing 0059 (strands: Computational Thinking, Programming,
Managing Data, Networks & Digital Communication, Computer Systems),
Cambridge Primary Digital Literacy 0072 (strands: Safety & Wellbeing,
The Digital World, Tools & Content Creation), напрацювання `temp/` (ct_quiz, alt_cs).

## Track: `informatics` — Інформатика

| slug | Назва | НУШ | Cambridge |
|---|---|---|---|
| `information` | Інформація та повідомлення | інформація, органи чуття, види повідомлень | 0059 Managing Data (основа) |
| `data` | Дані: групування, таблиці, діаграми | робота з даними | 0059 Managing Data |
| `computer-systems` | Комп'ютер та його складові | комп'ютерні пристрої | 0059 Computer Systems |
| `algorithms-programming` | Алгоритми, виконавці, програми | алгоритми та виконавці | 0059 Programming (CT-strand → track `computational-thinking`) |
| `networks-internet` | Мережі та Інтернет | мережі, пошук | 0059 Networks & Digital Communication; 0072 Digital World |
| `digital-safety` | Безпека та цифровий добробут | безпечна поведінка, здоров'я за екраном | 0072 Safety & Wellbeing |
| `digital-tools` | Цифрові інструменти та створення контенту | створення інформаційних продуктів | 0072 Tools & Content Creation |

Примітка: strand «Computational Thinking» Cambridge 0059 у нас винесений в окремий
track, тому в informatics його немає — питання «чистого мислення» йдуть туди.

## Track: `ai-basics` — Основи ШІ

Cambridge на primary-рівні окремого AI-strand не має; теми складені за логікою
0072 Digital World + сучасні AI-literacy рамки (розпізнавання / навчання з даних /
критичне ставлення).

| slug | Назва | Зміст |
|---|---|---|
| `what-is-ai` | Що таке ШІ | де ШІ навколо нас, ШІ vs звичайна програма |
| `how-ai-learns` | Як ШІ навчається | приклади, дані, патерни, помилки навчання |
| `ai-perception` | Як ШІ бачить і чує | розпізнавання зображень, мови, звуку |
| `human-vs-ai` | Людина і ШІ | що вміє людина, а що машина; сильні/слабкі сторони |
| `ai-ethics-safety` | Безпека і довіра до ШІ | фейки, персональні дані, перевірка відповідей ШІ |
| `ai-tools` | ШІ як помічник | використання ШІ-інструментів у навчанні та творчості |

## Track: `computational-thinking` — Обчислювальне мислення

Теми збігаються з концептами (успадковано з ct_quiz, покриття захищене
методичними тестами банку):

| slug | Назва |
|---|---|
| `algorithms` | Алгоритми (послідовність дій) |
| `decomposition` | Декомпозиція |
| `abstraction` | Абстрагування |
| `patterns` | Розпізнавання закономірностей |
| `repetition` | Повторення (цикли) |
| `logic` | Логічне мислення (і/або/не) |
| `efficiency` | Ефективність способу |
| `classification` | Класифікація |
| `debugging` | Налагодження |

## `concept_key` (крос-напрямкова вісь)

Той самий словник, що й теми CT: `algorithms`, `decomposition`, `abstraction`,
`patterns`, `repetition`, `logic`, `efficiency`, `classification`, `debugging`.
Для track `computational-thinking` `concept_key` = `topic`.

## Валідація

- `TOPICS_BY_TRACK` і `CONCEPT_KEYS` — константи на бекенді; API відхиляє
  невідомі значення (fail-closed).
- Адмінка: селект теми залежить від обраного напрямку.
- Додавання теми = PR зі зміною константи + цього документа.
