-- Migration 0060: normative NUSH informatics codes (docs/lesson-engine/README.md,
-- "Framework catalogue").
--
-- The catalogue (0059) took its NUSH entries from the MON portal
-- «Інтерактивний поступ», which prints codes with an extra level
-- (2 ІФО 1.1.1). The State Standard of Primary Education (Cabinet of
-- Ministers resolution No 87 of 21.02.2018, appendix 7, edition in force)
-- codes the same results as [2 ІФО 1.1] and groups them under four general
-- results. The wording of all 30 results matches the standard.
--
-- 1. Catalogue: the code becomes the normative one, the portal code is kept
--    as an alias (still searchable), the group is the standard's general
--    result and the source names the standard.
-- 2. Skills: every nush-ifo-2018 mapping that uses a portal code is
--    rewritten to the normative code, with a revision, like the admin API.
--    Evidence is untouched: it refers to skills, not to catalogue codes.
--
-- Idempotent: both steps only touch codes still in the portal form.

-- The check rides on ADD COLUMN IF NOT EXISTS, so a re-run skips both.
ALTER TABLE public.curriculum_framework_refs
  ADD COLUMN IF NOT EXISTS aliases jsonb NOT NULL DEFAULT '[]'::jsonb
    CONSTRAINT curriculum_framework_refs_aliases_check CHECK (jsonb_typeof(aliases) = 'array');

UPDATE public.curriculum_framework_refs r
SET code = regexp_replace(r.code, '^([24] ІФО [0-9]\.[0-9])\.1$', '\1'),
    aliases = jsonb_build_array(r.code),
    group_code = 'ІФО ' || substring(r.code from '^[24] ІФО ([0-9])\.'),
    group_title = CASE substring(r.code from '^[24] ІФО ([0-9])\.')
      WHEN '1' THEN 'Пошук, подання, перетворення, аналіз, узагальнення та систематизація даних, критичне оцінювання інформації для розв’язання життєвих проблем'
      WHEN '2' THEN 'Створення інформаційних продуктів та програм для ефективного розв’язання задач/проблем, творчого самовираження індивідуально та у співпраці, за допомогою цифрових пристроїв та без них'
      WHEN '3' THEN 'Усвідомлене використання інформаційних і комунікаційних технологій та цифрових пристроїв для доступу до інформації, спілкування та співпраці, самостійного опанування новими уміннями'
      WHEN '4' THEN 'Усвідомлення наслідків використання інформаційних технологій для себе, суспільства, навколишнього світу та сталого розвитку, дотримання етичних, міжкультурних та правових норм інформаційної взаємодії'
    END,
    source = 'Державний стандарт початкової освіти (постанова КМУ № 87 від 21.02.2018), додаток 7, цикл '
      || replace(r.level, '-', '–') || ' класи. Приклади завдань: МОН, «Інтерактивний поступ»'
WHERE r.framework = 'nush-ifo-2018'
  AND r.code ~ '^[24] ІФО [0-9]\.[0-9]\.1$';

WITH changed AS (
  SELECT o.id, (
    SELECT jsonb_agg(
      CASE WHEN m.value->>'framework' = 'nush-ifo-2018' AND m.value->>'ref' ~ '^[24] ІФО [0-9]\.[0-9]\.1$'
        THEN jsonb_set(m.value, '{ref}', to_jsonb(regexp_replace(m.value->>'ref', '^([24] ІФО [0-9]\.[0-9])\.1$', '\1')))
        ELSE m.value
      END ORDER BY m.ordinality)
    FROM jsonb_array_elements(o.mappings) WITH ORDINALITY AS m(value, ordinality)
  ) AS mappings
  FROM public.curriculum_outcomes o
  WHERE EXISTS (
    SELECT 1 FROM jsonb_array_elements(o.mappings) AS m(value)
    WHERE m.value->>'framework' = 'nush-ifo-2018' AND m.value->>'ref' ~ '^[24] ІФО [0-9]\.[0-9]\.1$'
  )
),
updated AS (
  UPDATE public.curriculum_outcomes o
  SET mappings = changed.mappings,
      edit_version = o.edit_version + 1,
      updated_at = now()
  FROM changed
  WHERE o.id = changed.id
  RETURNING o.*
)
INSERT INTO public.curriculum_outcome_revisions (outcome_id, edit_version, action, snapshot)
SELECT u.id, u.edit_version, 'update', jsonb_build_object(
  'id', u.id, 'subjectPackId', u.subject_pack_id, 'code', u.code, 'titleUk', u.title_uk,
  'titleEn', u.title_en, 'source', u.source, 'sourceRef', u.source_ref, 'gradeBand', u.grade_band,
  'mappings', u.mappings, 'status', u.status)
FROM updated u
ON CONFLICT (outcome_id, edit_version) DO NOTHING;
