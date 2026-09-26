-- Migration 0058: outcome directory pilot "input and output devices" (grade 2)
-- and framework mappings with a strength (docs/lesson-engine/README.md,
-- "Outcome directory").
--
-- Evidence is written only against Rozumko skills (source 'internal'). The
-- national standard (NUSH, framework keys per edition: nush-ifo-2018 for the
-- edition in force, nush-ifo-2028 for the new one) and Cambridge
-- (cambridge-0059 Computing, cambridge-0072 Digital Literacy) live only in
-- `mappings`. A mapping strength ('direct' | 'partial' | 'supporting') is a
-- methodological judgement, not an official equivalence.
--
-- Data only, no schema change. Idempotent: new outcomes use ON CONFLICT DO
-- NOTHING; the two pilot file outcomes gain mappings only while they still
-- have none, so an admin's later edit is never overwritten. Every change
-- writes a revision, like the admin API does.

INSERT INTO public.curriculum_outcomes (id, subject_pack_id, code, title_uk, source, grade_band, mappings)
VALUES
  ('int-devices-io-distinguish', 'informatics-ua-primary', 'INF-2-DEV-1',
   'Розрізняє пристрої введення та виведення серед знайомих пристроїв', 'internal', '1-2',
   '[{"framework": "cambridge-0059", "ref": "2CS.03", "strength": "direct"},
     {"framework": "nush-ifo-2018", "ref": "2 ІФО 3.1.1", "strength": "partial"}]'::jsonb),
  ('int-devices-io-new-device', 'informatics-ua-primary', 'INF-2-DEV-2',
   'Визначає за описом функції, чи новий пристрій вводить, чи виводить інформацію', 'internal', '1-2',
   '[{"framework": "cambridge-0059", "ref": "2CS.03", "strength": "direct"},
     {"framework": "nush-ifo-2018", "ref": "2 ІФО 1.3.1", "strength": "partial"}]'::jsonb),
  ('int-devices-choose-for-task', 'informatics-ua-primary', 'INF-2-DEV-3',
   'Обирає пристрій для задачі та пояснює, чому він підходить', 'internal', '1-2',
   '[{"framework": "cambridge-0059", "ref": "2CS.05", "strength": "direct"},
     {"framework": "cambridge-0059", "ref": "2CS.01", "strength": "supporting"},
     {"framework": "nush-ifo-2018", "ref": "2 ІФО 3.1.1", "strength": "partial"}]'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.curriculum_outcome_revisions (outcome_id, edit_version, action, snapshot)
SELECT o.id, 1, 'create', jsonb_build_object(
  'id', o.id, 'subjectPackId', o.subject_pack_id, 'code', o.code, 'titleUk', o.title_uk,
  'titleEn', o.title_en, 'source', o.source, 'sourceRef', o.source_ref, 'gradeBand', o.grade_band,
  'mappings', o.mappings, 'status', o.status)
FROM public.curriculum_outcomes o
WHERE o.id IN ('int-devices-io-distinguish', 'int-devices-io-new-device', 'int-devices-choose-for-task')
  AND o.edit_version = 1
ON CONFLICT (outcome_id, edit_version) DO NOTHING;

-- The two file outcomes from 0057. INF-2-FILES-1 (file name vs extension) has
-- no Stage 1-2 counterpart; its closest objective is Stage 3, hence 'partial'.
WITH mapped (id, mappings) AS (
  VALUES
    ('int-files-name-extension',
     '[{"framework": "cambridge-0059", "ref": "3CS.04", "strength": "partial"}]'::jsonb),
    ('int-files-organize',
     '[{"framework": "cambridge-0072", "ref": "2TC.10", "strength": "direct"},
       {"framework": "cambridge-0072", "ref": "1TC.09", "strength": "supporting"},
       {"framework": "nush-ifo-2018", "ref": "2 ІФО 3.3.1", "strength": "supporting"}]'::jsonb)
),
updated AS (
  UPDATE public.curriculum_outcomes o
  SET mappings = mapped.mappings,
      edit_version = o.edit_version + 1,
      updated_at = now()
  FROM mapped
  WHERE o.id = mapped.id
    AND o.mappings = '[]'::jsonb
  RETURNING o.*
)
INSERT INTO public.curriculum_outcome_revisions (outcome_id, edit_version, action, snapshot)
SELECT u.id, u.edit_version, 'update', jsonb_build_object(
  'id', u.id, 'subjectPackId', u.subject_pack_id, 'code', u.code, 'titleUk', u.title_uk,
  'titleEn', u.title_en, 'source', u.source, 'sourceRef', u.source_ref, 'gradeBand', u.grade_band,
  'mappings', u.mappings, 'status', u.status)
FROM updated u
ON CONFLICT (outcome_id, edit_version) DO NOTHING;
