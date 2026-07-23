# Authored Lessons To Curriculum And Home Path Mapping

_Created: 2026-07-23_

This document maps ready authored lessons from `temp/authored-lessons` to the
current Rozumko curriculum frame.

Goal:

> `lessonId -> grade -> NUSH topic -> internal track/topic -> learning theme ->
> Home path point`.

This is a planning bridge. The lesson JSON files do not contain `track/topic`
metadata, and importing them into the database will not make them visible in
Home Mode by itself. A lesson becomes visible only when a Home path point
references its `lessonId` and the lesson is published/exported.

## Mapping Rules

- Keep the stable internal taxonomy unchanged: `track/topic` remains the
  technical source of truth.
- Use NUSH topics as teacher-facing labels, not as new database topics.
- Use learning themes as a planning layer for School checks, Home path points
  and future achievements.
- Use existing Home path points when the lesson naturally fits.
- Mark a Home path point as `candidate` when the current map has no honest
  place for the lesson.
- Import ready lessons as drafts first; publish and export only after the path
  mapping is approved.

## Current Coverage Summary

| Grade | Authored lesson blocks | Lessons | Current Home path fit |
|---|---:|---:|---|
| 1 | information, computers, data, algorithms, digital tools, networks, safety | 42 | partial: information, sorting/data, algorithms and safety fit; computers, digital tools and networks need candidate points |
| 2 | information, computers, data, algorithms, digital creation/files, networks, safety | 42 | partial: information, computers, algorithms and safety fit; data, digital creation/files and networks need candidate points |

## Recommended First Integration Order

1. Grade 2 existing points:
   - `g2-info-start`;
   - `g2-digital-safety`;
   - `g2-ct-algorithms`;
   - `g2-assembly`.

2. Grade 1 existing points:
   - `g1-info-senses`;
   - `g1-sort-start`;
   - `g1-ct-algorithms`;
   - `g1-digital-safety`.

3. Candidate points after the existing path is stable:
   - `g1-computer-around-us`;
   - `g1-digital-tools`;
   - `g1-internet-basics`;
   - `g2-data-tables`;
   - `g2-digital-creation`;
   - `g2-internet-search`.

## Grade 1 Lessons

