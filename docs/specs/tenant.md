# Spec de domínio: Tenant

Status: aprovado
Última atualização: 2026-08-04

> Esta spec documenta um contexto que já tem implementação parcial em produção
> (semanas 1–5 do projeto, anteriores à adoção do fluxo SDD). Foi escrita a partir do
> código existente (`packages/backend/src/controllers/{auth,onboarding,invite}Controller.ts`,
> middlewares e `prisma/schema.prisma}`) e das decisões tomadas em 2026-08-04 para
> resolver 5 lacunas encontradas nessa implementação (ver histórico de decisões no
> final). **A implementação atual ainda não reflete essas decisões** — isso é
> trabalho pendente, não algo já pronto.

## 1. Bounded context

Cadastrar o escritório de contabilidade (Tenant) que contrata o sistema, autenticar
seus usuários e controlar quem tem acesso a ele.

**Propósito:** Ser o ponto de entrada do sistema — todo outro contexto (Cliente,
Contabilidade, Fiscal, DP...) existe *dentro* de um Tenant e depende dele já existir
e ter um usuário autenticado.

**Relação com outros contextos:**

| Contexto | Relação | Observação |
|---|---|---|
| Cliente | downstream | Cliente sempre pertence a exatamente um Tenant e referencia-o só por `id`. Não é modelado aqui. |
| Cobrança / Billing (Stripe) | parceiro | O onboarding depende de uma confirmação de pagamento externa para ativar o Tenant, mas gestão contínua de cobrança (troca de plano, cancelamento, inadimplência recorrente) não é modelada aqui — ver Fora de escopo. |
| Auditoria (Audit Trail) | downstream (futuro) | Login, onboarding, convite e ativação são justamente os eventos que o Audit Trail (P0 do backlog, ainda não implementado) precisará capturar. Este contexto expõe os eventos de domínio para isso, mas não implementa auditoria. |
| CRM | downstream (futuro) | Cadastros que expiram sem confirmar pagamento (`TenantExpirado`) viram base para acompanhamento comercial. Este contexto só preserva os dados e dispara o evento — nutrir o lead é responsabilidade de um futuro contexto de CRM. |

## 2. Linguagem ubíqua

| Termo | Definição |
|---|---|
| Tenant (Escritório) | Escritório de contabilidade que contrata o sistema e paga a assinatura. Identificado por CNPJ e por um slug único. |
| Owner (Proprietário) | Usuário criado automaticamente no cadastro do Tenant. Acesso total, incluindo administração do próprio Tenant. Existe exatamente um por Tenant nesta versão. |
| Atendente | Usuário que ingressa no Tenant aceitando um Convite de um Owner. Acesso restrito a operação (não administra o Tenant). |
| Papel (Role) | `owner` ou `atendente` — define o nível de acesso de um usuário dentro do Tenant. |
| Slug | Identificador público e único do Tenant, usado no subdomínio (`slug.dominio.com.br`) e como fallback de login quando não há subdomínio. |
| Sessão | Prova de autenticação emitida após login bem-sucedido, carregando a identidade do usuário, o Tenant e o papel. Válida por tempo limitado. |
| Estado do Tenant | `pendente_pagamento`, `ativo` ou `expirado`. Um Tenant nasce pendente, se torna ativo quando a assinatura é confirmada, ou expira automaticamente após 7 dias sem confirmação (sem perder dados). |
| Convite | Registro criado por um Owner autorizando um e-mail específico a ingressar como Atendente do Tenant, mediante um token de uso único e validade limitada. |

## 3. Casos de uso

### UC-01: Cadastrar um novo Tenant (onboarding)

Como visitante, quero cadastrar meu escritório de contabilidade no sistema, para
começar a usá-lo como Owner.

**Critérios de aceite:**

