ALTER TABLE payroll_guides ADD COLUMN expected_amount NUMERIC(14, 2);
ALTER TABLE payroll_guides ADD COLUMN payment_reference TEXT;
ALTER TABLE payroll_documents ADD COLUMN content BYTEA;
ALTER TABLE payroll_documents ADD CONSTRAINT payroll_documents_inline_size
  CHECK (content IS NULL OR octet_length(content) BETWEEN 5 AND 5242880);
CREATE UNIQUE INDEX payroll_guides_official_identity ON payroll_guides (period_id, kind, official_reference)
  WHERE official_reference IS NOT NULL;

COMMENT ON COLUMN payroll_guides.expected_amount IS 'Valor de referência informado pelo escritório para comparar a guia oficial com a apuração e registrar divergências na competência.';
COMMENT ON COLUMN payroll_guides.payment_reference IS 'Referência à evidência de quitação informada pelo escritório, preservada separadamente do identificador de emissão da guia oficial.';
COMMENT ON COLUMN payroll_documents.content IS 'Conteúdo binário reservado a documentos oficiais anexados pela aplicação, armazenado na mesma transação e protegido pelas permissões da folha.';