| lessonId | Lesson title | NUSH topic | Internal track/topic | Learning theme | Home path point |
|---|---|---|---|---|---|
| `info-what-is-information-g1` | Що таке інформація? | Інформація та повідомлення | `informatics/information` | `how-we-get-information` | existing: `g1-info-senses` |
| `info-senses-helpers-g1` | П'ять помічників людини | Інформація та повідомлення | `informatics/information` | `how-we-get-information` | existing: `g1-info-senses` |
| `info-messages-and-transfer-g1` | Якими бувають повідомлення | Інформація та повідомлення | `informatics/information` | `how-we-get-information` | existing: `g1-info-senses` |
| `info-presentation-forms-g1` | Як можна подати інформацію | Інформація та повідомлення | `informatics/information` | `how-we-get-information` | existing: `g1-info-senses` |
| `info-actions-g1` | Що ми робимо з інформацією | Інформація та повідомлення | `informatics/information` | `how-we-get-information` | existing: `g1-info-senses` |
| `info-sender-receiver-g1` | Хто передає і хто отримує повідомлення | Інформація та повідомлення | `informatics/information` | `how-we-get-information` | existing: `g1-info-senses` |
| `comp-what-is-computer-g1` | Комп'ютери навколо нас | Комп'ютер і пристрої | `informatics/computer-systems` | `computer-around-us` | candidate: `g1-computer-around-us` |
| `comp-types-g1` | Якими бувають комп'ютери | Комп'ютер і пристрої | `informatics/computer-systems` | `computer-around-us` | candidate: `g1-computer-around-us` |
| `comp-main-parts-g1` | Складові настільного комп'ютера | Комп'ютер і пристрої | `informatics/computer-systems` | `computer-around-us` | candidate: `g1-computer-around-us` |
| `comp-input-devices-g1` | Пристрої введення інформації | Комп'ютер і пристрої | `informatics/computer-systems` | `computer-around-us` | candidate: `g1-computer-around-us` |
| `comp-output-devices-g1` | Пристрої виведення інформації | Комп'ютер і пристрої | `informatics/computer-systems` | `computer-around-us` | candidate: `g1-computer-around-us` |
| `comp-devices-work-together-g1` | Як пристрої працюють разом | Комп'ютер і пристрої | `informatics/computer-systems` | `computer-around-us` | candidate: `g1-computer-around-us` |
| `data-what-are-data-g1` | Дані навколо нас | Дані, таблиці, діаграми | `informatics/data`, `computational-thinking/classification` | `sort-by-features` | existing: `g1-sort-start` |
| `data-object-features-g1` | Ознаки предметів | Дані, таблиці, діаграми | `informatics/data`, `computational-thinking/classification` | `sort-by-features` | existing: `g1-sort-start` |
| `data-grouping-one-feature-g1` | Групуємо за однією ознакою | Дані, таблиці, діаграми | `informatics/data`, `computational-thinking/classification` | `sort-by-features` | existing: `g1-sort-start` |
| `data-ordering-objects-g1` | Упорядковуємо предмети | Дані, таблиці, діаграми | `informatics/data`, `computational-thinking/patterns` | `patterns-around-us` | existing: `g1-ct-patterns` |
| `data-simple-tables-g1` | Збираємо дані в таблицю | Дані, таблиці, діаграми | `informatics/data` | `questions-tables-conclusions` | candidate: `g1-data-basics` |
| `data-simple-charts-g1` | Читаємо прості діаграми | Дані, таблиці, діаграми | `informatics/data`, `computational-thinking/patterns` | `questions-tables-conclusions` | candidate: `g1-data-basics` |
| `algo-what-is-algorithm-g1` | Що таке алгоритм | Алгоритми і виконавці | `informatics/algorithms-programming`, `computational-thinking/algorithms` | `steps-in-order` | existing: `g1-ct-algorithms` |
| `algo-commands-and-order-g1` | Команди та порядок дій | Алгоритми і виконавці | `informatics/algorithms-programming`, `computational-thinking/algorithms` | `steps-in-order` | existing: `g1-ct-algorithms` |
| `algo-performers-g1` | Виконавці команд | Алгоритми і виконавці | `informatics/algorithms-programming`, `computational-thinking/algorithms` | `steps-in-order` | existing: `g1-ct-algorithms` |
| `algo-arrow-sequences-g1` | Складаємо алгоритми зі стрілок | Алгоритми і виконавці | `informatics/algorithms-programming`, `computational-thinking/algorithms` | `steps-in-order` | existing: `g1-ct-algorithms` |
| `algo-debugging-g1` | Знаходимо і виправляємо помилки | Алгоритми і виконавці | `informatics/algorithms-programming`, `computational-thinking/debugging` | `find-and-fix` | existing: `g1-logic-bridge` |
| `algo-first-program-g1` | Від алгоритму до програми | Програмування і Scratch | `informatics/algorithms-programming`, `computational-thinking/algorithms` | `steps-in-order` | candidate: `g1-programming-intro` |
| `tools-what-is-digital-tool-g1` | Що таке цифрові інструменти | Створення цифрового вмісту | `informatics/digital-tools` | `digital-or-not` | candidate: `g1-digital-tools` |
| `tools-digital-drawing-g1` | Малюємо на екрані | Створення цифрового вмісту | `informatics/digital-tools` | `useful-digital-product` | candidate: `g1-digital-tools` |
| `tools-digital-text-g1` | Пишемо та змінюємо текст | Створення цифрового вмісту | `informatics/digital-tools` | `useful-digital-product` | candidate: `g1-digital-tools` |
| `tools-sound-and-image-g1` | Записуємо звук і створюємо зображення | Створення цифрового вмісту | `informatics/digital-tools` | `useful-digital-product` | candidate: `g1-digital-tools` |
| `tools-create-save-open-g1` | Створюємо та зберігаємо цифрову роботу | Файли, папки і робоче середовище | `informatics/digital-tools` | `useful-digital-product` | candidate: `g1-digital-tools` |
| `tools-care-health-and-respect-g1` | Працюємо безпечно та відповідально | Безпека в цифровому середовищі | `informatics/digital-tools`, `informatics/digital-safety` | `safe-online-choices` | existing: `g1-digital-safety` |
| `net-connections-around-us-g1` | Зв'язки навколо нас | Інтернет, мережі та пошук | `informatics/networks-internet` | `message-travel` | candidate: `g1-internet-basics` |
| `net-computer-network-g1` | Комп'ютерна мережа | Інтернет, мережі та пошук | `informatics/networks-internet` | `message-travel` | candidate: `g1-internet-basics` |
| `net-what-is-internet-g1` | Що таке інтернет | Інтернет, мережі та пошук | `informatics/networks-internet` | `message-travel` | candidate: `g1-internet-basics` |
| `net-websites-and-browser-g1` | Сайти та браузер | Інтернет, мережі та пошук | `informatics/networks-internet` | `search-and-check` | candidate: `g1-internet-basics` |
| `net-online-activities-g1` | Що люди роблять онлайн | Інтернет, мережі та пошук | `informatics/networks-internet` | `search-and-check` | candidate: `g1-internet-basics` |
| `net-safe-internet-g1` | Безпека в інтернеті | Безпека в цифровому середовищі | `informatics/networks-internet`, `informatics/digital-safety` | `safe-online-choices` | existing: `g1-digital-safety` |
| `safety-screen-breaks-g1` | Перерви під час роботи з екраном | Безпека в цифровому середовищі | `informatics/digital-safety` | `safe-online-choices` | existing: `g1-digital-safety` |
| `safety-workplace-g1` | Безпечне робоче місце | Безпека в цифровому середовищі | `informatics/digital-safety`, `informatics/computer-systems` | `safe-online-choices` | existing: `g1-digital-safety` |
| `safety-device-care-g1` | Дбайливо поводимося з технікою | Безпека в цифровому середовищі | `informatics/digital-safety`, `informatics/computer-systems` | `safe-online-choices` | existing: `g1-digital-safety` |
| `safety-personal-data-g1` | Бережемо особисті дані та паролі | Безпека в цифровому середовищі | `informatics/digital-safety`, `ai-basics/ai-ethics-safety` | `safe-online-choices` | existing: `g1-digital-safety` |
| `safety-unexpected-online-g1` | Що робити в неприємній ситуації онлайн | Безпека в цифровому середовищі | `informatics/digital-safety`, `ai-basics/ai-ethics-safety` | `safe-online-choices` | existing: `g1-digital-safety` |
| `safety-digital-behavior-g1` | Ввічливість у цифровому світі | Безпека в цифровому середовищі | `informatics/digital-safety`, `ai-basics/ai-ethics-safety` | `safe-online-choices` | existing: `g1-digital-safety` |

