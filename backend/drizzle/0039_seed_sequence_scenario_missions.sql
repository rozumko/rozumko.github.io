-- Migration 0039: register legacy sequence/scenario content as editable missions.

INSERT INTO public.missions
  (id, title, kind, track, grade, version, edit_version, status,
   published_version, published_snapshot, published_at, config)
VALUES
  (
    'game-sequence-algorithms-grade2', 'Гра: Упорядкуй кроки', 'sequence-game',
    'computational-thinking', 2, 1, 1, 'published', 1,
    jsonb_build_object(
      'id', 'game-sequence-algorithms-grade2', 'title', 'Гра: Упорядкуй кроки',
      'kind', 'sequence-game', 'track', 'computational-thinking', 'grade', 2,
      'version', 1, 'config', jsonb_build_object('legacyBundledContent', true, 'gameKey', 'algorithms-g2')
    ), now(), jsonb_build_object('legacyBundledContent', true, 'gameKey', 'algorithms-g2')
  ),
  (
    'game-scenarios-digital-safety-grade2', 'Гра: Як вчинити?', 'scenario-game',
    'informatics', 2, 1, 1, 'published', 1,
    jsonb_build_object(
      'id', 'game-scenarios-digital-safety-grade2', 'title', 'Гра: Як вчинити?',
      'kind', 'scenario-game', 'track', 'informatics', 'grade', 2,
      'version', 1, 'config', jsonb_build_object('legacyBundledContent', true, 'gameKey', 'digital-safety')
    ), now(), jsonb_build_object('legacyBundledContent', true, 'gameKey', 'digital-safety')
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.mission_revisions
  (mission_id, edit_version, action, snapshot, changed_by, created_at)
SELECT id, edit_version, 'backfill', to_jsonb(missions), updated_by,
  COALESCE(updated_at, created_at, now())
FROM public.missions
WHERE id IN ('game-sequence-algorithms-grade2', 'game-scenarios-digital-safety-grade2')
ON CONFLICT (mission_id, edit_version) DO NOTHING;
