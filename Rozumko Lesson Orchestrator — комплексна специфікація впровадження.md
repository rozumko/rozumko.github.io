# РОЗУМКО: LESSON ORCHESTRATOR

## Комплексна продуктова, педагогічна та технічна специфікація для впровадження керованих інтерактивних уроків інформатики 1–4 класів

**Тип документа:** Implementation Specification / Source of Intent  
**Цільова система:** `rozumko/rozumko.github.io`  
**Цільова аудиторія:** ШІ-агент або розробник, який безпосередньо змінює код Rozumko  
**Мета:** вбудувати у чинний Rozumko повноцінний режим керованого інтерактивного уроку — `Guided Lessons / Lesson Run / Lesson Orchestrator` — без руйнування чинних School, Home та Olympiad режимів.

---

# 1. Статус і призначення документа

Цей документ є технічною та продуктовою специфікацією.

Він визначає:

- що саме необхідно побудувати;
- що вже існує і має бути повторно використане;
- що не слід переписувати;
- як має бути представлений навчальний контент;
- як працює Lesson Runtime;
- як учитель керує уроком;
- як працюють учнівські пристрої;
- як інтегрується Classroom Remote;
- як зберігаються результати;
- як формуються навчальні докази;
- як працює аналітика;
- як враховуються педагогічні, вікові, санітарні, privacy та security вимоги;
- які автоматизовані тести необхідні;
- які результати повинні бути отримані на кожному етапі;
- за яких умов дозволено переходити до наступного етапу;
- що не входить до MVP.

Це не brainstorming і не рекомендаційний огляд.

Для ШІ-агента цей документ слід трактувати як **цільовий функціональний контракт**.

Водночас він не скасовує внутрішні правила репозиторію.

---

# 2. Обов'язковий pre-flight для ШІ-агента

Перед будь-якими змінами агент повинен:

1. Прочитати `AGENTS.md`.
2. Якщо у локальній робочій копії існує `.agents-product-strategy.md`, прочитати його відповідно до правил репозиторію.
3. Перед змінами auth, API, scoring, БД або deployment прочитати `docs/security-model.md`.
4. Перед змінами lesson/content architecture прочитати `docs/architecture.md`.
5. Перевірити актуальні `package.json` frontend і backend.
6. Перевірити актуальну Drizzle schema.
7. Знайти поточні реалізації:
   - `teacher_classes`;
   - `class_students`;
   - School Mode;
   - missions;
   - micro-lessons;
   - question renderer;
   - editorial workflow;
   - static content publication.
8. Не припускати, що документація щодо версій залежностей повністю синхронізована з `package.json`.
9. Не переписувати існуючий функціонал, якщо новий режим можна реалізувати як розширення.
10. Зберігати чинні security invariants.

Перед кожним етапом реалізації агент має виконувати правила планування й підтвердження, визначені в `AGENTS.md`.

---

# 3. Продуктова ідея

Rozumko має перейти від набору окремих навчальних інструментів до системи, здатної **оркеструвати повний урок інформатики**.

Продукт не слід визначати як:

- звичайний LMS;
- електронний підручник;
- бібліотеку презентацій;
- платформу тестування;
- Classroom Management System.

Це:

# Lesson Orchestrator / Teaching Runtime

Система, яка в реальному часі пов'язує:

```text
навчальний контент
        ↓
структуру уроку
        ↓
дії вчителя
        ↓
екран/дошку
        ↓
пристрої учнів
        ↓
інтерактивні завдання
        ↓
результати
        ↓
формувальне оцінювання
        ↓
навчальні результати
        ↓
звіти
```

---

# 4. Цільовий досвід учителя

Після реалізації нормальний урок має виглядати приблизно так:

```text
Учитель відкриває Rozumko.

→ обирає клас
→ обирає урок
→ натискає «Почати урок»

Rozumko показує перший етап.

→ учитель пояснює
→ натискає «Далі»

На дошці автоматично з'являється схема.

→ «Далі»

Система пропонує інтерактив.

Учитель обирає:

[Виконати разом]
або
[Надіслати учням]

Якщо «Надіслати учням»:

→ потрібне завдання відкривається на учнівських комп'ютерах
→ діти нічого не шукають
→ діти не вводять логін
→ діти виконують вправу

Учитель одразу бачить:

Марко      ✓
Софія      ✓
Андрій     !
Олена      …
...

Якщо багато дітей мають ту саму проблему:

→ учитель натискає «Пауза»
→ повертає потрібне пояснення
→ пояснює ще раз
→ запускає Retry або продовжує урок.

Після уроку:

→ результати вже зібрані
→ видно результати кожного учня
→ видно evidence за навчальними результатами
→ можна сформувати короткий коментар.
```

Головна мета — **забрати з учителя технічну та операційну рутину**.

---

# 5. Головний архітектурний принцип

```text
                 ROZUMKO

            CONTENT SYSTEM
                  │
             Lesson Schema
                  │
          Lesson Orchestrator
                  │
      ┌───────────┼───────────┐
      │           │           │
 Teacher View Presentation Student View
      │                       │
      │                 Activity Engine
      │                       │
      └──── Classroom Remote ─┘
                  │
             Student Device
                  │
             Activity Result
                  │
         ┌────────┴────────┐
         │                 │
    Checkpoint          Evidence
         │                 │
   Live Heatmap      Learning Outcome
                           │
                      Student Report
```

---

# 6. Що НЕ потрібно будувати

У межах цього проєкту не треба перетворювати Rozumko на універсальний LMS.

На першому етапі не потрібні:

- student email;
- student password;
- student Supabase Auth;
- окремий персональний кабінет дитини;
- месенджер;
- чат;
- домашні завдання як окремий LMS-модуль;
- журнал відвідуваності;
- calendar;
- відеоконференції;
- parent account для Guided Lesson;
- SCORM player;
- окремий Learning Record Store;
- cmi5;
- xAPI як внутрішня модель даних;
- Redis Pub/Sub;
- Kafka;
- RabbitMQ;
- Kubernetes;
- мікросервісна архітектура;
- AI automatic grading authority;
- повноцінний MDM;
- запис екранів учнів;
- перегляд чужих вкладок;
- keylogging;
- збір mousemove telemetry;
- оцінювання кожного кліку.

---

# 7. Поточний фундамент Rozumko

Новий функціонал має будуватися **поверх чинної системи**.

Не створювати альтернативну архітектуру.

## Уже існує і має бути повторно використано

### `teacher_classes`

Є базовою сутністю класу.

Не створювати окрему `guided_classes`.

### `class_students`

Є persistent roster учителя.

Саме `class_students.id` має бути основним persistent student identifier для Guided Lessons.

Не створювати student account лише заради Lesson Runtime.

### School Mode

Чинний School Mode має залишитися окремим режимом.

School Mode:

```text
anonymous
join code
nickname/avatar
session
leaderboard
aggregate analytics
```

Guided Lesson:

```text
teacher class roster
known classStudent
device assignment
lesson history
learning evidence
individual progress
```

Не слід перетворювати School Mode на Guided Lessons.

Не слід змінювати privacy contract School Mode.

### Missions

Повторно використовувати існуючі:

- mechanics;
- renderer-и;
- editorial patterns;
- published snapshots;
- content validation.

### Questions

Повторно використовувати існуючий question renderer і server-side scoring там, де це можливо.

### Micro-lessons

`micro_lessons` не є Guided Lesson.

Не слід поступово перетворювати micro-lessons у складний curriculum lesson шляхом додавання великої кількості несумісних полів.

Створити нову domain entity:

```text
curriculum_lessons
```

але використати вже перевірену модель:

```text
draft
review
published
archived

editVersion
publishedVersion
publishedSnapshot
revision history
```

---

# 8. Джерела контенту

Майбутній Lesson Orchestrator об'єднує кілька існуючих систем.

## 8.1. Нові HTML-уроки 1–4 класів

Вони є основним педагогічним джерелом.

З них потрібно перенести:

- title;
- module;
- lesson number;
- essential question;
- objectives;
- theory;
- visual explanation;
- diagrams;
- discussion;
- practice;
- support;
- extension;
- interactive task;
- self-check;
- reflection;
- success criteria;
- vocabulary;
- Cambridge vocabulary;
- teacher notes, де вони є.

Не зберігати сторінку як великий `html` field.

HTML є **форматом джерела**, а не внутрішньою моделлю Rozumko.

---

# 9. Роль legacy `compnauka/course/new_lessons`

Legacy `new_lessons` містить цінну програмну модель.

Звідти треба запозичити:

