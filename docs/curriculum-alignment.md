# Curriculum Alignment Strategy

_Created: 2026-07-23_

This document fixes how Rozumko should align the existing platform taxonomy
with typical NUSH Informatics topics, Home Mode learning paths and the teacher's
expanded integrated program for grades 1-4.

It is a product/content decision document. It must not become a second
technical taxonomy that competes with `docs/content-taxonomy.md`.

## Current Platform Inventory

Rozumko already has a working content taxonomy and content bank. The existing
technical source of truth is:

- `track`: one of `informatics`, `computational-thinking`, `ai-basics`;
- `topic`: a stable subject theme inside a track;
- `concept_key`: a cross-track computational-thinking skill;
- `progression_band`: `recognize`, `apply` or `reason`;
- `channels`: where a question may be used, such as School class games, Home
  path practice or olympiad training.

As of this inventory, the static practice bank contains 673 questions in
`public/questions/grade-1..4.json`. All exported questions have both `track` and
`topic`.

Approximate current distribution:

| Track | Questions |
|---|---:|
| `informatics` | 312 |
| `computational-thinking` | 217 |
| `ai-basics` | 144 |

Current stable topics:

| Track | Topics |
|---|---|
| `informatics` | `information`, `data`, `computer-systems`, `algorithms-programming`, `networks-internet`, `digital-safety`, `digital-tools` |
| `computational-thinking` | `algorithms`, `decomposition`, `abstraction`, `patterns`, `repetition`, `logic`, `efficiency`, `classification`, `debugging` |
| `ai-basics` | `what-is-ai`, `how-ai-learns`, `ai-perception`, `human-vs-ai`, `ai-ethics-safety`, `ai-tools` |

Home Mode already has path points that can reference several curriculum tags at
once through:

```ts
curriculum: [
  { track: 'informatics', topic: 'information' },
  { track: 'ai-basics', topic: 'ai-ethics-safety' },
]
```

This is the correct mechanism for integrated activities. We should use and
strengthen it instead of creating a fourth top-level track.

## Core Decision

Keep `track/topic` as the stable technical taxonomy.

Add a separate planning layer called **learning theme** for curriculum
alignment. A learning theme is a pedagogical unit that may combine several
existing `track/topic` tags.

A learning theme can align with:

- a typical NUSH Informatics topic;
- an idea from the teacher's integrated Informatics + Cambridge + AI literacy
  program;
- a Home Mode mission or path point;
- a School Mode quick check;
- a seasonal final or performance task.

It must not replace `track/topic`.

## Why Not Add Topics Situationally

Ad-hoc topic creation would create several problems:

- School filters would become inconsistent for teachers.
- Home path points could reference topics that question selection cannot
  satisfy.
- Reports would become harder to explain to parents.
- Content Studio would lose a clean review surface.
- Existing questions and lessons would need re-tagging without a clear payoff.

Adding a new `topic` should remain a deliberate product decision: update
`docs/content-taxonomy.md`, backend validation, shared UI taxonomy and tests in
one focused change.

Most new curriculum ideas should become learning themes, missions, lessons or
content packs that reuse existing `track/topic` tags.

## Surface-Specific Rules

### School Mode

School Mode is for teachers who need a fast and convenient way to check or
train knowledge from typical NUSH Informatics topics.

Teacher-facing navigation should use familiar school language:

- class;
- Informatics topic;
- difficulty;
- quick check, training or class game.

School Mode should not require teachers to understand the Rozumko internal
three-track model. The three tracks may power filtering internally, but the
default teacher path should feel like ordinary primary-school Informatics.

Good School Mode labels:

- Інформація та повідомлення;
- Дані, таблиці, діаграми;
- Комп'ютер і пристрої;
- Алгоритми, виконавці, програми;
- Мережі та Інтернет;
- Безпека в цифровому середовищі;
- Цифрові інструменти і створення вмісту.

AI and computational-thinking content may appear inside these topics when it is
age-appropriate and useful, but it should not make the teacher feel that the
platform is built only for an advanced Cambridge-style program.

## School Mode NUSH Topic Frame v1

School Mode should use a small teacher-facing topic frame that matches familiar
primary-school Informatics language. These topics are presentation and selection
units for teachers; they are not new database `topic` values.

Current implementation note: the teacher classroom-game form already creates
School sessions with `track: 'informatics'` and lets the teacher choose an
Informatics `topic`. That product direction is correct. Future improvements may
let one School topic select from several internal tags, but the teacher-facing
surface should still remain one Informatics subject.

