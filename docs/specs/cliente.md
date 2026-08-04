# Spec de domínio: Cliente

Status: aprovado
Última atualização: 2026-08-04

## 1. Bounded context

Cadastrar e manter as empresas/pessoas atendidas pelo escritório de contabilidade
(Tenant), servindo de referência para todos os módulos operacionais do sistema.

**Propósito:** Representar, dentro de um Tenant (escritório de contabilidade), cada
empresa ou pessoa cuja contabilidade/fiscal/DP o escritório gerencia.

**Relação com outros contextos:**

| Contexto | Relação | Observação |
|---|---|---|
| Tenant | upstream | Um Cliente sempre pertence a exatamente um Tenant. Tenant já resolve autenticação e isolamento multitenant do escritório; este contexto adiciona um segundo nível de isolamento (por Cliente) dentro do Tenant. |
| Auth / Convites de Atendente | parceiro | Atendentes e Owner (definidos no contexto de Auth) acessam Clientes conforme papel, mas este contexto não modela autenticação nem convites. |
| Contabilidade, Fiscal, DP, Societário | downstream | Todos referenciam um Cliente pelo seu `id` como dono dos dados operacionais (lançamentos, notas, funcionários, obrigações). Nenhum desses módulos é modelado aqui. |
| Tenant / Billing | parceiro | Mudança de plano de cobrança e configurações administrativas do Tenant pertencem a esse contexto, não a Cliente. |

## 2. Linguagem ubíqua

| Termo | Definição |
|---|---|
| Tenant | Escritório de contabilidade que contrata o sistema e paga a assinatura. |
| Cliente | Empresa ou pessoa (identificada por CNPJ ou CPF) atendida pelo escritório, cuja contabilidade é gerenciada dentro do sistema. |
| Identificação Fiscal | CNPJ ou CPF que identifica um Cliente (ou um Tenant) unicamente perante o Fisco. |
| Regime Tributário | Classificação fiscal do Cliente (MEI, Simples Nacional, Lucro Presumido, Lucro Real) que determina como os impostos são apurados. |
| Período de Regime | Intervalo de tempo em que um determinado Regime Tributário vigorou para um Cliente. |
| Atendente | Usuário do escritório com acesso operacional aos Clientes do Tenant, exceto áreas administrativas do próprio Tenant. |
| Owner | Usuário do escritório com acesso total, incluindo administração do Tenant. |

## 3. Casos de uso

### UC-01: Cadastrar um novo Cliente

Como Atendente ou Owner, quero cadastrar um novo Cliente no escritório, para começar a
gerenciar a contabilidade dele no sistema.

**Critérios de aceite:**

```gherkin
Cenário: Cadastro bem-sucedido de Cliente com CNPJ
  Dado que estou autenticado como usuário do Tenant "Contabilidade Silva"
  Quando eu cadastro um Cliente com CNPJ "12.345.678/0001-90", razão social
    "Padaria do João Ltda" e regime tributário "Simples Nacional"
  Então um novo Cliente é criado vinculado ao Tenant "Contabilidade Silva"
  E o Cliente aparece na lista de clientes do escritório

Cenário: Cadastro de Cliente por CPF (MEI ou autônomo)
  Dado que estou autenticado como usuário do Tenant
  Quando eu cadastro um Cliente usando CPF "123.456.789-00" em vez de CNPJ
  Então o Cliente é criado normalmente, identificado pelo CPF

Cenário: Tentativa de cadastrar Cliente com identificação fiscal já existente no Tenant
  Dado que já existe um Cliente com CNPJ "12.345.678/0001-90" neste Tenant
  Quando eu tento cadastrar outro Cliente com o mesmo CNPJ no mesmo Tenant
  Então o cadastro é rejeitado com um erro de duplicidade
```

### UC-02: Registrar mudança de regime tributário de um Cliente

Como Atendente ou Owner, quero registrar uma mudança de regime tributário de um
Cliente, para refletir uma mudança real de enquadramento fiscal (ex: crescimento que
tira o Cliente do Simples Nacional).

**Critérios de aceite:**

```gherkin
Cenário: Mudança de regime tributário
  Dado que o Cliente "Padaria do João Ltda" está no regime "Simples Nacional" desde
    01/01/2024
  Quando eu registro a mudança para "Lucro Presumido" a partir de 01/01/2026
  Então o histórico de regimes do Cliente passa a ter dois períodos: Simples Nacional
    (até 31/12/2025) e Lucro Presumido (a partir de 01/01/2026, vigente)
```

