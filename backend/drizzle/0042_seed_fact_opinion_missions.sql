-- Migration 0042: register legacy fact-opinion content as editable missions.

INSERT INTO public.missions
  (id, title, kind, track, grade, version, edit_version, status,
   published_version, published_snapshot, published_at, config)
VALUES
  (
    'game-fact-opinion-level1-grade1', 'Гра: Факт чи думка?', 'fact-opinion-game',
    'ai-basics', 1, 1, 1, 'published', 1,
    jsonb_build_object(
      'id', 'game-fact-opinion-level1-grade1', 'title', 'Гра: Факт чи думка?',
      'kind', 'fact-opinion-game', 'track', 'ai-basics', 'grade', 1,
      'version', 1, 'config', jsonb_build_object('legacyBundledContent', true, 'gameKey', 'level1')
    ), now(), jsonb_build_object('legacyBundledContent', true, 'gameKey', 'level1')
  ),
  (
    'game-fact-opinion-level2-grade2', 'Гра: Факт, думка чи міф', 'fact-opinion-game',
    'ai-basics', 2, 1, 1, 'published', 1,
    jsonb_build_object(
      'id', 'game-fact-opinion-level2-grade2', 'title', 'Гра: Факт, думка чи міф',
      'kind', 'fact-opinion-game', 'track', 'ai-basics', 'grade', 2,
      'version', 1, 'config', jsonb_build_object('legacyBundledContent', true, 'gameKey', 'level2')
    ), now(), jsonb_build_object('legacyBundledContent', true, 'gameKey', 'level2')
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.mission_revisions
  (mission_id, edit_version, action, snapshot, changed_by, created_at)
SELECT id, edit_version, 'backfill', to_jsonb(missions), updated_by,
  COALESCE(updated_at, created_at, now())
FROM public.missions
WHERE id IN ('game-fact-opinion-level1-grade1', 'game-fact-opinion-level2-grade2')
ON CONFLICT (mission_id, edit_version) DO NOTHING;