Recommended teacher-facing topics:

| School topic ID | Teacher-facing label | What the teacher expects | Primary internal tags | Optional supporting tags | Notes |
|---|---|---|---|---|---|
| `information-messages` | Інформація та повідомлення | види повідомлень, джерела інформації, факт/думка, уважне читання | `informatics/information` | `computational-thinking/logic`, `ai-basics/ai-ethics-safety` | Good default for grades 1-2. AI appears only as trust/check enrichment. |
| `computer-devices` | Комп'ютер і пристрої | складові комп'ютера, пристрої введення/виведення, призначення пристроїв | `informatics/computer-systems` | `computational-thinking/classification` | Keep practical; good for fast classroom checks. |
| `files-environment` | Файли, папки і робоче середовище | відкрити, зберегти, знайти, назвати, упорядкувати файл | `informatics/digital-tools`, `informatics/computer-systems` | `computational-thinking/algorithms` | Common teacher need; do not create a separate technical topic unless content grows a lot. |
| `digital-creation` | Створення цифрового вмісту | текст, малюнок, фото, аудіо, презентація, просте редагування | `informatics/digital-tools` | `computational-thinking/decomposition`, `ai-basics/ai-tools` | Home can turn this into missions; School should stay tool/task oriented. |
| `data-tables-charts` | Дані, таблиці, діаграми | групування, таблиця, піктограма, діаграма, висновок за даними | `informatics/data` | `computational-thinking/classification`, `computational-thinking/patterns`, `ai-basics/how-ai-learns` | Strong bridge to CT and AI, but teacher label remains ordinary data work. |
| `algorithms-executors` | Алгоритми і виконавці | команди, порядок дій, маршрути, виконавці, помилки в алгоритмі | `informatics/algorithms-programming` | `computational-thinking/algorithms`, `computational-thinking/debugging` | Core School topic. |
| `programming-scratch` | Програмування і Scratch | послідовності, події, повторення, прості програми, тестування | `informatics/algorithms-programming` | `computational-thinking/repetition`, `computational-thinking/debugging`, `computational-thinking/decomposition` | Teacher-facing split from algorithms is useful because many teachers search by Scratch/programming. |
| `internet-networks-search` | Інтернет, мережі та пошук | онлайн/офлайн, мережі, пошук інформації, посилання, QR-коди | `informatics/networks-internet` | `ai-basics/ai-tools`, `ai-basics/ai-ethics-safety` | Source checking can be included from grade 3 onward. |
| `digital-safety` | Безпека в цифровому середовищі | особиста інформація, пароль, онлайн-спілкування, цифровий добробут | `informatics/digital-safety` | `ai-basics/ai-ethics-safety` | High-value School topic across all grades. |

### School Topic Rules

- The teacher sees School topics, not internal tracks.
- A School topic may map to several internal tags, but the UI should not expose
  that complexity by default.
- If the platform cannot yet issue mixed-tag question sets for School Mode,
  each School topic should first fall back to its primary `informatics` tag.
- Supporting CT/AI tags are enrichment and reporting signals, not a reason to
  rename the teacher-facing topic.
- Do not show Cambridge labels in the School topic picker.
- Do not create separate School topics for every lesson in a yearly program.
  Use learning themes, missions or question-set titles for narrower ideas.

### IT Studios Source Alignment

The teacher-facing School frame is aligned with the five IT Studios content
lines rather than with Cambridge labels:

- Цифрова грамотність;
- Медіатворчість;
- Обчислювальне мислення та програмування;
- Аналіз даних та моделювання;
- Цифрове громадянство.

Rozumko should not expose these five lines as another required picker for
teachers. They are the source model behind a shorter list of School topics.

