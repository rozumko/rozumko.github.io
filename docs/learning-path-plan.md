# План впровадження: навчальний шлях у домашньому режимі

Статус: етапи 0–2 і 4.1–4.2 виконані (2026-07-10); далі — етап 3 (акаунти,
чекає рішення про прив'язку лідів) і 4.3–4.4 (save_server — разом із картами
3–4 класів етапу 5; alt_cs — вибірковий імпорт у банк).
Доповнення 2026-07-11: мікро-уроки, зріз 1 виконано (див. розділ
«Мікро-уроки» нижче).

Мета: перетворити розрізнені тести, ігри та головоломки на послідовний дитячий
досвід — карту шляху з точками за темами, трьома гілками (Інформатика /
Обчислювальне мислення / Основи ШІ), відмітками виконання і поступовим
відкриванням. Модель доступу — як у Khan Academy Kids: батько реєструє акаунт,
створює профілі дітей; дитина обирає профіль і грає.

## Вихідний стан (перевірено 2026-07-10)

- Банк практики: **673 питання** у `public/questions/grade-1..4.json`; кожен
  клас покриває всі 22 теми трьох треків (мін. 6 питань на тему).
  Формати: 608 choice, 18 truefalse, 15 match, 13 sort, 10 input, 9 sequence.
- Ігри: сортування ×3 (`features/games/sorting-game.ts`, 5+2+3 рівні; 2 гри під
  UI-замком підписки) + головоломки 6 типів (`puzzle-engine.ts`, параметричні,
  1–4 клас). `sorting-game` має `onComplete(summary)`, який нікуди не звітується;
  головоломки контракту завершення не мають.
- Місії: `features/missions/mission-runner.ts` + `pickMissionQuestions`;
  home.html = вибір клас+трек → 6 завдань.
- Бекенд домашнього режиму вже існує: `homeLeads`, `homeChildProfiles`,
  `homeEntitlements`, `homeDemoAttempts/Reports`, payment webhook, club-ендпоінти
  (`backend/src/routes/home.ts`). Обмеження: профіль дитини скрізь береться як
  перший за `leadId` через `limit(1)`; lead-id у URL фактично є bearer-секретом;
  повторного входу з іншого пристрою немає.
- Міграції: остання `0028_enable_rls_all_application_tables.sql`. ⚠️ Перед новими
  міграціями звірити, що 0027/0028 застосовані на проді.
- `docs/content-taxonomy.md` каже «482 питання» — застаріло (насправді 673).
- `temp/new/`: fact-or-opinion (готовність висока), assembly ×2 і save_server
  (потрібна вичистка), alt_cs (не інтегруємо).

## Наскрізні правила (кожен етап)

- Фронтенд: `npm run typecheck && npm test && npm run build`; бекенд:
  `cd backend && npm run build && npm test`; Playwright layout-тести в CI.
- Перед змінами auth/API/оцінювання — перечитати `docs/security-model.md`.
- Нові params/body ID — UUID-валідація до звернення в БД.
- Security regression tests не послаблюємо.
- Кожен етап завершується працюючим продуктом (можна зупинитись після будь-якого).

---

## Етап 0 — Гігієна (розмір S)

0.1. Оновити `docs/content-taxonomy.md`: 482 → 673, актуальний розподіл за
     треками і форматами.
0.2. Звірити стан міграцій на проді (0027, 0028); застосувати відсутні.
0.3. Зафіксувати рішення по `temp/new/`: fact-or-opinion → інтегруємо (етап 4);
     assembly, save_server → інтегруємо після вичистки; alt_cs → вибірково
     перенести формулювання через `backend/scripts/import-temp-content`, папку
     видалити.

## Етап 1 — Контракт завершення активності (розмір M)

Фундамент: єдиний формат «активність завершена», спільний для місій, ігор і
головоломок. Без нього карта не знатиме, що точка пройдена.

1.1. Тип `ActivityResult` (новий модуль `features/path/activity-result.ts`):
     `{ activityType: 'mission'|'game'|'puzzle', activityId, activityVersion,
     grade, curriculum: [{ track, topic }], trust: 'client-unverified', stars,
     correct, total, durationSec, completedAt }`.
