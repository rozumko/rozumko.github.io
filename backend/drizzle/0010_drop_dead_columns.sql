-- Видалення мертвих колонок таблиці questions:
-- firebase_id — артефакт міграції з Firebase, більше не використовується
-- subject     — ніколи не задіяна в API, фільтрах або UI

ALTER TABLE public.questions DROP COLUMN IF EXISTS firebase_id;
ALTER TABLE public.questions DROP COLUMN IF EXISTS subject;