| IT Studios line | 1-2 class source ideas | 3-4 class source ideas | School Mode topics |
|---|---|---|---|
| Цифрова грамотність | люди і комп'ютери; частини комп'ютера; безпечне використання; клавіатура; керування комп'ютером; вікна програм | пристрої та безпечне використання; інформаційні процеси; системний блок; пам'ять; навігація та налаштування | Комп'ютер і пристрої; Файли, папки і робоче середовище |
| Медіатворчість | програми для різних даних; введення тексту; створення малюнків; фрагменти зображень; шаблони і штампи | цифрові тексти; електронні документи; форматування; текст і зображення; прості презентації | Створення цифрового вмісту; Файли, папки і робоче середовище |
| Обчислювальне мислення та програмування | план, інструкція, алгоритм; виконавці; способи подання; лінійні алгоритми; повторення; події; налагодження | перші програми; алгоритмічні структури; налагодження; програми руху/малювання; повторення; події; умови; ігрові проєкти | Алгоритми і виконавці; Програмування і Scratch |
| Аналіз даних та моделювання | об'єкти та властивості; множини; подання даних; таблиці; поняття моделі | кодування; класифікація; діаграми; карти знань; упорядкування даних; матеріальна та інформаційна модель | Інформація та повідомлення; Дані, таблиці, діаграми |
| Цифрове громадянство | мережа й інтернет; сайт та адреса; безпечна поведінка; пошук в інтернеті | пошук і копіювання даних; авторське право; джерела інформації; творчість і співпраця в інтернеті; цифровий слід; кібербезпека | Інтернет, мережі та пошук; Безпека в цифровому середовищі; Інформація та повідомлення |

### School Topic Set Decision

Use these nine School topics as the v1 teacher-facing picker:

1. Інформація та повідомлення.
2. Комп'ютер і пристрої.
3. Файли, папки і робоче середовище.
4. Створення цифрового вмісту.
5. Дані, таблиці, діаграми.
6. Алгоритми і виконавці.
7. Програмування і Scratch.
8. Інтернет, мережі та пошук.
9. Безпека в цифровому середовищі.

This is intentionally smaller than the full IT Studios module list. It matches
the teacher's practical need in School Mode: quickly choose a familiar
Informatics topic and launch a check or class game.

The School picker may later show grade-specific availability, for example:

| Topic | Grade 1 | Grade 2 | Grade 3 | Grade 4 |
|---|---|---|---|---|
| Інформація та повідомлення | core | core | support | support |
| Комп'ютер і пристрої | core | core | core | core |
| Файли, папки і робоче середовище | support | core | core | core |
| Створення цифрового вмісту | core | core | core | core |
| Дані, таблиці, діаграми | support | core | core | core |
| Алгоритми і виконавці | core | core | core | support |
| Програмування і Scratch | support | core | core | core |
| Інтернет, мережі та пошук | support | core | core | core |
| Безпека в цифровому середовищі | core | core | core | core |

`core` means the topic should have ready-made School checks for that grade.
`support` means the topic may appear as a lighter or integrated check, but it
does not have to be a main entry point yet.

### School Topic Coverage Inventory

Inventory source: `public/questions/grade-1..4.json`, checked 2026-07-23.
Counts below are question counts available in the static practice export.

`Primary` means questions that can be selected today through the main
`informatics` tag for that School topic. `Expanded` means the likely future
pool if School Mode supports curated or mixed-tag selection with CT/AI support
tags.

| School topic | Primary tags | G1 | G2 | G3 | G4 | Expanded G1 | Expanded G2 | Expanded G3 | Expanded G4 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Інформація та повідомлення | `informatics/information` | 6 | 18 | 6 | 6 | 18 | 30 | 18 | 18 |
| Комп'ютер і пристрої | `informatics/computer-systems` | 22 | 6 | 6 | 6 | 28 | 12 | 12 | 12 |
| Файли, папки і робоче середовище | `informatics/digital-tools`, `informatics/computer-systems` | 28 | 12 | 12 | 12 | 34 | 19 | 18 | 18 |
| Створення цифрового вмісту | `informatics/digital-tools` | 6 | 6 | 6 | 6 | 18 | 18 | 18 | 18 |
| Дані, таблиці, діаграми | `informatics/data` | 6 | 6 | 6 | 6 | 24 | 24 | 24 | 24 |
| Алгоритми і виконавці | `informatics/algorithms-programming` | 24 | 29 | 48 | 26 | 36 | 42 | 60 | 38 |
| Програмування і Scratch | `informatics/algorithms-programming` | 24 | 29 | 48 | 26 | 42 | 47 | 66 | 44 |
| Інтернет, мережі та пошук | `informatics/networks-internet` | 6 | 6 | 6 | 6 | 18 | 18 | 18 | 18 |
| Безпека в цифровому середовищі | `informatics/digital-safety` | 6 | 6 | 6 | 19 | 12 | 12 | 12 | 25 |

Interpretation:

- Every School topic has enough primary questions for at least one short check
  in each grade.
- `Створення цифрового вмісту`, `Дані, таблиці, діаграми`, `Інтернет, мережі
  та пошук` and lower-grade `Безпека в цифровому середовищі` are usable but
  thin at the primary-tag level: about one 5-6 question check per grade.
