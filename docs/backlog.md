# Backlog Prioritário — Pendências do projeto

Resumo: backlog priorizado por ordem de impacto e risco para entregar um MVP contábil/fiscal seguro e multitenant.

## Notação
- Prioridade: P0 (crítico), P1 (importante), P2 (planejado)
- Estimativa: sprints (2 semanas) / pontos

---

## P0 — Mais críticos (entregar primeiro)

1) Audit Trail Imutável (AuditLog)
- Estimativa: 1–2 sprints
- Acceptance criteria: gravação append-only por tenant; consulta por tenant/intervalo; hashes para detectar adulteração; logs imutáveis por design (DB + periodic notarização opcional).
- MVP tasks:
  - schema: `AuditLog(id, tenantId, userId, agentType, eventType, resource, resourceId, payload JSONB, createdAt, prevHash, hash)`
  - middleware para emitir eventos em actions críticas (auth, onboarding, invite, billing, lançamentos fiscais/contábeis)
  - endpoint interno de leitura `GET /internal/audit` (autenticado admin)
- Arquivos/locais: backend `packages/backend/src/` (`middlewares/`, `controllers/`, nova `services/audit.ts`), prisma migration
- Riscos: performance — use índices por tenantId + createdAt

2) Single Source of Truth (Event-driven sync Fiscal↔Contábil)
- Estimativa: 2–4 sprints
- Acceptance criteria: um documento fiscal cria um evento canônico; consumidor cria lançamento contábil idempotente; reconciliador detecta divergências.
- MVP tasks:
  - definir eventos `fiscal.document.created/updated` com payload padronizado
  - fila/worker (BullMQ/Redis) para processamento e dedupe por `externalId`
  - esquema `FiscalDocument` e `AccountingEntry` com campo `sourceId`
- Arquivos/locais: backend `workers/`, `prisma schema`, routes para ingestão fiscal

3) Motor básico de Regras Tributárias (core engine)
- Estimativa: 3–5 sprints
- Acceptance criteria: regras parametrizáveis por regime; API para avaliar impostos num documento; testes demonstrando cálculos para casos simples.
- MVP tasks:
  - modelar `TaxRule`, `RuleVersion`, `TaxAccumulator`
  - engine de execução (ex.: funções JS segura + sandbox ou expressão JSON)
  - UI/admin para CRUD de regras (opcional inicial: arquivo config)
- Locais: `packages/backend/src/services/rules/`, DB

4) Módulo Fiscal (ingestão de notas e SPED básico)
- Estimativa: 4–8 sprints
- Acceptance criteria: registrar NF-e/NFC-e, validar XML, armazenar XML, gerar arquivo SPED Fiscal mínimo para um período.
- MVP tasks:
  - endpoints para upload/import XML/JSON
  - parser/validador de NFe (XML -> canonical JSON)
  - job para gerar SPED export (.txt ou .zip) para um tenant
- Locais: `packages/backend/src/controllers/fiscal`, workers

5) Fila de Aprovação (Human-in-the-Loop)
- Estimativa: 1–2 sprints
- Acceptance criteria: tarefas atribuíveis, UI de revisão, aceitação/rejeição que geram audit log.
- MVP tasks: model `ApprovalTask`, UI page, endpoints para listar, aceitar, reprovar

6) Integração SEFAZ / órgão (infra mínima)
- Estimativa: 4–8 sprints (por integração/UF)
- Acceptance criteria: consulta status NF-e via protocolo; armazenamento de retorno; segurança de certificados.
- Observação: requer certificação digital e testes em homologação.

7) Plano de Contas e Lançamentos Contábeis
- Estimativa: 2–4 sprints
- Acceptance: criar/editar plano de contas por tenant; gerar balancetes básicos a partir de lançamentos.
- MVP tasks: models `Account`, `AccountingEntry`, relatórios simples

---

## P1 — Importantes (seguem após P0)

1) OCR e Pipeline de Extração (Assistente Júnior)
- Estimativa: 2–4 sprints
- Tasks: integração com Tesseract ou Cloud Vision, normalização, criação de `DocumentExtraction` e fila de revisão.

2) Integração LLM e infra de embeddings
- Estimativa: 2–4 sprints (PoC)
- Tasks: escolher provedor (OpenAI/Providers), infra de vetores (pgvector/Pinecone), policy de dados e redaction, endpoints para QA.

3) Módulo Contábil avançado (DRE, Balanço)
- Estimativa: 3–6 sprints
- Tasks: geração de DRE/Balanço, ajustes por plano de contas, relatórios exportáveis

4) Pagamentos e conciliações (além do Stripe já existente)
- Estimativa: 2–4 sprints por gateway
- Tasks: webhook handlers, conciliação automática, geração de cobranças

5) Observabilidade e Monitoramento
- Estimativa: 1–2 sprints
- Tasks: logs estruturados, métricas (Prometheus), alertas básicos

6) LGPD / Data Subject Requests
- Estimativa: 1–2 sprints
- Tasks: export/forget por tenant/usuario, consent logging

---

## P2 — Planejados/Extras
- Conectores ERPs (Omie, Bling, Conta Azul) — 2–4 sprints cada
- Open Finance — 3–6 sprints
- Módulo DP completo (folha) — 4–8 sprints
- Agentes IA vendidos separadamente — roadmap e pricing
- Backup/DR formalização e testes — 1–2 sprints

---

## Como dividir em Issues (sugestão)
- Criar epic por P0 item (Audit Trail, SST, Motor Regras, Fiscal) e subtasks: schema, migration, service, middleware, endpoints, testes, docs. Ex.: `epic/audit-trail` → `issue/audit-schema`, `issue/audit-middleware`, `issue/audit-api`, `issue/audit-tests`.

## Próximos passos sugeridos
1. Aprovar prioridades P0/P1.  
2. Criar epics e issues no tracker (GitHub) com links e estimativas.  
3. Implementar o Audit Trail (primeira entrega).  

---

Arquivo gerado automaticamente por revisão de código local.