1.2. Адаптери до контракту:
     - sorting-game: наявний `onComplete` → `ActivityResult`;
     - puzzle-engine: додати callback завершення сесії (зараз результат лише
       локальний);
     - mission-runner: адаптер від `mission-result.ts`.
1.3. Локальний progress-store (`features/path/progress-store.ts`):
     localStorage, версіонована схема, **черга подій з ідемпотентними записами**
     (childProfile-agnostic поки), щоб на етапі 3 синхронізуватись із сервером
     без переробки. Unit-тести на store і мердж черги.

## Етап 2 — Карта шляху, пілот 2-го класу (розмір L)

2.1. Формат карти — статичний TS-модуль `features/path/path-data.ts`
     (версіонується з кодом; БД/адмінка — свідомо пізніше). Модель точки:
     `{ id, grade, curriculum: [{ track, topic }], title, icon,
     activities: [{ id, version, title, activity, required }], unlockAfter: pointId[],
     position: {x,y} }`.
2.2. Сторінка `path.html` + `features/path/path-map.ts`: SVG-мапа, стани точок
     (locked / available / completed зі зірками), три гілки з візуальними
     перетинами. Доступність за наявним стандартом проєкту: клавіатурна
     навігація по точках, aria-стани, фокус-стилі. Дизайн — tokens.css, без
     нових залежностей. Дотримати quiz-fit контракт (без прокрутки на екрані
     активності; мапа може скролитись).
2.3. Запуск активності з точки і повернення на карту з відміткою
     (через контракт етапу 1). Поступове відкривання: точка доступна, коли всі
     `unlockAfter` completed.
2.4. Пілотна карта 2-го класу, 9 точок (типи активностей чесно розрізняти
     іконками — частина точок спершу quiz-only):
     1. Як ми отримуємо інформацію — ІнфоСорт (informatics/information)
     2. Сортуємо за різними правилами — Мульти-Сортування (CT/classification)
     3. Факт, думка чи міф — нова гра, точка перетину
        informatics/information ↔ ai-basics/ai-ethics-safety (після етапу 4.1 —
        до того тимчасово місія з банку)
     4. Збираємо комп'ютер — симулятор (informatics/hardware)
     5. Знаходимо закономірність — головоломки sequence/symbols (CT/patterns)
     6. Як ШІ розпізнає об'єкти — місія (ai-basics/ai-perception)
     7. Що не можна повідомляти онлайн — місія (informatics/digital-safety)
     8. Будуємо точний алгоритм — місія + головоломка machine (CT/algorithms)
     9. Фінальна місія — по 3 питання з кожного з трьох напрямів
2.5. Playwright layout-тести карти (desktop + mobile viewport), тест циклу
     «пройти активність → точка completed → наступна відкрилась» на localStorage.

Після етапу 2 продукт уже показуваний: карта працює без реєстрації, прогрес
локальний на пристрої.

## Етап 3 — Батьківські акаунти: еволюція homeLeads (розмір XL)

Принципи: діти ніколи не мають власного auth; шкільний вхід за exchange-code не
змішується з домашнім; entitlement лишається на рівні батьківського акаунта.

3.1. Оновити `docs/security-model.md` розділом «домашні акаунти» ДО коду:
     ролі, межі довіри, потоки токенів, загрози (перебір lead-id, ізоляція
     профілів між акаунтами, дитина ≠ адміністратор профілів).
3.2. ✅ (2026-07-10) Auth батька — Supabase Auth; статус — із БД через
     `GET /api/parent/me`. Реалізовано ОКРЕМИМ `lib/parent-auth.ts` (не
     розширенням auth.ts): жодного дотику до app_users/auto-provisioning —
     захищено guard-тестом у parent-accounts-schema.test.ts. Акаунт
     створюється явним ідемпотентним `POST /api/parent/register`.
