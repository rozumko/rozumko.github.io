-- Migration 0025: гра-місія «Мульти-Сортування» (порт temp/sort.html).
-- Механіка: той самий предмет має кілька ознак і в різних рівнях потрапляє в
-- різні кошики → тренує абстрагування (вибір суттєвої ознаки).
-- Track: computational-thinking, concept: abstraction.

INSERT INTO public.missions ("id", "title", "kind", "track", "grade", "version", "status", "config")
VALUES (
  'game-multisort-attributes-grade2',
  'Гра: Мульти-Сортування (той самий предмет — різні ознаки)',
  'sorting-game',
  'computational-thinking',
  2,
  1,
  'active',
  '{
    "conceptKey": "abstraction",
    "page": "games.html",
    "levels": [
      { "instruction": "Спочатку — за кольором", "bins": ["red", "green"], "items": 10 },
      { "instruction": "Ті самі речі — тепер їжа чи тварини?", "bins": ["food", "animal"], "items": 10 },
      { "instruction": "А тепер — природа, техніка чи одяг?", "bins": ["nature", "machine", "clothing"], "items": 11 }
    ]
  }'::jsonb
)
ON CONFLICT ("id") DO NOTHING;
