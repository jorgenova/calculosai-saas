# Hierarquia de conta e escritórios

`Tenant` é a fronteira da conta, do login, da assinatura e da cobrança. Um
Tenant possui um ou mais `Office`; cada Office representa uma empresa contábil
independente e possui CNPJ próprio.

```text
Tenant
├── Users
│   ├── Owner (todos os Offices)
│   └── Attendant (OfficeAccess explícito)
└── Offices
    └── Companies e demais dados operacionais
```

O JWT contém `userId`, `tenantId` e o papel global. O Office ativo é enviado em
`X-Office-Id` e validado em cada transação. Toda transação protegida usa um
único `PoolClient`, configura `app.current_tenant`, `app.current_user`,
`app.current_role` e, quando necessário, `app.current_office`.

Uma Company pertence a exatamente um Office. O mesmo CPF ou CNPJ pode existir
em Offices diferentes, mas é único dentro de cada Office. Regime tributário,
ciclo de atendimento e futuros serviços são independentes entre esses registros.

## Migração e recuperação

A expansão `0004_office_hierarchy_and_companies` cria a hierarquia, faz o
backfill de um Office por Tenant e associa Atendentes e convites pendentes. A
contração `0005_remove_tenant_cnpj` remove o CNPJ do Tenant somente depois que o
backend novo estiver validado.

O comando `npm run test:db:migration` recria um snapshot no formato pós-`0003`,
executa e reverte a expansão, aplica novamente e confere o backfill, aplica a
contração e simula a restauração de `tenants.cnpj` a partir do Office inicial.
O ensaio é isolado no banco local descartável `calculosai_migration_test`.

## Validação local

- `npm run test:db:migration`: caminho de migração e recuperação;
- `npm run test:db:reset && npm run test:db:verify`: schema final, RLS e
  isolamento entre Tenants/Offices;
- `npm run typecheck`: contratos TypeScript;
- `npm test --workspace=packages/backend`: domínio e build do backend.