## Grade 2 Lessons

| lessonId | Lesson title | NUSH topic | Internal track/topic | Learning theme | Home path point |
|---|---|---|---|---|---|
| `info-questions-g2` | Інформація допомагає відповідати на запитання | Інформація та повідомлення | `informatics/information` | `how-we-get-information` | existing: `g2-info-start` |
| `info-presentation-types-g2` | Способи подання інформації | Інформація та повідомлення | `informatics/information` | `how-we-get-information` | existing: `g2-info-start` |
| `info-processes-g2` | Дії з інформацією | Інформація та повідомлення | `informatics/information` | `how-we-get-information` | existing: `g2-info-start` |
| `info-messages-signs-carriers-g2` | Повідомлення, знаки та носії інформації | Інформація та повідомлення | `informatics/information` | `how-we-get-information` | existing: `g2-info-start` |
| `info-fact-assumption-fantasy-g2` | Факт, припущення та фантазія | Інформація та повідомлення | `informatics/information`, `ai-basics/ai-ethics-safety` | `fact-or-opinion` | existing: `g2-fact-opinion` |
| `info-check-and-protect-g2` | Перевіряємо інформацію та захищаємося | Інформація та повідомлення | `informatics/information`, `informatics/digital-safety` | `fact-or-opinion`, `safe-online-choices` | existing: `g2-fact-opinion` |
| `computer-digital-devices-g2` | Комп'ютер та інші цифрові пристрої | Комп'ютер і пристрої | `informatics/computer-systems` | `computer-around-us` | existing: `g2-assembly` |
| `computer-choose-device-g2` | Обираємо пристрій для завдання | Комп'ютер і пристрої | `informatics/computer-systems` | `computer-around-us` | existing: `g2-assembly` |
| `computer-parts-g2` | Складові настільного комп'ютера | Комп'ютер і пристрої | `informatics/computer-systems` | `computer-around-us` | existing: `g2-assembly` |
| `computer-input-devices-g2` | Пристрої введення даних | Комп'ютер і пристрої | `informatics/computer-systems`, `informatics/data` | `computer-around-us` | existing: `g2-assembly` |
| `computer-output-and-combined-g2` | Пристрої виведення та пристрої з кількома діями | Комп'ютер і пристрої | `informatics/computer-systems` | `computer-around-us` | existing: `g2-assembly` |
| `computer-system-and-help-g2` | Як пристрої працюють разом | Комп'ютер і пристрої | `informatics/computer-systems` | `computer-around-us` | existing: `g2-assembly` |
| `data-concept-g2` | Що таке дані | Дані, таблиці, діаграми | `informatics/data` | `sort-by-features` | candidate: `g2-data-tables` |
| `data-collection-g2` | Збираємо дані | Дані, таблиці, діаграми | `informatics/data` | `questions-tables-conclusions` | candidate: `g2-data-tables` |
| `data-coding-g2` | Кодуємо та розкодовуємо дані | Дані, таблиці, діаграми | `informatics/data`, `computational-thinking/patterns` | `patterns-around-us` | existing: `g2-ct-patterns` |
| `data-grouping-sorting-g2` | Групуємо та впорядковуємо дані | Дані, таблиці, діаграми | `informatics/data`, `computational-thinking/classification` | `sort-by-features` | existing: `g2-ct-multisort` |
| `data-tables-g2` | Записуємо дані в таблицю | Дані, таблиці, діаграми | `informatics/data` | `questions-tables-conclusions` | candidate: `g2-data-tables` |
| `data-charts-g2` | Читаємо діаграми та робимо висновки | Дані, таблиці, діаграми | `informatics/data` | `questions-tables-conclusions` | candidate: `g2-data-tables` |
| `algo-properties-g2` | Алгоритм і його властивості | Алгоритми і виконавці | `informatics/algorithms-programming`, `computational-thinking/algorithms` | `steps-in-order` | existing: `g2-ct-algorithms` |
| `algo-performer-system-g2` | Виконавець і система команд | Алгоритми і виконавці | `informatics/algorithms-programming`, `computational-thinking/algorithms` | `steps-in-order` | existing: `g2-ct-algorithms` |
| `algo-representation-g2` | Способи подання алгоритмів | Алгоритми і виконавці | `informatics/algorithms-programming`, `computational-thinking/algorithms` | `steps-in-order` | existing: `g2-ct-algorithms` |
| `algo-linear-routes-g2` | Лінійні алгоритми та маршрути | Алгоритми і виконавці | `informatics/algorithms-programming`, `computational-thinking/algorithms` | `steps-in-order` | existing: `g2-ct-algorithms` |
| `algo-repetition-g2` | Повторюємо команди | Програмування і Scratch | `informatics/algorithms-programming`, `computational-thinking/repetition` | `repeat-without-extra-steps` | existing: `g2-ct-algorithms` |
| `algo-program-test-debug-g2` | Створюємо, запускаємо й налагоджуємо програму | Програмування і Scratch | `informatics/algorithms-programming`, `computational-thinking/debugging` | `find-and-fix` | existing: `g2-ct-algorithms` |
| `tools-graphics-editing-g2` | Створюємо та редагуємо цифрові малюнки | Створення цифрового вмісту | `informatics/digital-tools` | `useful-digital-product` | candidate: `g2-digital-creation` |
| `tools-graphics-objects-g2` | Працюємо з об'єктами на малюнку | Створення цифрового вмісту | `informatics/digital-tools`, `computational-thinking/decomposition` | `useful-digital-product` | candidate: `g2-digital-creation` |
| `tools-text-editing-g2` | Вводимо та редагуємо текст | Створення цифрового вмісту | `informatics/digital-tools` | `useful-digital-product` | candidate: `g2-digital-creation` |
| `tools-text-formatting-g2` | Форматуємо текст | Створення цифрового вмісту | `informatics/digital-tools` | `useful-digital-product` | candidate: `g2-digital-creation` |
| `tools-presentation-g2` | Створюємо просту презентацію | Створення цифрового вмісту | `informatics/digital-tools`, `computational-thinking/decomposition` | `useful-digital-product` | candidate: `g2-digital-creation` |
| `tools-files-project-g2` | Зберігаємо, відкриваємо та впорядковуємо файли | Файли, папки і робоче середовище | `informatics/digital-tools` | `useful-digital-product` | candidate: `g2-digital-creation` |
| `net-network-and-internet-g2` | Комп'ютерна мережа та інтернет | Інтернет, мережі та пошук | `informatics/networks-internet` | `message-travel` | candidate: `g2-internet-search` |
| `net-connections-and-sharing-g2` | Як пристрої з'єднуються та обмінюються даними | Інтернет, мережі та пошук | `informatics/networks-internet` | `message-travel` | candidate: `g2-internet-search` |
| `net-sites-browser-links-g2` | Сайти, вебсторінки, браузер і посилання | Інтернет, мережі та пошук | `informatics/networks-internet` | `search-and-check` | candidate: `g2-internet-search` |
| `net-search-g2` | Шукаємо інформацію в інтернеті | Інтернет, мережі та пошук | `informatics/networks-internet`, `ai-basics/ai-tools` | `search-and-check` | candidate: `g2-internet-search` |
| `net-communication-collaboration-g2` | Спілкуємося та працюємо разом онлайн | Інтернет, мережі та пошук | `informatics/networks-internet`, `informatics/digital-safety` | `message-travel`, `safe-online-choices` | candidate: `g2-internet-search` |
| `net-safe-sharing-g2` | Безпечно користуємося мережею | Безпека в цифровому середовищі | `informatics/networks-internet`, `informatics/digital-safety` | `safe-online-choices` | existing: `g2-digital-safety` |
| `safety-cyberhygiene-g2` | Щоденні правила кібергігієни | Безпека в цифровому середовищі | `informatics/digital-safety` | `safe-online-choices` | existing: `g2-digital-safety` |
| `safety-passwords-accounts-g2` | Паролі та облікові записи | Безпека в цифровому середовищі | `informatics/digital-safety`, `ai-basics/ai-ethics-safety` | `safe-online-choices` | existing: `g2-digital-safety` |
| `safety-personal-data-footprint-g2` | Особисті дані та цифровий слід | Безпека в цифровому середовищі | `informatics/digital-safety`, `ai-basics/ai-ethics-safety` | `safe-online-choices` | existing: `g2-digital-safety` |
| `safety-links-files-tricks-g2` | Підозрілі повідомлення, посилання та файли | Безпека в цифровому середовищі | `informatics/digital-safety`, `ai-basics/ai-ethics-safety` | `safe-online-choices` | existing: `g2-digital-safety` |
| `safety-screen-balance-g2` | Здоровий баланс під час роботи з екраном | Безпека в цифровому середовищі | `informatics/digital-safety` | `safe-online-choices` | existing: `g2-digital-safety` |
| `safety-cyberbullying-help-g2` | Кібербулінг і звернення по допомогу | Безпека в цифровому середовищі | `informatics/digital-safety`, `ai-basics/ai-ethics-safety` | `safe-online-choices` | existing: `g2-digital-safety` |

