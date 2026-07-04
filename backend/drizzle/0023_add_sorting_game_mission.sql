-- Migration 0023: перша гра-місія в реєстрі — «Розумне сортування» (класифікація).
-- Движок: features/games/sorting-game.ts (клієнтський, безключовий).
-- config дублює рівні з features/games/sorting-data.ts — джерело для адмінки.

INSERT INTO public.missions ("id", "title", "kind", "track", "grade", "version", "status", "config")
VALUES (
  'game-sorting-attributes-grade1',
  'Гра: Розумне сортування (класифікація за ознакою)',
  'sorting-game',
  'computational-thinking',
  1,
  1,
  'active',
  '{
    "conceptKey": "classification",
    "page": "games.html",
    "levels": [
      { "instruction": "Що можна їсти?", "bins": ["eat", "no-eat"], "items": 8 },
      { "instruction": "Який це транспорт?", "bins": ["air", "water", "land"], "items": 9 },
      { "instruction": "Яка це форма?", "bins": ["circle", "square"], "items": 6 },
      { "instruction": "Велике чи маленьке?", "bins": ["big", "small"], "items": 6 },
      { "instruction": "Швидке чи повільне?", "bins": ["fast", "slow"], "items": 6 }
    ]
  }'::jsonb
)
ON CONFLICT ("id") DO NOTHING;