- `Алгоритми і виконавці` and `Програмування і Scratch` currently share the
  same primary technical tag. They need curated question sets or additional
  selection rules before they feel distinct in the School picker.
- `Файли, папки і робоче середовище` and `Створення цифрового вмісту` overlap
  through `informatics/digital-tools`; curated sets would also make them more
  precise.
- Expanded CT/AI support tags are useful for richer missions and aggregate
  insights, but they should not appear as extra teacher-facing directions by
  default.

Near-term content priorities for School Mode:

1. Curate question sets for `Алгоритми і виконавці` vs `Програмування і
   Scratch`.
2. Add more primary-tag questions for `digital-tools`, `data`,
   `networks-internet` and lower-grade `digital-safety`.
3. Keep mixed CT/AI selection as a later improvement after the simple
   Informatics-topic picker is clear and stable.

Implementation note, 2026-07-23:

- `features/school/school-topics.ts` is the v1 School-topic configuration.
- The teacher picker uses the 9 School topics above.
- The API payload still sends the stable internal `track/topic` pair, so
  existing questions, lessons and Home Mode links do not need migration.
- `backend/src/lib/school-topics.ts` is the server allowlist for School topic
  selection. For overlapping topics such as `Алгоритми і виконавці` and
  `Програмування і Scratch`, the server first prefers matching `concept_key`
  values and then tops up from the stable primary topic if the preferred pool is
  still too small.
- `docs/lesson-path-mapping.md` maps ready authored lessons to NUSH topics,
  existing `track/topic` tags, learning themes and Home path points.

### Home Mode

Home Mode is parent-led and child-facing. It should not look like a school
syllabus.

Home Mode should present learning themes as short missions, path points and
seasonal milestones. The same activity can count toward several curriculum tags
when it genuinely integrates skills.

Good Home Mode framing:

- logic mission;
- digital safety challenge;
- data detective;
- AI trust check;
- step-by-step algorithm mission;
- final mission of three directions.

Home reports should translate taxonomy into parent-readable outcomes: attention,
logic, following instructions, checking answers, safe AI habits and confidence
with tasks.

### Olympiad / Seasonal Events

Seasonal events may use learning themes as packages, but official scoring and
diploma-generating results still follow the existing backend-only scoring
rules.

Events should not import School Mode identity or classroom results into Home
Mode.

## Proposed Learning Theme Shape

Learning themes can begin as documentation and later become data if the need is
clear.

Recommended shape:

```ts
interface LearningTheme {
  id: string
  title: string
  gradeRange: Array<1 | 2 | 3 | 4>
  nushLabel: string
  curriculum: Array<{ track: QuestionTrack; topic: string }>
  conceptKeys?: string[]
  surfaces: Array<'school' | 'home' | 'seasonal'>
  source: Array<'nush' | 'teacher-program' | 'cambridge' | 'ai-literacy'>
  useAs: Array<'quick-check' | 'mission' | 'lesson' | 'game' | 'performance-task'>
  notes?: string
}
```

Do not implement this as a database table until there is a concrete workflow
that needs it. For now, a documented mapping is enough.

## Canonical Learning Themes v1

These are the first stable learning themes for planning School checks, Home
missions, micro-lessons, games and seasonal tasks.

The names below are deliberately human-facing. They should sound like lesson,
mission or quick-check themes, not database categories. The technical mapping
stays in the `Existing tags` column.