3.3. ✅ Міграція 0029 (2026-07-10): окрема `home_parent_accounts` (1:1 із
     Supabase Auth, RLS, unique auth_user_id/email) + nullable
     `parent_account_id` на `home_leads` (і `claimed_at`) та
     `home_child_profiles`; FK — ON DELETE RESTRICT (fail-closed до політики
     видалення). Runtime-авторизація НЕ ввімкнена; guard-тест
     `backend/src/db/parent-accounts-schema.test.ts` фіксує форму і забороняє
     передчасні /api/parent у server.ts. Наступні зрізи: прибрати неявний
     контракт «один профіль на лід» — нові ендпоінти приймають явний
     `childProfileId` (UUID-валідація); старі lead-ендпоінти лишаються для
     сумісності демо без реєстрації.
3.4. Нові маршрути `/api/parent/*`:
     - ✅ `POST /register` (ідемпотентний), ✅ `GET /me`, ✅ `GET /profiles`
       (лише власні, скоуп за parent_account_id);
     - ✅ `POST /claim-lead` — потрійна перевірка (parent auth + чинний
       lead-token + збіг підтвердженого email), транзакційно з race-guard
       `WHERE parent_account_id IS NULL`, ідемпотентно для свого ліда,
       409 fail-closed для чужого, rate-limit 5/хв; backfill
       `home_child_profiles.parent_account_id`. Тести: parent-claim.test.ts
       (чиста логіка) + parent-flow.test.ts (ізоляція між акаунтами);
     - ✅ (зріз 4) `POST /profiles` (ліміт 6, лише displayName+grade, без ліда —
       міграція 0030: lead_id nullable + ownership-CHECK) і
       `PATCH /profiles/:childProfileId` (ownership → 404 для чужого).
       DELETE свідомо відсутній до документованої retention-політики;
     - ✅ (зріз 4) `GET /profiles/:childProfileId/reports` — обʼєднані
       demo+practice звіти лише власного профілю;
     - ✅ (зріз 4) `GET /entitlement` — агрегат по заклеймлених лідах через
       hasHomeAccess; підписка ЛИШАЄТЬСЯ на рівні ліда (webhook незмінний),
       повний переїзд на account-level — окремий зріз;
     - ✅ (зріз 5) `GET/POST /profiles/:childProfileId/path-progress`;
     - ✅ (зріз 6) типізований parent/path API у `features/api/client.ts`,
       tab-scoped parent session і profile-scoped offline sync карти;
     - ✅ (зріз 7) `parent.html`: вхід/реєстрація дорослого, створення й явний
       вибір профілю; дитина входить у карту без власного пароля;
     - ✅ (зріз 8) легкий батьківський огляд: стан Home-доступу та останній
       серверний звіт кожної дитини без клієнтського переоцінювання результату;
     - ✅ (зріз 9) редагування імені та класу дитячого профілю через ownership-gated PATCH;
     - далі: subscription purchase UI,
       підтверджуване перенесення anonymous local-прогресу, переїзд entitlement.
3.5. ✅ Серверний прогрес шляху: `home_path_progress` + `home_path_events`
     (міграція 0031), unique на профіль+шлях+точку та профіль+event-key.
     POST перевіряє ownership, клас, catalog point/activity/version і всі
     unlockAfter; повтор тієї самої події не збільшує attempts.
     Синк: при вході батька/вибору профілю фронтенд зливає localStorage-чергу
     етапу 1. Браузерні результати завжди `client-unverified`: сервер перевіряє
     дозволену активність і версію, після чого повертає авторитетний snapshot;
     локальні значення не можуть перекрити серверні зірки або attempts.
