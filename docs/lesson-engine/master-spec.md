# ROZUMKO LESSON ENGINE

## Master Product, Pedagogical & Technical Specification

**Версія концепції:** 2.0  
**Статус:** Master Specification / Source of Intent  
**Цільова система:** `rozumko/rozumko.github.io`  
**Перший пілотний предмет:** Інформатика, 1–4 класи  
**Кінцева продуктова модель:** універсальний рушій керованих уроків  
**Основна аудиторія документа:** ШІ-агент, розробник, архітектор, методист

---

# 0. ГОЛОВНЕ РІШЕННЯ

Rozumko більше не слід розглядати як:

> платформу з інформатики для початкової школи.

Цільова модель:

> **Rozumko Lesson Engine — універсальний рушій для створення, виконання, оркестрування, контролю та аналізу керованих уроків.**

Інформатика 1–4 класів є **першим предметним пакетом**, на якому:

- перевіряється архітектура;
- перевіряється педагогічна модель;
- перевіряється Lesson Runtime;
- перевіряється Classroom Remote;
- перевіряється live-аналітика;
- перевіряється Evidence Model;
- перевіряється комерційна цінність;
- перевіряється можливість роботи слабшого або недосвідченого вчителя за готовим сценарієм.

Після успішної перевірки рушій має дозволяти створювати:

```text
Rozumko Informatics
Rozumko Mathematics
Rozumko Science
Rozumko Digital Literacy
Rozumko AI Literacy
...
```

без переписування Lesson Engine.

---

# 1. ПРОДУКТОВА ТЕЗА

Типова освітня платформа дає вчителю інструменти:

```text
створи презентацію
створи тест
додай відео
додай опитування
проведи урок
проаналізуй результати
```

Rozumko повинен піти далі.

Він має давати:

```text
готовий сценарій
↓
правильний матеріал
↓
правильне представлення
↓
правильну активність
↓
правильний момент її запуску
↓
доставлення активності дітям
↓
збір результатів
↓
сигнал учителю
↓
можливість змінити хід уроку
↓
Evidence
↓
звіт
```

Тобто продуктом є не просто контент і не просто software.

Продуктом є:

# Executable Lesson

Урок як структурований сценарій, який система здатна виконувати разом із учителем.

---

# 2. ЩО ТАКЕ КЕРОВАНИЙ УРОК

Керований урок — це Lesson Definition, що містить:

- цілі;
- навчальні результати;
- пояснення;
- питання;
- візуальні матеріали;
- teacher notes;
- student instructions;
- інтерактиви;
- offline/unplugged activities;
- checkpoints;
- evidence activities;
- support;
- extension;
- reflection;
- presentation projections;
- runtime behaviour.

У процесі уроку Lesson Engine знає:

```text
де ми знаходимось;
що зараз бачить учитель;
що бачить клас;
що повинні робити учні;
які пристрої активні;
хто виконав завдання;
який результат отримано;
чи є загальна проблема;
чи створює результат Evidence.
```

---

# 3. ОСНОВНА АРХІТЕКТУРА ПРОДУКТУ

```text
                    ROZUMKO PLATFORM

┌────────────────────────────────────────────────────┐
│                 CONTENT PACKS                      │
│                                                    │
│ Informatics │ Mathematics │ Science │ ...          │
└───────────────────────┬────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────┐
│                 LESSON SCHEMA                      │
│                                                    │
│ subject-agnostic structured lesson definition     │
└───────────────────────┬────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────┐
│                 LESSON ENGINE                      │
│                                                    │
│ Lesson Runtime                                     │
│ Activity Engine                                    │
│ Presentation Engine                                │
│ Classroom Orchestration                            │
│ Live State                                         │
│ Evidence Engine                                    │
│ Reporting                                          │
└─────────┬─────────────────┬────────────────┬───────┘
          │                 │                │
          ▼                 ▼                ▼
   Teacher View      Presentation View   Student View
          │                                  │
          │                                  ▼
          │                           Activity Runtime
          │                                  │
          └──────── Classroom Remote ─────────┘
                         │
                         ▼
                  Student Devices
                         │
                         ▼
                    Attempts
                         │
               ┌─────────┴────────┐
               ▼                  ▼
          Checkpoints          Evidence
               │                  │
               ▼                  ▼
          Live Heatmap      Learning Outcomes
                                  │
                                  ▼
                              Reports
```

---

# 4. ТРИ РІВНІ СИСТЕМИ

Архітектурно необхідно чітко розділити:

## A. Lesson Engine

Універсальне ядро.

Не знає, чи це:

- інформатика;
- математика;
- Science;
- мова.

Воно знає лише:

```text
lesson
block
activity
teacher
student
class
device
attempt
checkpoint
evidence
outcome
```

---

## B. Content Pack

Предметна логіка.

Наприклад:

```text
Informatics 1–4
```

містить:

- curriculum;
- lessons;
- vocabulary;
- outcome mappings;
- specialised activities;
- simulators;
- media;
- assessment policies.

---

## C. Integrations

Зовнішні системи.

Наприклад:

```text
Classroom Remote
itnauka.org
external LMS
school information system
future publisher API
future xAPI/CASE adapters
```

Інтеграція не повинна визначати внутрішню архітектуру ядра.

---

# 5. СТРАТЕГІЧНИЙ WEDGE

Першим продуктом є:

# Rozumko Informatics 1–4

Але технічно він повинен реалізовуватись як:

```text
Rozumko Lesson Engine
+
Informatics Content Pack
```

а не як:

```text
hardcoded Informatics Application
```

---

# 6. ЧОМУ ІНФОРМАТИКА Є ПРАВИЛЬНИМ ПІЛОТОМ

Інформатика має складніші вимоги до Lesson Engine, ніж багато інших предметів.

Вона потребує:

- presentation;
- discussion;
- quizzes;
- classification;
- sequencing;
- simulators;
- keyboard activities;
- mouse activities;
- browser activities;
- programming;
- algorithm execution;
- debugging;
- external tools;
- device orchestration;
- screen/non-screen alternation.

Якщо Lesson Engine добре підтримує інформатику, його значну частину можна повторно використати для інших предметів.

---

# 7. ПЕРШИЙ ПІЛОТНИЙ КОРИСТУВАЧ

Першою цільовою persona не обов'язково має бути сильний професійний учитель інформатики.

Особливо цінною може бути persona:

> **учитель, який повинен провести урок інформатики, але не має глибокої предметної або методичної підготовки.**

Rozumko повинен зменшувати залежність якості уроку від:

- досвіду;
- технічної компетентності;
- кількості часу на підготовку;
- уміння створювати презентації;
- уміння будувати інтерактиви.

---

# 8. ГОЛОВНА UX-ОБІЦЯНКА

Учитель не повинен керувати технологічною системою.

Учитель керує уроком.