```gherkin
Cenário: Cadastro bem-sucedido
  Dado que não existe nenhum Tenant com CNPJ "12.345.678/0001-90" nem slug "contabilidade-silva"
  Quando eu me cadastro com nome "Jorge", email "jorge@exemplo.com", senha,
    razão social "Contabilidade Silva", CNPJ "12.345.678/0001-90" e
    slug "contabilidade-silva", escolhendo um plano
  Então um novo Tenant "Contabilidade Silva" é criado no estado `pendente_pagamento`
  E um usuário Owner é criado, vinculado a esse Tenant
  E uma assinatura de pagamento é solicitada para o Tenant, referenciando o plano
    escolhido
  E um e-mail de boas-vindas é enviado

Cenário: CNPJ já cadastrado
  Dado que já existe um Tenant com CNPJ "12.345.678/0001-90"
  Quando alguém tenta se cadastrar com o mesmo CNPJ
  Então o cadastro é rejeitado com erro de duplicidade

Cenário: Slug já em uso
  Dado que já existe um Tenant com slug "contabilidade-silva"
  Quando alguém tenta se cadastrar com o mesmo slug
  Então o cadastro é rejeitado com erro de duplicidade

Cenário: Falha ao solicitar a assinatura de pagamento
  Dado que o Tenant e o Owner já foram gravados no estado `pendente_pagamento`
  Quando a solicitação de assinatura ao Processador de Pagamentos falha
  Então o Tenant permanece `pendente_pagamento` (nada é revertido)
  E não existe nenhuma assinatura órfã, porque o Tenant nunca dependeu do sucesso
    dessa chamada para existir
```

> Mudança em relação à implementação atual: hoje a chamada ao Stripe acontece
> **antes** do INSERT do Tenant. Esta spec inverte a ordem — Tenant e Owner são
> gravados primeiro, no estado `pendente_pagamento` — para eliminar o risco de
> assinatura órfã (decisão registrada no histórico, D-02 original).

### UC-02: Confirmação de pagamento ativa o Tenant

Como sistema, quando o Processador de Pagamentos confirma que a assinatura de um
Tenant está ativa, quero transicionar esse Tenant para `ativo`, para liberar seu uso
pleno.

**Critérios de aceite:**

```gherkin
Cenário: Confirmação recebida
  Dado que o Tenant "Contabilidade Silva" está `pendente_pagamento`
  Quando o Processador de Pagamentos confirma que a assinatura está ativa
  Então o Tenant passa para o estado `ativo`

Cenário: Confirmação para um Tenant que já está ativo
  Dado que o Tenant já está `ativo`
  Quando uma nova confirmação chega para ele
  Então nada muda — a transição é idempotente
```

### UC-03: Tenant pendente expira após 7 dias sem confirmação de pagamento

Como sistema, quando um Tenant permanece `pendente_pagamento` por mais de 7 dias sem
confirmação do Processador de Pagamentos, quero marcá-lo como `expirado`, para não
tratar cadastros não convertidos como se estivessem em andamento — sem apagar os
dados, que passam a servir de base para acompanhamento comercial futuro (CRM).

**Critérios de aceite:**

```gherkin
Cenário: Expiração automática
  Dado que o Tenant "Contabilidade Silva" está `pendente_pagamento` há mais de 7 dias
  E nenhuma confirmação de pagamento foi recebida
  Quando a verificação de expiração roda
  Então o Tenant passa para o estado `expirado`
  E nenhum dado do Tenant ou do Owner é removido

Cenário: Confirmação tardia depois de expirado
  Dado que o Tenant está `expirado`
  Quando o Processador de Pagamentos confirma a assinatura depois disso
  Então o Tenant passa para `ativo` normalmente — a expiração não é definitiva,
    apenas sinaliza que o cadastro parou de progredir sozinho
```

### UC-04: Autenticar-se no Tenant (login)

Como Owner ou Atendente, quero autenticar-me com e-mail e senha, para acessar o
Tenant ao qual pertenço.

**Critérios de aceite:**

```gherkin
Cenário: Login bem-sucedido via subdomínio
  Dado que acesso o sistema por "contabilidade-silva.dominio.com.br"
  E existe um usuário com email "jorge@exemplo.com" e senha "minhasenha" nesse Tenant
  Quando eu informo email e senha corretos
  Então recebo uma Sessão válida por 8 horas, contendo meu userId, o tenantId e meu
    Papel

Cenário: Login via slug (sem subdomínio, uso local/dev)
  Dado que informo o slug "contabilidade-silva" junto com email e senha
  Quando as credenciais conferem para esse Tenant
  Então recebo uma Sessão válida

Cenário: Login em Tenant pendente ou expirado
  Dado que o Tenant está `pendente_pagamento` ou `expirado`
  Quando o Owner desse Tenant faz login com credenciais corretas
  Então o login funciona normalmente — o estado do Tenant não bloqueia
    autenticação nesta versão (ver Fora de escopo)

Cenário: Credenciais inválidas
  Quando eu informo uma senha incorreta, ou um e-mail que não existe nesse Tenant
  Então o acesso é negado, sem revelar qual dos dois estava errado

Cenário: Tentativas excessivas de login
  Dado que já falhei o login 10 vezes para o mesmo IP nos últimos 15 minutos
  Quando eu tento novamente
  Então a tentativa é bloqueada até a janela expirar
```

