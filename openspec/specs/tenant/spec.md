# tenant Specification

## Purpose
Cadastrar o escritório de contabilidade (Tenant) que contrata o sistema, autenticar
seus usuários (Owner e Atendente) e controlar quem tem acesso a ele. É o ponto de
entrada do sistema: todo outro contexto existe dentro de um Tenant.

## Requirements

### Requirement: Cadastro de um novo Tenant (onboarding)
O sistema SHALL permitir que um visitante cadastre uma nova conta Tenant
informando nome, e-mail e senha do futuro Owner, nome administrativo da conta,
razão social e CNPJ do primeiro Office, slug e plano escolhido. O Tenant, o
primeiro Office e o Owner SHALL ser gravados antes de qualquer chamada ao
Processador de Pagamentos, com o Tenant no estado `pendente_pagamento`, para que
uma falha externa não deixe assinatura órfã nem impeça a existência da conta.

#### Scenario: Cadastro bem-sucedido
- **WHEN** um visitante se cadastra com CNPJ de Office e slug de Tenant ainda
  não usados, escolhendo um plano
- **THEN** um novo Tenant é criado no estado `pendente_pagamento`
- **AND** o primeiro Office é criado com a razão social e o CNPJ informados
- **AND** um único usuário Owner é criado, vinculado ao Tenant
- **AND** uma assinatura de pagamento é solicitada para o Tenant
- **AND** um e-mail de boas-vindas é enviado

#### Scenario: CNPJ já cadastrado
- **WHEN** alguém tenta se cadastrar com um CNPJ que já identifica qualquer
  Office do sistema
- **THEN** o cadastro é rejeitado com erro de duplicidade

#### Scenario: Slug já em uso
- **WHEN** alguém tenta se cadastrar com um slug que já pertence a outro Tenant
- **THEN** o cadastro é rejeitado com erro de duplicidade

#### Scenario: Falha ao solicitar a assinatura de pagamento
- **WHEN** o Tenant, o primeiro Office e o Owner já foram gravados e a
  solicitação de assinatura ao Processador de Pagamentos falha
- **THEN** o Tenant permanece `pendente_pagamento`
- **AND** o Office e o Owner permanecem disponíveis
- **AND** nada do que já foi gravado é revertido

### Requirement: Confirmação de pagamento ativa o Tenant
O sistema SHALL transicionar um Tenant de `pendente_pagamento` para `ativo` quando
o Processador de Pagamentos confirma que a assinatura está ativa. A transição é
idempotente.

#### Scenario: Confirmação recebida
- **WHEN** o Processador de Pagamentos confirma que a assinatura de um Tenant
  `pendente_pagamento` está ativa
- **THEN** o Tenant passa para o estado `ativo`

#### Scenario: Confirmação para um Tenant que já está ativo
- **WHEN** uma nova confirmação de pagamento chega para um Tenant que já está
  `ativo`
- **THEN** nada muda no estado do Tenant

### Requirement: Autenticação de Owner e Atendente (login)
O sistema SHALL autenticar um usuário por e-mail e senha dentro de um Tenant
identificado pelo subdomínio da requisição ou, na ausência de subdomínio, por um
slug informado explicitamente. Uma sessão válida por 8 horas, contendo
`userId`, `tenantId` e o Papel global do usuário, SHALL ser emitida em caso de
sucesso. O Office ativo não SHALL ser fixado como permissão imutável na sessão;
após o login, o usuário SHALL selecionar um dos Offices que pode acessar. O
estado do Tenant não bloqueia a autenticação nesta versão, e tentativas de login
SHALL ser limitadas por janela de tempo e IP de origem.

#### Scenario: Login bem-sucedido via subdomínio
- **WHEN** um usuário acessa via `slug.dominio.com.br` e informa credenciais
  corretas para um usuário existente nesse Tenant
- **THEN** uma sessão válida por 8 horas é emitida com `userId`, `tenantId` e Papel
- **AND** o usuário pode consultar seus Offices acessíveis para selecionar o
  contexto operacional

#### Scenario: Login via slug no corpo da requisição
- **WHEN** um usuário informa o slug do Tenant junto com e-mail e senha, sem
  subdomínio
- **THEN** o login é resolvido pelo slug informado e uma sessão válida é emitida
  em caso de credenciais corretas

#### Scenario: Login em Tenant pendente ou expirado
- **WHEN** o Owner ou um Atendente de um Tenant `pendente_pagamento` ou
  `expirado` informa credenciais corretas
- **THEN** o login funciona normalmente