### UC-03: Owner encerra o atendimento de um Cliente diretamente

Como Owner, quero encerrar o atendimento de um Cliente diretamente, sem depender de
aprovação de mais ninguém, para que ele deixe de aparecer na lista principal do
escritório sem perder o histórico já registrado.

**Critérios de aceite:**

```gherkin
Cenário: Encerramento direto pelo Owner
  Dado que o Cliente "Padaria do João Ltda" está `Ativo`
  E eu estou autenticado como Owner do Tenant
  Quando eu encerro o atendimento desse Cliente
  Então o Cliente passa direto para o estado `Encerrado`
  E o Cliente deixa de aparecer na listagem padrão de clientes do escritório
  E todos os dados e o histórico do Cliente continuam acessíveis por consulta direta
```

### UC-04: Atendente solicita encerramento, Owner aprova ou rejeita

Como Atendente, quero solicitar o encerramento de um Cliente, para sinalizar ao Owner
que esse atendimento deveria acabar, sem ter autoridade para decidir isso sozinho.

Como Owner, quero aprovar ou rejeitar uma solicitação de encerramento, para manter o
controle final sobre quais Clientes o escritório deixa de atender.

**Critérios de aceite:**

```gherkin
Cenário: Atendente solicita encerramento
  Dado que o Cliente "Padaria do João Ltda" está `Ativo`
  E eu estou autenticado como Atendente
  Quando eu solicito o encerramento desse Cliente
  Então o Cliente passa para o estado `EncerramentoPendente`
  E o Cliente continua aparecendo normalmente na listagem do escritório, sinalizado
    como pendente de aprovação
  E todos os módulos operacionais continuam funcionando normalmente para esse
    Cliente enquanto a solicitação está pendente

Cenário: Owner aprova a solicitação
  Dado que o Cliente "Padaria do João Ltda" está `EncerramentoPendente`
  Quando o Owner aprova a solicitação de encerramento
  Então o Cliente passa para o estado `Encerrado`
  E o Cliente deixa de aparecer na listagem padrão do escritório

Cenário: Owner rejeita a solicitação
  Dado que o Cliente "Padaria do João Ltda" está `EncerramentoPendente`
  Quando o Owner rejeita a solicitação de encerramento
  Então o Cliente volta para o estado `Ativo`

Cenário: Atendente tenta aprovar sua própria solicitação
  Dado que o Cliente "Padaria do João Ltda" está `EncerramentoPendente`
  Quando um Atendente (não Owner) tenta aprovar ou rejeitar essa solicitação
  Então a ação é rejeitada — só o Owner pode decidir
```

### UC-05: Owner reativa um Cliente encerrado

Como Owner, quero reativar um Cliente encerrado, para retomar o atendimento sem
perder o histórico já registrado nem precisar recadastrá-lo do zero.

**Critérios de aceite:**

```gherkin
Cenário: Reativação bem-sucedida
  Dado que o Cliente "Padaria do João Ltda" está `Encerrado`
  E eu estou autenticado como Owner do Tenant
  Quando eu reativo esse Cliente
  Então o Cliente passa para o estado `Ativo`
  E volta a aparecer na listagem padrão de clientes do escritório
  E todo o histórico anterior (períodos de regime, etc.) permanece intacto

Cenário: Atendente tenta reativar
  Dado que o Cliente "Padaria do João Ltda" está `Encerrado`
  E eu estou autenticado como Atendente
  Quando eu tento reativar esse Cliente
  Então a ação é rejeitada — só o Owner pode reativar

Cenário: Tentativa de cadastrar novo Cliente com identificação fiscal de um Cliente Encerrado
  Dado que existe um Cliente `Encerrado` com CNPJ "12.345.678/0001-90" neste Tenant
  Quando alguém tenta cadastrar um novo Cliente com o mesmo CNPJ (UC-01)
  Então o cadastro é rejeitado com erro de duplicidade, do mesmo jeito que para um
    Cliente `Ativo` — a ação correta é reativar o Cliente existente, não criar um novo
```

## 4. Modelo de domínio

### Entidades