| ID | Human-facing theme | School-facing label | Home-facing label | Grades | Existing tags | Best use |
|---|---|---|---|---|---|---|
| `how-we-get-information` | Як ми отримуємо інформацію | Інформація та повідомлення | Інфодетектив | 1-2 | `informatics/information` | quick check, sorting game, lesson |
| `digital-or-not` | Цифрове чи нецифрове? | Цифрові інструменти | Обери корисний інструмент | 1 | `informatics/information`, `informatics/digital-tools` | quick check, entry mission |
| `computer-around-us` | Комп'ютер поруч | Комп'ютер і пристрої | Де ховається комп'ютер? | 1-3 | `informatics/computer-systems` | quick check, click trainer, simulator |
| `safe-online-choices` | Безпечно онлайн | Безпека в цифровому середовищі | Мій секрет у безпеці | 1-4 | `informatics/digital-safety`, `ai-basics/ai-ethics-safety` | quick check, scenarios, Home report signal |
| `fact-or-opinion` | Факт чи думка? | Інформація та повідомлення | Детектив фактів | 1-4 | `informatics/information`, `ai-basics/ai-ethics-safety`, `computational-thinking/logic` | game, quick check, trust mission |
| `sort-by-features` | Сортуємо за ознаками | Дані, групування, ознаки | Знайди правило сортування | 1-3 | `computational-thinking/classification`, `informatics/data` | sorting game, quick check |
| `patterns-around-us` | Знайди закономірність | Дані та закономірності | Продовж візерунок | 1-3 | `computational-thinking/patterns`, `informatics/data` | puzzle, mission |
| `questions-tables-conclusions` | Запитання, таблиця, висновок | Дані, таблиці, діаграми | Дані підказують рішення | 2-4 | `informatics/data`, `computational-thinking/classification` | quick check, micro-lesson, mission |
| `steps-in-order` | Кроки в правильному порядку | Алгоритми і виконавці | Крок за кроком | 1-3 | `informatics/algorithms-programming`, `computational-thinking/algorithms` | sequence game, quick check, mission |
| `repeat-without-extra-steps` | Повторення без зайвих кроків | Повторення в алгоритмах | Зроби коротше | 2-4 | `computational-thinking/repetition`, `informatics/algorithms-programming`, `computational-thinking/efficiency` | mission, Scratch-style activity |
| `find-and-fix` | Знайди і виправ помилку | Налагодження алгоритмів | Майстерня помилок | 1-4 | `computational-thinking/debugging`, `informatics/algorithms-programming` | quick check, puzzle, mission |
| `search-and-check` | Пошук і перевірка відповідей | Пошук інформації | Перевір, перш ніж довіряти | 2-4 | `informatics/networks-internet`, `ai-basics/ai-tools`, `ai-basics/ai-ethics-safety` | guided mission, source-check task |
| `ai-or-not` | ШІ чи звичайна програма? | Основи ШІ в цифровому світі | Де тут ШІ? | 1-3 | `ai-basics/what-is-ai`, `informatics/computer-systems` | Home mission, optional School enrichment |
| `ai-needs-examples` | Чому ШІ потрібні приклади | Дані та приклади для ШІ | Навчи помічника прикладами | 2-4 | `ai-basics/how-ai-learns`, `informatics/data`, `computational-thinking/patterns` | Home mission, lesson, seasonal task |
| `ai-can-be-wrong` | Чому ШІ може помилятися | Перевірка відповідей ШІ | Не вір одразу | 3-4 | `ai-basics/ai-ethics-safety`, `ai-basics/human-vs-ai`, `informatics/information` | Home mission, source-check task |
| `message-travel` | Як мандрує повідомлення | Мережі та Інтернет | Подорож повідомлення | 3-4 | `informatics/networks-internet`, `computational-thinking/abstraction` | quick check, model task |
| `protect-the-message` | Як захистити повідомлення | Безпечне передавання даних | Секретне повідомлення | 4 | `informatics/digital-safety`, `informatics/networks-internet`, `computational-thinking/patterns` | puzzle, seasonal mission |
| `useful-digital-product` | Створюємо корисний цифровий продукт | Цифровий продукт / проєкт | Прототип для людини | 3-4 | `informatics/digital-tools`, `computational-thinking/decomposition`, `ai-basics/ai-tools` | performance task, seasonal final |

### Naming Rules

- Prefer short Ukrainian phrases that a teacher or parent can repeat aloud.
- Avoid mechanical labels such as "Data trains AI" when a clearer child-facing
  phrase exists, for example "Чому ШІ потрібні приклади".
- A theme may combine several `track/topic` tags, but it should still have one
  clear human idea.
- Do not create a new theme only because one question needs a nicer title. Use
  the question, mission or lesson title for that.
- Keep School labels close to typical Informatics language; keep Home labels
  warmer and mission-like.

## Initial Alignment Map

This map shows how ideas from the integrated program can be used without
changing the current platform taxonomy.