Типовий interaction:

```text
Відкрити урок
↓
Почати
↓
Далі
↓
Пояснення
↓
Далі
↓
Показати схему
↓
Далі
↓
Надіслати дітям
↓
Побачити результат
↓
Продовжити / пояснити ще раз
↓
Завершити
```

---

# 9. ПРОДУКТ НЕ ПОВИНЕН ПЕРЕТВОРЮВАТИСЯ НА LMS

Не треба дублювати:

- електронний журнал;
- календар;
- attendance;
- video conferencing;
- messaging;
- school administration;
- parent communication;
- homework management;
- timetable management.

Rozumko повинен бути:

```text
Teaching Runtime
```

а не:

```text
School Management System
```

---

# 10. НЕ ПОТРІБНО БУДУВАТИ У MVP

Не додавати без доказаної потреби:

- React migration;
- microservices;
- Redis;
- Kafka;
- LRS;
- SCORM;
- cmi5;
- internal xAPI architecture;
- student accounts;
- complex AI agent;
- automatic AI grading;
- behavioural surveillance;
- screen recording;
- arbitrary browser monitoring.

---

# 11. ПОТОЧНИЙ ROZUMKO ЯК ФУНДАМЕНТ

Використовувати чинний стек і чинні патерни.

Frontend:

```text
Vite
TypeScript
Vanilla JS
CSS
```

Backend:

```text
Node.js
Fastify
TypeScript
```

Database:

```text
PostgreSQL
Drizzle ORM
```

Auth:

```text
adult users through Supabase Auth
```

Database access:

```text
backend API only
```

Frontend HTTP:

```text
features/api/client.ts
```

---

# 12. ІСНУЮЧІ ENTITIES, ЯКІ ТРЕБА ПОВТОРНО ВИКОРИСТАТИ

## teacher_classes

Canonical classroom.

Не створювати дубль.

## class_students

Persistent teacher roster.

Для Guided Lessons:

```text
class_students.id
```

є persistent student identity.

Student account не потрібен.

---

# 13. SCHOOL MODE ЗАЛИШАЄТЬСЯ ОКРЕМИМ

Anonymous School Mode:

```text
join code
avatar
nickname
anonymous participant
leaderboard
```

має залишитися.

Guided Lesson Mode:

```text
teacher class
persistent roster
device mapping
historical evidence
```

є іншим use case.

Не об'єднувати ці identity models.

---

# 14. MICRO-LESSONS ЗАЛИШАЮТЬСЯ ОКРЕМИМ PRODUCT SURFACE

Існуючий `micro_lessons` використовується для Home learning path.

Не розширювати його до універсального Lesson Engine.

Створити окремий:

```text
curriculum_lessons
```

---

# 15. LESSON SCHEMA ПОВИННА БУТИ SUBJECT-AGNOSTIC

Не створювати поля:

```text
algorithmType
computerDevice
programmingLanguage
```

у core Lesson Schema.

Предметно-специфічні дані повинні жити:

```text
activity.config
subject metadata
content-pack registry
```

---

# 16. CANONICAL LESSON DEFINITION

```ts
type LessonDefinitionV1 = {
  schemaVersion: 1

  id: string
  slug: string

  subject: string

  grade: number

  moduleId?: string
  unitId?: string
  lessonNumber?: number

  title: LocalizedText
  shortTitle?: LocalizedText

  essentialQuestion?: LocalizedText

  durationMin: number

  objectives: LessonObjective[]

  learningOutcomes: LessonOutcomeLink[]

  vocabulary?: VocabularyItem[]

  blocks: LessonBlock[]

  metadata: {
    contentPack: string
    source?: string
    sourceRef?: string

    contentVersion: number

    language: string

    status:
      | 'draft'
      | 'review'
      | 'published'
      | 'archived'
  }
}
```

---

# 17. CONTENT PACK

Додати concept:

```ts
type ContentPack = {
  id: string

  subject: string

  title: string

  gradeRange: {
    min: number
    max: number
  }

  curriculumRefs: string[]

  lessonIds: string[]

  activityNamespaces?: string[]

  outcomeRegistryId?: string
}
```

Перший:

```text
contentPack = "informatics-ua-primary"
```

---

# 18. BLOCK MODEL

Core Lesson Engine повинен працювати з універсальними block types.

```text
hero
essential-question
objectives
explanation
visual
discussion
activity
practice
checkpoint
support
extension
reflection
success-criteria
vocabulary
teacher-note
break
```

---

# 19. SUBJECT-SPECIFIC BLOCKS

По можливості не створювати:

```text
binary-block
algorithm-block
math-fraction-block
science-experiment-block
```

Універсальна структура:

```text
visual
activity
explanation
```

а subject-specific logic — у configuration.

---

# 20. BLOCK BASE

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
  }

  outcomeIds?: string[]
}
```

---

# 21. STABLE BLOCK IDs

Published block IDs повинні бути стабільними.

Приклад:

```text
g2-m1-l1-b01
```

Вони використовуються:

- runtime;
- deep link;
- analytics;
- reports;
- evidence;
- presentation;
- migration;
- tests.

---

# 22. PROJECTIONS

Один Lesson Definition породжує кілька projections.

```text
Teacher
Presentation
Student
Remote
Assessment
```

Не створювати окремий content copy для кожного режиму.

---

# 23. TEACHER VIEW

Містить:

- lesson flow;
- full explanations;
- teacher instructions;
- misconceptions;
- expected responses;
- support;
- extension;
- timing;
- outcome mapping;
- activity control;
- live class state.

---

# 24. PRESENTATION VIEW

Містить:

- headline;
- diagram;
- short text;
- prompt;
- image;
- activity launcher.

Не містить:

- teacher notes;
- answer keys;
- long methodology.

---

# 25. PRESENTATION METADATA

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

---

# 26. STUDENT VIEW

Показує:

- relevant instruction;
- activity;
- feedback;
- waiting/paused state.

Не показує:

- весь lesson;
- teacher plan;
- answer key;
- classmates;
- analytics.

---

# 27. ACTIVITY ENGINE — ЧАСТИНА CORE

Activity Engine не належить Informatics Pack.

Це reusable engine.

Core mechanic registry може містити:

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
scenario
transfer
table-read
creative
external
```

---

# 28. SPECIALISED ACTIVITY PACKAGES

Предмет може додавати specialized mechanics.

Informatics Pack:

```text
click-trainer
key-trainer
trace-contour
robot-grid
code-runner
logo-runner
file-system-simulator
browser-simulator
network-simulator
AI-classification-simulator
```

Science Pack у майбутньому може додати:

```text
experiment-simulator
measurement
diagram-labeling
```

---

# 29. ACTIVITY PLUGIN MODEL

Рушій має підтримувати pattern:

```ts
interface ActivityPlugin {
  key: string
  version: number

  validateConfig(config: unknown): ValidationResult

  renderStudent(context: StudentActivityContext): void

  renderPresentation?(context: PresentationActivityContext): void

  normalizeResult(result: unknown): ActivityResult
}
```

Це не обов'язково буквальна реалізація, але архітектурний принцип має бути таким.

---

# 30. COMMON ACTIVITY RESULT

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

---

# 31. PRACTICE / CHECKPOINT / EVIDENCE

Цей поділ належить Core Engine.

## Practice

Навчання без оцінювального навантаження.

## Checkpoint

Сигнал вчителю в момент уроку.

## Evidence

Persistent pedagogical evidence.

---

# 32. PRACTICE

```text
learn
explore
retry
receive feedback
```

Не впливає автоматично на outcome profile.

---

# 33. CHECKPOINT

Використовується Live Classroom Engine.

Показує:

```text
чи можна рухатись далі?
```

Checkpoint може бути ephemeral.

---

# 34. EVIDENCE

Evidence є довгостроковим.

Зв'язок:

```text
Student
↓
Activity Attempt
↓
Learning Outcome
```

---

# 35. LEARNING OUTCOMES — CORE MODEL

Сам registry може бути subject-specific.

Core entity:

```ts
type LearningOutcome = {
  id: string

  code: string

  subject: string

  gradeBand?: string

  title: string

  description?: string

  source: string

  sourceRef?: string

  active: boolean
}
```

---

# 36. MULTIPLE CURRICULUM MAPPINGS

Один lesson/activity може бути пов'язаний одночасно з:

```text
НУШ
Cambridge
internal skill taxonomy
```

Приклад:

```ts
curriculumMappings: [
  {
    framework: 'NUSH',
    outcomeId: '...'
  },
  {
    framework: 'Cambridge',
    outcomeId: '...'
  }
]
```

Core Engine не повинен знати значення framework.

---

# 37. INFORMATICS PACK

Пілотний Content Pack:

```text
Rozumko Informatics 1–4
```

включає:

- 1–4 grade curriculum;
- modules;
- lessons;
- NUSH mapping;
- Cambridge mapping;
- vocabulary;
- simulations;
- trainers;
- programming tools;
- AI literacy;
- computational thinking;
- digital literacy.

---

# 38. ПЕРШИЙ ВЕРТИКАЛЬНИЙ SLICE

```text
2 клас
Модуль 1
Урок 1
«Цифрова система»
```

Повинен пройти весь pipeline:

```text
source lesson
↓
Lesson Schema
↓
publish
↓
Teacher View
↓
Presentation
↓
Activity
↓
Classroom Remote
↓
Student Device
↓
Checkpoint
↓
Heatmap
↓
Evidence
↓
Report
```

---

# 39. LESSON RUNTIME — CORE

Lesson Runtime зберігає:

```text
lesson
published version
class
teacher
current block
students
activity states
pause state
timestamps
```

---

# 40. LESSON RUN STATES

```text
prepared
↓
active
↔ paused
↓
finished
```

Також:

```text
cancelled
```

Finished/cancelled immutable.

---

# 41. LESSON SNAPSHOT

При створенні run потрібно зафіксувати published lesson version.

Історичний run не змінюється після редагування lesson.

---

# 42. CLASSROOM ORCHESTRATION

Core Engine повинен уміти:

```text
open activity
pause class activity
resume
retry
skip
advance lesson
```

Не всі команди обов'язково означають OS/browser control.

---

# 43. CLASSROOM REMOTE — ADAPTER

Classroom Remote не є Core Engine.

Він є adapter:

```text
Lesson Engine
↓
Classroom Control Interface
↓
Classroom Remote
```

---

# 44. CLASSROOM CONTROL INTERFACE

```ts
interface ClassroomControlProvider {
  listDevices(): Promise<RemoteDevice[]>

  launchUrls(
    launches: DeviceLaunch[]
  ): Promise<DeviceLaunchResult[]>
}
```

У майбутньому можна мати:

```text
ClassroomRemoteProvider
GoGuardianProvider
GenericWebProvider
```

якщо з'явиться потреба.

---

# 45. ЦЕ ВАЖЛИВА СТРАТЕГІЧНА ЗМІНА

Classroom Remote не повинен бути жорсткою умовою існування Rozumko.

Rozumko Lesson Engine повинен підтримувати:

```text
managed devices
```

і:

```text
unmanaged/BYOD
```

---

# 46. GENERIC WEB FALLBACK

Без extension:

```text
QR
PIN
short link
```

Teacher map-ить participant на roster.

Таким чином engine може використовуватися школами без Classroom Remote.

---

# 47. DEVICE MAPPING

Persistent:

```text
classStudent
↕
device
```

Teacher може змінювати mapping.

Історичний run зберігає snapshot.

---

# 48. STUDENT IDENTITY

У Guided Lessons:

```text
class_students.id
```

є persistent academic identifier.

Дитині не потрібен user account.

---

# 49. PRIVACY

Відсутність account ≠ anonymity.

Якщо:

```text
student
↔
results
```

можна зіставити, це персоналізовані навчальні дані.

Використовувати:

- minimization;
- opaque tokens;
- server-side mapping;
- short-lived session state.

---

# 50. STUDENT LAUNCH TOKEN

```text
/student-run?token=...
```

Token scope:

```text
run
runStudent
activity
expiry
nonce
```

Token не містить PII.

---

# 51. SERVER-SIDE SCORING

Trusted Evidence:

```text
answer
↓
backend
↓
server scoring
↓
attempt
↓
evidence
```

Browser не визначає trusted correctness.

---

# 52. CLIENT-UNVERIFIED RESULT

Procedural game може надсилати:

```text
correct
total
mistakes
duration
```

але trust залишається:

```text
client-unverified
```

---

# 53. LIVE HEATMAP — CORE

Heatmap не subject-specific.

Rows:

```text
students
```

Columns:

```text
lesson checkpoints / concepts
```

---

# 54. HEATMAP STATES

```text
not-started
working
completed
needs-attention
offline
skipped
```

Не лише green/yellow/red.

---

# 55. TEACHER DECISION SUPPORT

Система показує evidence, а не наказ.

Наприклад:

```text
8 із 24 учнів обрали однакову неправильну відповідь.
```

Teacher chooses:

```text
Show answers
Return to explanation
Follow-up activity
Continue
```

---

# 56. НЕ СТВОРЮВАТИ “AI TEACHER”

AI не повинен вирішувати:

```text
class failed
student doesn't understand
teacher must reteach
```

без прозорих правил і teacher decision.

---

# 57. AI У МАЙБУТНЬОМУ

Корисні AI функції:

```text
lesson authoring
presentation draft
migration assistance
teacher comment draft
misconception clustering
```

---

# 58. AI COMMENT PIPELINE

