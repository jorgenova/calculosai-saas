## Context

Ver `proposal.md` para a motivação. Hoje `tenants` concentra três
responsabilidades: namespace de login (`slug`), assinatura/cobrança e identidade
legal do único escritório (`name`/`cnpj`). `users` e `invitations` são escopados
somente por `tenant_id`; o JWT carrega `userId`, `tenantId` e `role`.

O backend usa SQL cru sobre um `pg.Pool`. O middleware atual executa `BEGIN`,
`set_config` e consultas posteriores por chamadas independentes a `Pool.query`,
que não garantem a mesma conexão. Como `set_config(..., true)` é local à
transação, a introdução do escopo de Office exige primeiro tornar o vínculo
entre transação, conexão e request explícito.

O change `add-cliente` ainda não implementou tabelas ou APIs. Seus requisitos de
histórico tributário e ciclo de atendimento são preservados pela capability
`company`; suas premissas de modelo e visibilidade por Tenant são substituídas.

## Goals / Non-Goals

**Goals:**

- Garantir isolamento simultâneo por Tenant e Office no banco e na aplicação.
- Manter o JWT pequeno e permitir que mudanças de acesso tenham efeito imediato.
- Migrar contas existentes sem interromper login, convite ou cobrança.
- Preservar o padrão de controllers com SQL cru, introduzindo somente os
  auxiliares necessários para transação e contexto de segurança.
- Criar Companies independentes por Office, inclusive quando representam o
  mesmo CPF ou CNPJ real.

**Non-Goals:**

- Consolidar relatórios ou operações de vários Offices numa mesma consulta.
- Criar papéis diferentes por Office, departamentos ou permissões granulares.
- Compartilhar uma linha mestra de Company entre Offices ou sincronizar seus
  dados cadastrais.
- Definir os serviços prestados por cada Office a uma Company.
- Implementar exclusão, transferência ou fusão de Offices.
- Introduzir repositórios, ORM para consultas ou infraestrutura de eventos.

## Decisions

### Tenant permanece como conta e Office recebe a identidade legal

`tenants` conserva `id`, `name` como nome administrativo da conta, `slug`,
estado, dados Stripe e `created_at`. O CNPJ deixa de pertencer ao Tenant.

`offices` recebe `id`, `tenant_id`, `name`, `cnpj`, `created_at` e `updated_at`.
O CNPJ é globalmente único. A tabela também expõe uma chave única composta
`(id, tenant_id)` para que tabelas filhas possam provar no banco que o Office e
o Tenant informados correspondem.

Alternativa descartada: transformar cada escritório em outro Tenant. Isso
duplicaria assinatura, login e usuários e não atenderia a gestão pela mesma conta.

### Papel global e acesso explícito somente para Atendentes

`users.role` continua com `owner | attendant`. Um índice único parcial em
`users(tenant_id) WHERE role = 'owner'` garante exatamente no máximo um Owner;
onboarding e migration garantem a existência de um.

`office_accesses` contém `tenant_id`, `user_id`, `office_id` e `created_at`, com
unicidade em `(user_id, office_id)` e foreign keys compostas que proíbem
associação entre Tenants. Somente Atendentes precisam de linhas nessa tabela.
O acesso do Owner é derivado do papel global, tornando todo Office futuro
imediatamente acessível sem sincronizar associações redundantes.

Alternativa descartada: armazenar o papel em `office_accesses`. O produto
definiu os mesmos perfis em todos os Offices e um único Owner global.

### Office ativo é contexto de request, não claim de autorização do JWT

O JWT permanece com `userId`, `tenantId` e `role`. `GET /offices` retorna os
Offices acessíveis. Requisições operacionais enviam o Office escolhido em
`X-Office-Id`; o cliente frontend central acrescenta o header depois da seleção.
O backend nunca confia apenas no valor recebido: valida Tenant, papel e
`office_accesses` em cada novo contexto transacional.

O frontend pode persistir a última seleção localmente e selecionar
automaticamente quando houver apenas uma opção, mas o banco continua sendo a
fonte de verdade. Remover um acesso tem efeito na requisição seguinte sem
reemitir JWT.

Alternativas descartadas: incluir todos os Office IDs no JWT, que ficaria
obsoleto após concessão/revogação; e codificar o Office em todas as URLs, que
duplicaria o mesmo mecanismo em cada módulo operacional futuro.

### Uma conexão e uma transação por handler protegido

Um wrapper de handler adquire um `PoolClient`, inicia a transação, injeta via
`set_config` parametrizado os contextos aplicáveis e fornece esse mesmo client a
todas as consultas do controller. O wrapper confirma a transação antes de
enviar a resposta de sucesso; em erro, faz rollback e sempre libera a conexão.

Contextos:

- `app.current_tenant`: obrigatório em toda operação autenticada;
- `app.current_user`: obrigatório em toda operação autenticada;
- `app.current_role`: papel global assinado no JWT (`owner | attendant`);
- `app.current_office`: obrigatório somente em operações de Office.

Login e aceite de convite usam wrappers transacionais específicos porque ainda
não possuem todos os contextos no início do fluxo. Nenhum SQL interpola valores
em `set_config`.

Alternativa descartada: continuar usando `Pool.query` para `BEGIN` e para as
consultas seguintes. O pool pode escolher conexões diferentes, anulando tanto a
transação quanto o contexto RLS.

### RLS valida Tenant, Office e direito de acesso

