## Context

Ver `proposal.md` para a motivação. O backend hoje (`packages/backend/src`) não
tem nenhuma camada de domínio — todos os controllers (`auth`, `onboarding`,
`invite`) fazem SQL cru direto via `db.query`, sem repositório, sem entidades. O
isolamento multitenant é garantido em 3 camadas: JWT → `tenantMiddleware`
(`set_config('app.current_tenant', ...)`, parametrizado, nunca interpolação) →
RLS no PostgreSQL. `docs/specs/cliente.md` descreve o contexto Cliente em
vocabulário DDD completo (agregado, Value Objects, contrato de repositório),
mais rico que o padrão do código atual.

## Goals / Non-Goals

**Goals:**
- Primeira implementação do contexto Cliente, alinhada à spec aprovada.
- Isolar a única invariante genuinamente frágil em SQL puro (histórico de
  PeríodoDeRegime: exatamente um vigente, sem sobreposição/lacuna) num módulo
  testável sem banco.
- Fechar, de passagem, o gap de migration já conhecido (`slug` do Tenant nunca
  virou migration rastreada).

**Non-Goals:**
- Não introduzir uma camada de domínio completa (entidades + repositórios) no
  projeto — fica para uma decisão futura, se e quando mais contextos precisarem
  do mesmo padrão.
- Não implementar emissão de domain events nem outbox nesta fatia.
- Não implementar controle de acesso por departamento (fora de escopo da spec,
  INV-04/seção 7).

## Decisions

### Nível de estrutura: híbrido
O `clienteController.ts` segue o padrão atual (SQL cru via `db.query`,
consistente com `invite`/`onboarding`/`auth`) para cadastro, consulta e
transições de estado. A única exceção é a lógica de troca de regime tributário:
um módulo `src/domain/periodoRegime.ts` (função pura, sem I/O) recebe o período
vigente atual + a nova troca solicitada e devolve as duas operações a persistir
(fechar o vigente, abrir o novo), validando que a nova data de início é posterior
ao início do período vigente. O controller chama essa função e persiste o
resultado numa transação. Alternativa considerada e descartada: repositório +
entidade completos (mais fiel à spec, mas introduz um padrão sem precedente no
projeto sem um segundo contexto pra validar que vale a pena generalizar agora).

### Fluxo de encerramento: campos na própria linha `Cliente`
`Cliente` ganha `solicitanteId`, `dataSolicitacao`, `aprovadorId`, `dataDecisao`
(todos opcionais). Como só existe uma solicitação ativa por vez — o próprio
estado `EncerramentoPendente` garante isso — não há necessidade de uma tabela de
histórico de solicitações. Alternativa considerada: tabela
`SolicitacaoEncerramento` separada, guardando toda solicitação (inclusive
rejeitadas); descartada por ser histórico que ninguém consome hoje — quando o
Audit Trail (P0 do backlog) existir, ele é o lugar certo para esse histórico
genérico, não uma tabela ad-hoc por contexto.

### Domain events: não emitir nesta fatia
Os 6 eventos da spec (`ClienteCadastrado`, `RegimeTributárioAlterado`,
`EncerramentoSolicitado`, `ClienteEncerrado`,
`SolicitacaoDeEncerramentoRejeitada`, `ClienteReativado`) ficam documentados
em `specs/cliente/spec.md` como comportamento observável (via API), mas nenhuma
infraestrutura de emissão/outbox é criada agora — não há nenhum consumidor real
(Contabilidade, Motor de Regras Tributárias) pra validar contra. Quando o
primeiro consumidor existir, ele dita o mecanismo (outbox transacional, event
emitter in-process, fila) — decisão adiada de propósito.

