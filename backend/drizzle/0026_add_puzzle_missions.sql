-- Migration 0026: логічні головоломки в реєстрі місій (порт math_quiz).
-- Движок: features/games/puzzle-engine.ts (клієнтський, параметричний за класом
-- 1–4, безключовий). Один рядок на тип; concept у config. grade=1 — мінімальний
-- (насправді 1–4, див. config.grades). kind='puzzle'.

INSERT INTO public.missions ("id", "title", "kind", "track", "grade", "version", "status", "config")
VALUES
  ('game-puzzle-sequence', 'Головоломка: Числовий ланцюжок', 'puzzle', 'computational-thinking', 1, 1, 'active',
   '{"concept":"patterns","page":"games.html","grades":[1,2,3,4]}'::jsonb),
  ('game-puzzle-machine',  'Головоломка: Математична машина', 'puzzle', 'computational-thinking', 1, 1, 'active',
   '{"concept":"algorithms","page":"games.html","grades":[1,2,3,4]}'::jsonb),
  ('game-puzzle-balance',  'Головоломка: Рівність на терезах', 'puzzle', 'computational-thinking', 1, 1, 'active',
   '{"concept":"logic","page":"games.html","grades":[1,2,3,4]}'::jsonb),
  ('game-puzzle-magic',    'Головоломка: Магічний квадрат (1 кл. — квадрат-загадка)', 'puzzle', 'computational-thinking', 1, 1, 'active',
   '{"concept":"logic","page":"games.html","grades":[1,2,3,4],"grade1":"latin-square-emoji"}'::jsonb),
  ('game-puzzle-symbols',  'Головоломка: Символьна логіка', 'puzzle', 'computational-thinking', 1, 1, 'active',
   '{"concept":"abstraction","page":"games.html","grades":[1,2,3,4],"grade1":"emoji"}'::jsonb)
ON CONFLICT ("id") DO NOTHING;
