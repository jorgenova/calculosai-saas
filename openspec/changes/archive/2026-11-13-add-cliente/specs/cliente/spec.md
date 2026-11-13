## Purpose

Cadastrar e manter as empresas/pessoas atendidas pelo escritório de contabilidade
(Tenant), incluindo o histórico de regime tributário e o ciclo de vida de
atendimento, servindo de referência para todos os módulos operacionais do sistema.

## ADDED Requirements

### Requirement: Cadastro de um novo Cliente
O sistema SHALL permitir que um usuário autenticado do Tenant (Owner ou Atendente)
cadastre um novo Cliente identificado por CNPJ ou CPF, com razão social (ou nome
civil) e um regime tributário inicial. A identificação fiscal SHALL ser única
dentro do Tenant, independente do estado do Cliente.

#### Scenario: Cadastro com CNPJ
- **WHEN** um usuário autenticado cadastra um Cliente com CNPJ, razão social e
  regime tributário válidos
- **THEN** um novo Cliente é criado vinculado ao Tenant, no estado `Ativo`
- **AND** o Cliente aparece na listagem padrão de clientes do escritório

#### Scenario: Cadastro com CPF (MEI ou autônomo)
- **WHEN** um usuário autenticado cadastra um Cliente usando CPF em vez de CNPJ
- **THEN** o Cliente é criado normalmente, identificado pelo CPF

#### Scenario: Identificação fiscal já existente no Tenant
- **WHEN** já existe um Cliente com a mesma identificação fiscal (CNPJ ou CPF)
  neste Tenant, em qualquer estado (`Ativo`, `EncerramentoPendente` ou
  `Encerrado`)
- **THEN** o cadastro é rejeitado com erro de duplicidade

### Requirement: Histórico de regime tributário
O sistema SHALL manter, para cada Cliente, um histórico de Períodos de Regime
Tributário sem sobreposição nem lacuna, com exatamente um período vigente a
qualquer instante. Uma troca de regime SHALL encerrar o período vigente e abrir
um novo, nunca reescrevendo períodos já encerrados.

#### Scenario: Mudança de regime tributário
- **WHEN** um usuário registra a mudança de regime de um Cliente para uma data de
  início futura ou presente
- **THEN** o período de regime anterior é encerrado na véspera dessa data
- **AND** um novo período vigente é aberto a partir dessa data
- **AND** o histórico anterior permanece intacto e consultável

### Requirement: Owner encerra o atendimento diretamente
O sistema SHALL permitir que somente o Owner encerre o atendimento de um Cliente
`Ativo` diretamente, sem depender de aprovação, movendo-o para `Encerrado` sem
perder nenhum dado ou histórico.

#### Scenario: Encerramento direto pelo Owner
- **WHEN** o Owner encerra o atendimento de um Cliente `Ativo`
- **THEN** o Cliente passa para o estado `Encerrado`
- **AND** o Cliente deixa de aparecer na listagem padrão de clientes do escritório
- **AND** todos os dados e o histórico do Cliente continuam acessíveis por
  consulta direta

### Requirement: Atendente solicita encerramento, Owner decide
O sistema SHALL permitir que um Atendente solicite o encerramento de um Cliente
`Ativo`, movendo-o para `EncerramentoPendente` sem interromper nenhum módulo
operacional, e SHALL exigir que somente o Owner aprove ou rejeite essa
solicitação.

#### Scenario: Atendente solicita encerramento
- **WHEN** um Atendente solicita o encerramento de um Cliente `Ativo`
- **THEN** o Cliente passa para o estado `EncerramentoPendente`
- **AND** o Cliente continua aparecendo na listagem do escritório, sinalizado
  como pendente de aprovação
- **AND** todos os módulos operacionais continuam funcionando normalmente para
  esse Cliente

#### Scenario: Owner aprova a solicitação
- **WHEN** o Owner aprova uma solicitação de encerramento de um Cliente
  `EncerramentoPendente`
- **THEN** o Cliente passa para o estado `Encerrado`
- **AND** o Cliente deixa de aparecer na listagem padrão do escritório

#### Scenario: Owner rejeita a solicitação
- **WHEN** o Owner rejeita uma solicitação de encerramento de um Cliente
  `EncerramentoPendente`
- **THEN** o Cliente volta para o estado `Ativo`

#### Scenario: Atendente tenta decidir sobre uma solicitação
- **WHEN** um usuário com Papel `atendente` tenta aprovar ou rejeitar uma
  solicitação de encerramento, mesmo que tenha sido ele quem solicitou
- **THEN** a ação é rejeitada — somente o Owner pode decidir

### Requirement: Owner reativa um Cliente encerrado
O sistema SHALL permitir que somente o Owner reative um Cliente `Encerrado`,
retornando-o para `Ativo` com todo o histórico anterior (períodos de regime
inclusos) preservado e inalterado.

#### Scenario: Reativação bem-sucedida
- **WHEN** o Owner reativa um Cliente `Encerrado`
- **THEN** o Cliente passa para o estado `Ativo`
- **AND** volta a aparecer na listagem padrão de clientes do escritório
- **AND** todo o histórico anterior permanece intacto

#### Scenario: Atendente tenta reativar
- **WHEN** um usuário com Papel `atendente` tenta reativar um Cliente `Encerrado`
- **THEN** a ação é rejeitada — somente o Owner pode reativar

#### Scenario: Nova tentativa de cadastro com a identificação fiscal de um Cliente encerrado
- **WHEN** alguém tenta cadastrar um novo Cliente com a mesma identificação fiscal
  de um Cliente `Encerrado` já existente no Tenant
- **THEN** o cadastro é rejeitado com erro de duplicidade, do mesmo jeito que para
  um Cliente `Ativo`

### Requirement: Visibilidade do cadastro de Cliente
O sistema SHALL permitir que qualquer usuário autenticado do Tenant — Owner ou
Atendente, independente de departamento — consulte o cadastro de todos os
Clientes do Tenant. Essa visibilidade não SHALL ser restringida por departamento;
a restrição por departamento se aplica somente aos módulos operacionais dentro de
um Cliente, fora do escopo desta capability.

#### Scenario: Atendente de qualquer departamento consulta o cadastro
- **WHEN** um Atendente autenticado no Tenant lista ou busca Clientes do
  escritório
- **THEN** todos os Clientes do Tenant são retornados, independente do
  departamento do Atendente
