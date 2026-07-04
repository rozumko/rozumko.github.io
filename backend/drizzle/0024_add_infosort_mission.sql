-- Migration 0024: гра-місія «ІнфоСорт» (сортування інформації).
-- Порт temp/infosort.html на спільний движок features/games/sorting-game.ts.
-- Вміст: органи чуття + форми подання інформації (informatics/information).

INSERT INTO public.missions ("id", "title", "kind", "track", "grade", "version", "status", "config")
VALUES (
  'game-sorting-information-grade1',
  'Гра: ІнфоСорт (як ми отримуємо інформацію)',
  'sorting-game',
  'informatics',
  1,
  1,
  'active',
  '{
    "topic": "information",
    "page": "games.html",
    "levels": [
      { "instruction": "Яким органом чуття ми це сприймаємо?", "bins": ["eye", "ear", "nose", "mouth", "skin"], "items": 12 },
      { "instruction": "У якій формі подана інформація?", "bins": ["text", "graphic", "numeric", "sound"], "items": 12 }
    ]
  }'::jsonb
)
ON CONFLICT ("id") DO NOTHING;