### Migration: `prisma migrate dev` real, aproveitando pra fechar o gap do `slug`
Diferente do padrão manual (`CREATE TABLE` como `postgres` no Supabase +
`prisma migrate resolve --applied`) usado até aqui, esta migration é gerada e
versionada normalmente via `npx prisma migrate dev --name add_cliente`. De
quebra, a mesma sessão de migration resolve a dívida já registrada em
`cerebro-do-projeto.md`: a coluna `slug` de `Tenant` (e a policy `tenant_select`
com a cláusula `slug IS NOT NULL`) nunca virou migration rastreada — vai junto
nesta migration (ou numa `0003` imediatamente anterior, gerada primeiro via
`prisma migrate dev` a partir do schema já vigente em produção, sem alterar
nada, só pra registrar o estado real antes de somar `Cliente` em cima).

### Modelo de dados

```prisma
enum ClienteStatus {
  Ativo
  EncerramentoPendente
  Encerrado
}

enum RegimeTributario {
  MEI
  SimplesNacional
  LucroPresumido
  LucroReal
}

enum TipoIdentificacaoFiscal {
  CNPJ
  CPF
}

model Cliente {
  id                     String        @id @default(uuid())
  tenantId               String
  tipoIdentificacao      TipoIdentificacaoFiscal
  identificacaoFiscal    String
  razaoSocial            String
  status                 ClienteStatus @default(Ativo)
  solicitanteId          String?
  dataSolicitacao        DateTime?
  aprovadorId            String?
  dataDecisao            DateTime?
  createdAt              DateTime      @default(now())

  tenant                 Tenant        @relation(fields: [tenantId], references: [id])
  periodosRegime         PeriodoRegime[]

  @@unique([tenantId, tipoIdentificacao, identificacaoFiscal])
}

model PeriodoRegime {
  id          String            @id @default(uuid())
  clienteId   String
  regime      RegimeTributario
  inicio      DateTime
  fim         DateTime?

  cliente     Cliente           @relation(fields: [clienteId], references: [id])
}
```

RLS de `Cliente` e `PeriodoRegime` segue exatamente o padrão de `User`
(`tenantId = current_setting('app.current_tenant', true)::TEXT` — via join em
`PeriodoRegime`, ou desnormalizando `tenantId` na própria tabela se o join em
policy se mostrar custoso). Nenhum isolamento adicional por Cliente — INV-04
exige que qualquer usuário do Tenant enxergue todos os Clientes.

## Risks / Trade-offs

- [O padrão híbrido cria uma pequena inconsistência: só um módulo do projeto
  isola lógica em função pura] → Mitigação: comentário no arquivo explicando o
  porquê, e usar o mesmo padrão se/quando outro contexto (Contabilidade) tiver
  uma invariante temporal parecida.
- [Sem outbox, se um evento for necessário retroativamente quando a Contabilidade
  nascer, os `ClienteCadastrado` já emitidos não terão sido capturados] →
  Mitigação aceita conscientemente: a tabela `Cliente` já tem `createdAt`, então
  um backfill (provisionar plano de contas pra Clientes existentes) é possível
  na hora, sem depender de eventos históricos.
- [RLS via join em `PeriodoRegime` pode ser mais lento que uma coluna
  `tenantId` direta] → Mitigação: desnormalizar `tenantId` em `PeriodoRegime`
  se o `EXPLAIN` mostrar necessidade; decisão de performance, não de
  modelagem, adiada pra quando houver dado real pra medir.

## Migration Plan

1. Gerar uma migration `0003_tenant_slug_baseline` (sem alterar schema, só
   documentando o estado real já em produção — resolve o gap do `cerebro`).
2. Gerar `0004_add_cliente` com as tabelas/enums acima + RLS, via
   `prisma migrate dev`.
3. Aplicar em `dev` local primeiro, depois `prd` via `prisma migrate deploy`
   (mesmo fluxo hands-on documentado em `cerebro-do-projeto.md` — o Jorge roda
   os comandos no servidor).
4. Sem rollback automatizado: se algo falhar em produção, reverter via
   `git revert` do commit da migration + `prisma migrate resolve --rolled-back`
   manual, seguindo o mesmo processo já usado no deploy do servidor novo.