- **Cliente** — identidade: `id` (gerado no cadastro). Estados possíveis: `Ativo` |
  `EncerramentoPendente` | `Encerrado`. Transições: `Ativo → EncerramentoPendente`
  (solicitação de Atendente), `Ativo → Encerrado` (encerramento direto do Owner),
  `EncerramentoPendente → Encerrado` (aprovação do Owner),
  `EncerramentoPendente → Ativo` (rejeição do Owner), `Encerrado → Ativo`
  (reativação pelo Owner — ver UC-05). `Encerrado` não é mais terminal: um Cliente
  reativado retoma o histórico anterior (períodos de regime, etc.) intacto.

### Value Objects

- **IdentificaçãoFiscal** — composto por: tipo (`CNPJ` | `CPF`) + número. Válida
  apenas se o número satisfizer o algoritmo de dígito verificador correspondente ao
  tipo. Imutável, igualdade por valor.
- **RazãoSocial** — nome legal do Cliente (razão social se CNPJ, nome civil se CPF).
- **RegimeTributário** — um de: `MEI` | `Simples Nacional` | `Lucro Presumido` |
  `Lucro Real`.
- **PeríodoDeRegime** — composto por: RegimeTributário, data de início, data de fim
  (nula quando é o período vigente). Imutável uma vez encerrado.

### Agregados

- **Cliente** (raiz: Cliente)
  - Protege: unicidade da IdentificaçãoFiscal dentro do mesmo Tenant; existência de
    exatamente um PeríodoDeRegime vigente a cada instante, sem sobreposição nem
    lacuna no histórico.
  - Contém: IdentificaçãoFiscal, RazãoSocial, histórico de PeríodoDeRegime.
  - Referenciado externamente só por: `id` do Cliente.

### Repositórios (contrato, não implementação)

- **ClienteRepository**
  - `existePorIdentificacaoFiscal(tenantId, identificacao): boolean` — verifica
    duplicidade dentro do Tenant.
  - `salvar(cliente): void` — persiste um Cliente novo ou atualizado.
  - `buscarPorId(id): Cliente | undefined`
  - `listarPorTenant(tenantId): Cliente[]` — retorna só Clientes `Ativo` por padrão
    (ver INV-06).
  - `listarPorTenantIncluindoEncerrados(tenantId): Cliente[]` — para telas/relatórios
    que precisam enxergar o histórico completo.
  - `listarComEncerramentoPendente(tenantId): Cliente[]` — fila de solicitações
    aguardando decisão do Owner.

## 5. Invariantes e regras de negócio

- INV-01: A IdentificaçãoFiscal de um Cliente é única dentro do mesmo Tenant,
  independente do seu estado (`Ativo`, `EncerramentoPendente` ou `Encerrado` — um
  Cliente `Encerrado` continua contando pra essa unicidade, já que nunca é removido).
  Pode se repetir entre Tenants diferentes (dois escritórios podem atender, cada um,
  um cliente com o mesmo CNPJ, sem conflito entre si).
- INV-02: Um Cliente sempre pertence a exatamente um Tenant, definido no cadastro e
  imutável depois — transferência de Cliente entre Tenants está fora de escopo.
- INV-03: Um Cliente sempre tem pelo menos um PeríodoDeRegime, e em qualquer instante
  de tempo há exatamente um regime vigente.
- INV-04: Qualquer usuário autenticado do Tenant — Owner ou Atendente, de qualquer
  departamento — pode consultar o cadastro de todos os Clientes do Tenant. O
  departamento do Atendente (Pessoal, Fiscal, Contábil, Societário) restringe quais
  *módulos operacionais* ele acessa dentro de um Cliente, não quais Clientes ele
  enxerga — essa restrição pertence ao contexto de Auth/Autorização, não a este.
- INV-05: A troca de regime tributário nunca reescreve o histórico — encerra o
  período vigente e abre um novo, preservando qual regime valia em cada data (
  necessário para apuração retroativa de impostos).
- INV-06: Um Cliente `Encerrado` nunca é removido fisicamente — permanece na base
  para consulta histórica, mas fica excluído da listagem padrão de clientes do
  escritório.
- INV-07: Um Atendente pode solicitar o encerramento de um Cliente, mas essa
  solicitação só se efetiva mediante aprovação do Owner. O Owner pode encerrar um
  Cliente diretamente, sem passar pelo fluxo de solicitação/aprovação — ele já é a
  própria autoridade de decisão.
- INV-08: Um Cliente em `EncerramentoPendente` continua totalmente operacional —
  aparece na listagem do escritório (sinalizado) e todos os módulos seguem
  funcionando normalmente até a solicitação ser aprovada ou rejeitada.