- content-as-data;
- separation of content and renderer;
- student/teacher projection;
- Activity Registry;
- structured quiz;
- reflection;
- learning coverage;
- reusable task renderer-и;
- accessibility/touch patterns.

Не потрібно переносити цей застосунок цілком.

Правильний підхід:

```text
analyse
→ extract useful mechanics
→ adapt
→ port into Rozumko architecture
```

Не:

```text
iframe old site into new site
```

---

# 10. Роль itnauka.org

`itnauka.org` використовується як бібліотека спеціалізованих тренажерів.

Підтримати два типи інтеграції.

## Launch-only

Rozumko може:

- показати activity;
- відкрити URL;
- використати Classroom Remote.

Але без result integration це не Evidence.

## Integrated external activity

Тренажер отримує scoped token і після завершення повертає результат у Rozumko.

Наприклад:

```text
Rozumko
→ signed activity launch
→ itnauka
→ activity
→ POST result
→ Rozumko
```

Важливо:

client-reported correctness без server verification має:

```text
trust = client-unverified
```

---

# 11. Роль Classroom Remote

Classroom Remote — окремий технічний шар.

Його відповідальність:

```text
device discovery
device online/offline
OPEN_URL
ACK
error
```

Classroom Remote **не повинен знати**:

- curriculum;
- expected learning outcomes;
- answer keys;
- scores;
- evidence;
- teacher report.

Rozumko **не повинен знати деталі Chrome tabs API**.

Між ними потрібен вузький adapter contract.

---

# 12. Single Source Authoring

Кожен урок повинен мати одну канонічну структуру.

Не створювати окремі:

```text
lesson.html
presentation.pptx
student.html
teacher.html
remote.html
```

Має існувати:

```text
LessonDefinition
```

який рендериться в різні режими.

---

# 13. Lesson Schema v1

Базова модель:

```ts
type LessonDefinitionV1 = {
  schemaVersion: 1

  id: string
  slug: string

  grade: 1 | 2 | 3 | 4
  moduleId: string
  lessonNumber: number

  title: LocalizedText
  shortTitle?: LocalizedText
  essentialQuestion?: LocalizedText

  durationMin: number

  objectives: LessonObjective[]
  learningOutcomes: LessonOutcomeLink[]
  vocabulary?: VocabularyItem[]

  blocks: LessonBlock[]

  presentation?: PresentationDefaults

  metadata: {
    source:
      | 'new-html'
      | 'manual'
      | 'legacy-new-lessons'

    sourceRef?: string
    contentVersion: number

    language:
      | 'uk'
      | 'uk-en'

    status:
      | 'draft'
      | 'review'
      | 'published'
      | 'archived'
  }
}
```

---

# 14. LocalizedText

Мінімальна модель:

```ts
type LocalizedText = {
  uk: string
  en?: string
}
```

Не будувати складну translation platform, поки в ній немає реальної потреби.

---

# 15. Lesson Block Model

Lesson block має бути discriminated union.

```ts
type LessonBlock =
  | HeroBlock
  | EssentialQuestionBlock
  | ObjectivesBlock
  | ExplanationBlock
  | VisualBlock
  | DiscussionBlock
  | ActivityBlock
  | PracticeBlock
  | CheckpointBlock
  | SupportBlock
  | ExtensionBlock
  | ReflectionBlock
  | SuccessCriteriaBlock
  | VocabularyBlock
  | TeacherNoteBlock
  | BreakBlock
```

---

# 16. Спільні поля Block

```ts
type LessonBlockBase = {
  id: string

  audience: {
    teacher: boolean
    student: boolean
  }

  views: {
    document: boolean
    presentation: boolean
    remote: boolean
  }

  modality:
    | 'screen'
    | 'teacher-led'
    | 'discussion'
    | 'paper'
    | 'movement'
    | 'unplugged'

  estimatedMinutes?: number

  runtime?: {
    step: boolean
    autoAdvance?: false
  }

  outcomeIds?: string[]
}
```

---

# 17. Stable IDs

Кожний block повинен отримати стабільний ID.

Наприклад:

```text
g2-m1-l1-b01
g2-m1-l1-b02
g2-m1-l1-b03
```

ID потрібен для:

- runtime;
- analytics;
- report;
- presentation navigation;
- historic snapshot;
- deep link;
- tests.

Після publication ID не слід змінювати без вагомої причини.

---

# 18. Presentation projection

Кожен displayable block може мати:

```ts
presentation?: {
  enabled: boolean

  layout?:
    | 'title'
    | 'visual'
    | 'concept'
    | 'question'
    | 'activity-launcher'

  headline?: string
  shortText?: string[]
  assetIds?: string[]

  speakerNotes?: string
}
```

Не слід покладатися на automatic AI summarization при кожному запуску уроку.

AI може допомагати при authoring, але published snapshot повинен містити перевірену presentation projection.

---

# 19. Teacher View

Teacher View — повний методичний документ.

Показує:

- цілі;
- essential question;
- пояснення;
- teacher notes;
- expected answers;
- misconceptions;
- support;
- extension;
- timing;
- activity controls;
- learning outcomes;
- screen-time advisory.

---

# 20. Presentation View

Presentation View призначений для:

- projector;
- interactive board;
- large screen.

Вимоги:

- fullscreen;
- мінімум chrome;
- велика типографіка;
- одна основна ідея;
- схеми замість великих текстів;
- teacher notes не показуються на projection surface;
- keyboard navigation;
- touch navigation;
- visible current step.

Основні controls:

```text
← Назад
Далі →
```

Для activity:

```text
[Виконати разом]
[Надіслати учням]
[Пропустити]
```

---

# 21. Student View

Student View показує тільки те, що дитині потрібно зараз.

Учень не бачить:

- весь lesson plan;
- teacher notes;
- correct answers;
- score інших учнів;
- roster;
- learning outcome profile;
- admin navigation.

---

# 22. Activity Engine

Activity Engine повинен розділяти:

```text
mechanic
```

і

```text
activity content/config
```

Наприклад:

```text
mechanic = classify
```

може використовуватися для:

- input/output;
- safe/unsafe;
- hardware/software;
- fact/opinion;
- AI/non-AI.

---

# 23. Canonical mechanic registry

Цільово підтримати:

```text
choice
multi-select
truefalse
input
match
sequence
classify
sort
fill
draw
creative
scenario
transfer
table-read
click-trainer
key-trainer
trace-contour
simulator
external
```

Не реалізовувати всі одночасно.

---

# 24. MVP mechanics

Для першого vertical slice достатньо:

```text
choice
truefalse
classify або sort
external launch-only
```

Після перевірки архітектури:

```text
sequence
match
input
scenario
simulator
skill trainers
```

---

# 25. Activity Block

```ts
type ActivityBlock = LessonBlockBase & {
  type: 'activity'

  activity: {
    instanceId: string

    mechanic: ActivityMechanic

    source:
      | 'inline'
      | 'question-bank'
      | 'mission'
      | 'external'

    refId?: string
    config?: Record<string, unknown>

    telemetry:
      | 'practice'
      | 'checkpoint'
      | 'evidence'

    scoring: {
      mode:
        | 'none'
        | 'server'
        | 'client-unverified'
        | 'teacher-observed'
    }

    attempts?: {
      max?: number
      keepBest?: boolean
    }
  }
}
```

---

# 26. Common Activity Result Contract

Усі mechanics повертають один envelope.

```ts
type ActivityResult = {
  activityInstanceId: string

  status:
    | 'started'
    | 'submitted'
    | 'completed'

  startedAt: string
  completedAt?: string

  durationMs?: number

  correct?: number
  total?: number
  mistakes?: number

  normalizedScore?: number

  answerPayload?: unknown

  trust:
    | 'server-verified'
    | 'client-unverified'
    | 'teacher-observed'
}
```

Activity renderer ніколи не пише напряму в PostgreSQL.

---

# 27. Practice / Checkpoint / Evidence

Це фундаментальна педагогічна модель системи.

## Practice

Мета:

```text
навчитися
спробувати
помилитися
дослідити
```

Practice:

- може не зберігатися;
- не впливає на outcome profile;
- може працювати локально;
- retries не карають дитину.

## Checkpoint

Мета:

```text
дати вчителю сигнал
```

Checkpoint:

- оновлює Live Heatmap;
- показує class pattern;
- може мати короткострокове збереження;
- не означає автоматично formal assessment.

## Evidence

Мета:

```text
підтвердити навчальний результат
```

Evidence:

- persistent;
- прив'язаний до classStudent;
- прив'язаний до outcome;
- прив'язаний до конкретної activity;
- містить trust level;
- містить lesson/run/version.

---

# 28. Learning Outcomes

Створити canonical registry.