### UC-05: Owner convida um Atendente

Como Owner, quero convidar uma pessoa por e-mail para ser Atendente do meu Tenant,
para que ela possa operar o sistema em meu nome.

**Critérios de aceite:**

```gherkin
Cenário: Convite enviado
  Dado que estou autenticado como Owner do Tenant "Contabilidade Silva"
  E não existe usuário nem Convite pendente com o e-mail convidado neste Tenant
  Quando eu convido "novo@exemplo.com"
  Então um Convite é criado, com token de uso único válido por 7 dias
  E um e-mail é enviado para essa pessoa com o link de aceite

Cenário: E-mail já pertence a um usuário do Tenant
  Dado que já existe um usuário com o e-mail convidado neste Tenant
  Quando eu tento convidar esse mesmo e-mail
  Então o convite é rejeitado com erro de duplicidade

Cenário: Já existe um convite pendente para o mesmo e-mail
  Dado que já existe um Convite pendente e válido para "novo@exemplo.com" neste Tenant
  Quando eu tento convidar o mesmo e-mail de novo
  Então o novo convite é rejeitado — só pode haver um convite pendente por e-mail por
    Tenant

Cenário: Atendente tenta convidar
  Dado que estou autenticado como Atendente
  Quando eu tento convidar alguém
  Então a ação é rejeitada — só o Owner pode convidar
```

### UC-06: Atendente aceita o convite e define sua senha

Como pessoa convidada, quero acessar o link do convite e definir meu nome e senha,
para me tornar Atendente do Tenant que me convidou.

**Critérios de aceite:**

```gherkin
Cenário: Aceite bem-sucedido
  Dado que existe um Convite pendente e não expirado para "novo@exemplo.com" no
    Tenant "Contabilidade Silva"
  Quando eu acesso o link com o token do convite e defino nome e senha
  Então um Usuário Atendente é criado, vinculado ao Tenant "Contabilidade Silva"
  E o Convite passa para o estado `aceito`
  E eu posso fazer login normalmente a partir de agora

Cenário: Token inválido ou já utilizado
  Dado que o token não corresponde a nenhum Convite pendente (inexistente ou já
    aceito)
  Quando eu tento acessar o link de aceite
  Então o aceite é rejeitado

Cenário: Token expirado
  Dado que o Convite existe, mas se passaram mais de 7 dias desde sua criação
  Quando eu tento aceitar
  Então o aceite é rejeitado, o Convite passa para `expirado`, e é necessário que o
    Owner envie um novo convite
```

## 4. Modelo de domínio

### Entidades

- **Tenant** — identidade: `id`. Atributos: nome (razão social), CNPJ, slug, Estado
  (`pendente_pagamento` | `ativo` | `expirado`). Transições: `pendente_pagamento →
  ativo` (confirmação do Processador de Pagamentos), `pendente_pagamento → expirado`
  (7 dias corridos sem confirmação), `expirado → ativo` (confirmação tardia ainda é
  aceita — a expiração não é definitiva). Não há transição de volta a partir de
  `ativo` nesta versão — inadimplência/cancelamento pertencem a um contexto de
  Billing futuro.
- **Usuário** — identidade: `id`. Atributos: nome, email, senha (armazenada como
  hash, nunca em texto puro), Papel. Pertence a exatamente um Tenant, fixo desde a
  criação.
- **Convite** — identidade: `id`. Atributos: e-mail convidado, token (armazenado
  como hash, nunca em texto puro), Estado (`pendente` | `aceito` | `expirado`),
  usuário que convidou, data de criação, data de expiração (7 dias após criação).
  Transições: `pendente → aceito` (aceite bem-sucedido), `pendente → expirado`
  (tentativa de aceite após o prazo).

### Value Objects

- **CNPJ** — identifica o Tenant perante o Fisco. Único globalmente no sistema
  (diferente do CNPJ/CPF de Cliente, que é único só dentro do Tenant — são
  identificadores fiscais de contextos diferentes, não o mesmo conceito).
