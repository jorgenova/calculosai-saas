# Spec de domínio: Cliente

Status: rascunho
Última atualização: 2026-07-16

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

## 4. Modelo de domínio

### Entidades

- **Cliente** — identidade: `id` (gerado no cadastro). Estados possíveis: `Ativo` |
  `EncerramentoPendente` | `Encerrado`. Transições: `Ativo → EncerramentoPendente`
  (solicitação de Atendente), `Ativo → Encerrado` (encerramento direto do Owner),
  `EncerramentoPendente → Encerrado` (aprovação do Owner),
  `EncerramentoPendente → Ativo` (rejeição do Owner). `Encerrado` é terminal neste
  contexto (não há reativação modelada — ver Decisões em aberto).

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

- INV-01: A IdentificaçãoFiscal de um Cliente é única dentro do mesmo Tenant, mas
  pode se repetir entre Tenants diferentes (dois escritórios podem atender, cada um,
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

## 6. Eventos de domínio

| Evento | Quando ocorre | Payload mínimo | Possíveis consumidores |
|---|---|---|---|
| ClienteCadastrado | Cliente criado com sucesso | clienteId, tenantId, identificaçãoFiscal, regimeTributárioInicial | Contabilidade (pode iniciar plano de contas), Fiscal, DP |
| RegimeTributárioAlterado | Novo período de regime registrado | clienteId, regimeAnterior, regimeNovo, dataEfetiva | Motor de Regras Tributárias (recalcula parametrização de impostos) |
| EncerramentoSolicitado | Atendente solicita encerramento de um Cliente | clienteId, tenantId, solicitanteId, dataSolicitacao | Owner (precisa ser notificado para decidir) |
| ClienteEncerrado | Atendimento de um Cliente é encerrado (direto pelo Owner ou por aprovação) | clienteId, tenantId, aprovadorId (Owner), solicitanteId (nulo se direto), dataEncerramento | Módulos operacionais (podem parar de gerar novas obrigações para esse Cliente) |
| SolicitacaoDeEncerramentoRejeitada | Owner rejeita uma solicitação pendente | clienteId, tenantId, aprovadorId, solicitanteId, dataRejeicao | Solicitante (precisa ser notificado da decisão) |

## 7. Fora de escopo

- Reativação de um Cliente `Encerrado` — não modelada nesta versão (ver decisão em
  aberto abaixo).
- Controle de acesso por departamento (Pessoal, Fiscal, Contábil, Societário) —
  pertence ao contexto de Auth/Autorização. Este contexto só garante que a
  visibilidade do *cadastro* de Cliente não é afetada por departamento (INV-04).
- Atribuição de Cliente a atendentes específicos (carteira por contador) — hoje o
  acesso é uniforme para todo usuário autenticado do Tenant, independente de
  departamento (ver INV-04).
- A estrutura do Plano de Contas em si — pertence ao contexto de Contabilidade, que
  vai referenciar Cliente por `id`.
- Validação ativa da IdentificaçãoFiscal contra a Receita Federal — se necessária,
  deve seguir o mesmo padrão de "Serviço de domínio" já usado no cadastro do Tenant.
- Mudança de plano de cobrança e configurações administrativas do Tenant.

## 8. Decisões em aberto

- Um Cliente `Encerrado` pode ser reativado (voltar para `Ativo`), ou encerramento é
  definitivo e um novo atendimento vira um Cliente novo?
- Existe prazo legal de retenção de dados após o encerramento, ou os dados ficam
  retidos indefinidamente (INV-06 só garante que não são apagados, mas não define
  por quanto tempo)?
- O Plano de Contas é um template global customizável por Cliente, ou totalmente
  próprio por Cliente? Isso decide se `ClienteCadastrado` deve ou não disparar
  criação automática de um plano de contas inicial.
- A IdentificaçãoFiscal do Cliente precisa de validação ativa contra a Receita
  Federal (como no cadastro do Tenant), ou basta a validação local de dígito
  verificador?