6. Вхід дитини: у межах батьківської сесії на пристрої — екран вибору профілю
     (ім'я/аватар), без пароля; батьківська зона (звіти, підписка, профілі) —
     за повторним auth-кроком або PIN.
3.7. Тести: ізоляція профілів між акаунтами (негативні), UUID-валідація,
     rate-limit на claim-lead, регресія наявних home-flow тестів.

## Етап 4 — Інтеграція активностей із temp/new (розмір L, паралелиться з 3)

4.1. «Факт чи думка» (перший пріоритет):
     - конвертувати `gemini-code-*.js` у типізований модуль
       `features/games/fact-opinion-data.ts` (позбутись window-глобалів);
     - злити якісні конкретні URL зі старої `facts.js` (нові файли деградували
       до головних сторінок; у L1 URL лише у 4/20);
     - перекласифікувати міфи/забобони в окрему категорію: 1 клас — 2 категорії
       (факт / чиясь думка), 2 клас — 3 (факт / думка / міф). Категорії
       «маніпуляція», «фейк», «відповідь ШІ» для 3–4 класів — окремий
       контентний беклог, не блокер;
     - спростити дорослу лексику у 6 записах L2 («когнітивне упередження» тощо);
     - виправити надто абсолютні «факти» L1 («Лимони жовтого кольору» і под.);
     - поле `image`: прибрати або додати реальні assets (рішення за наявністю
       ілюстрацій);
     - UI на рушії/патернах платформи (tokens.css, focus-trap,
       question-renderer-стилістика), рівень за класом профілю, контракт
       завершення з етапу 1.
4.2. assembly (hardware → 2–3 клас, software → 4 клас): прибрати GA/OG/canonical
     itnauka.org, чужі фавікони і site-shell; портувати на shell платформи;
     контракт завершення; розмістити у `features/games/` за зразком наявних.
4.3. save_server (3–4 клас, фінальна місія Інформатики): найбільший
     рефакторинг — Tailwind CDN → CSS платформи, видалити власні sw.js/manifest
     (конфлікт із SW платформи), Unsplash-фон → локальний asset, i18n-обв'язку
     спростити до укр. Контент (13 тем × 3 варіації MCQ) зберегти.
4.4. alt_cs: вибірково перенести вдалі формулювання у банк через
     `import-temp-content`; папку видалити.

## Етап 5 — Масштабування і монетизація (розмір L)

5.1. ✅ Карти 1, 3, 4 класів (зрізи 10–11;
     модель точки вже готова; орієнтир розподілу — карта
     з аналізу: 1 кл. сортування+закономірності+прості алгоритми; 3 кл.
     алгоритми/цикли/декомпозиція + assembly; 4 кл. безпека/мережі/довіра до
     ШІ + save_server як фінал).
5.2. Замки підписки на точках: старт — UI-замок + серверний entitlement для
     club-контенту (ендпоінт `/club/questions` вже існує). Перенесення даних
     статичних ігор за entitlement-API — окреме рішення зі своїм трейдофом
     (офлайн, кеш SW); не блокує запуск.
     Погоджене подання free-карти (2026-07-13):
     - НЕ замок на кожній точці: пройдені точки кольорові; наступні 3–5 —
       повнокольорове прев'ю з позначкою «Повна пригода»; далі — силует
       наступної локації в тумані; одна картка «Відкрити N місій» наприкінці
       маршруту;
     - клік по закритій точці → дитячий екран без цін і CTA купівлі:
       «Поклич дорослого» / «Повернутися на карту». Заборонено FOMO-механіки
       (таймери, «втрата» нагород, member-тизери в дитячому UI) —
       анти-приклад: Prodigy (скарга Fairplay до FTC, 2021);
     - батьківський шлюз продає через поведінковий звіт home-demo
       (strengths/struggles/patterns), далі: що відкриває підписка,
       ціна/період, скасування, один CTA;
     - модель точки отримує поле доступу (`free | club`) у зрізі 4 (структура
       шляху в БД), щоб стани карти не вимагали окремої міграції;
     - доставка контенту: free-точки лишаються статичними (офлайн-friendly);
       club-уроки і club-дані — ЛИШЕ через entitlement-API за прецедентом
       олімпіадних питань (UI-замок не захищає `public/lessons/*.json`).
5.3. Відео-активності («подивись і відповідай») — новий тип активності;
     проєктувати після того, як контракт і карта обкатані.
5.4. Оновити SW-стратегію кешу для path-даних і нових ігор (за зразком
     network-first для `/questions/`).

## Мікро-уроки: теорія перед випробуванням (доповнення 2026-07-11)

Механіка: кожна точка шляху може починатись обов'язковим кроком теорії —
(опційне вертикальне відео ≤90с →) картки тексту → мікро-квіз із миттєвим
фідбеком. Практика лишається воротами майстерності; теорія не «завалюється»
(фіксовані 3 зірки за завершення, correct/total квізу — формувальна аналітика).
Розблокування точок — ЛИШЕ за завершенням (`unlockAfter`); зірки — валюта
нагород/ачівок, не розблокування.

Ключове рішення (варіант А): точка посилається на урок явним `lessonId`
(`{ kind: 'lesson', lessonId }` у `PathActivity`), БЕЗ автопідбору за
track/topic. Контент-джерело: `temp/new_lessons/` (28 уроків 1–2 класу з
прив'язкою до держстандарту) — дистилюємо секції в картки; портуємо лише
контент і вибрані механіки, не застосунок.

- ✅ Зріз 1 (2026-07-11): `features/lessons/` (lesson-data, lesson-loader
  fail-safe, lesson-runner), гілка `lesson` у `path.ts`, адаптер
  `fromLessonSummary`, SW network-first для `/lessons/`, guard-тест
  «lessonId ↔ файл існує і валідний», layout-тести теорії. Пілот: 3 уроки
  2 класу в `public/lessons/` (info-senses-g2, algorithms-order-g2,
  private-info-g2) у точках g2-info-start / g2-ct-algorithms /
  g2-digital-safety.
- ✅ Зріз 2 (2026-07-13): таблиця `micro_lessons` (міграція 0032, ⚠️ треба
  застосувати на проді), CRUD під `requireAdmin` (fail-closed
  `lesson-validation.ts`, автоінкремент version при зміні контенту),
  вкладка «Уроки» в адмінці (редактор карток/квізу, slug незмінний після
  створення), `npm run export:lessons` → `public/lessons/<id>.json`
  (лише published; export валідує рядки тим самим валідатором).
  Рішення: картинки — лише URL-поле (сторедж → R2 після міграції на
  Cloudflare); бонусні активності (`required: false`) винесено в окремий
  зріз, бо зачіпають синк-контракт (батчинг + серверний каталог).
- ✅ Зріз 3 (2026-07-13): ігри `sequence` («Впорядкуй кроки», тап-у-слот,
  `features/games/sequence-game.ts`) і `scenarios` («Як вчинити?»,
  `scenarios-game.ts`) + контент-пули з посібника (6 наборів кроків,
  6 ситуацій безпеки/етикету) зі структурними валідаторами в тестах.
  Вписані у 2 клас: `g2-ct-algorithms` = теорія → sequence → місія
  (generic-головоломки замінено тематичним закріпленням),
  `g2-digital-safety` = теорія → scenarios → місія. Серверний каталог
  віддзеркалено. Спільні утиліти нових ігор — `round-utils.ts`
  (історичні рушії свідомо не рефакторились). Моторні тренажери для
  1 класу — досі кандидати на окремий зріз.
- ✅ Зріз 4a (2026-07-14): структура шляху в БД — таблиця `path_maps`
  (міграція 0033; перед релізом застосувати разом із 0034–0035; seed з `path-data.ts`,
  ідемпотентний, з полем `access: free|club` під free-карту). Валідація
  path-progress тепер читає каталог з БД (`path-catalog.ts`, TTL-кеш 60с,
  fail-closed) — ручне дзеркало `HOME_PATH_CATALOG` видалено, клас
  дрейф-помилок «фронт ≠ бекенд» усунено архітектурно. `npm run
  export:path` → `public/path/<pathId>.json` (SW network-first готовий).
  Тести валідації працюють з канонічного seed-файлу
  (`backend/src/db/seed/path-maps.json`); guard «seed ↔ path-data.ts»
  лишився в CI.
- ✅ Зріз 4b (2026-07-14): вкладка «Шлях» в адмінці — формовий редактор
  точок (id/назва/іконка/access/x/y, unlockAfter чекбоксами, curriculum,
  кроки з kind-специфічними полями і дропдауном уроків) + SVG-прев'ю;
  збереження цілою картою через `PUT /api/admin/path-maps/:pathId`
  (валідація графа: ациклічність, один старт, шейпи активностей;
  автопідняття version змінених кроків на сервері — редактор не може
  «відкотити» версію). Клієнт: `path-loader.ts` — карта рендериться з
  вбудованої копії одразу, бандл `public/path/` підміняє її після
  довантаження (лише на екрані карти, не посеред активності); битий чи
  відсутній бандл → фолбек. Кеш серверного каталогу скидається при
  збереженні.
- ✅ Slice 4c (2026-07-14): revision integrity and concurrent editing.
  Migration 0034 adds immutable `path_map_revisions` and records
  `path_version` on progress events, so older static bundles remain valid
  after later map edits. `PUT` requires `expectedVersion`, prevents lost
  updates, and verifies that every assigned lesson exists and is published.
  Re-added step IDs advance beyond their historical maximum version. Export
  and browser loading perform full structural graph validation. A downloaded
  revision is applied only after the active point closes, while offline batches
  retain their map revision and lesson content version. The admin editor keeps
  unsaved changes across tabs, edits map titles, and traps modal focus. Points
  with server progress cannot be deleted, and deleted `pointId` values cannot
  be reused to prevent old completion state from unlocking new content.
- Відео: запуск без відео; `videoUrl` — опційне поле; хостинг self-hosted
  (Cloudflare R2/Stream), не YouTube-embed.
- Migration compatibility: legacy queues without `pathVersion` are accepted
  only against a structurally compatible immutable revision; new batches
  always submit their exact map revision.

### Бонусні активності (зріз 5, 2026-07-14)

- ✅ Механіка `required: false` end-to-end: після обовʼязкових кроків точка
  показує бонус-екран (зіграти будь-які / «Завершити точку»); бонусні
  результати їдуть у тому ж батчі. Сервер: `optionalActivities` у каталозі,
  валідація приймає required ⊎ підмножину optional; зірки точки — ЛИШЕ з
  required (бонус не знижує і не накручує). Контент бонус-кроків додається
  адмінкою (вкладка «Шлях», чекбокс «Обовʼязковий»), карти в коді/seed не
  змінювались. Playwright покриває обидва флоу через route-інтерцепт бандла.

## Ризики та відкриті питання

- Контентний хвіст: puzzle-активності поки обирають генератор за класом, але не за `topic` точки.
  Перед мапінгом `topic → subset of generators` потрібен окремий перегляд складності й балансу
  (`patterns → sequence`, `debugging → machine` тощо), щоб тематична точність не звузила різноманіття завдань.

- ~~Міграції 0027/0028 на проді~~ — звірено 2026-07-10: схема актуальна до 0028
  включно. Нюанс: у `drizzle.__drizzle_migrations` записи 0009–0011 мають інші
  created_at, ніж у журналі (застосовані вручну) — мігратор порівнює за
  max(created_at), тож це безпечно, але не «лікувати» розбіжність повторним
  застосуванням.
- Міграція lead → акаунт для наявних лідів: прив'язка через email збігом чи
  явний claim-код? (рішення на етапі 3.1).
- Ілюстрації для «Факт чи думка» — джерела зображень поки відсутні.
- ✅ Продуктове рішення 2026-07-10: після готовності карт 1, 3 і 4 класів шлях
  стає головним сценарієм «Я вдома»: вибір класу → старт/продовження карти.
  Три напрями показуються як гілки карти, а окремі місії та головоломки
  залишаються другорядним режимом швидкої практики.
- ✅ (зріз 12) `home.html` перебудовано в path-first hierarchy: вибір класу →
  велика карта пригод → швидкі місії → окремі ігри.
- ✅ (зріз 13) anonymous first-point gate: після стартової точки дитина кличе
  дорослого; батько явно обирає профіль того самого класу, а frontend переносить
  лише catalogued `client-unverified` результат через ownership-gated API та
  очищає anonymous local state тільки після успішної відповіді сервера.
- Наступний порядок: карти 1/3/4 класів → Home-first map UX → перша точка без
  реєстрації → adult registration gate і підтверджене перенесення лише
  домашнього локального прогресу → subscription locks після checkout-рішення.