```ts
type LearningOutcome = {
  id: string

  code: string

  gradeBand:
    | '1-2'
    | '3-4'

  domain: 'informatics'

  title: string
  description?: string

  source:
    | 'state-standard'
    | 'typical-program'
    | 'cambridge'
    | 'internal'

  sourceRef?: string

  active: boolean
}
```

---

# 29. Нормативна термінологія

Не використовувати формулювання:

```text
ІФО = індекс формувального оцінювання
```

У нормативних кодах початкової освіти `ІФО` використовується для **інформатичної освітньої галузі**.

Learning Outcome Registry повинен використовувати фактичні коди та джерела.

---

# 30. Lesson → Outcome

```ts
type LessonOutcomeLink = {
  outcomeId: string

  role:
    | 'introduced'
    | 'practiced'
    | 'assessed'
}
```

---

# 31. Activity → Outcome

```ts
type ActivityOutcomeLink = {
  outcomeId: string

  evidenceRole:
    | 'supporting'
    | 'primary'

  weight?: number
}
```

---

# 32. Student Outcome Evidence

```ts
type StudentOutcomeEvidence = {
  id: string

  classStudentId: string
  outcomeId: string

  lessonRunId: string
  activityAttemptId: string

  normalizedScore?: number

  trust:
    | 'server-verified'
    | 'client-unverified'
    | 'teacher-observed'

  evidenceRole:
    | 'supporting'
    | 'primary'

  observedAt: string
}
```

---

# 33. Outcome summary

MVP не повинен зберігати абсолютне:

```text
mastered = true
```

після одного завдання.

Teacher-facing summary:

```text
Not enough evidence
Needs support
Progressing
Demonstrated
```

Summary має бути:

- прозорим;
- explainable;
- заснованим на evidence;
- teacher-reviewable.

---

# 34. Live Heatmap

Основний runtime dashboard.

Rows:

```text
students
```

Columns:

```text
concepts/checkpoints
```

Не кожне питання й не кожен click.

Статуси:

```text
not-started
in-progress
completed
needs-attention
offline
skipped
```

Візуалізація не повинна залежати лише від кольору.

Наприклад:

```text
✓ completed
~ needs support
… working
○ not started
× offline
```

---

# 35. Деталі Heatmap

Клік на cell відкриває:

- activity;
- latest answer;
- attempts;
- duration як context;
- specific error/distractor;
- sync status;
- evidence status.

Teacher не повинен шукати ці дані по різних сторінках.

---

# 36. Педагогічні recommendations

Допустимо:

```text
9 із 22 учнів обрали “мікрофон = output”.
```

Actions:

```text
[Показати відповіді]
[Повернути пояснення]
[Додаткова вправа]
[Продовжити]
```

Не слід автоматично писати:

```text
“Учні не засвоїли поняття.”
```

Система показує observation; інтерпретація залишається за вчителем.

---

# 37. Lesson Run

Основна runtime entity.

Lifecycle:

```text
prepared
   ↓
active
 ↔ paused
   ↓
finished

prepared / active
   ↓
cancelled
```

Finished і cancelled runs не повертаються в active.

---

# 38. Створення Lesson Run

Flow:

```text
Teacher
→ chooses class
→ chooses published lesson
→ Prepare Lesson
→ server creates LessonRun
→ copies published snapshot
→ teacher verifies/matches devices
→ Start
```

---

# 39. Current Step

Run зберігає:

```text
currentBlockId
currentStepIndex
```

Teacher navigation є server-authorized operation.

Reload не повинен скидати step на початок.

---

# 40. Run Event Log

Рекомендовані events:

```text
run_created
run_started
block_opened
activity_dispatched
run_paused
run_resumed
run_finished
run_cancelled
```

Не використовувати event log для запису кожного UI event.

---

# 41. Device Assignment

Persistent mapping:

```text
classStudent
↕
remoteDeviceId
```

Приклад:

```text
PC-01 → Марко
PC-02 → Софія
```

Mapping може бути persistent для кабінету, але легко змінюється.

---

# 42. Run Student Snapshot

На початку run створюється snapshot:

```text
lessonRunStudent
```

який містить:

```text
run
classStudent
device
status
```

Якщо через тиждень учень сяде за інший ПК, історія попереднього уроку не змінюється.

---

# 43. Extension privacy

Classroom Remote extension не повинен зберігати:

- ім'я;
- прізвище;
- outcome;
- score;
- assessment history.

Extension знає:

```text
remoteDeviceId
room/session metadata
commands
```

Server Rozumko знає mapping.

---

# 44. Classroom Remote Bridge

У Rozumko створити narrow integration interface.

Приклад:

```ts
interface ClassroomRemoteBridge {
  listDevices(): Promise<RemoteDevice[]>

  openUrl(input: {
    commandId: string
    urlByDevice: Record<string, string>
  }): Promise<DispatchAck>
}
```

Не копіювати extension implementation у Rozumko.

---

# 45. Fake Remote Adapter

До інтеграції з реальним Classroom Remote обов'язково створити fake/mock adapter.

Він потрібен для:

- unit tests;
- Playwright;
- CI;
- simulated 5–30 devices.

Не робити тестування Lesson Runtime залежним від реальних ноутбуків.

---

# 46. Student Launch URL

Приклад:

```text
/student-run?token=<opaque-short-lived-token>
```

URL не містить:

```text
student name
classStudentId у відкритому вигляді
answer key
teacher token
email
```

---

# 47. Student Launch Token

Scope:

```text
lessonRunId
lessonRunStudentId
activityInstanceId
expiresAt
nonce
```

Server визначає student identity **з token**, а не з довільного `classStudentId` у POST body.

Token має бути:

- short-lived;
- scoped;
- server-issued;
- revocable через run state;
- непридатним для іншого activity/run.

---

# 48. Student accounts

Student Supabase Auth для Guided Lessons не створювати.

Вхід учня:

```text
signed/opaque launch token
```

або fallback:

```text
short run join flow
```

---

# 49. BYOD / дистанційний учень

Коли Classroom Remote недоступний:

```text
teacher generates join code/link
student opens it
teacher maps joined participant to roster
```

Після mapping учень отримує run-scoped identity.

Не вимагати email.

---

# 50. External Activity Registry

Не зберігати arbitrary external URL у published lesson без перевірки.

Приклад:

```ts
externalActivityRegistry = {
  'windows-interface-trainer': {
    allowed: true,
    integration: 'launch-only'
  }
}
```

Для integrated tools:

```text
integration = result-callback
```

---

# 51. Server-side scoring

Для objective evidence:

```text
browser submits answer
↓
backend obtains protected scoring definition
↓
backend scores
↓
backend stores attempt
↓
backend creates evidence
```

Browser не є джерелом `isCorrect`.

---

# 52. Client-unverified mechanics

Для procedural games browser може повідомляти:

```text
correct
total
mistakes
duration
```

Backend:

- validates ranges;
- clamps values;
- records `client-unverified`;
- не підвищує автоматично до `server-verified`.

---

# 53. Teacher-observed evidence

У майбутньому можна підтримати:

```text
discussion
unplugged
oral explanation
project
```

через teacher observation.

Це не обов'язково для першого vertical slice.

---

# 54. Recommended database model

Назви можна адаптувати до conventions, але семантика повинна залишитись.

## `curriculum_lessons`

```text
id
grade
module_id
lesson_number
title

schema_version

status
edit_version
published_version

draft_content jsonb
published_snapshot jsonb

created_by
updated_by
reviewed_by
published_by

created_at
updated_at
reviewed_at
published_at
```

---

# 55. `curriculum_lesson_revisions`

```text
id
lesson_id
edit_version
action
snapshot
changed_by
created_at
```

Повторити security/editorial pattern існуючих questions, missions, micro-lessons.

---

# 56. `learning_outcomes`

```text
id
code
grade_band
domain
title
description
source
source_ref
active
created_at
updated_at
```

---

# 57. `lesson_runs`

```text
id uuid

teacher_id
class_id

lesson_id
lesson_published_version
lesson_snapshot jsonb

status

current_block_id
current_step_index

join_code nullable

created_at
started_at
paused_at
finished_at
updated_at
```

---

# 58. `lesson_run_students`

```text
id

lesson_run_id
class_student_id

device_id nullable

status

joined_at
last_seen_at
```

Constraint:

```text
UNIQUE(lesson_run_id, class_student_id)
```

---

# 59. `device_assignments`

```text
id
teacher_id
class_id
class_student_id

remote_device_id
device_label nullable

active

created_at
updated_at
```

---

# 60. `activity_attempts`

