ALTER TABLE payroll_events
  ADD COLUMN signed_xml TEXT,
  ADD COLUMN submission_key TEXT,
  ADD CONSTRAINT payroll_events_signed_queue CHECK (
    (signed_xml IS NULL AND submission_key IS NULL)
    OR (origin = 'integrated' AND signed_xml IS NOT NULL AND submission_key IS NOT NULL)
  );

CREATE UNIQUE INDEX payroll_events_employer_id_environment_submission_key_key
  ON payroll_events (employer_id, environment, submission_key);

COMMENT ON COLUMN payroll_events.signed_xml IS 'XML assinado e validado localmente que deve ser preservado para conciliar o evento da fila.';
COMMENT ON COLUMN payroll_events.submission_key IS 'Chave do documento e da versão de origem, usada para impedir duplicação na preparação de envios.';
