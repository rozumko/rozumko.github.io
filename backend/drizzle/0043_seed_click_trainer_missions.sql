-- Migration 0043: register the legacy click-trainer content as an editable mission.

INSERT INTO public.missions
  (id, title, kind, track, grade, version, edit_version, status,
   published_version, published_snapshot, published_at, config)
VALUES
  (
    'game-click-trainer-computer-parts-grade1', 'Тренажер: Клацни правильну картку', 'click-trainer-game',
    'informatics', 1, 1, 1, 'published', 1,
    jsonb_build_object(
      'id', 'game-click-trainer-computer-parts-grade1', 'title', 'Тренажер: Клацни правильну картку',
      'kind', 'click-trainer-game', 'track', 'informatics', 'grade', 1,
      'version', 1, 'config', jsonb_build_object('legacyBundledContent', true, 'gameKey', 'computer-parts')
    ), now(), jsonb_build_object('legacyBundledContent', true, 'gameKey', 'computer-parts')
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.mission_revisions
  (mission_id, edit_version, action, snapshot, changed_by, created_at)
SELECT id, edit_version, 'backfill', to_jsonb(missions), updated_by,
  COALESCE(updated_at, created_at, now())
FROM public.missions
WHERE id = 'game-click-trainer-computer-parts-grade1'
ON CONFLICT (mission_id, edit_version) DO NOTHING;