#### Scenario: Credenciais inválidas
- **WHEN** a senha informada está incorreta, ou o e-mail não existe nesse Tenant
- **THEN** o acesso é negado sem revelar qual dos dois estava errado

#### Scenario: Tentativas excessivas de login
- **WHEN** o mesmo IP já falhou o login 10 vezes nos últimos 15 minutos
- **THEN** a tentativa seguinte é bloqueada até a janela expirar

### Requirement: Owner convida um Atendente
O sistema SHALL permitir que somente o Owner crie um Convite para um e-mail
ingressar como Atendente do Tenant, selecionando pelo menos um Office ao qual a
pessoa terá acesso. O token SHALL ser de uso único e válido por 7 dias. Se o
e-mail já pertencer a um Atendente do mesmo Tenant, o sistema SHALL conceder os
novos acessos sem criar outra identidade nem exigir novo aceite.

#### Scenario: Convite enviado
- **WHEN** o Owner convida um e-mail ainda não cadastrado e seleciona um ou mais
  Offices do seu Tenant
- **THEN** um Convite é criado com token de uso único válido por 7 dias
- **AND** os Offices selecionados ficam associados ao Convite
- **AND** um e-mail com o link de aceite é enviado

#### Scenario: E-mail já pertence a um usuário do Tenant
- **WHEN** o Owner informa o e-mail de um Atendente existente no Tenant e
  seleciona um Office que ele ainda não acessa
- **THEN** o acesso ao Office é concedido sem criar outro usuário ou Convite

#### Scenario: Já existe um convite pendente para o mesmo e-mail
- **WHEN** já existe um Convite `pending` e não expirado para o e-mail no Tenant
- **THEN** um novo Convite não é criado
- **AND** o Owner deve cancelar, expirar ou concluir o Convite existente antes de
  emitir outro

#### Scenario: Convite sem Office
- **WHEN** o Owner tenta convidar um novo Atendente sem selecionar Office algum
- **THEN** a operação é rejeitada

#### Scenario: Atendente tenta convidar
- **WHEN** um usuário com Papel `attendant` tenta criar um Convite ou conceder
  acesso a outro usuário
- **THEN** a ação é rejeitada

### Requirement: Atendente aceita o convite e define sua senha
O sistema SHALL permitir que quem possui um token de Convite `pending` e não
expirado defina seu nome e senha, criando um usuário Atendente vinculado ao
Tenant e concedendo acesso aos Offices associados ao Convite. O Convite SHALL
ser marcado como `accepted`; tokens inexistentes, usados ou expirados SHALL ser
rejeitados.

#### Scenario: Aceite bem-sucedido
- **WHEN** alguém aceita um Convite válido informando nome e senha
- **THEN** um usuário Atendente é criado no Tenant do Convite
- **AND** o Atendente recebe acesso a todos os Offices associados ao Convite
- **AND** o Convite passa para `accepted`

#### Scenario: Token inválido ou já utilizado
- **WHEN** o token não corresponde a nenhum Convite `pending`
- **THEN** o aceite é rejeitado

#### Scenario: Token expirado
- **WHEN** se passaram mais de 7 dias desde a criação do Convite
- **THEN** o aceite é rejeitado
- **AND** o Convite passa para `expired`

### Requirement: Isolamento de dados por Tenant
O slug de um Tenant e o CNPJ de um Office SHALL ser únicos em todo o sistema. O
e-mail de um Usuário SHALL ser único dentro do Tenant e cada Tenant SHALL possuir
exatamente um Owner. A senha nunca SHALL ser armazenada nem transmitida em texto
puro. Toda leitura ou escrita autenticada SHALL respeitar o Tenant da sessão e,
quando operacional, o Office ativo e o acesso do usuário, com contextos de
segurança parametrizados e Row-Level Security no PostgreSQL.

#### Scenario: Mesmo e-mail em Tenants diferentes
- **WHEN** dois Tenants distintos cadastram um usuário com o mesmo e-mail
- **THEN** ambos os cadastros são aceitos sem conflito

#### Scenario: Segundo Owner no mesmo Tenant
- **WHEN** alguém tenta criar ou promover um segundo Owner no mesmo Tenant
- **THEN** a operação é rejeitada

#### Scenario: Consulta sem tenant autenticado
- **WHEN** uma consulta protegida é feita sem o contexto do Tenant autenticado
- **THEN** a Row-Level Security não retorna nenhuma linha protegida

#### Scenario: Atendente tenta usar Office não autorizado
- **WHEN** um Atendente autenticado informa como ativo um Office ao qual não tem
  acesso
- **THEN** a operação é rejeitada e nenhum dado operacional é retornado