```text
Evidence
↓
deterministic factual summary
↓
AI rewrites text
↓
teacher reviews
↓
export
```

AI не вигадує інформацію.

---

# 59. REALTIME MVP

Не будувати складну distributed realtime infrastructure.

MVP:

```text
student POST
↓
backend

teacher polling delta
```

1–2 sec polling під час active activity достатній для pilot.

---

# 60. FUTURE REALTIME

За потреби:

```text
SSE → downstream
HTTP POST → upstream
```

WebSocket додати в Core лише якщо є доведена потреба.

---

# 61. REDIS

Не використовувати у MVP.

Додати лише після load evidence.

---

# 62. OFFLINE-FIRST

Core Student Runtime повинен підтримувати offline outbox.

```text
submit
↓
IndexedDB
↓
network send
```

---

# 63. IDEMPOTENCY

Кожна submission:

```text
clientAttemptId
```

Повторний POST не створює duplicate attempt.

---

# 64. BACKGROUND SYNC

Optional.

Не робити core correctness залежною від browser Background Sync.

---

# 65. SCREEN / NON-SCREEN ORCHESTRATION

Це частина Lesson Engine, а не тільки Informatics.

Block modality:

```text
screen
teacher-led
discussion
paper
movement
unplugged
```

---

# 66. CONTINUOUS SCREEN SEGMENT

Engine рахує:

```text
continuous screen time
```

а не весь lesson duration.

Subject pack / grade policy задає recommendation threshold.

---

# 67. PEDAGOGICAL POLICY LAYER

Щоб engine був універсальним, age/subject rules не потрібно hardcode у renderer.

Створити concept:

```ts
type LessonPolicy = {
  grade?: number

  screenAdvisory?: {
    warningMinutes?: number
    maximumRecommendedContinuousMinutes?: number
  }

  activityDefaults?: {
    minimumTouchTarget?: number
  }
}
```

Перший policy pack — primary informatics.

---

# 68. TEACHER CONSOLE

General layout:

```text
Lesson / current step
Presentation controls
Activity controls
Class state
Teacher notes
```

Не перетворювати на analytics cockpit.

---

# 69. MAIN ACTIONS

У normal flow:

```text
Back
Next
Show
Send
Pause
Resume
```

Не показувати десятки controls.

---

# 70. TEACHER MODE VS AUTHOR MODE

Не змішувати.

Teacher:

```text
conducts lesson
```

Editor:

```text
creates content
```

Під час уроку authoring controls не повинні заважати.

---

# 71. AUTHORING НЕ Є ПЕРШИМ КОМЕРЦІЙНИМ ПРОДУКТОМ

Nearpod-подібний universal builder не є нашим основним differentiator.

Перша ставка:

```text
high-quality ready-made content
+
execution engine
```

---

# 72. AUTHORING SYSTEM ПОТРІБЕН ПЕРШ ЗА ВСЕ CONTENT TEAM

На старті editor орієнтований на:

- автора;
- методиста;
- адміністратора content pack.

Не обов'язково на всіх учителів.

---

# 73. TEACHER CUSTOMIZATION

Teacher може пізніше:

```text
duplicate lesson
hide block
add note
replace activity
change timing
```

але це другий етап.

Не починати із Canva-like editor.

---

# 74. CONTENT PACK ARCHITECTURE

```text
Content Pack
│
├── metadata
├── curriculum
├── outcomes
├── lessons
├── activities
├── assets
├── vocabulary
└── policies
```

---

# 75. ПРИКЛАД INFORMATICS PACK

```text
informatics-primary-ua/
│
├── grade-1/
├── grade-2/
├── grade-3/
├── grade-4/
│
├── outcomes/
├── activities/
├── simulators/
├── assets/
└── vocabulary/
```

Фактична filesystem architecture має відповідати conventions repo.

---

# 76. DATABASE CORE

Не створювати subject-specific runtime tables.

Потрібні:

```text
curriculum_lessons
curriculum_lesson_revisions

learning_outcomes

lesson_runs
lesson_run_students

device_assignments

activity_attempts

student_outcome_evidence
```

---

# 77. CURRICULUM LESSONS

```text
id
content_pack_id
subject
grade
module_id
unit_id
lesson_number

schema_version

status
edit_version
published_version

draft_content
published_snapshot

audit fields
timestamps
```

---

# 78. LESSON RUN

```text
id
teacher_id
class_id

lesson_id
lesson_published_version
lesson_snapshot

status
current_block_id
current_step_index

created_at
started_at
paused_at
finished_at
```

---

# 79. LESSON RUN STUDENTS

```text
id
lesson_run_id
class_student_id
device_id
status
joined_at
last_seen_at
```

---

# 80. ACTIVITY ATTEMPTS

```text
id
client_attempt_id

lesson_run_id
lesson_run_student_id
class_student_id

block_id
activity_instance_id
activity_type

attempt_no
status

answer_payload

normalized_score
correct
total
mistakes
duration_ms

trust

timestamps
```

---

# 81. EVIDENCE

```text
id

class_student_id
learning_outcome_id

lesson_run_id
activity_attempt_id

score
trust
evidence_role

observed_at
```

---

# 82. EDITORIAL WORKFLOW

Reuse Rozumko pattern:

```text
draft
↓
review
↓
published
↓
archived
```

З:

- immutable revision history;
- optimistic locking;
- published snapshots;
- audit fields.

---

# 83. SECURITY

Кожна нова table:

```text
RLS enabled
```

У тій самій migration.

No browser DB access.

---

# 84. STATIC PUBLICATION

Display-safe published content може бути exported:

```text
public/curriculum-lessons/
```

Protected scoring keys — server only.

---

# 85. CONTENT MIGRATION

HTML lessons є source.

Не final format.

Pipeline:

```text
HTML
↓
parser
↓
normalizer
↓
Lesson Definition
↓
validation
↓
manual review
↓
publish
```

---

# 86. НЕ ПОЧИНАТИ MASS MIGRATION

До повного vertical slice:

```text
1 lesson
```

Потім:

```text
3–5 lessons
```

Потім:

```text
1 module
```

Потім:

```text
10 lesson converter validation
```

Тільки потім масштабування.

---

# 87. LEGACY NEW_LESSONS

Розглядати як reference implementation.

Не embed.

Port:

- mechanics;
- schemas;
- UX patterns;
- accessibility.

Не переносити obsolete state architecture.

---

# 88. REPORTING — CORE

Engine повинен уміти створювати generic:

```text
Lesson Report
Student Report
Outcome Report
```

Subject pack визначає meaning outcome.

---

# 89. LESSON REPORT

Class view:

```text
students
completion
checkpoint patterns
evidence
missing results
sync problems
```

---

# 90. STUDENT REPORT

Показує:

```text
lesson
activities
attempts
evidence
outcomes
```

---

# 91. EXPLAINABILITY

