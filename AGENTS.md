# КРИТИЧНО ВАЖЛИВО — СТРОГИЙ РЕЖИМ

Ти працюєш ВИКЛЮЧНО всередині папки `C:\Users\artem\Documents\GitHub\rozumko.github.io`.

Це платформа для онлайн-олімпіад з інформатики для учнів 1–4 класів.

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

## Ключові архітектурні правила

- Відповіді та оцінювання — тільки на сервері. Ключі відповідей ніколи не потрапляють у браузер
- Авторизація (role, status) — завжди через `GET /api/teacher/me`, не через JWT claims
- Студенти не мають Supabase Auth. Вхід тільки через `POST /api/student/exchange-code`
- Весь доступ до БД — через бекенд API. Прямих запитів із фронтенду до Supabase таблиць немає
- `features/api/client.ts` — єдина точка для всіх HTTP-запитів із фронтенду

## Структура (ключові файли)

```
features/api/client.ts   ← всі API-запити (типізовані)
features/admin/          ← вкладки адмін-панелі
features/olympiad/       ← quiz-engine
utils/                   ← question-renderer, focus-trap, ui
backend/src/routes/      ← student, attempt, teacher, admin, questions
backend/src/lib/auth.ts  ← requireAuth, requireAdmin middleware
backend/src/db/          ← Drizzle schema + migrations
public/                  ← sw.js, manifest, favicon (статичні assets)
```