- INV-09: Somente o Owner pode aprovar ou rejeitar uma solicitação de encerramento;
  um Atendente não pode decidir sobre a própria solicitação nem sobre a de outro
  Atendente.
- INV-10: Somente o Owner pode reativar um Cliente `Encerrado`. A reativação preserva
  integralmente o histórico anterior do Cliente (períodos de regime, etc.) — não é um
  recadastro.
- INV-11: Não há prazo de retenção definido para os dados de um Cliente `Encerrado`
  nesta versão — INV-06 garante que não são apagados, mas por quanto tempo fica em
  aberto para um futuro contexto de Compliance/LGPD (backlog P1).

## 6. Eventos de domínio

| Evento | Quando ocorre | Payload mínimo | Possíveis consumidores |
|---|---|---|---|
| ClienteCadastrado | Cliente criado com sucesso | clienteId, tenantId, identificaçãoFiscal, regimeTributárioInicial | Contabilidade (provisiona automaticamente um plano de contas inicial a partir de um template global), Fiscal, DP |
| RegimeTributárioAlterado | Novo período de regime registrado | clienteId, regimeAnterior, regimeNovo, dataEfetiva | Motor de Regras Tributárias (recalcula parametrização de impostos) |
| EncerramentoSolicitado | Atendente solicita encerramento de um Cliente | clienteId, tenantId, solicitanteId, dataSolicitacao | Owner (precisa ser notificado para decidir) |
| ClienteEncerrado | Atendimento de um Cliente é encerrado (direto pelo Owner ou por aprovação) | clienteId, tenantId, aprovadorId (Owner), solicitanteId (nulo se direto), dataEncerramento | Módulos operacionais (podem parar de gerar novas obrigações para esse Cliente) |
| SolicitacaoDeEncerramentoRejeitada | Owner rejeita uma solicitação pendente | clienteId, tenantId, aprovadorId, solicitanteId, dataRejeicao | Solicitante (precisa ser notificado da decisão) |
| ClienteReativado | Owner reativa um Cliente `Encerrado` | clienteId, tenantId, reativadoPorUserId (Owner), dataReativacao | Módulos operacionais (podem voltar a gerar obrigações para esse Cliente) |

## 7. Fora de escopo

- Controle de acesso por departamento (Pessoal, Fiscal, Contábil, Societário) —
  pertence ao contexto de Auth/Autorização. Este contexto só garante que a
  visibilidade do *cadastro* de Cliente não é afetada por departamento (INV-04).
- Atribuição de Cliente a atendentes específicos (carteira por contador) — hoje o
  acesso é uniforme para todo usuário autenticado do Tenant, independente de
  departamento (ver INV-04).
- A estrutura do Plano de Contas em si (contas, hierarquia, template global em si) —
  pertence ao contexto de Contabilidade. Este contexto só garante que
  `ClienteCadastrado` é o gatilho para a Contabilidade provisionar um plano de contas
  inicial a partir de um template.
- Prazo formal de retenção de dados após encerramento (LGPD/Compliance) — ver INV-11.
- Mudança de plano de cobrança e configurações administrativas do Tenant.

## 8. Decisões em aberto

Nenhuma no momento — as 4 questões abertas na primeira versão desta spec foram todas
resolvidas em 2026-08-04 (ver histórico abaixo).

---

## Histórico de decisões (2026-08-04)

| # | Decisão original | Resolução adotada |
|---|---|---|
| 1 | Reativação de Cliente `Encerrado` | Permitida (UC-05, `Encerrado → Ativo`). Evita conflito com INV-01 (unicidade de identificação fiscal por Tenant) e preserva histórico contínuo (INV-10) |
| 2 | Prazo de retenção de dados após encerramento | Sem prazo definido nesta versão; fica para um futuro contexto de Compliance/LGPD (INV-11) |
| 3 | Plano de Contas: template global ou próprio por Cliente | Template global customizável — `ClienteCadastrado` é o gatilho para a Contabilidade provisionar o plano de contas inicial (evento atualizado, seção 6) |
| 4 | Validação ativa de CNPJ/CPF contra a Receita Federal | Só validação local de dígito verificador (já era o comportamento do Value Object `IdentificaçãoFiscal`, seção 4) — diferente da abordagem adotada para Tenant |
