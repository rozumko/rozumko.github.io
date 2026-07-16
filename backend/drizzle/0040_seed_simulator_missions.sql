-- Migration 0040: register code-owned simulators for controlled content authoring.

INSERT INTO public.missions
  (id, title, kind, track, grade, version, edit_version, status,
   published_version, published_snapshot, published_at, config)
VALUES
  (
    'game-simulator-assembly-hardware', 'Симулятор: Збірка ПК', 'simulator-game',
    'informatics', 2, 1, 1, 'published', 1,
    jsonb_build_object(
      'id', 'game-simulator-assembly-hardware', 'title', 'Симулятор: Збірка ПК',
      'kind', 'simulator-game', 'track', 'informatics', 'grade', 2, 'version', 1,
      'config', jsonb_build_object('legacyBundledContent', true, 'scenarioKey', 'assembly-hardware', 'mechanicsVersion', 1)
    ), now(), jsonb_build_object('legacyBundledContent', true, 'scenarioKey', 'assembly-hardware', 'mechanicsVersion', 1)
  ),
  (
    'game-simulator-assembly-software', 'Симулятор: Налаштування ОС та ПЗ', 'simulator-game',
    'informatics', 4, 1, 1, 'published', 1,
    jsonb_build_object(
      'id', 'game-simulator-assembly-software', 'title', 'Симулятор: Налаштування ОС та ПЗ',
      'kind', 'simulator-game', 'track', 'informatics', 'grade', 4, 'version', 1,
      'config', jsonb_build_object('legacyBundledContent', true, 'scenarioKey', 'assembly-software', 'mechanicsVersion', 1)
    ), now(), jsonb_build_object('legacyBundledContent', true, 'scenarioKey', 'assembly-software', 'mechanicsVersion', 1)
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.mission_revisions
  (mission_id, edit_version, action, snapshot, changed_by, created_at)
SELECT id, edit_version, 'backfill', to_jsonb(missions), updated_by,
  COALESCE(updated_at, created_at, now())
FROM public.missions
WHERE id IN ('game-simulator-assembly-hardware', 'game-simulator-assembly-software')
ON CONFLICT (mission_id, edit_version) DO NOTHING;
