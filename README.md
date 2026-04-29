# 🧠 Розумко — Онлайн-олімпіада з інформатики

> Онлайн-платформа для проведення олімпіад та тренувань з інформатики для учнів 1–4 класів.

[![License: Proprietary](https://img.shields.io/badge/license-Proprietary-red.svg)](./LICENSE)
[![GitHub Pages](https://img.shields.io/badge/hosted-GitHub%20Pages-blue.svg)](https://rozumko.github.io)

---

## ⚠️ Ліцензія

**Це комерційний проєкт з закритою ліцензією.**  
Публічний репозиторій розміщений виключно для прозорості та не надає жодних прав на використання коду.

> Копіювання, модифікація або використання коду без письмового дозволу автора **заборонені**.  
> Детально — у файлі [LICENSE](./LICENSE).

---

## Про проєкт

**Розумко** — освітня платформа для проведення онлайн-олімпіад і тренувань з інформатики для учнів початкової школи.

### Для кого

| Роль | Можливості |
|---|---|
| 👨‍🏫 **Вчитель** | Кабінет: класи, генерація кодів доступу, перегляд результатів |
| 🧒 **Учень** | Вхід за кодом без реєстрації, тренування або олімпіада |
| 🔧 **Адмін** | Управління подіями, банком питань, вчителями, результатами |

### Ключові особливості

- **Без реєстрації для учнів** — вхід тільки за кодом (`КІТ247`)
- **6 типів питань** — вибір, так/ні, введення, порядок, послідовність, пари
- **Зображення до питань** — з lightbox-переглядом
- **Захист від збоїв** — localStorage-бекап під час олімпіади
- **Безпека** — Firebase App Check, Firestore rules, захист від XSS
- **Доступність** — WCAG 2.2, focus trap, prefers-reduced-motion

---

## Стек технологій

| Категорія | Технологія |
|---|---|
| Frontend | Vanilla HTML + CSS + JavaScript (ES Modules) |
| Стилі | Tailwind CSS (CDN) + кастомний `style.css` |
| Auth | Firebase Authentication (email/password + anonymous) |
| База даних | Cloud Firestore |
| Безпека | Firebase App Check (reCAPTCHA v3) |
| Хостинг | GitHub Pages |

---

## Структура проєкту

```
├── index.html          ← лендінг
├── student.html/js     ← інтерфейс учня
├── teacher.html/js     ← кабінет вчителя
├── admin.html/js       ← адмін-панель
├── style.css           ← глобальні стилі
│
├── services/           ← Firebase: auth, Firestore, stats
├── features/           ← auth flows, quiz engine, session, results
├── utils/              ← focus-trap, question-renderer
├── data/questions/     ← JS-банк питань (fallback)
│
├── docs/               ← технічна документація
│   ├── teacher-student-architecture.md
│   └── task-format.md
│
├── manifest.json       ← PWA manifest
├── firestore.rules     ← правила безпеки Firestore
└── LICENSE             ← умови використання
```

---

## Документація

- [Архітектура проєкту](./docs/teacher-student-architecture.md)
- [Формат питань](./docs/task-format.md)

---

## Контакти

З питань співпраці, дозволу на використання або повідомлень про помилки — через [GitHub Issues](../../issues).

---

*© 2024–2026 Розумко. Всі права захищені.*