Кожний outcome summary повинен відкриватися до source Evidence.

```text
Outcome
↓
Evidence
↓
Attempt
↓
Activity
↓
Lesson
```

---

# 92. НІЯКОГО BLACK-BOX MASTERY

Не:

```text
AI says student = 82%
```

Потрібен trace.

---

# 93. INFORMATICS PILOT OUTCOME MODEL

Пілот використовує:

- НУШ;
- Cambridge Computing;
- internal computational-thinking taxonomy.

Це перевірить multi-framework architecture.

---

# 94. SPECIALISED INFORMATICS ACTIVITIES

Саме тут пілот повинен бути сильнішим за generic EdTech.

Поступово інтегрувати:

- mouse trainer;
- keyboard trainer;
- Windows simulator;
- file/folder simulator;
- browser simulator;
- URL builder;
- network simulation;
- binary;
- algorithm trace;
- robot;
- pathfinding;
- RAVLYK;
- programming tasks;
- AI classification;
- prompts;
- digital safety.

---

# 95. НЕ ОБМЕЖУВАТИ ACTIVITY ENGINE КВІЗАМИ

Generic quiz functionality є commodity.

Сильна сторона Informatics Pack — domain simulations.

---

# 96. BUSINESS VALIDATION Є ЧАСТИНОЮ ПІЛОТУ

Технічна готовність не означає product-market fit.

Потрібно окремо перевірити:

```text
чи користуються?
чи повертаються?
чи економить час?
чи готові платити?
```

---

# 97. ПІЛОТ НЕ МОЖНА ПЕРЕВІРЯТИ ЛИШЕ В UGS

Власна школа є чудовою лабораторією.

Але не доказом зовнішнього попиту.

---

# 98. EXTERNAL VALIDATION

Після internal pilot:

```text
5–10 teachers
3–5 external schools
```

Бажано різного типу.

---

# 99. PILOT PERSONAS

До тесту включити:

- сильного CS teacher;
- молодого/недосвідченого teacher;
- primary teacher, який викладає informatics;
- methodologist;
- private school;
- municipal school, якщо можливо.

---

# 100. ПРАВИЛО INDEPENDENT USE

Teacher повинен провести урок без участі автора Rozumko.

Якщо автор стоїть поруч і допомагає, це usability demo, а не validation.

---

# 101. ПЕРШІ PRODUCT METRICS

Не запитувати лише:

```text
“Вам сподобалось?”
```

Вимірювати:

```text
чи провів другий урок;
чи повернувся наступного тижня;
чи використав замість старого workflow;
чи скоротив підготовку;
чи просить наступні уроки;
чи рекомендує колезі.
```

---

# 102. TEACHER EFFICIENCY METRICS

Порівняти старий і новий workflow:

```text
preparation minutes
teacher clicks
app switches
student setup time
manual interventions
time to collect results
```

---

# 103. ORCHESTRATION VALUE METRICS

Перевірити:

```text
чи використовується Send to Students;
чи використовується live dashboard;
чи використовується Pause/Reteach;
чи device mapping економить час.
```

Якщо teacher ігнорує 80% orchestration — продуктова концепція потребує перегляду.

---

# 104. BUSINESS METRIC

Найважливіше зовнішнє питання:

> Чи готова школа купити це?

Не:

> Чи подобається це вчителю?

---

# 105. ПЕРШИЙ КОМЕРЦІЙНИЙ СЕГМЕНТ — ГІПОТЕЗА

Не фіксувати це як остаточну модель, але тестувати насамперед:

```text
schools
```

а не individual teachers.

---

# 106. ЧОМУ SCHOOL LICENSE ЛОГІЧНІШИЙ

School отримує:

```text
full curriculum
teacher guidance
all activities
class rosters
device orchestration
analytics
reports
deployment
support
```

Цінність більша, ніж просто teacher subscription.

---

# 107. МОЖЛИВА FREEMIUM MODEL — ГІПОТЕЗА

Teacher:

```text
free exploration / limited pilot
```

School:

```text
paid full deployment
```

Не реалізовувати billing до validation.

---

# 108. GO / NO-GO — PRODUCT

Після зовнішнього pilot продовжувати масштабування, якщо спостерігається більшість таких signals:

```text
teachers independently complete lessons;
teachers voluntarily return;
preparation time decreases;
students join with low friction;
orchestration gets used;
teachers consult live results;
external schools request continued access;
several decision-makers express payment intent.
```

---

# 109. NO-GO / PIVOT SIGNALS

Переглянути концепцію, якщо:

```text
teachers use only PDF/presentation;
teachers ignore orchestration;
teachers prefer links manually;
live analytics unused;
Classroom Remote adds complexity;
teachers don't return;
schools refuse to pay;
only product creator can use it smoothly.
```

---

# 110. ВАЖЛИВИЙ СТРАТЕГІЧНИЙ ПРИНЦИП

Ми не повинні доводити:

```text
“платформа працює”
```

Ми повинні довести:

```text
“платформа створює достатньо цінності, щоб люди змінили свій workflow”
```

---

# 111. TECHNICAL MVP

Перший MVP включає лише те, що потрібно довести.

```text
Lesson Schema
Teacher View
Presentation
Activity
Lesson Run
Roster
Device Mapping
Remote Bridge
Student Runner
Live Checkpoint
Heatmap
Evidence
Lesson Report
Offline retry
```

---

# 112. НЕ MVP

```text
universal visual lesson builder
marketplace
AI course generator
parent product
publisher portal
other subjects
xAPI
Redis
district administration
billing automation
```

---

# 113. PHASE 0 — BASELINE

Завдання:

- read current architecture;
- security model;
- relevant code;
- tests;
- current DB.

Gate:

```bash
npm run check:frontend

cd backend
npm run build
npm test
```

---

# 114. PHASE 1 — SUBJECT-AGNOSTIC LESSON SCHEMA

Створити Core Lesson Definition.

Перевірка:

Lesson 2.1 має представлятись без Informatics-specific fields у core schema.

Gate:

> Чи можна теоретично описати тим самим schema урок математики?

Якщо ні — schema занадто предметна.

---

# 115. PHASE 2 — CONTENT PACK MODEL

Ввести concept:

```text
Content Pack
```

Створити:

```text
informatics-primary-ua
```

Gate:

Core Lesson Engine може отримати content pack ID, але не містить hardcoded `informatics` conditions.

---

# 116. PHASE 3 — EDITORIAL STORAGE

Створити:

```text
curriculum_lessons
curriculum_lesson_revisions
```

З existing publication lifecycle.

Gate:

- draft;
- review;
- published;
- immutable snapshot;
- RLS;
- audit.

---

# 117. PHASE 4 — RENDERERS

Створити:

```text
Teacher
Presentation
Student
```

з одного Lesson Definition.

Gate:

Жодної duplicated lesson copy.

---

# 118. PHASE 5 — ACTIVITY CORE

Створити plugin/registry architecture.

Реалізувати мінімум:

```text
choice
truefalse
classify
external
```

Gate:

Activity Engine не містить assumption, що предмет = informatics.

---

# 119. PHASE 6 — LESSON RUNTIME

Створити run state.

Gate:

```text
create
start
next
pause
resume
finish
reload
```

працюють server-side.

---

# 120. PHASE 7 — CLASSROOM CONTROL ABSTRACTION

Створити generic interface.

Спочатку:

```text
FakeClassroomControlProvider
```

Потім:

```text
ClassroomRemoteProvider
```

Gate:

Lesson Engine може працювати з fake provider без Chrome extension.

---

# 121. PHASE 8 — REAL CLASSROOM REMOTE

Перевірити actual integration protocol.

Не вигадувати API.

Пілот:

```text
3–5 devices
```

Gate:

```text
Teacher Send
→ correct device
→ correct activity
```

---

# 122. PHASE 9 — LIVE CLASS STATE

Реалізувати:

- student submit;
- delta query;
- heatmap;
- offline state;
- details.

Gate:

5 students simultaneously.

---

# 123. PHASE 10 — EVIDENCE ENGINE

Створити generic:

```text
LearningOutcome
StudentOutcomeEvidence
```

Gate:

Evidence traceable.

---

# 124. PHASE 11 — OFFLINE

IndexedDB outbox.

Gate:

```text
network off
submit
network on
one server attempt
```

---

# 125. PHASE 12 — LESSON REPORT

Teacher отримує report.

Gate:

Кожний summary explainable.

---

# 126. PHASE 13 — INTERNAL CLASSROOM PILOT

UGS.

Спочатку:

```text
Lesson 2.1
```

Потім:

```text
3–5 lessons
```

---

# 127. PHASE 14 — EXTERNAL PILOT

3–5 external schools.

Не мігрувати весь курс до цього етапу.

---

# 128. PHASE 15 — PRODUCT GO / NO-GO

Провести окремий review.

Вирішити:

```text
Scale
Modify
Narrow
Pivot
Stop
```

---

# 129. PHASE 16 — ONE MODULE

Якщо Go:

мігрувати повний module.

Перевірити repeated usage.

---

# 130. PHASE 17 — CONTENT MIGRATION TOOL

Після стабілізації schema.

HTML converter.

Manual review.

---

# 131. PHASE 18 — INFORMATICS 1–4

Масштабувати Content Pack.

---

# 132. PHASE 19 — ENGINE GENERALISATION TEST

До початку другого предмета взяти **один сторонній урок**.

Наприклад:

```text
математика 1 клас
Доданок + доданок = сума
```

Не будувати повний Mathematics Pack.

Лише перевірити:

> Чи може існуючий Engine виконати цей урок без зміни Core?

---

# 133. CRITICAL GENERALISATION TEST

Якщо для математичного уроку доводиться переписувати:

```text
Lesson Runtime
Presentation Engine
Student Runner
Heatmap
Evidence Engine
```

— Core спроєктований неправильно.

Якщо додається лише:

```text
content
activity config
curriculum mapping
```

— architecture працює.

---

# 134. ДРУГИЙ CONTENT PACK

Лише після успішного Informatics Product Validation.

Можливі:

```text
Mathematics Primary
Science Primary
Digital Literacy
AI Literacy
```

Вибір — за ринковим validation, не за технічною цікавістю.

---

# 135. THIRD-PARTY CONTENT PACKS

Довгострокова стратегія може передбачати:

```text
publisher
methodology team
school network
```

як автора content pack.

---

# 136. PLATFORM EVOLUTION

Можлива майбутня модель:

```text
Rozumko Engine
│
├── Rozumko original content
├── School content
├── Publisher A
├── Publisher B
└── Teacher custom packs
```

Це майбутня опція, не MVP.

---

# 137. PUBLIC CONTENT API — FUTURE

Content Pack theoretically could become portable.

Але не стандартизувати public API до стабілізації internal Lesson Schema.

---

# 138. COMPETITIVE POSITIONING

Не позиціонувати як:

```text
Ukrainian Nearpod
```

Не позиціонувати як:

```text
Kahoot + browser control
```

---

# 139. ЦІЛЬОВЕ POSITIONING ПІЛОТУ

> **Rozumko — готова система проведення уроків інформатики, яка веде вчителя через урок, доставляє потрібні активності учням і показує, що відбувається з навчанням у класі.**

---

# 140. POSITIONING ENGINE

Після generalisation:

> **Rozumko Lesson Engine — платформа для перетворення навчального курсу на керований виконуваний урок.**

---

# 141. НАША ВІДМІННІСТЬ ВІ GENERIC LESSON TOOLS

Generic tool:

```text
teacher creates lesson
```

Rozumko:

```text
curriculum team creates executable lesson
teacher executes
```

---

# 142. НАША ВІДМІННІСТЬ ВІ CLASSROOM MANAGEMENT

Classroom management:

```text
manage devices
```

Rozumko:

```text
manage learning process
```

Device control — adapter.

---

# 143. НАША ВІДМІННІСТЬ ВІ LMS

LMS:

```text
manage course administration
```

Rozumko:

```text
orchestrate lesson execution
```

---

# 144. НАША ВІДМІННІСТЬ ВІ DIGITAL TEXTBOOK

Digital textbook:

```text
child interacts with content
```

Rozumko:

```text
teacher + class + content + devices
```

---

# 145. CONTENT QUALITY Є ЧАСТИНОЮ PRODUCT

Engine без якісного pilot content не можна нормально протестувати.

Тому Informatics Pack не є другорядним demo.

Він повинен бути реальним, методично якісним продуктом.

---

# 146. АЛЕ CONTENT НЕ ПОВИНЕН ЗАБЛОКУВАТИ ENGINE

Не переносити 140 уроків до validation.

---

# 147. DEFINITION OF DONE — VERTICAL SLICE

Teacher може:

```text
login
↓
select class
↓
select Lesson 2.1
↓
start
↓
present
↓
advance
↓
launch activity
↓
send to devices
↓
students complete without login
↓
see live state
↓
pause
↓
reteach
↓
resume
↓
finish
↓
see evidence/report
```

---

# 148. ТЕХНІЧНИЙ VERTICAL SLICE ВВАЖАЄТЬСЯ УСПІШНИМ, ЯКЩО

- current tests green;
- security green;
- no answer-key leak;
- snapshot immutable;
- five simulated students work;
- real Remote works on pilot devices;
- offline retry works;
- report traceable.

---

# 149. PRODUCT VERTICAL SLICE ВВАЖАЄТЬСЯ УСПІШНИМ, ЯКЩО

Учитель:

- проводить урок без допомоги розробника;
- не відкриває додатково 5 сервісів;
- розуміє controls;
- бачить classroom state;
- може реагувати на проблему.

---

# 150. EXTERNAL PILOT SUCCESS

Сильний signal:

```text
teacher voluntarily asks for next lesson
```

Ще сильніший:

```text
school asks for full course
```

Найсильніший:

```text
school agrees to pay
```

---

# 151. ПІЛОТ НЕ ПОВИНЕН МАТИ ВЕЛИКИЙ SALES PROCESS

На першому етапі достатньо:

```text
3 schools
↓
10 schools
↓
30 schools
```

Не потрібно одразу доводити ринок у тисячі закладів.

---

# 152. UNIT ECONOMICS — ПІЗНІШЕ

До building billing потрібно знати:

- usage;
- retention;
- support cost;
- infrastructure cost;
- buyer;
- willingness to pay.

Не вигадувати pricing до pilot.

---

# 153. ТЕХНІЧНИЙ ПРИНЦИП

Не створювати infrastructure заради майбутнього масштабу, якого ще немає.

Спочатку:

```text
simple
reliable
observable
tested
```

---

# 154. ARCHITECTURE TRIGGER POLICY

Redis додається після:

```text
measured scaling problem
```

WebSocket у Core додається після:

```text
measured realtime requirement
```

LRS додається після:

```text
real interoperability requirement
```

---

# 155. CONTENT GENERALISATION POLICY

Не створювати generic abstraction після одного use case лише теоретично.

Процес:

```text
Informatics use case
↓
second-subject test
↓
identify real commonality
↓
generalize
```

---

# 156. АЛЕ CORE BOUNDARIES МАЮТЬ БУТИ SUBJECT-AGNOSTIC ВЖЕ ЗАРАЗ

Тобто не hardcode:

```ts
if (subject === 'informatics') {
  // core runtime
}
```

Informatics-specific behaviour живе в plugin/config/content pack.

---

# 157. TEST: SUBJECT INDEPENDENCE

Створити у tests synthetic lesson:

```text
subject = "test-subject"
```

з:

```text
explanation
activity
checkpoint
evidence
```

Він має виконуватися Core Engine.

---

# 158. TEST: SECOND SUBJECT

Після Informatics MVP створити одну реальну mathematics lesson fixture.

Якщо Core tests залишаються без змін — хороший signal.

---

# 159. ACCESSIBILITY — CORE

Не Content Pack responsibility.

Core гарантує:

- keyboard;
- focus;
- semantics;
- reduced motion;
- touch;
- responsive;
- colour-independent states.

---

# 160. PEDAGOGICAL QUALITY — SHARED RESPONSIBILITY

Engine гарантує:

```text
структуру
модальності
runtime
evidence roles
```

Content Pack гарантує:

```text
якість explanation
правильність activity
curriculum alignment
age appropriateness
```

---

# 161. DATA RESPONSIBILITY

Engine відповідає за:

```text
identity boundaries
security
attempts
evidence storage
```

Content Pack не має права обходити ці правила.

---

# 162. ACTIVITY SECURITY

Plugin не отримує arbitrary DB access.

Activity communicates through defined runtime interface.

---

# 163. EXTERNAL TOOLS

Core activity source:

```text
native
external
```

External:

```text
launch-only
integrated
```

---

# 164. EXTERNAL URL POLICY

Published content не містить arbitrary unchecked URL.

Use registry/allowlist.

---

# 165. MIGRATION SOURCE ≠ RUNTIME FORMAT

Завжди:

```text
source HTML
≠
LessonDefinition
```

---

# 166. CURRENT NEW HTML CONTENT

Є pedagogical source of truth для Informatics Pack.

Зберегти сильні сторони:

- essential question;
- objectives;
- explanation;
- support;
- extension;
- reflection;
- criteria;
- Cambridge terms.

---

# 167. OLD NEW_LESSONS

Є software design reference.

Зберегти:

- content-as-data;
- modes;
- activity patterns.

---

# 168. ROZUMKO

Є platform/backend/runtime host.

---

# 169. ITNAUKA

Є specialised tool/activity provider.

---

# 170. CLASSROOM REMOTE

Є device-control provider.

---

# 171. ЦІЛЬОВА ЕКОСИСТЕМА

```text
New Lesson Content
       ↓
Informatics Content Pack
       ↓
Lesson Schema
       ↓
Rozumko Lesson Engine
       ↓
Teacher / Presentation / Student
       ↓
Activities
 ┌─────────────┬──────────────┐
 │             │              │
Native      itnauka      future plugin
 │             │
 └─────── Results ────────┐
                          ↓
                      Evidence

Classroom Remote
       ↑
Classroom Control Adapter
```

---

# 172. REPOSITORY DOCUMENTATION

Додати:

```text
docs/lesson-engine-architecture.md
docs/content-pack-model.md
docs/lesson-schema.md
docs/lesson-engine-security.md
docs/informatics-pilot.md
docs/lesson-engine-pilot-runbook.md
```

---

# 173. AGENT IMPLEMENTATION DISCIPLINE

ШІ-агент не повинен отримувати завдання:

> “реалізуй увесь документ”.

Завдання поділяються по Phase.

---

# 174. ПЕРЕД КОЖНОЮ PHASE

Агент:

```text
reads relevant files
↓
checks baseline
↓
implements smallest slice
↓
tests
↓
reports gate
```

---

# 175. НЕ ПЕРЕХОДИТИ ДО НАСТУПНОЇ PHASE

Якщо acceptance gate поточної не виконаний.

---

# 176. НЕ ПОСЛАБЛЮВАТИ TESTS

Security test failure означає:

```text
implementation problem
```

а не:

```text
test problem
```

доки не доведено протилежне.

---

# 177. REQUIRED TEST CLASSES

Кожна core feature має:

```text
unit
integration
security
E2E where appropriate
```

---

# 178. KEY SECURITY TESTS

Обов'язково:

```text
teacher isolation
class ownership
student token scope
token expiry
answer-key protection
idempotency
RLS coverage
published/draft isolation
immutable historical run
```

---

# 179. KEY PRODUCT TEST

Найважливіший тест неможливо автоматизувати:

> Чи може сторонній учитель провести урок без автора системи?

---

# 180. KEY ARCHITECTURE TEST

Найважливіший architecture test:

> Чи можна виконати урок іншого предмета тим самим Lesson Engine?

---

# 181. КЛЮЧОВА БІЗНЕС-ПЕРЕВІРКА

> Чи погоджується незалежна школа платити за використання системи?

---

# 182. РЕКОМЕНДОВАНИЙ ПОРЯДОК РОЗРОБКИ

```text
Core schema
↓
Informatics Lesson 2.1
↓
renderers
↓
activity
↓
runtime
↓
device adapter
↓
live state
↓
evidence
↓
offline
↓
report
↓
UGS pilot
↓
external pilot
↓
Go / No-Go
↓
module
↓
full Informatics Pack
↓
second-subject architecture test
↓
platform expansion
```

