# company Specification

## Purpose
Cadastrar e manter as empresas ou pessoas atendidas por cada Office, com
identificação fiscal, histórico tributário e ciclo de atendimento completamente
isolados dos demais escritórios.

## Requirements

### Requirement: Cadastro de uma nova Company
O sistema SHALL permitir que um usuário com acesso ao Office ativo cadastre uma
Empresa (`Company`) identificada por CNPJ ou CPF, com razão social ou nome civil
e regime tributário inicial. A identificação fiscal SHALL ser válida, normalizada
e única dentro do Office, independentemente do estado da Company.

#### Scenario: Cadastro com CNPJ
- **WHEN** um usuário cadastra uma Company com CNPJ, nome e regime tributário
  válidos no Office ativo
- **THEN** uma Company é criada nesse Office no estado `active`
- **AND** aparece na listagem padrão de Empresas do Office

#### Scenario: Cadastro com CPF
- **WHEN** um usuário cadastra uma Company usando CPF e nome civil
- **THEN** a Company é criada normalmente no Office ativo, identificada pelo CPF

#### Scenario: Identificação fiscal repetida no mesmo Office
- **WHEN** já existe uma Company com o mesmo tipo e número de identificação
  fiscal no Office ativo, em qualquer estado
- **THEN** o cadastro é rejeitado com erro de duplicidade

#### Scenario: Mesma identificação fiscal em Offices diferentes
- **WHEN** uma Company com determinado CPF ou CNPJ existe no Office A e um
  usuário cadastra a mesma identificação no Office B
- **THEN** o cadastro é aceito como registro independente
- **AND** alterações em um registro não afetam o outro

### Requirement: Histórico de regime tributário
O sistema SHALL manter, para cada Company, um histórico de períodos de regime
tributário sem sobreposição nem lacuna, com exatamente um período vigente. Uma
troca de regime SHALL encerrar o período vigente e abrir um novo, sem reescrever
períodos encerrados.

#### Scenario: Mudança de regime tributário
- **WHEN** um usuário autorizado registra a mudança de regime de uma Company
- **THEN** o período anterior é encerrado na véspera da nova data de início
- **AND** um novo período vigente é aberto nessa data
- **AND** o histórico anterior permanece intacto e consultável

### Requirement: Owner encerra o atendimento diretamente
O sistema SHALL permitir que somente o Owner encerre diretamente o atendimento
de uma Company `active`, movendo-a para `closed` sem perder dados ou histórico.

#### Scenario: Encerramento direto pelo Owner
- **WHEN** o Owner encerra uma Company `active` no Office ativo
- **THEN** a Company passa para `closed`
- **AND** deixa de aparecer na listagem padrão desse Office
- **AND** seus dados e histórico permanecem consultáveis diretamente

### Requirement: Atendente solicita encerramento e Owner decide
O sistema SHALL permitir que um Atendente com acesso ao Office solicite o
encerramento de uma Company `active`, movendo-a para `closure_pending`, e SHALL
exigir que somente o Owner aprove ou rejeite a solicitação.

#### Scenario: Atendente solicita encerramento
- **WHEN** um Atendente solicita o encerramento de uma Company `active`
- **THEN** a Company passa para `closure_pending`
- **AND** continua na listagem do Office, sinalizada como pendente

#### Scenario: Owner aprova a solicitação
- **WHEN** o Owner aprova o encerramento de uma Company `closure_pending`
- **THEN** a Company passa para `closed`

#### Scenario: Owner rejeita a solicitação
- **WHEN** o Owner rejeita o encerramento de uma Company `closure_pending`
- **THEN** a Company volta para `active`

#### Scenario: Atendente tenta decidir
- **WHEN** um Atendente tenta aprovar ou rejeitar uma solicitação
- **THEN** a operação é rejeitada

### Requirement: Owner reativa uma Company encerrada
O sistema SHALL permitir que somente o Owner reative uma Company `closed`,
retornando-a para `active` com todo o histórico preservado.

#### Scenario: Reativação bem-sucedida
- **WHEN** o Owner reativa uma Company `closed` no Office ativo
- **THEN** a Company passa para `active`
- **AND** volta à listagem padrão do Office
- **AND** seu histórico permanece inalterado

#### Scenario: Atendente tenta reativar
- **WHEN** um Atendente tenta reativar uma Company `closed`
- **THEN** a operação é rejeitada

### Requirement: Visibilidade de Companies por Office
O sistema SHALL permitir que qualquer usuário autorizado no Office ativo
consulte todas as Companies desse Office, independentemente de departamento, e
SHALL impedir a consulta de Companies pertencentes a outro Office.

#### Scenario: Atendente consulta Companies do Office autorizado
- **WHEN** um Atendente lista Companies com um Office autorizado ativo
- **THEN** somente Companies desse Office são retornadas

#### Scenario: Usuário referencia Company de outro Office
- **WHEN** uma requisição no Office A referencia uma Company do Office B
- **THEN** a Company não é retornada nem alterada
