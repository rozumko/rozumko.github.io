-- Migration 0030: parent-created child profiles.
--
-- Профіль дитини тепер може створюватися батьківським акаунтом без demo-ліда,
-- тож lead_id стає nullable. Fail-closed інваріант: у профілю ЗАВЖДИ є хоча б
-- один власник — demo-лід або батьківський акаунт (CHECK нижче). Наявні рядки
-- не змінюються (у всіх lead_id заповнений — provenance зберігається).

ALTER TABLE public.home_child_profiles
  ALTER COLUMN lead_id DROP NOT NULL;

ALTER TABLE public.home_child_profiles
  ADD CONSTRAINT home_child_profiles_owner_ck
  CHECK (lead_id IS NOT NULL OR parent_account_id IS NOT NULL);