```text
id

client_attempt_id

lesson_run_id
lesson_run_student_id
class_student_id

lesson_id
lesson_published_version

block_id
activity_instance_id
activity_type

attempt_no
status

answer_payload jsonb

normalized_score
correct
total
mistakes
duration_ms

trust

started_at
submitted_at
completed_at
```

`client_attempt_id` потрібен для idempotency.

---

# 61. `student_outcome_evidence`

```text
id

class_student_id
outcome_id

lesson_run_id
activity_attempt_id

normalized_score nullable

trust
evidence_role

observed_at
```

---

# 62. `lesson_run_events`

Рекомендовано:

```text
id
lesson_run_id
type
block_id nullable
actor_type
actor_id nullable
payload jsonb
created_at
```

Не перетворювати payload на raw telemetry dump.

---

# 63. RLS

Кожна нова application table:

```text
ENABLE ROW LEVEL SECURITY
```

у тій самій migration.

Не створювати permissive browser policy.

Доступ — backend only.

Security regression test повинен падати, якщо нова таблиця залишилась без RLS.

---

# 64. Curriculum API

Teacher:

```http
GET /api/teacher/curriculum/lessons
GET /api/teacher/curriculum/lessons/:id
```

Admin/editorial:

```http
POST  /api/admin/curriculum/lessons
PATCH /api/admin/curriculum/lessons/:id

POST /api/admin/curriculum/lessons/:id/review
POST /api/admin/curriculum/lessons/:id/publish
POST /api/admin/curriculum/lessons/:id/archive
```

Optimistic locking через `editVersion`.

---

# 65. Lesson Run API

```http
POST /api/teacher/lesson-runs

GET /api/teacher/lesson-runs/:id
GET /api/teacher/lesson-runs/:id/live

POST /api/teacher/lesson-runs/:id/start
POST /api/teacher/lesson-runs/:id/pause
POST /api/teacher/lesson-runs/:id/resume
POST /api/teacher/lesson-runs/:id/finish

PATCH /api/teacher/lesson-runs/:id/current-step
```

Кожен route:

- require teacher;
- verify DB-owned role/status;
- verify ownership;
- validate UUID before DB;
- fail closed.

---

# 66. Device Mapping API

```http
GET /api/teacher/classes/:classId/device-assignments

PUT /api/teacher/classes/:classId/device-assignments

DELETE /api/teacher/classes/:classId/device-assignments/:assignmentId
```

Teacher може керувати лише власним class.

---

# 67. Dispatch API

```http
POST /api/teacher/lesson-runs/:id/dispatch
```

Input:

```json
{
  "blockId": "g2-m1-l1-b09",
  "target": {
    "type": "all"
  }
}
```

або:

```json
{
  "blockId": "g2-m1-l1-b09",
  "target": {
    "type": "students",
    "studentIds": ["..."]
  }
}
```

Backend повертає launch plan:

```json
{
  "commandId": "...",
  "launches": [
    {
      "deviceId": "...",
      "url": "/student-run?token=..."
    }
  ]
}
```

Frontend Bridge передає launch plan Classroom Remote.

---

# 68. Student API

Приклад:

```http
POST /api/student/lesson/exchange-token

GET /api/student/lesson/run-state

POST /api/student/lesson/activity/start

POST /api/student/lesson/activity/submit

POST /api/student/lesson/heartbeat
```

Student routes не використовують Supabase Auth.

---

# 69. API client rule

Frontend HTTP functions повинні бути централізовані відповідно до current repository architecture.

Не додавати випадкові:

```ts
fetch('/api/...')
```

у десятках Guided Lesson modules.

---

# 70. Realtime: MVP

Не будувати distributed realtime infrastructure до vertical slice.

Для першої версії:

```text
student → HTTP POST → backend

teacher dashboard
→ GET live state / delta
→ polling 1–2 s під час activity
```

Використати revision/cursor:

```text
?since=123
```

щоб не віддавати весь state щоразу.

Для 20–30 учнів цього достатньо для перевірки продукту.

---

# 71. Realtime evolution

Після вимірювання можна перейти до:

```text
SSE server → teacher/student
HTTP POST client → server
```

WebSocket у самому Rozumko потрібен лише якщо з'явиться реальна full-duplex/high-frequency задача.

---

# 72. Redis

Redis **не входить у MVP**.

Повернутися до Redis тільки якщо існує виміряна проблема:

- кілька backend instances;
- live clients розподіляються між instances;
- потрібен message backplane;
- load test доводить проблему.

Не будувати Redis “на майбутнє”.

---

# 73. Classroom Remote transport

Classroom Remote уже має власний realtime transport.

Не замінювати його лише тому, що Lesson Runtime може використовувати HTTP/SSE.

Кожен продукт може мати оптимальний transport для своєї задачі.

---

# 74. Offline-first

Втрата мережі не повинна:

- стирати answer;
- скидати activity;
- створювати duplicate;
- показувати дитині technical error page.

---

# 75. IndexedDB Outbox

Student Runner використовує локальний outbox.

```ts
type PendingSubmission = {
  clientAttemptId: string

  endpoint: string
  payload: unknown

  createdAt: number
  retryCount: number
}
```

---

# 76. Submit flow

```text
Student submits
↓
save local outbox
↓
POST
↓
success?
  yes → remove outbox
  no  → keep pending
↓
retry while page open
↓
retry on online
↓
retry after next launch
```

---

# 77. Background Sync

Background Sync може використовуватися лише як enhancement.

Не робити коректність системи залежною від нього.

Feature detect.

Якщо browser не підтримує Background Sync — outbox усе одно працює через foreground retry.

---

# 78. Idempotency

Кожний attempt має:

```text
clientAttemptId
```

Повторна доставка того самого submission:

```text
POST
POST
POST
```

має створити:

```text
1 ActivityAttempt
```

а не 3.

---

# 79. Teacher reload

Весь active run state зберігається server-side.

Після reload:

```text
teacher logs/restores session
→ dashboard detects active run
→ restores current block
→ restores heatmap
→ continues
```

---

# 80. Student reload

Якщо token valid:

```text
reload
→ resume
```

Якщо token expired:

```text
clear reconnect screen
```

Teacher може redispatch.

---

# 81. Lesson edited during run

Active/historical run використовує immutable snapshot.

Редагування published lesson після запуску:

```text
НЕ змінює
```

- current content;
- scoring;
- report;
- evidence.

---

# 82. Activity edited during run

Той самий принцип.

Run повинен мати достатню version/snapshot інформацію для історичної відтворюваності.

---

# 83. Practice scoring

Practice:

- local feedback допустимий;
- answer keys можуть бути client-side лише якщо це свідомо локальна formative activity і відповідає існуючій security policy;
- practice не використовується як trusted Evidence.

---

# 84. Evidence scoring

Evidence:

- answer key server-side;
- server determines correctness;
- result stored;
- evidence generated only після accepted attempt.

---

# 85. Retry policy

Practice:

```text
unlimited / configurable
```

Checkpoint:

```text
teacher sees attempt count
```

Evidence:

```text
explicit maxAttempts
```

Не приховувати retry history у final report.

---

# 86. Педагогічна аналітика

Не робити висновки:

```text
довго = погано
швидко = добре
багато кліків = engagement
1 помилка = не знає
```

Допустимі signals:

- completion;
- correctness;
- distractor;
- attempts;
- skipped;
- incomplete;
- specific misconception pattern;
- duration лише як contextual signal.

---

# 87. Teacher workload

Система повинна скорочувати кількість учительських дій.

Учитель не повинен:

- створювати нову session для кожної activity;
- щоразу генерувати новий join code;
- копіювати URL;
- вводити імена дітей;
- повторно вибирати class;
- вручну перемикати десятки браузерів.

Нормальний flow:

```text
Start
→ Next
→ Next
→ Send to students
→ Continue
→ Finish
```

---

# 88. Pause / Reteach / Resume

Коли teacher натискає Pause:

Student Runner показує:

```text
Пауза
Поверни увагу до вчителя
```

Teacher:

```text
returns to explanation block
→ explains
→ Resume
```

MVP не потребує hard OS/browser lock.

---

# 89. Screen-time model

Block має `modality`.

Runtime накопичує тільки **continuous screen segment**, а не весь elapsed lesson time.

Наприклад:

```text
screen 4 min
screen 3 min
discussion 3 min
screen 5 min
```

Continuous segment:

```text
7 min
reset
5 min
```

---

# 90. Screen-time UX

Teacher бачить ненав'язливо:

```text
Екран: 08:42
```

Коли наближається threshold:

```text
Рекомендовано змінити вид діяльності.
Наступний блок: обговорення без екрана.
```

Не блокувати клас автоматично.

---

