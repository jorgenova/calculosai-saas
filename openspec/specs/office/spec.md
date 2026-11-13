# office Specification

## Purpose
Permitir que uma única conta Tenant administre várias empresas contábeis
independentes, compartilhando identidades de usuário sem misturar dados
operacionais entre os escritórios.

## Requirements

### Requirement: Owner administra os Offices do Tenant
O sistema SHALL permitir que somente o Owner crie Offices adicionais no seu
Tenant, cada um identificado por nome e CNPJ próprios. O CNPJ SHALL ser único em
todo o sistema e o Office SHALL pertencer imutavelmente ao Tenant em que foi
criado.

#### Scenario: Criação de segundo Office
- **WHEN** o Owner cadastra um Office com nome e CNPJ ainda não utilizados
- **THEN** o Office é criado dentro do Tenant do Owner
- **AND** torna-se imediatamente acessível ao Owner

#### Scenario: CNPJ já usado por outro Office
- **WHEN** o Owner tenta cadastrar um Office com CNPJ já existente no sistema
- **THEN** a criação é rejeitada com erro de duplicidade

#### Scenario: Atendente tenta criar Office
- **WHEN** um Atendente tenta criar um Office
- **THEN** a operação é rejeitada

### Requirement: Acesso global do Owner aos Offices
O sistema SHALL conceder ao único Owner do Tenant acesso a todos os Offices
atuais e futuros desse Tenant, sem exigir atribuição individual, e SHALL impedir
qualquer acesso a Offices de outro Tenant.

#### Scenario: Novo Office disponível ao Owner
- **WHEN** um novo Office é criado no Tenant
- **THEN** o Owner pode selecioná-lo e operar todos os seus recursos

#### Scenario: Owner tenta acessar Office de outro Tenant
- **WHEN** o Owner informa um Office pertencente a outro Tenant
- **THEN** o acesso é rejeitado

### Requirement: Acesso explícito de Atendentes aos Offices
O sistema SHALL permitir que o Owner conceda ou revogue o acesso de um
Atendente a um ou mais Offices do mesmo Tenant. O Papel do usuário SHALL
permanecer global no Tenant e não SHALL variar por Office.

#### Scenario: Atendente recebe acesso a dois Offices
- **WHEN** o Owner concede ao mesmo Atendente acesso aos Offices A e B
- **THEN** ambos aparecem na lista de Offices acessíveis desse Atendente

#### Scenario: Acesso revogado
- **WHEN** o Owner revoga o acesso de um Atendente ao Office A
- **THEN** o Office A deixa de aparecer para o Atendente
- **AND** novas tentativas de operar seus recursos são rejeitadas

#### Scenario: Atribuição entre Tenants
- **WHEN** alguém tenta associar um usuário a um Office de outro Tenant
- **THEN** a operação é rejeitada

### Requirement: Seleção de Office ativo
O sistema SHALL exigir um Office ativo para acessar recursos operacionais. O
Owner SHALL poder selecionar qualquer Office do Tenant e o Atendente somente um
Office explicitamente autorizado. Quando houver exatamente um Office acessível,
o sistema MAY selecioná-lo automaticamente.

#### Scenario: Usuário seleciona Office autorizado
- **WHEN** um usuário seleciona um Office que pode acessar
- **THEN** as operações subsequentes ficam escopadas exclusivamente a esse Office

#### Scenario: Operação sem Office ativo
- **WHEN** um usuário tenta acessar um recurso operacional sem Office ativo
- **THEN** a operação é rejeitada sem retornar dados de Office algum

### Requirement: Isolamento operacional entre Offices
O sistema SHALL impedir que consultas, alterações ou cadastros realizados no
contexto de um Office leiam ou modifiquem dados de outro Office, mesmo quando o
usuário possui acesso aos dois. Visões consolidadas entre Offices não SHALL ser
produzidas implicitamente.

#### Scenario: Owner alterna entre dois Offices
- **WHEN** o Owner acessa dados no Office A e depois seleciona o Office B
- **THEN** cada consulta retorna apenas os dados do Office ativo naquele momento

#### Scenario: Identificador de recurso pertence a outro Office
- **WHEN** uma operação no Office A referencia o identificador de um recurso do
  Office B
- **THEN** o recurso não é retornado nem alterado
