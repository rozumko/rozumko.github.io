# КРИТИЧНО ВАЖЛИВО — СТРОГИЙ РЕЖИМ

Ти працюєш ВИКЛЮЧНО всередині папки `C:\Users\artem\Documents\GitHub\rozumko.github.io`.

Це освітня платформа для розвитку обчислювального мислення, основ ШІ, логічних місій, тренувань і онлайн-подій для учнів 1–4 класів.

**Поточний стек:** Vite 6 + TypeScript (allowJs) + Vanilla JS + CSS — фронтенд; Node.js + Fastify v5 + TypeScript — бекенд; PostgreSQL (Supabase) + Drizzle ORM — БД; Supabase Auth (тільки вчитель/адмін); GitHub Pages (GitHub Actions) + Render (бекенд).

## Заборонено назавжди

- Створювати git worktrees, копіювати репозиторій, створювати додаткові папки
- Читати, сканувати або згадувати папки вище `C:\Users\artem\Documents\GitHub\rozumko.github.io`
- Виконувати `find`, `grep`, `tree` по всьому проєкту без дозволу
- Читати файли "для контексту" якщо не просили
- Копіювати великий обсяг коду в контекст

## Дозволено

- Читати і редагувати файли, які явно названі або безпосередньо потрібні для завдання
- Фронтенд: HTML, CSS, TypeScript/JavaScript у кореневій папці та `features/`, `utils/`
- Бекенд: TypeScript у `backend/src/`

## Правила роботи

- Перед будь-якою дією запитуй: "Які конкретні файли мені потрібно прочитати?"
- Якщо завдання нечітке — став одне уточнююче питання
- Пропонуй план з 2–3 кроків і чекай підтвердження
- Відповідай коротко. Показуй тільки diff змін, а не весь файл
- Перед продуктовими, архітектурними або roadmap-змінами прочитай локальний приватний файл `.agents-product-strategy.md`, якщо він існує. Його зміст не публікується в GitHub, але є джерелом правди для ШІ-агентів у цій робочій копії.

## Ключові архітектурні правила

- Відповіді та оцінювання — тільки на сервері. Ключі відповідей ніколи не потрапляють у браузер
- Авторизація (role, status) — завжди через `GET /api/teacher/me`, не через JWT claims
- Студенти не мають Supabase Auth. Вхід тільки через `POST /api/student/exchange-code`
- Весь доступ до БД — через бекенд API. Прямих запитів із фронтенду до Supabase таблиць немає
- `features/api/client.ts` — єдина точка для всіх HTTP-запитів із фронтенду

## Запобіжники безпеки

- Перед змінами auth, API, оцінювання, деплою або БД прочитай `docs/security-model.md`
- Не змінюй `trustProxy: 1` на `trustProxy: true`
- Публічний `/api/questions` повертає лише тренувальні питання; олімпіадні питання видаються тільки через `POST /api/student/exchange-code`
- Для нових params/body/query ID додавай UUID-валідацію до звернення до БД
- Після змін запускай frontend: `npm run typecheck && npm test && npm run build`
- Після змін запускай backend: `cd backend && npm run build && npm test`
- Не послаблюй security regression tests без окремого аудиту причин

## Структура (ключові файли)

```
features/api/client.ts   ← всі API-запити (типізовані)
features/admin/          ← вкладки адмін-панелі
features/olympiad/       ← quiz-engine
utils/                   ← question-renderer, focus-trap, ui
backend/src/routes/      ← student, attempt, teacher, admin, questions
backend/src/lib/auth.ts  ← requireAuth, requireAdmin middleware
backend/src/db/          ← Drizzle schema + migration runner
backend/drizzle/         ← SQL-міграції
public/                  ← sw.js, manifest, favicon (статичні assets)
```