## Existing Home Path Points To Update First

| Home path point | Current state | Candidate lessons to attach |
|---|---|---|
| `g2-info-start` | already has `info-senses-g2` | add or replace with selected grade 2 information lessons after review |
| `g2-digital-safety` | already has `private-info-g2` | add selected safety lessons as theory steps or alternate lesson variants |
| `g2-ct-algorithms` | already has `algorithms-order-g2` | add selected algorithm lessons, especially `algo-properties-g2`, `algo-linear-routes-g2`, `algo-program-test-debug-g2` |
| `g2-assembly` | simulator only | add one computer-systems lesson before the simulator |
| `g1-info-senses` | sorting activity only | add one entry information lesson |
| `g1-sort-start` | sorting activity only | add one short data/features lesson if reading load is acceptable |
| `g1-ct-algorithms` | mission only | add one short algorithm lesson |
| `g1-digital-safety` | mission only | add one safety lesson before the mission |

## Candidate New Home Path Points

| Candidate point ID | Grade | Why it exists | Suggested first lessons |
|---|---:|---|---|
| `g1-computer-around-us` | 1 | Grade 1 has six computer-device lessons but no current Home point for them. | `comp-what-is-computer-g1`, `comp-main-parts-g1`, `comp-devices-work-together-g1` |
| `g1-digital-tools` | 1 | Digital creation is a core NUSH expectation and does not fit cleanly into current grade 1 path. | `tools-what-is-digital-tool-g1`, `tools-create-save-open-g1` |
| `g1-internet-basics` | 1 | Networks content exists, but current grade 1 path only has safety, not internet concepts. | `net-what-is-internet-g1`, `net-websites-and-browser-g1`, `net-safe-internet-g1` |
| `g1-data-basics` | 1 | Tables/charts are stronger than the existing sorting/pattern points. | `data-simple-tables-g1`, `data-simple-charts-g1` |
| `g1-programming-intro` | 1 | The "first program" lesson is more advanced than the current algorithms point. | `algo-first-program-g1` |
| `g2-data-tables` | 2 | Grade 2 has full data/table/chart coverage, but no explicit Home data point. | `data-collection-g2`, `data-tables-g2`, `data-charts-g2` |
| `g2-digital-creation` | 2 | Digital content/files lessons are complete but not represented in the current grade 2 path. | `tools-text-editing-g2`, `tools-presentation-g2`, `tools-files-project-g2` |
| `g2-internet-search` | 2 | Networks/search lessons are complete but not represented in the current grade 2 path. | `net-network-and-internet-g2`, `net-search-g2`, `net-safe-sharing-g2` |

## Product Decision

Do not import all 84 lessons directly into the live Home path.

Recommended sequence:

1. Import all lesson JSON as drafts.
2. Review and publish only the first selected block.
3. Attach 4-6 lessons to existing Home path points.
4. Verify the child flow on mobile.
5. Add candidate path points only after the existing path points feel coherent.

This keeps the platform from becoming a content warehouse and protects the
clear learning-loop direction documented in `docs/app-reference.md`.
