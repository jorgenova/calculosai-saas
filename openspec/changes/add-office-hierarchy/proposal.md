## Why

O Tenant representa a conta contratante, mas o modelo atual também o trata como
o único escritório contábil, impedindo que a mesma conta administre empresas
contábeis distintas com usuários compartilhados. A hierarquia precisa ser
separada antes da implementação do cadastro operacional de empresas, para que
dados de Offices diferentes nunca sejam misturados.

## What Changes

- Manter `Tenant` como nome técnico da conta, responsável por slug, assinatura,
  cobrança, estado da conta e conjunto de usuários.
- Introduzir `Office` como a empresa contábil operacional, com nome e CNPJ
  próprios; um Tenant pode possuir vários Offices.
- Manter os papéis globais `owner` e `attendant`, com exatamente um Owner por
  Tenant. O Owner acessa automaticamente todos os Offices atuais e futuros; cada
  Atendente recebe acesso explícito a um ou mais Offices.
- Exigir a seleção de um Office ativo para operações, sem consolidar dados de
  vários Offices implicitamente.
- Alterar onboarding, autenticação e convites para criar o primeiro Office,
  listar Offices acessíveis e atribuir Atendentes a Offices.
- Substituir o conceito planejado de Cliente por `Company` ("Empresa" na UI),
  aceitando CPF ou CNPJ e vinculando cada registro a exatamente um Office.
- Preservar no novo conceito de Company o histórico de regime tributário e o
  ciclo de vida de atendimento já planejados em `add-cliente`, agora sempre
  escopados ao Office da Company.
- Permitir que o mesmo CPF ou CNPJ seja cadastrado em Offices diferentes, mas
  impedir duplicidade dentro do mesmo Office.
- Reforçar o isolamento PostgreSQL com contexto de Tenant, usuário e Office,
  validando o acesso por RLS e mantendo todas as consultas do request na mesma
  conexão/transação.
- Migrar cada Tenant existente para um Office inicial sem perder usuários,
  convites, assinatura ou capacidade de login.
- **BREAKING**: nome e CNPJ deixam de identificar diretamente o Tenant como
  escritório; APIs e telas operacionais passam a exigir contexto de Office. O
  planejamento ainda não implementado de `add-cliente` é substituído pelo
  modelo `Company` definido nesta mudança e não deve ser aplicado em paralelo.

## Capabilities

### New Capabilities

- `office`: criação e gestão dos Offices de um Tenant, seleção do Office ativo,
  concessão de acesso a Atendentes e isolamento operacional por Office.
- `company`: cadastro e consulta de Empresas por CPF ou CNPJ dentro de um Office,
  com unicidade e visibilidade limitadas ao Office ativo.

### Modified Capabilities

- `tenant`: redefine Tenant como conta contratante, adapta onboarding,
  autenticação, convites, papéis e garantias de RLS à hierarquia de Offices.

## Impact

- `packages/backend/prisma/schema.prisma` e migrations: novos modelos `Office`,
  `OfficeAccess` e `Company`; migração de nome/CNPJ; constraints compostas,
  índices e policies RLS.
- Backend Express: onboarding, login, JWT/contexto autenticado, middleware
  transacional, convites, seleção de Office e rotas de Companies.
- Frontend React: seletor de escritório, contexto de Office, gestão de acessos e
  substituição de "Cliente" por "Empresa".
- Banco PostgreSQL/Supabase: backfill de um Office por Tenant existente e testes
  de isolamento entre Tenants, entre Offices e entre Atendentes.
- OpenSpec: o change ativo `add-cliente` deverá ser reconciliado e não aplicado
  junto com esta mudança, pois suas premissas de visibilidade por Tenant foram
  invalidadas.