---

# 183. ЩО НЕ МОЖНА ЗМІНЮВАТИ В ЦЬОМУ ПОРЯДКУ БЕЗ СИЛЬНОЇ ПРИЧИНИ

Не робити:

```text
full content migration
```

до:

```text
external validation
```

---

# 184. ПРИЧИНА

Найбільший ризик проєкту — не технічний.

Найбільший ризик:

```text
побудувати дуже хорошу систему,
якою крім автора ніхто регулярно не користується.
```

---

# 185. РОЗРОБКА ПОВИННА ЗМЕНШУВАТИ ЦЕЙ РИЗИК

Тому roadmap оптимізується не під:

```text
maximum feature count
```

а під:

```text
maximum learning per development effort
```

про product-market fit.

---

# 186. ENGINE SUCCESS CRITERIA

Rozumko Lesson Engine успішний, якщо:

1. може виконати повний lesson;
2. teacher легко керує lesson;
3. student interaction не потребує складного onboarding;
4. activity delivery працює;
5. live information корисна;
6. evidence traceable;
7. subject-specific logic не проникла у core;
8. другий предмет можна додати без переписування runtime.

---

# 187. INFORMATICS PACK SUCCESS CRITERIA

Informatics Pack успішний, якщо:

1. сторонні teachers проводять lessons;
2. lessons методично придатні;
3. specialised activities дають цінність;
4. preparation time скорочується;
5. teachers повертаються;
6. school buyer бачить цінність.

---

# 188. ПЛАТФОРМА SUCCESS CRITERIA

Перехід від Informatics product до platform виправданий, якщо:

```text
Engine value
```

доведена незалежно від конкретного content pack.

---

# 189. НЕ ПРИСКОРЮВАТИ EXPANSION

Другий предмет не є метою сам по собі.

Це architecture/business validation.

---

# 190. МОЖЛИВИЙ ДОВГОСТРОКОВИЙ ПРОДУКТ

```text
Rozumko Lesson Engine
```

для:

- schools;
- publishers;
- curriculum providers;
- school networks;
- methodologists.

---

# 191. МОЖЛИВИЙ ДОВГОСТРОКОВИЙ WORKFLOW

Publisher має:

```text
textbook
teacher guide
workbook
```

Rozumko перетворює це на:

```text
Executable Curriculum
```

---

# 192. EXECUTABLE CURRICULUM

Це може стати ключовим поняттям продукту.

Не просто:

```text
content
```

а:

```text
content
+
runtime rules
+
activities
+
presentation
+
evidence
```

---

# 193. STRATEGIC MOAT

Не один feature.

Потенційний moat:

```text
Lesson Engine
+
Content Packs
+
specialised Activity Ecosystem
+
Classroom Orchestration
+
Learning Evidence
```

---

# 194. ЧОМУ ЦЕ ВАЖЧЕ СКОПІЮВАТИ

Окремо:

```text
quiz
presentation
push URL
```

копіюються легко.

Важче скопіювати:

```text
high-quality curriculum
+
runtime
+
specialised domain activities
+
evidence model
+
teacher workflow
```

---

# 195. FINAL PRODUCT PRINCIPLE

Rozumko не повинен допомагати вчителю:

> створити більше цифрового контенту.

Rozumko повинен допомагати:

> **провести якісніший урок із меншим операційним навантаженням.**

---

# 196. FINAL ARCHITECTURE PRINCIPLE

Універсалізувати:

```text
lesson execution
```

але не намагатися одразу універсалізувати:

```text
весь education software
```

---

# 197. FINAL PILOT PRINCIPLE

Інформатика — не обмеження продукту.

Інформатика — **лабораторія**, де ми доводимо Lesson Engine.

---

# 198. FINAL BUSINESS PRINCIPLE

Не припускати, що ринок існує.

Перевірити його.

```text
Build enough
↓
Pilot
↓
Measure
↓
Sell
↓
Then scale
```

---

# 199. FINAL DEFINITION

## Rozumko Lesson Engine

> **Універсальний програмний рушій, який перетворює структурований навчальний контент на керований урок: веде вчителя через сценарій, синхронізує представлення матеріалу та роботу учнів, запускає інтерактивні активності, збирає результати в реальному часі та перетворює значущі результати на прозорі навчальні докази.**

## Rozumko Informatics

> **Перший повноцінний Content Pack для Rozumko Lesson Engine, призначений для викладання інформатики, цифрової грамотності, обчислювального мислення та основ ШІ у 1–4 класах.**

---

# 200. ГОЛОВНЕ ПИТАННЯ ДЛЯ КОЖНОГО НАСТУПНОГО РІШЕННЯ

Перед додаванням будь-якої функції потрібно запитувати:

> Це функція Lesson Engine, функція Informatics Content Pack чи зовнішня інтеграція?

Якщо відповідь незрозуміла — архітектурна межа ще не визначена.

---

# 201. ГОЛОВНИЙ КРИТЕРІЙ ДЛЯ CORE

Core Lesson Engine не повинен знати, що першим предметом була інформатика.

---

# 202. ГОЛОВНИЙ КРИТЕРІЙ ДЛЯ ПІЛОТУ

Учитель, який не створював Rozumko, повинен мати можливість:

> відкрити урок, провести його та захотіти використати систему ще раз.

---

# 203. ГОЛОВНИЙ КРИТЕРІЙ ДЛЯ БІЗНЕСУ

Школа, яка не пов'язана з розробником, повинна сказати:

> **“Це вирішує для нас достатньо важливу проблему, щоб ми були готові за це платити.”**

Лише після цього доцільно масштабувати продукт.

---

# ФІНАЛЬНА СХЕМА

```text
                        ROZUMKO

                  ┌─────────────────┐
                  │  LESSON ENGINE  │
                  │                 │
                  │ Schema          │
                  │ Runtime         │
                  │ Presentation    │
                  │ Activities      │
                  │ Orchestration   │
                  │ Live State      │
                  │ Evidence        │
                  │ Reports         │
                  └────────┬────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
    Informatics        Mathematics       Science
      Pack               Pack            Pack
     PILOT              FUTURE          FUTURE
          │
          ▼
   specialised CS
     activities
          │
          ▼
 Classroom Remote
  / web fallback
```

---

# КІНЦЕВА СТРАТЕГІЯ

```text
Не будуємо платформу для всіх предметів.

Будуємо правильний Lesson Engine.

Перевіряємо його на інформатиці.

Доводимо цінність на реальних учителях.

Доводимо готовність шкіл платити.

Перевіряємо другий предмет.

І лише після цього перетворюємо Rozumko
з сильного вертикального продукту
на справжню платформу.
```