- **Slug** — string única globalmente, usada para resolver o Tenant a partir do
  subdomínio ou do campo de login.
- **Papel** — `owner` | `atendente`.

### Agregados

- **Tenant** (raiz: Tenant)
  - Protege: unicidade global de CNPJ e de Slug; a transição de Estado só ocorre via
    confirmação do Processador de Pagamentos ou por expiração automática por tempo,
    nunca manualmente.
  - Referenciado externamente só por: `id`.
- **Usuário** (raiz: Usuário)
  - Protege: unicidade do e-mail dentro do mesmo Tenant.
  - Referenciado externamente só por: `id`.
- **Convite** (raiz: Convite)
  - Protege: no máximo um Convite `pendente` por par (Tenant, e-mail); token de uso
    único; expiração após 7 dias.
  - Referenciado externamente só por: `id` (o token em si nunca é exposto fora do
    fluxo de e-mail → aceite).

### Repositórios (contrato, não implementação)

- **TenantRepository**
  - `existePorCnpj(cnpj): boolean`
  - `existePorSlug(slug): boolean`
  - `buscarPorSlug(slug): Tenant | undefined`
  - `salvar(tenant): void`
  - `buscarPorId(id): Tenant | undefined`
- **UsuarioRepository**
  - `existePorEmailNoTenant(tenantId, email): boolean`
  - `buscarPorEmailNoTenant(tenantId, email): Usuario | undefined`
  - `salvar(usuario): void`
- **ConviteRepository**
  - `existePendentePorEmailNoTenant(tenantId, email): boolean`
  - `buscarPorTokenValido(token): Convite | undefined` — retorna só se `pendente` e
    não expirado
  - `salvar(convite): void`

### Serviços de domínio (contrato, não implementação)

- **ProcessadorDePagamentos**
  - `solicitarAssinatura(tenant, plano): void` — inicia a cobrança para o Tenant.
    Não retorna confirmação síncrona de ativação — a ativação vem por confirmação
    assíncrona (UC-02).
- **NotificadorPorEmail**
  - `enviarBoasVindas(usuario, tenant)`
  - `enviarConvite(email, tenant, convite)`
  - Falha no envio nunca desfaz a operação que a originou (cadastro ou convite já
    persistidos continuam válidos); é apenas registrada. Reenvio manual fica fora de
    escopo desta versão.
- **EmissorDeSessao**
  - `emitir(usuario): Sessao` — gera a prova de autenticação (userId, tenantId,
    Papel) após validar credenciais. Sessão expira 8 horas após a emissão; não há
    renovação automática (sem refresh) nesta versão.

## 5. Invariantes e regras de negócio

- INV-01: O CNPJ de um Tenant é único em todo o sistema (diferente de Cliente, cujo
  identificador fiscal só é único dentro do Tenant).
- INV-02: O Slug de um Tenant, quando definido, é único em todo o sistema.
- INV-03: Todo Tenant tem exatamente um Owner, criado no momento do cadastro do
  Tenant. Não há fluxo de transferência de propriedade nesta versão.
- INV-04: O e-mail de um Usuário é único dentro do mesmo Tenant, mas pode se repetir
  entre Tenants diferentes.
- INV-05: Somente um usuário com Papel `owner` pode convidar novos Atendentes.
- INV-06: A senha de um Usuário nunca é armazenada nem transmitida em texto puro.
- INV-07: Login rejeitado (credencial inválida) não deve revelar se foi o e-mail ou a
  senha que estava incorreta.
- INV-08: Tentativas de login são limitadas por janela de tempo e IP de origem, para
  mitigar força bruta.
- INV-09: Um Tenant nasce `pendente_pagamento`. Transita para `ativo` mediante
  confirmação do Processador de Pagamentos (a qualquer momento, inclusive depois de
  expirado), ou para `expirado` automaticamente após 7 dias corridos sem confirmação.
  Nunca há transição manual.
- INV-10: O estado do Tenant não bloqueia login nesta versão — Owner e Atendentes de
  um Tenant `pendente_pagamento` ou `expirado` continuam autenticando normalmente.
- INV-11: Um Convite tem no máximo um registro `pendente` por e-mail dentro do mesmo
  Tenant, com token de uso único, válido por 7 dias a partir da criação.
