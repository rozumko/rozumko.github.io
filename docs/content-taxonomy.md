# Таксономія навчального вмісту

Статус: **впроваджено** (2026-07-04). Схема — міграція 0021; серверна валідація
— `backend/src/lib/taxonomy.ts`; UI-копія — `features/admin/taxonomy.ts`.
Банк (practice-експорт `public/questions/`, стан 2026-07-10): **673 питання**
(informatics 312, computational-thinking 217, ai-basics 144; по класах
166/168/174/165). Кожен клас покриває всі 22 теми (мін. 6 питань на тему).
Механіки: choice 608, truefalse 18, match 15, sort 13, input 10, sequence 9.
Джерела імпорту — `backend/scripts/import-temp-content.ts`
(ct_quiz, alt_cs, ai_basics, informatics_extra, ct_extra, mixed_mechanics).

Дві незалежні осі класифікації питання:

- **`topic`** — предметна тема в межах напрямку (`track`). Обов'язкове для нового
  вмісту (адмінка/API), nullable у схемі для legacy.
- **`concept_key`** — CT-навичка, яку тренує питання (опційне для informatics/ai-basics,
  обов'язкове для computational-thinking). Дає крос-напрямковий «профіль мислення».

Супутні колонки (0021): `progression_band` (recognize/apply/reason), `version`
(інкремент бекендом при змістовній правці), `meta jsonb` (редакційні дані:
reviewStatus, isCore, джерело імпорту).

**`channels` — це не третя вісь класифікації, а межа видачі** (міграція 0044).
`topic`/`concept_key` відповідають на «про що питання», `channels` — «де його
дозволено показати»: `path` (Дім і карта пригод), `class_game` (Школа),
`olympiad_training` (статичний practice-експорт). Порожній список = питання не
видається ніде; питання основного туру (`is_olympiad = true`) не має жодного
тренувального каналу. Не змішуй ці поняття в одному селекті адмінки —
обґрунтування в [ADR-0007](./adr/0007-question-delivery-channels.md).

Джерела: типова програма НУШ (інформатична освітня галузь, 1–4 кл.),
Cambridge Primary Computing 0059 (strands: Computational Thinking, Programming,
Managing Data, Networks & Digital Communication, Computer Systems),
Cambridge Primary Digital Literacy 0072 (strands: Safety & Wellbeing,
The Digital World, Tools & Content Creation), напрацювання `temp/` (ct_quiz, alt_cs).

## Track: `informatics` — Інформатика

| slug | Назва | НУШ | Cambridge |
|---|---|---|---|
| `information` | Інформація | інформація, повідомлення, способи подання, носії, довіра до інформації | 0059 Managing Data (основа) |
| `data` | Дані | ознаки, групування, таблиці, діаграми, висновки | 0059 Managing Data |
| `computer-systems` | Комп'ютер і пристрої | комп'ютерні пристрої, системи, введення/виведення | 0059 Computer Systems |
| `algorithms-programming` | Виконавці й програми | виконавці, система команд, програмне середовище | 0059 Programming (CT-strand → track `computational-thinking`) |
| `networks-internet` | Мережі, інтернет і пошук | мережі, інтернет, пошук, передавання повідомлень | 0059 Networks & Digital Communication; 0072 Digital World |
| `digital-safety` | Цифрова безпека | безпечна поведінка, персональні дані, добробут за екраном | 0072 Safety & Wellbeing |
| `digital-tools` | Цифрові інструменти й файли | файли, папки, створення цифрових робіт та інформаційних продуктів | 0072 Tools & Content Creation |

Примітка: strand «Computational Thinking» Cambridge 0059 у нас винесений в окремий
track, тому в informatics його немає — питання «чистого мислення» йдуть туди.

## Track: `ai-basics` — Основи ШІ

Cambridge на primary-рівні окремого AI-strand не має; теми складені за логікою
0072 Digital World + сучасні AI-literacy рамки (розпізнавання / навчання з даних /
критичне ставлення).

| slug | Назва | Зміст |
|---|---|---|
| `what-is-ai` | Що таке ШІ | де ШІ навколо нас, ШІ vs звичайна програма |
| `how-ai-learns` | Дані для ШІ | приклади, дані, патерни, помилки навчання |
| `ai-perception` | Розпізнавання | розпізнавання зображень, мови, звуку |
| `human-vs-ai` | Людина і ШІ | що вміє людина, а що машина; сильні/слабкі сторони |
| `ai-ethics-safety` | Довіра й безпека ШІ | фейки, персональні дані, перевірка відповідей ШІ |
| `ai-tools` | ШІ як помічник | використання ШІ-інструментів у навчанні та творчості |

## Track: `computational-thinking` — Обчислювальне мислення

Теми збігаються з концептами (успадковано з ct_quiz, покриття захищене
методичними тестами банку):

| slug | Назва |
|---|---|
| `algorithms` | Алгоритми |
| `decomposition` | Декомпозиція |
| `abstraction` | Абстрагування |
| `patterns` | Закономірності |
| `repetition` | Повторення (цикли) |
| `logic` | Логіка |
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
