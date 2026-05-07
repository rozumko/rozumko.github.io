ALTER TABLE access_codes
  ADD COLUMN registration_id uuid;

ALTER TABLE access_codes
  ADD CONSTRAINT access_codes_registration_id_event_registrations_id_fk
  FOREIGN KEY (registration_id)
  REFERENCES event_registrations(id)
  ON DELETE NO ACTION
  ON UPDATE NO ACTION;