- INV-12: Falha no envio de e-mail (boas-vindas ou convite) não desfaz o cadastro ou
  o convite já persistidos.
- INV-13: Uma Sessão emitida expira 8 horas após a emissão; não há renovação
  automática nesta versão.
- INV-14: Um Tenant `expirado` preserva integralmente seus dados (Tenant e Owner) —
  não há exclusão automática. Servem de base para um futuro contexto de CRM
  acompanhar comercialmente cadastros que não converteram.

## 6. Eventos de domínio

| Evento | Quando ocorre | Payload mínimo | Possíveis consumidores |
|---|---|---|---|
| TenantCadastrado | Tenant + Owner gravados, estado inicial `pendente_pagamento` | tenantId, cnpj, slug, ownerId | Audit Trail (futuro) |
| TenantAtivado | Processador de Pagamentos confirma a assinatura | tenantId, dataAtivacao | Audit Trail (futuro); notificação ao Owner (futuro) |
| TenantExpirado | Tenant `pendente_pagamento` completa 7 dias sem confirmação | tenantId, dataExpiracao | CRM (futuro) — dispara acompanhamento comercial do cadastro não convertido; Audit Trail (futuro) |
| UsuarioAutenticado | Login bem-sucedido | userId, tenantId, papel, dataHora | Audit Trail (futuro) |
| LoginFalhou | Tentativa de login rejeitada | tenantId (se identificado), dataHora, motivo | Audit Trail (futuro) |
| AtendenteConvidado | Owner cria um Convite | conviteId, tenantId, emailConvidado, convidadoPorUserId | Audit Trail (futuro) |
| ConviteAceito | Aceite bem-sucedido de um Convite | conviteId, tenantId, novoUsuarioId, dataAceite | Audit Trail (futuro); Owner (notificação futura) |

## 7. Fora de escopo

- Bloqueio de acesso/operações por estado do Tenant (`pendente_pagamento` ou futura
  inadimplência) — login e este contexto funcionam independente do estado; gating de
  módulos operacionais pertence a um contexto de Billing/Autorização futuro.
- Recuperação de senha / redefinição.
- Login alternativo por CNPJ e recuperação de subdomínio por e-mail (backlog já
  registrado para isso).
- Remoção ou alteração de Papel de um Usuário existente; transferência de Owner.
- Reenvio manual de e-mail após falha de envio.
- Gestão contínua de cobrança (troca de plano, cancelamento, inadimplência recorrente)
  — pertence a um contexto de Billing, que hoje não existe formalmente.
- Validação ativa do CNPJ do Tenant contra a Receita Federal.
- Acompanhamento comercial de cadastros `expirado` (nutrição de lead, contato do time
  comercial, critérios de priorização) — este contexto só preserva os dados e dispara
  `TenantExpirado`; agir sobre isso é responsabilidade de um futuro contexto de CRM.

## 8. Decisões em aberto

Nenhuma no momento — as 5 lacunas originais (D-01 a D-05) foram todas resolvidas em
2026-08-04 (ver histórico abaixo).

---

## Histórico de decisões (2026-08-04)

As lacunas D-01 a D-05 da versão anterior desta spec foram resolvidas em conversa
com o usuário e incorporadas ao modelo acima:

| # | Decisão original | Resolução adotada |
|---|---|---|
| D-01 | Convite sem fluxo de aceite | Convidado define a própria senha via link com token de uso único (UC-05, entidade Convite) |
| D-02 | Ordem onboarding vs. pagamento, risco de assinatura órfã | Tenant nasce `pendente_pagamento`; ativação é assíncrona, via confirmação do Processador de Pagamentos (UC-02) |
| D-03 | Falha no envio de e-mail | E-mail é best-effort — nunca desfaz cadastro/convite já persistidos (INV-12) |
| D-04 | Ciclo de vida do Tenant | Modelado só o necessário para o onboarding (`pendente_pagamento` → `ativo`); inadimplência/cancelamento ficam para um futuro contexto de Billing |
| D-05 | Expiração de sessão | 8 horas, sem renovação automática (INV-13) |
| D-02 (filha) — Tenant que nunca ativa | O que fazer com um cadastro que nunca recebe confirmação de pagamento | Expira em 7 dias (`pendente_pagamento → expirado`), sem apagar dados — vira a base de um futuro contexto de CRM para acompanhamento comercial (UC-03, INV-14, evento `TenantExpirado`) |