# 91. Санітарна педагогіка

Lesson authoring повинно заохочувати:

```text
screen
→ discussion
→ physical cards
→ notebook
→ screen
→ reflection
```

а не 40 хвилин continuous device interaction.

---

# 92. Accessibility

Усі Guided Lessons surfaces повинні підтримувати:

- keyboard;
- visible focus;
- screen-reader-compatible controls;
- semantic HTML;
- alt;
- form labels;
- large touch target;
- responsive viewport;
- reduced motion;
- no essential hover.

Heatmap color завжди дублюється icon/text.

---

# 93. Typographic principles для дітей

1–2 клас:

- короткі рядки;
- великі базові шрифти;
- мінімум paragraph density;
- одна команда за раз.

3–4 клас:

- трохи більше text autonomy;
- але student activity все одно не перетворюється на “сторінку підручника”.

---

# 94. Feedback language

Не:

```text
НЕПРАВИЛЬНО!
```

Краще:

```text
Спробуй ще раз.
Подумай: мікрофон отримує інформацію чи показує її?
```

Feedback має навчати.

---

# 95. Content Editorial Workflow

Guided Lessons повторюють існуючу модель:

```text
draft
↓
review
↓
published
↓
archived
```

Потрібні:

- optimistic edit locking;
- immutable revision history;
- last published snapshot;
- explicit publish;
- archive protection where relevant.

---

# 96. Static lesson publication

Безпечний published display content можна експортувати:

```text
public/curriculum-lessons/<id>.json
```

Це дає:

- швидкий load;
- static hosting;
- PWA cache;
- меншу залежність від backend cold start.

У static JSON не повинно бути:

- protected answer keys;
- secrets;
- student data;
- server-only scoring rules.

---

# 97. Raw HTML policy

Не використовувати arbitrary raw HTML як основну model.

Допустимий content:

- plain text;
- constrained Markdown/rich text;
- structured lists;
- callouts;
- asset references;
- pre-defined visual components.

Legacy HTML необхідно parse + sanitize + normalize.

Не переносити:

```text
<script>
onclick=
inline executable code
arbitrary style architecture
```

---

# 98. Lesson Assets

```ts
type LessonAsset = {
  id: string

  kind:
    | 'image'
    | 'video'
    | 'diagram'

  src: string

  alt?: string
  caption?: string
}
```

Broken third-party media не повинно ламати весь урок.

---

# 99. Міграція HTML

Не починати з автоматичного batch parser.

Правильний порядок:

```text
1 lesson manually
↓
schema stabilized
↓
renderer stabilized
↓
runtime stabilized
↓
converter
↓
10 lesson test batch
↓
mass migration
```

---

# 100. Migration Converter

Pipeline:

```text
HTML
↓
semantic extraction
↓
normalization
↓
asset mapping
↓
LessonDefinition
↓
validation
↓
migration report
↓
manual review
↓
draft import
```

Ніколи:

```text
HTML → auto publish
```

---

# 101. Migration Report

Для кожного уроку:

```text
parsed blocks
unrecognized fragments
missing IDs
broken assets
external links
activities
presentation projection gaps
learning outcome gaps
warnings
errors
```

Якщо:

```text
unrecognizedFragments > 0
```

auto-publication заборонена.

---

# 102. Перший еталонний урок

Vertical Slice:

```text
2 клас
Модуль 1
Урок 1
«Цифрова система»
```

Причини:

- Hardware / Software;
- Input → Process → Output;
- visual model;
- classify;
- discussion;
- self-check;
- reflection;
- support/extension;
- outcome mapping.

---

# 103. Орієнтовний block map Lesson 2.1

```text
01 Hero
02 Essential Question
03 Objectives
04 Explanation: Hardware / Software
05 Visual: Input → Process → Output
06 Explanation / examples
07 Discussion
08 Practice
09 Support
10 Extension
11 Activity
12 Checkpoint
13 Checkpoint
14 Checkpoint
15 Reflection
16 Success Criteria
17 Vocabulary
```

Фактичний mapping має бути сформований з актуального source lesson.

---

# 104. Reporting: Lesson Report

Після `finish` teacher бачить:

## Class

- students connected;
- completed;
- checkpoints;
- hardest concepts;
- skipped;
- evidence count;
- unresolved sync.

## Per student

- activities;
- attempts;
- checkpoint status;
- evidence;
- outcome links;
- missing/incomplete.

---

# 105. Topic Report

Після vertical slice:

- lessons by topic;
- outcomes;
- evidence over time;
- repeated difficulty;
- missing evidence.

Не рахувати простий average усіх clicks.

---

# 106. Teacher Comment Draft

Система може сформувати editable draft:

> Розрізняє апаратну та програмну складові цифрової системи. Потребує додаткової практики у визначенні пристроїв введення і виведення.

Обов'язково:

```text
teacher reviews
```

перед копіюванням/експортом.

---

# 107. Свідоцтво досягнень

MVP не повинен:

- автоматично заповнювати офіційний документ без teacher review;
- заявляти інтеграцію з державним реєстром без реального API;
- перетворювати один test score на official outcome level.

MVP формує:

```text
evidence summary
teacher draft
```

---

# 108. Privacy model

Відсутність student account не означає відсутність personal data.

Якщо server може зв'язати:

```text
Марко
→ classStudentId
→ result
```

це не анонімні дані.

Архітектура повинна використовувати:

```text
data minimization
pseudonymous device IDs
scoped tokens
server-side mapping
```

---

# 109. Дані, які Guided Lessons НЕ потребують

Не збирати без окремої причини:

- student email;
- phone;
- home address;
- birthday;
- password;
- social account.

---

# 110. Logs

Не логувати:

- full bearer/launch token;
- raw teacher access token;
- answer payload у generic logs;
- student name без потреби.

Structured logs можуть містити:

```text
requestId
lessonRunId
activityId
errorCode
```

---

# 111. External Callback Security

Для integrated itnauka activity:

- exact origin allowlist;
- HTTPS;
- scoped callback token;
- expiry;
- rate limit;
- payload validation;
- replay handling;
- trust level.

---

# 112. Feature Flag

До pilot completion Guided Lessons має бути за feature flag/capability.

Не достатньо сховати menu item.

Якщо access restricted, backend також має enforce.

---

# 113. Observability

Потрібні технічні metrics:

```text
lesson load failures
run creation latency
active runs
activity submit latency
4xx/5xx
outbox retries
remote dispatch success
remote dispatch failure
reconnect count
validation errors
```

Не потрібен child surveillance telemetry.

---

# 114. Performance targets для pilot

Engineering targets, не SLA:

```text
30 students
```

- create run p95 < приблизно 1 s;
- activity submit p95 < приблизно 1 s;
- accepted result → teacher display target < 2 s;
- 30 near-simultaneous submissions без 5xx;
- presentation local transition < 100 ms після state;
- teacher reload recovery без втрати run.

Targets переглянути після real pilot.

---

# 115. Не додавати xAPI до core v1

Internal source of truth:

```text
Rozumko PostgreSQL domain model
```

Не:

```text
xAPI statement = canonical database record
```

Майбутній adapter:

```text
ActivityAttempt
↓
xAPI exporter
↓
external LRS
```

---

# 116. cmi5

Не входить до MVP.

Причина:

Guided Lesson — це не просто standard single learner course package.

cmi5 можна розглядати тільки якщо з'явиться реальний integration requirement.

---

# 117. Competency interoperability

Внутрішній `learning_outcomes` registry не повинен залежати від конкретного зовнішнього competency standard.

У майбутньому можливі adapters до:

- CASE;
- IEEE competency models;
- інших educational interoperability formats.

---

# 118. Security Tests

Обов'язкові regression cases:

1. Teacher A не читає run Teacher B.
2. Teacher A не запускає lesson для class Teacher B.
3. Teacher A не редагує device mapping Teacher B.
4. Student token не працює для іншого run.
5. Student token не працює для іншого activity.
6. Expired token rejected.
7. Invalid UUID rejected до DB.
8. Student endpoint не повертає answer key.
9. Public lesson snapshot не містить protected key.
10. Draft lesson не доступний student surface.
11. Archived lesson не можна використати для нового run.
12. Existing run продовжує працювати зі snapshot.
13. Duplicate `clientAttemptId` не створює duplicate.
14. Student body не може підмінити `classStudentId`.
15. `client-unverified` не стає `server-verified`.
16. RLS є на кожній новій table.
17. Frontend не виконує direct Supabase data query.
18. External callback origin перевіряється.
19. External callback token scope перевіряється.
20. Finished run не приймає evidence без explicit late-submission policy.

---

# 119. Lesson Schema Unit Tests

