> **Superseded:** esta mudança não deve ser aplicada. Seus requisitos de
> cadastro, regime tributário e ciclo de atendimento foram incorporados a
> `add-office-hierarchy` como a capability `company`, com isolamento por Office.

## Why

O escritório de contabilidade (Tenant) não tem hoje nenhuma forma de cadastrar as
empresas/pessoas que atende. Todos os módulos operacionais futuros (Contabilidade,
Fiscal, DP, Societário) dependem de um Cliente existir como referência. A spec de
domínio já foi discutida e aprovada em `docs/specs/cliente.md` (2026-08-04); este
change formaliza essa spec no método OpenSpec e é o ponto de partida da primeira
implementação — hoje não existe nenhum código para este contexto.

## What Changes

- Cadastro de Cliente por CNPJ ou CPF, com razão social e regime tributário
  inicial, dentro do Tenant autenticado.
- Histórico de Período de Regime Tributário — troca de regime nunca reescreve o
  histórico, apenas encerra o período vigente e abre um novo.
- Ciclo de vida de atendimento com 3 estados (`Ativo`, `EncerramentoPendente`,
  `Encerrado`): Owner encerra diretamente; Atendente só pode solicitar, mediante
  aprovação do Owner; Owner pode reativar um Cliente `Encerrado` sem perder
  histórico.
- Unicidade da identificação fiscal (CNPJ/CPF) por Tenant, válida mesmo para
  Clientes `Encerrado` (nunca reaproveitável por um cadastro novo — a ação correta
  é reativar).

## Capabilities

### New Capabilities
- `cliente`: cadastro, histórico de regime tributário e ciclo de vida de
  atendimento (ativo / encerramento pendente / encerrado / reativação) de um
  Cliente dentro de um Tenant.

### Modified Capabilities
- (nenhuma — não há sobreposição de requisitos com a capability `tenant`; Cliente
  só referencia `tenantId`)

## Impact

- `packages/backend/prisma/schema.prisma`: novos modelos `Cliente` e
  `PeriodoRegime`, novos enums de estado e regime tributário, nova migration com
  RLS análogo ao de `User` (isolamento por `tenantId`, sem isolamento adicional
  por Cliente — ver design.md).
- `packages/backend/src`: novo `clienteController.ts`, `routes/cliente.ts`,
  validação local de CPF/CNPJ (dígito verificador) — sem chamada à Receita
  Federal, ao contrário do CNPJ do Tenant.
- `packages/frontend`: nova tela de listagem de Clientes + modal de
  cadastro/edição, usando os componentes já existentes em `design-system/`
  (`Table`, `Modal`, `Badge` para o estado).
- Nenhum evento de domínio será efetivamente emitido/consumido nesta primeira
  fatia (Contabilidade, Motor de Regras Tributárias e notificações não existem
  ainda) — ver design.md para a decisão de adiar isso.