| Learning theme | School-facing NUSH label | Existing tags | Best surface | Notes |
|---|---|---|---|---|
| Digital vs non-digital choices | Інформація та цифрові інструменти | `informatics/information`, `informatics/digital-tools` | School, Home | Useful for grade 1 entry missions. |
| Computers around us | Комп'ютер і пристрої | `informatics/computer-systems` | School | Keep practical and familiar. |
| AI or not AI | Основи ШІ в цифровому світі | `ai-basics/what-is-ai`, `informatics/computer-systems` | Home, optional School | Use as enrichment, not default NUSH entry. |
| Safe digital behavior | Безпека в цифровому середовищі | `informatics/digital-safety`, `ai-basics/ai-ethics-safety` | School, Home | Strong fit for both modes. |
| Information, facts and opinions | Інформація та повідомлення | `informatics/information`, `ai-basics/ai-ethics-safety` | Home, School | Already represented by fact-opinion activities. |
| Objects, properties and sorting | Дані, групування, ознаки | `computational-thinking/classification`, `informatics/data` | School, Home | Good bridge between Informatics and CT. |
| Patterns and pictograms | Дані та закономірності | `computational-thinking/patterns`, `informatics/data` | Home | Good mission mechanic and report signal. |
| Instructions and algorithms | Алгоритми і виконавці | `informatics/algorithms-programming`, `computational-thinking/algorithms` | School, Home | Core shared theme. |
| Order matters | Алгоритми і порядок команд | `computational-thinking/algorithms`, `computational-thinking/debugging` | School, Home | Strong quick-check format. |
| Repetition and loops | Повторення в алгоритмах | `computational-thinking/repetition`, `informatics/algorithms-programming` | Home, later School | Can become games and Scratch-style tasks. |
| Search vs AI answer | Пошук інформації | `informatics/networks-internet`, `ai-basics/ai-tools`, `ai-basics/ai-ethics-safety` | Home, optional School | Should be age-gated and source-check focused. |
| Training data and fairness | Дані для ШІ | `informatics/data`, `ai-basics/how-ai-learns`, `ai-basics/ai-ethics-safety` | Home | Better as guided mission than quick quiz. |
| Spreadsheet or data model | Дані, таблиці, діаграми | `informatics/data`, `computational-thinking/classification` | Home, School | Useful for grades 3-4. |
| Networks and client-server model | Мережі та Інтернет | `informatics/networks-internet`, `computational-thinking/abstraction` | School, Seasonal | Keep simple for School quick checks. |
| Secure transfer and encryption idea | Безпека даних | `informatics/digital-safety`, `informatics/networks-internet`, `computational-thinking/patterns` | Seasonal, Home | Better as mission or puzzle than raw quiz. |
| Human-centred prototype | Цифровий продукт / проєкт | `informatics/digital-tools`, `computational-thinking/decomposition`, `ai-basics/ai-tools` | Home, Seasonal | Not first-priority School Mode. |

## What To Do With The Teacher's Integrated Program

Use it as a source of richer mission ideas, not as a replacement taxonomy.

Good uses:

- new Home path points;
- new micro-lessons;
- scenario games;
- sorting and sequence content packs;
- seasonal finals;
- teacher-facing quick checks when they map clearly to NUSH labels;
- parent-readable report phrases.

Avoid:

- exposing Cambridge labels as primary School Mode navigation;
- turning all integrated program topics into platform `topic` values;
- making AI literacy a required step for every School Mode Informatics topic;
- duplicating the Home path map under a separate Cambridge path;
- importing classroom identity or performance into Home reports.

## Topic Expansion Policy

Default answer: do not add a new topic.

Add a topic only when all are true:

1. Existing topics cannot represent the content without misleading reports or
   filters.
2. At least two grades or multiple mission formats will use the topic.
3. The topic is understandable to teachers and parents.
4. The bank can be populated with enough published questions or activities.
5. The change updates backend validation, shared UI taxonomy, docs and tests.

If only one lesson or mission needs the idea, use a learning theme or mission
title instead.

## Near-Term Action Plan

1. Keep the existing `track/topic` taxonomy unchanged.
2. Update stale documentation counts where needed so docs match the current
   673-question bank.
3. Use this document as the alignment checklist before adding content from the
   integrated program.
4. Harden the Home path editor so curriculum `topic` values use the same known
   topic list as questions.
5. For each new content idea, choose:
   - existing `track/topic` tags;
   - optional `concept_key`;
   - School/Home/seasonal surface;
   - whether it is a quick check, mission, micro-lesson, game or final.

## Decision Filter

Before adding a new content unit, ask:

1. Is this a new stable taxonomy concept, or just a learning theme?
2. Can a typical NUSH Informatics teacher find it without knowing Cambridge?
3. Can a parent understand the Home value without school jargon?
4. Does it reuse existing `track/topic` tags?
5. Does it preserve School/Home separation and server-side scoring rules?

If the answer to item 4 is "yes", do not add a new `topic`.