Перевірити:

- valid lesson;
- invalid schemaVersion;
- grade 5 rejected;
- duplicate block IDs;
- empty blocks;
- invalid block type;
- activity без mechanic;
- evidence без outcome mapping;
- invalid modality;
- broken external key;
- missing asset;
- missing presentation content where required.

---

# 120. Runtime State Tests

Valid:

```text
prepared → active
active → paused
paused → active
active → finished
```

Invalid:

```text
finished → active
cancelled → active
finished → prepared
```

---

# 121. Evidence Tests

Перевірити:

```text
practice → no Evidence
checkpoint → no persistent Evidence by default
evidence accepted → Evidence
duplicate submit → one Evidence
failed scoring → no Evidence
unverified → trust preserved
```

---

# 122. Screen Timer Tests

Наприклад:

```text
screen 4
screen 5
```

continuous = 9.

Потім:

```text
discussion 3
```

continuous reset.

Потім:

```text
screen 4
```

continuous = 4.

Threshold залежить від grade.

---

# 123. Integration Test Vertical Slice

Automated scenario:

```text
create teacher
create class
create 5 students
create lesson
publish lesson
create run
assign 5 fake devices
start run
advance blocks
dispatch activity
5 students submit
query live state
finish run
query report
query evidence
```

Assertions:

```text
5 run students
5 accepted attempts
0 duplicates
correct mapping
correct lesson version
heatmap updated
evidence traceable
```

---

# 124. Playwright Teacher E2E

Scenario:

1. login;
2. select class;
3. select lesson;
4. prepare;
5. map devices;
6. start;
7. Next;
8. Next;
9. Presentation;
10. Send to Students;
11. heatmap updates;
12. click student;
13. Pause;
14. return to explanation;
15. Resume;
16. finish;
17. report.

---

# 125. Playwright Student E2E

Scenario:

```text
open signed URL
↓
no login
↓
activity
↓
answer
↓
feedback
↓
reload
↓
resume safely
```

---

# 126. Offline E2E

```text
open activity
↓
disable network
↓
submit
↓
local pending state
↓
enable network
↓
flush
↓
one server result
```

Required:

```text
no duplicate
no lost answer
```

---

# 127. Accessibility Tests

Axe/Playwright:

- teacher console;
- presentation;
- student runner;
- lesson report;
- device mapping dialog;
- heatmap details.

Також manual:

- keyboard only;
- 200% zoom;
- tablet touch.

---

# 128. Classroom Remote Contract Tests

Fake adapter:

- correct URL per device;
- partial success;
- offline device;
- timeout;
- retry;
- duplicate ACK;
- invalid device;
- commandId.

Real pilot:

- 3–5 laptops.

---

# 129. Failure Scenario: один device offline

Очікувана поведінка:

```text
24 students
1 offline
```

Teacher бачить:

```text
23/24 connected
```

Решта класу не блокується.

Після reconnect device отримує current state.

---

# 130. Failure Scenario: Classroom Remote down

Fallback:

```text
Copy Link
QR
Join Code
```

Guided Lesson не повинен бути повністю непридатним без extension.

---

# 131. Failure Scenario: backend reconnect

Student outbox зберігає result.

Teacher UI показує:

```text
Connection lost
Trying to reconnect
```

а не blank/error page.

---

# 132. Editorial validation

Published lesson fail-closed якщо:

- duplicate IDs;
- missing title;
- invalid grade;
- no blocks;
- invalid activity reference;
- unallowlisted external resource;
- evidence activity без outcome;
- server scoring без protected source;
- unknown schema version;
- missing required asset;
- unsafe HTML.

---

# 133. Versioning

Version separately:

```text
schemaVersion
lesson publishedVersion
activity/mechanic version
learning outcome registry source/version
```

Historical result завжди повинен пояснювати:

```text
який content
яка activity
яка version
```

---

# 134. Presentation Keyboard UX

Recommended:

```text
ArrowRight → Next
ArrowLeft  → Previous
Escape     → Exit Fullscreen
```

Space може працювати як Next лише якщо focus не знаходиться на activity control.

---

# 135. Presentation Touch UX

Великі controls.

Swipe може бути додатковим, але не єдиним способом navigation.

---

# 136. Teacher Notes

Speaker/teacher notes ніколи не повинні випадково з'являтись на projector surface.

Якщо teacher view і presentation відкриті в різних window/tab, state синхронізується через run.

---

# 137. Content Authoring UI

Не обов'язково будувати повний visual page builder у першому sprint.

MVP admin може працювати через structured form/editor.

Але структура повинна дозволяти надалі:

```text
add block
reorder
edit
preview teacher
preview presentation
preview student
validate
review
publish
```

---

# 138. Content preview

Перед publication admin/editor повинен бачити:

```text
Teacher preview
Presentation preview
Student preview
```

Не публікувати content, який був перевірений лише як JSON.

---

# 139. Learning Outcome Mapping UI

Editor має бачити:

```text
Lesson outcomes
```

та для Evidence activity:

```text
Activity → Outcome
```

Не вимагати outcome mapping для чисто декоративного visual block.

---

# 140. Practice/Checkpoint/Evidence Authoring UX

Автор activity повинен явно обрати одну роль.

Default:

```text
practice
```

Не робити `evidence` default.

Це зменшує ризик надмірного оцінювання.

---

# 141. Student Report Explainability

Для кожного suggested outcome status teacher може відкрити:

```text
Which Evidence?
Which lesson?
Which activity?
Which attempt?
What result?
What trust level?
```

Black-box summary заборонений.

---

# 142. Teacher override

У майбутньому teacher може manually confirm/override summary.

Якщо це реалізовано, треба зберігати:

```text
automatic suggestion
teacher decision
timestamp
teacherId
```

Не перезаписувати history.

---

# 143. Data retention

Перед production потрібно формально визначити retention policy.

Архітектурно розділити:

- short-lived tokens;
- transient run presence;
- activity attempts;
- long-lived outcome evidence.

Не задавати довільні юридичні retention periods без окремого policy decision.

---

# 144. School/Home identity isolation

Guided School data не повинні автоматично приєднуватися до Home child profile.

Будь-який майбутній link:

```text
School child ↔ Home profile
```

потребує окремого explicit identity flow та privacy review.

---

# 145. No parent dependency

Учитель може повністю провести Guided Lesson без parent account.

Це критично для school adoption.

---

# 146. Перший Pilot UX

Не запускати перший classroom pilot зі 100 функціями.

Pilot teacher повинен мати:

```text
Lessons
Classes
Start lesson
Device map
Teacher/Presentation
Live results
Finish
Report
```

Advanced analytics приховати.

---

# 147. Phase 0 — Baseline Audit

## Завдання

- перевірити repository;
- знайти всі related components;
- зафіксувати existing test status;
- визначити integration points;
- не змінювати code.

## Exit Gate

Повинні проходити чинні checks.

Frontend:

```bash
npm run check:frontend
```

Backend:

```bash
cd backend
npm run build
npm test
```

Якщо baseline red — спочатку документувати/усунути baseline issue.

---

# 148. Phase 1 — Lesson Schema + Editorial Storage

## Реалізувати

- `curriculum_lessons`;
- revisions;
- migration;
- RLS;
- admin routes;
- schema validator;
- manual Lesson 2.1 conversion;
- publish workflow.

## Не реалізовувати ще

- devices;
- heatmap;
- Classroom Remote;
- Evidence;
- mass migration.

## Gate

Lesson:

- створюється;
- валідується;
- review;
- publish;
- published snapshot immutable;
- draft не доступний student surface;
- revision history працює;
- security tests green.

---

# 149. Phase 2 — Lesson Renderers

Реалізувати:

```text
Teacher Document View
Presentation View
```

для Lesson 2.1.

Gate:

- той самий LessonDefinition;
- різні projection;
- presentation не містить teacher-only content;
- responsive;
- accessibility;
- reload;
- Playwright pass.

---

# 150. Phase 3 — Activity Engine Adapter

Реалізувати:

- common activity registry;
- `ActivityResult`;
- choice;
- truefalse;
- classify/sort;
- board mode;
- student standalone mode.

Gate:

- один mechanic працює в двох modes;
- answer key не leak для server-scored mode;
- identical result envelope;
- keyboard/touch pass.

---

# 151. Phase 4 — Lesson Run

Реалізувати:

- lesson_runs;
- lesson_run_students;
- lifecycle;
- current block;
- snapshot;
- resume after reload.

Gate:

- state transition tests;
- owner isolation;
- reload;
- content edit does not affect active run.

---

# 152. Phase 5 — Device Mapping

Реалізувати:

- existing class roster reuse;
- device assignment;
- mapping UI;
- run mapping snapshot.

Gate:

```text
5 students
5 fake devices
```

мають однозначне mapping.

Teacher може змінити mapping до dispatch.

---

# 153. Phase 6 — Classroom Remote Adapter

Реалізувати:

- Bridge interface;
- fake;
- перевірити реальний Remote contract;
- real integration;
- ACK/error display.

Gate на 3–5 реальних ПК:

```text
teacher click
→ correct URL opens
→ correct device
→ correct student token
```

Partial device failure не блокує інших.

---

# 154. Phase 7 — Live Checkpoints

Реалізувати:

- student submit;
- live delta endpoint;
- teacher polling;
- heatmap;
- student details;
- idempotency.

Gate:

- result з'являється у target latency;
- duplicate не дублюється;
- teacher reload відновлює heatmap;
- offline device не ламає run.

---

# 155. Phase 8 — Outcomes + Evidence

Реалізувати:

- outcomes registry;
- lesson links;
- activity links;
- evidence;
- evidence query.

Gate:

Для кожного Evidence:

```text
Outcome
→ Attempt
→ Activity
→ Block
→ Run
→ Lesson Version
→ Student
```

traceable.

---

# 156. Phase 9 — Offline Outbox

Реалізувати:

- IndexedDB;
- retry;
- online event;
- next-load retry;
- optional Background Sync;
- idempotent backend.

Gate:

```text
offline submit
→ reconnect
→ exactly one accepted server result
```

---

# 157. Phase 10 — Reports

Реалізувати:

- Lesson Report;
- Student Report;
- evidence explanation;
- teacher comment draft.

Gate:

Teacher може пояснити кожний висновок через evidence.

---

# 158. Phase 11 — Migration Tooling

Лише після vertical slice.

Реалізувати:

- HTML converter;
- validation report;
- asset resolver;
- manual review queue.

Gate:

10 різних lessons.

Вимоги:

```text
zero silent loss
zero unreviewed auto-publication
render parity acceptable
all links valid
```

---

# 159. Phase 12 — Module Pilot

Мігрувати один цілий module.

Провести кілька реальних lessons.

Перевірити:

- teacher workflow;
- varied mechanics;
- repeated evidence;
- topic analytics;
- device reliability.

---

# 160. Масове перенесення 1–4

Тільки після Module Pilot.

Migration order рекомендується організувати batch-ами.

Кожний batch:

```text
convert
validate
manual review
preview
publish
smoke test
```

---

# 161. Definition of Done для Vertical Slice MVP

MVP завершений лише якщо teacher може:

1. увійти;
2. відкрити свій class;
3. вибрати Lesson 2.1;
4. Prepare;
5. побачити Teacher View;
6. відкрити Presentation;
7. перейти між blocks;
8. дійти до activity;
9. натиснути Send to Students;
10. відкрити activity на 3–5 mapped devices;
11. учні виконують без login;
12. результати з'являються у heatmap;
13. teacher відкриває details;
14. teacher Pause;
15. повертає explanation;
16. Resume;
17. Finish;
18. відкриває Lesson Report;
19. бачить Evidence;
20. evidence пов'язане з outcome;
21. після reload history зберігається.

Одночасно:

- no answer-key leak;
- no direct DB client access;
- School Mode не зламаний;
- Home не зламаний;
- Olympiad не зламаний;
- security regression green.

---

# 162. Definition of Done для всієї ініціативи

Не:

```text
“ми імпортували 200 HTML”
```

а:

```text
“учитель може провести весь навчальний курс у керованому режимі”
```

Успіх вимірюється:

- швидкістю lesson launch;
- мінімальною кількістю teacher operations;
- надійністю delivery;
- зрозумілістю live information;
- якістю evidence;
- педагогічною придатністю;
- accessibility;
- privacy/security.

---

# 163. Pilot Plan

## A. Developer simulation

```text
5 fake devices
```

## B. Real devices

```text
5 school laptops
```

## C. One real class

```text
15–30 students
1 lesson
```

## D. Multiple lessons

```text
3–5 lessons
different mechanics
```

## E. One module

Повний workflow + reports.

Лише після E — scale migration.

---

# 164. Pilot Metrics

Technical:

```text
dispatch success rate
launch latency
submit latency
submit failure
reconnect success
duplicate rate
outbox recovery
teacher reload recovery
```

UX:

```text
time to start activity
manual interventions
students unable to open
teacher clicks per activity
heatmap comprehension
presentation density
```

Pedagogical:

```text
can teacher spot misconception?
can teacher pause/reteach?
does evidence match intended outcome?
does technology interrupt lesson?
```

---

# 165. Rollback

Feature:

```text
feature flag off
```

Existing modes continue.

Content:

```text
previous published version
```

Historical runs still use their snapshot.

Database migration must avoid destructive rewrite of School/Home/Olympiad data.

---

# 166. Recommended code organization

Adapt to repository conventions.

Possible structure:

```text
features/
  guided-lessons/
    types.ts
    validator.ts
    lesson-renderer.ts
    presentation-renderer.ts
    teacher-console.ts
    student-runner.ts
    activity-registry.ts
    activity-result.ts
    live-client.ts
    offline-outbox.ts
    classroom-remote-bridge.ts
```

Backend:

```text
backend/src/routes/
  curriculum-lessons.ts
  lesson-runs.ts
  student-lessons.ts
```

Services:

```text
backend/src/services/
  lesson-runtime.ts
  lesson-scoring.ts
  lesson-evidence.ts
```

Lib:

```text
backend/src/lib/
  lesson-validation.ts
  lesson-tokens.ts
```

Не створювати folders/interfaces лише заради architecture aesthetics.

---

# 167. Documentation, яку потрібно додати в repo

```text
docs/guided-lessons-architecture.md
docs/guided-lessons-security.md
docs/guided-lessons-content-schema.md
docs/guided-lessons-pilot-runbook.md
```

---

# 168. `guided-lessons-architecture.md`

Повинен описувати:

- domain;
- tables;
- state machines;
- diagrams;
- transport;
- offline;
- Classroom Remote boundary.

---

# 169. `guided-lessons-security.md`

Повинен описувати:

- teacher ownership;
- student token;
- scoring trust;
- RLS;
- external callbacks;
- PII;
- logs;
- answer key boundaries.

---

# 170. `guided-lessons-content-schema.md`

Повинен містити:

- LessonDefinition;
- all block types;
- activity config;
- stable IDs;
- examples;
- validation;
- migration rules.

---

# 171. `guided-lessons-pilot-runbook.md`

Для реального вчителя/тестувальника:

```text
prepare class
map devices
start
send activity
pause
reconnect device
fallback URL
finish
report
```

---

# 172. Sequence: Normal Lesson

```text
Teacher            Rozumko        Classroom Remote        Student

  | create run         |                  |                  |
  |------------------->|                  |                  |
  |                    |                  |                  |
  | start              |                  |                  |
  |------------------->|                  |                  |
  |                    |                  |                  |
  | next               |                  |                  |
  |------------------->|                  |                  |
  |                    |                  |                  |
  | dispatch           |                  |                  |
  |------------------->|                  |                  |
  |<-------------------| launch plan      |                  |
  |                                       |                  |
  | open URLs --------------------------->|                  |
  |                                       | OPEN_URL ------->|
  |                                       |<------ ACK       |
  |                                                          |
  |                         student token exchange <----------|
  |                                                          |
  |                         answer submit <-------------------|
  |                         score                            |
  |                         evidence                         |
  |                                                          |
  | live poll           |                                    |
  |-------------------->|                                    |
  |<--------------------| delta                              |
```

---

# 173. Sequence: Offline Submission

```text
Student
  |
  | Submit
  ↓
IndexedDB
  |
  | POST
  X network
  |
  | pending
  |
 network returns
  |
  | retry same clientAttemptId
  ↓
Rozumko
  |
  | accept once
  ↓
Student
  |
  | delete outbox item
  | synced
```

---

# 174. Sequence: Reteach

```text
Checkpoint
↓
Heatmap reveals pattern
↓
Teacher Pause
↓
Student pause overlay
↓
Teacher selects earlier block
↓
Presentation shows concept
↓
Teacher explains
↓
Resume / Retry / Continue
```

---

# 175. Acceptance Matrix