Tabelas de conta (`tenants`, `users`, `invitations`) continuam isoladas por
Tenant. Tabelas operacionais carregam `tenant_id` e `office_id`, mesmo quando o
Tenant poderia ser obtido por join. A pequena desnormalização simplifica
policies, índices e diagnósticos; foreign keys compostas impedem inconsistência.

Uma função SQL interna e estável verifica se `app.current_user` é o Owner do
Tenant ou possui `office_accesses` para `app.current_office`. Ela usa
`SECURITY INVOKER`, `search_path` fixo e a própria RLS de `office_accesses`,
recebe apenas IDs parametrizados e tem execução concedida ao `app_user`.
Policies operacionais exigem simultaneamente:

```text
tenant_id = app.current_tenant
office_id = app.current_office
can_access_office(app.current_tenant, app.current_user, app.current_office)
```

O middleware também valida o acesso para produzir 403 claro; a policy é a última
barreira contra falha ou omissão da aplicação.

### Convites carregam os Offices concedidos

`invitation_offices` relaciona `invitations` e `offices`, com `tenant_id` e
constraints compostas. Um novo convite exige ao menos um Office. O aceite cria
o Atendente e suas linhas em `office_accesses` na mesma transação.

Quando o e-mail já pertence a um Atendente do Tenant, não há convite: o Owner
cria somente os acessos ainda ausentes. E-mail de outro Tenant continua podendo
ser usado, pois identidades são isoladas por conta.

Alternativa descartada: armazenar Office IDs como JSON no convite. A tabela de
relação permite integridade referencial e consulta segura por RLS.

### Company é um registro independente por Office

`companies` contém `tenant_id`, `office_id`, `identification_type` (`cpf | cnpj`),
`tax_id` normalizado, `name`, `status` (`active | closure_pending | closed`),
campos da solicitação/decisão de encerramento e timestamps. A unicidade é
`(office_id, identification_type, tax_id)`, deliberadamente sem `tenant_id` como
fronteira de negócio. CPF/CNPJ é validado localmente antes da escrita.

`company_tax_periods` também carrega Tenant e Office para RLS, além de Company,
regime, início e fim. Uma função de domínio pura calcula a troca de regime; a
transação e constraints impedem mais de um período vigente.

Não existe uma Company mestre no Tenant. Se o mesmo CNPJ for atendido pelos
Offices A e B, haverá duas linhas, históricos e futuros serviços independentes.
Essa duplicação intencional preserva a exigência de não misturar dados.

### APIs técnicas em inglês e vocabulário de produto em português

Identificadores, tabelas e rotas usam `office`, `company` e snake_case conforme
as convenções do repositório. A interface apresenta "Escritório" e "Empresa";
"Tenant" não aparece para o usuário. O campo `name` da Company é exibido como
"Razão social ou nome completo", compatível com CNPJ e CPF.

## Risks / Trade-offs

- [O mesmo CPF/CNPJ pode divergir entre Offices] → Aceitar a independência como
  requisito; qualquer consolidação futura deve ser uma capability explícita.
- [Policies com verificação de acesso adicionam joins] → Indexar
  `office_accesses(user_id, office_id, tenant_id)` e medir com `EXPLAIN` em
  volume representativo.
- [Uma transação por handler segura uma conexão durante toda a operação] → Não
  executar chamadas Stripe, e-mail ou outras I/O externas dentro da transação;
  dimensionar e observar o pool.
- [O header de Office pode ficar desatualizado após revogação] → Revalidar no
  backend a cada contexto; responder 403 e fazer o frontend limpar a seleção.
- [O change `add-cliente` pode ser aplicado por engano] → Tratá-lo como
  superseded e bloquear sua aplicação/revisão em paralelo antes de iniciar esta.
- [Migração de RLS pode causar indisponibilidade ou vazamento se incompleta] →
  aplicar primeiro em banco de teste, validar com `SET ROLE app_user` para
  combinações de Tenant/usuário/Office e só então promover.

## Migration Plan

1. Reconciliar o change `add-cliente` como substituído e confirmar que nenhuma
   de suas migrations ou tabelas foi aplicada.
2. Criar uma migration de expansão com `offices`, `office_accesses`,
   `invitation_offices`, constraints, índices, função de acesso e policies,
   mantendo temporariamente `tenants.cnpj` para compatibilidade.
3. Para cada Tenant existente, criar um Office inicial copiando `tenants.name` e
   `tenants.cnpj`; conceder esse Office a todos os Atendentes existentes e
   associá-lo aos Convites pendentes. O Owner não recebe linha redundante.
4. Validar contagens, CNPJs, um Owner por Tenant, foreign keys e RLS no banco de
   teste; repetir o ensaio a partir de snapshot compatível com produção.
5. Implantar o backend com wrapper transacional, novo contexto de Office,
   onboarding/convites adaptados e APIs de Office/Company. Implantar depois o
   frontend com seletor e telas de Empresa.
6. Criar `companies` e `company_tax_periods` já no modelo final, pois não existem
   dados de Cliente a converter.
7. Após período de observação, executar migration de contração que remove
   `tenants.cnpj`; conservar `tenants.name` como nome administrativo da conta.
8. Atualizar o contexto OpenSpec e a documentação arquitetural para registrar
   que Tenant é conta e Office é a empresa contábil.

Antes da migration de contração, rollback consiste em restaurar a versão
anterior da aplicação e manter as novas tabelas sem uso. Depois da remoção de
`tenants.cnpj`, rollback exige restaurar a coluna a partir do Office inicial ou
de snapshot; por isso a contração só ocorre após validação e backup.