| Capability | MVP | Verification |
|---|---:|---|
| Existing roster reuse | Yes | Integration |
| No student login | Yes | E2E |
| Immutable lesson snapshot | Yes | DB test |
| Teacher View | Yes | Playwright |
| Presentation View | Yes | Playwright |
| Board activity | Yes | E2E |
| Send to devices | Yes | Real pilot |
| Remote bridge | Yes | Fake + real |
| Live Heatmap | Yes | Integration |
| Practice/Checkpoint/Evidence | Yes | Unit |
| Outcome Evidence | Yes | Integration |
| Offline Outbox | Before full pilot | Network E2E |
| Lesson Report | Yes | E2E |
| Topic Report | Later | — |
| Term Report | Later | — |
| AI recommendations | Later | — |
| xAPI | Later | — |
| Redis | Only if measured need | Load test |
| Parent integration | No | — |

---

# 176. Required Commands at Gates

Frontend:

```bash
npm run check:frontend
```

Цей pipeline має залишатися green.

Backend:

```bash
cd backend
npm run build
npm test
```

Також запускати relevant:

```text
migration checks
targeted security tests
guided lesson integration tests
Playwright tests
```

Не послаблювати security test, щоб “пройшов build”.

---

# 177. Existing version discrepancy rule

Якщо repository documentation називає старішу версію Vite/TypeScript, а `package.json` містить новішу:

```text
package.json / lockfile = dependency implementation truth
```

Не downgrade package лише для відповідності старому текстовому опису.

Окремо можна оновити documentation у focused change.

---

# 178. Future AI Features

Після стабілізації core можна додати:

- AI-assisted content migration;
- AI lesson draft;
- AI presentation suggestion;
- AI teacher comment draft;
- AI misconception grouping.

Не давати AI:

```text
final scoring authority
official outcome authority
automatic disciplinary interpretation
```

без teacher review.

---

# 179. Рекомендований AI Comment Architecture

```text
Evidence
↓
deterministic summary
↓
AI rewrites into natural teacher language
↓
teacher reviews
↓
copy/export
```

AI не має вигадувати факт, якого немає в Evidence.

---

# 180. Future adaptive lesson

У майбутньому Lesson Runtime може мати branches:

```text
if class checkpoint weak
→ reteach block

if strong
→ extension
```

Але MVP branching здійснює teacher кнопкою.

Не потрібен autonomous adaptive engine у v1.

---

# 181. Future lesson graph

Поточна v1 модель:

```text
ordered blocks
```

Може бути розширена до:

```text
block graph
```

Але не будувати graph engine, доки linear + teacher branching не доведе недостатність.

---

# 182. Future xAPI

Якщо потрібна інтеграція зі стороннім LRS:

```text
internal domain event
↓
xAPI mapping
↓
external service
```

Не навпаки.

---

# 183. Future standards

Можливі:

```text
CASE
IEEE competency standards
xAPI
LTI
```

лише як interoperability adapters.

Внутрішня модель повинна залишатися простою й контрольованою Rozumko.

---

# 184. Що агент НЕ повинен робити

Агенту прямо заборонено в межах цієї ініціативи без окремого рішення:

- переписувати frontend на React;
- вводити student Supabase accounts;
- замінювати current School Mode;
- змішувати anonymous School participants із persistent classStudents;
- переносити answer keys у browser для Evidence;
- зберігати student name у Classroom Remote extension;
- вважати client result trusted;
- додавати Redis “про запас”;
- додавати LRS “бо EdTech”;
- робити cmi5 core dependency;
- масово конвертувати lessons до перевірки vertical slice;
- auto-publish parsed HTML;
- auto-master outcome з одного question;
- збирати mouse movement telemetry;
- автоматично block screen без teacher decision;
- дозволяти arbitrary external URL;
- створювати direct frontend DB access;
- вимикати/послаблювати security regression;
- ламати Home/Olympiad/School API contracts.

---

# 185. Головний архітектурний критерій

Кожне технічне рішення оцінюється питанням:

> Чи робить воно реальний урок простішим для вчителя, зрозумілішим для дитини, надійнішим і безпечнішим?

Якщо новий технологічний шар не дає виміряної користі для:

- pedagogy;
- teacher workload;
- reliability;
- security;
- privacy;
- accessibility;
- performance;

його не потрібно додавати у поточний етап.

---

# 186. Кінцеве визначення продукту

Rozumko Guided Lessons — це не:

> “сайт, де є уроки”.

Це:

> **система виконання уроку, яка поєднує методично структурований контент, учителя, презентацію, учнівські пристрої, інтерактивні завдання та навчальні докази в одному керованому процесі.**

Головна цінність:

```text
Учителю не потрібно управляти технологією.

Учитель управляє навчанням.

Технологія виконує решту.
```

---

# APPENDIX A. Мінімальний приклад LessonDefinition

```json
{
  "schemaVersion": 1,
  "id": "g2-m1-l1",
  "slug": "digital-system",
  "grade": 2,
  "moduleId": "g2-m1",
  "lessonNumber": 1,
  "title": {
    "uk": "Цифрова система",
    "en": "Digital system"
  },
  "essentialQuestion": {
    "uk": "Як цифрова система отримує, опрацьовує та показує інформацію?"
  },
  "durationMin": 40,
  "objectives": [
    {
      "id": "obj-1",
      "text": "Розрізняти апаратну та програмну складові цифрової системи."
    }
  ],
  "learningOutcomes": [
    {
      "outcomeId": "info-g2-system-components",
      "role": "assessed"
    }
  ],
  "blocks": [
    {
      "id": "g2-m1-l1-b01",
      "type": "hero",
      "audience": {
        "teacher": true,
        "student": true
      },
      "views": {
        "document": true,
        "presentation": true,
        "remote": false
      },
      "modality": "teacher-led",
      "runtime": {
        "step": true
      },
      "content": {
        "title": "Цифрова система"
      },
      "presentation": {
        "enabled": true,
        "layout": "title",
        "headline": "Цифрова система"
      }
    },
    {
      "id": "g2-m1-l1-b06",
      "type": "activity",
      "audience": {
        "teacher": true,
        "student": true
      },
      "views": {
        "document": true,
        "presentation": true,
        "remote": true
      },
      "modality": "screen",
      "runtime": {
        "step": true
      },
      "outcomeIds": [
        "info-g2-system-components"
      ],
      "activity": {
        "instanceId": "device-classify",
        "mechanic": "classify",
        "source": "inline",
        "telemetry": "checkpoint",
        "scoring": {
          "mode": "server"
        },
        "config": {
          "prompt": "Розподіли пристрої за роллю."
        }
      },
      "presentation": {
        "enabled": true,
        "layout": "activity-launcher",
        "headline": "Куди належить кожен пристрій?"
      }
    }
  ],
  "metadata": {
    "source": "new-html",
    "sourceRef": "2_1.html",
    "contentVersion": 1,
    "language": "uk-en",
    "status": "published"
  }
}
```

---

# APPENDIX B. Trust Matrix

| Source | Trust | Heatmap | Evidence |
|---|---|---:|---:|
| Server-scored answer | server-verified | Yes | Yes |
| Client procedural game | client-unverified | Yes | Supporting only by explicit rule |
| External launch-only | none | Launch status only | No |
| Integrated external result | client-unverified by default | Yes | Not primary by default |
| Teacher observation | teacher-observed | Yes | Yes when explicitly recorded |
| Local Practice | local | Optional | No |

---

# APPENDIX C. Перший Epic

## Epic

**Guided Lessons — Vertical Slice**

## Goal

Провести один повний керований Lesson `g2-m1-l1` від published content до evidence report.

## Deliverables

```text
curriculum lesson schema
editorial storage
teacher renderer
presentation renderer
activity engine adapter
lesson run
class roster binding
device mapping
Classroom Remote bridge
student runner
live heatmap
evidence
report
offline retry
security tests
E2E
```

## Explicitly Out of Scope

```text
mass migration
Redis
xAPI
cmi5
LRS
parent integration
AI grading
term reports
enterprise scaling work
```

## Done

Тільки після виконання всього `Definition of Done для Vertical Slice MVP`.

---

# APPENDIX D. Recommended Scaling Sequence

```text
1 lesson
↓
3–5 lessons
↓
1 module
↓
10-lesson converter validation
↓
one complete grade
↓
grades 1–4
↓
topic analytics
↓
term summaries
↓
optional interoperability
```

Не змінювати цей порядок без явної причини.

---

# FINAL IMPLEMENTATION PRINCIPLE

Потрібно будувати не систему з максимальною кількістю технологій.

Потрібно побудувати найкоротший надійний шлях:

```text
методично якісний урок
        ↓
зрозумілі дії вчителя
        ↓
правильний контент на дошці
        ↓
правильне завдання на потрібному пристрої
        ↓
результат
        ↓
зрозумілий сигнал учителю
        ↓
навчальний доказ
```

Саме цей цикл є ядром Rozumko Lesson Orchestrator.