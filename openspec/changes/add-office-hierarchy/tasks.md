## 1. Preflight e reconciliação do planejamento

- [x] 1.1 Reconciliar o change `add-cliente` como substituído por
  `add-office-hierarchy`, sem aplicar suas migrations ou tarefas, e verificar
  que existe uma única fonte de verdade para Company antes de alterar código
- [x] 1.2 Registrar o estado real das migrations e do banco descrito em
  `docs/cerebro-do-projeto.md`, incluindo a migration
  `0003_english_snake_case_schema`, e verificar que o plano de expansão parte do
  schema efetivamente implantado sem reutilizar numeração

## 2. Contexto transacional e segurança do banco

- [x] 2.1 Implementar um wrapper de handler que adquire um `PoolClient`, executa
  `BEGIN`, fornece o mesmo client ao controller, faz `COMMIT` antes da resposta
  de sucesso e sempre executa rollback/release em erro; verificar com teste que
  todas as queries do handler usam a mesma conexão
- [x] 2.2 Injetar `app.current_tenant` e `app.current_user` com `set_config`
  parametrizado no wrapper autenticado e verificar que contexto ausente ou valor
  inválido não retorna linhas protegidas
- [x] 2.3 Adicionar o contexto operacional `app.current_office`, resolvido pelo
  header `X-Office-Id`, e verificar respostas distintas para header ausente,
  Office autorizado, Office não autorizado e Office de outro Tenant
- [x] 2.4 Migrar os controllers protegidos existentes de `db.query` para o
  `PoolClient` escopado e verificar que onboarding, login, convite e consulta da
  conta não dependem mais de transações distribuídas pelo pool

## 3. Schema de Office e migration de expansão

- [x] 3.1 Adicionar `Office`, `OfficeAccess` e `InvitationOffice` ao Prisma com
  nomes persistidos em inglês/snake_case, relações compostas por Tenant e
  unicidades definidas no design; verificar com `prisma validate` e
  `prisma generate`
- [x] 3.2 Criar a migration de expansão para tabelas, índices, foreign keys e o
  índice parcial de um Owner por Tenant, mantendo temporariamente
  `tenants.cnpj`; verificar aplicação limpa no banco de teste
- [x] 3.3 Implementar o backfill idempotente que cria um Office inicial por
  Tenant, atribui todos os Atendentes existentes a ele e associa Convites
  pendentes; verificar contagens, CNPJs e ausência de associações entre Tenants
- [x] 3.4 Criar a função SQL segura de verificação de acesso e policies RLS de
  Office/OfficeAccess/InvitationOffice; verificar com `SET ROLE app_user` os
  casos Owner, Atendente autorizado, Atendente não autorizado e outro Tenant
- [x] 3.5 Atualizar scripts de bootstrap e verificação do banco de teste para o
  novo schema e confirmar que `npm run test:db:start` e
  `npm run test:db:verify` passam a partir de banco vazio

## 4. Tenant, onboarding e autenticação

- [x] 4.1 Adaptar o onboarding para criar Tenant, primeiro Office e único Owner
  na mesma transação antes de Stripe/e-mail; verificar sucesso, slug duplicado,
  CNPJ de Office duplicado e falha best-effort dos serviços externos
- [x] 4.2 Manter o JWT com somente `userId`, `tenantId` e `role`, sem Office IDs,
  e verificar que login via slug/subdomínio continua válido por 8 horas
- [x] 4.3 Adaptar a consulta da conta para retornar dados administrativos do
  Tenant sem tratar seu CNPJ como identidade da conta e verificar que nenhum
  termo técnico `tenant` é exibido na UI
- [x] 4.4 Garantir no backend e no banco que um Tenant possui exatamente um
  Owner e verificar que tentativa de criar ou promover um segundo Owner falha

## 5. APIs e autorização de Offices

- [x] 5.1 Implementar `GET /offices` retornando todos os Offices do Tenant para o
  Owner e somente os atribuídos para Atendentes; verificar os dois perfis e o
  caso de Atendente sem acesso
- [x] 5.2 Implementar criação de Office exclusiva do Owner com validação local de
  CNPJ e verificar 201, CNPJ duplicado, 403 para Atendente e isolamento de Tenant
- [x] 5.3 Implementar concessão idempotente e revogação de OfficeAccess para
  Atendentes existentes; verificar acesso a um, a vários e a nenhum Office
- [x] 5.4 Impedir atribuição de Owner em OfficeAccess e associação entre Tenants;
  verificar constraints de banco e respostas de API para ambas as tentativas

## 6. Convites com escopo de Office

- [x] 6.1 Alterar a criação de Convite para exigir um ou mais Office IDs do mesmo
  Tenant e persistir InvitationOffice na mesma transação; verificar convite
  válido, lista vazia e Office externo
- [x] 6.2 Quando o e-mail já pertencer a um Atendente do Tenant, conceder somente
  os acessos ausentes sem criar Convite ou usuário; verificar idempotência e
  preservação da senha/identidade existentes
- [x] 6.3 Adaptar o aceite para criar o Atendente e todos os OfficeAccess do
  Convite atomicamente antes de marcá-lo `accepted`; verificar token válido,
  usado e expirado
- [x] 6.4 Manter convites e concessões exclusivos do Owner e verificar 403 para
  Atendente nas rotas administrativas

## 7. Schema e domínio de Company

- [x] 7.1 Adicionar `Company`, `CompanyTaxPeriod` e enums em inglês ao Prisma,
  incluindo Tenant/Office em tabelas operacionais, unicidade fiscal por Office e
  campos do ciclo de atendimento; verificar `prisma validate` e geração do client
- [x] 7.2 Criar migration, constraints e policies RLS de Company/CompanyTaxPeriod
  e verificar que o mesmo CPF/CNPJ é aceito em Offices diferentes, rejeitado no
  mesmo Office e invisível fora do contexto ativo
- [x] 7.3 Implementar normalização e validação local de CPF/CNPJ e verificar com
  testes unitários documentos válidos, inválidos, formatados e somente numéricos
- [x] 7.4 Implementar a função pura de troca de regime tributário e verificar com
  testes unitários que múltiplas trocas não geram lacuna, sobreposição ou dois
  períodos vigentes

## 8. APIs de Company

- [x] 8.1 Implementar cadastro de Company com CPF/CNPJ, `name` e regime inicial
  no Office ativo, criando o primeiro período na mesma transação; verificar os
  quatro cenários de cadastro da spec
- [x] 8.2 Implementar listagem e consulta de Companies do Office ativo, ocultando
  `closed` por padrão e oferecendo inclusão explícita; verificar que IDs de outro
  Office não retornam nem alteram dados
- [x] 8.3 Implementar troca de regime usando a função de domínio dentro da
  transação escopada e verificar histórico com período anterior intacto
- [x] 8.4 Implementar encerramento direto e reativação exclusivos do Owner e
  verificar transições válidas, 403 para Atendente e preservação do histórico
- [x] 8.5 Implementar solicitação de encerramento pelo Atendente e decisão pelo
  Owner; verificar aprovação, rejeição, estados inválidos e isolamento por Office

## 9. Frontend e experiência multi-Office

- [x] 9.1 Criar contexto de Office no frontend, carregar `GET /offices`, persistir
  a última seleção válida e adicionar `X-Office-Id` somente a requisições
  operacionais; verificar seleção automática com um Office e seletor com vários
- [x] 9.2 Adicionar seletor de "Escritório" ao AppShell e limpar/redirecionar o
  contexto após 403 por acesso revogado; verificar alternância sem misturar dados
- [x] 9.3 Criar tela do Owner para cadastrar Offices e conceder/revogar acessos de
  Atendentes; verificar que controles administrativos não aparecem para Atendente
- [x] 9.4 Adaptar o formulário de convite para selecionar um ou mais Offices e
  verificar os fluxos de novo e-mail e Atendente já existente
- [x] 9.5 Criar listagem e formulário de "Empresas", com rótulo "Razão social ou
  nome completo", CPF/CNPJ e regime; verificar cadastro e troca de Office pela UI
- [x] 9.6 Implementar na UI as ações de encerramento, aprovação, rejeição e
  reativação conforme o papel global; verificar visibilidade e respostas nos
  perfis Owner e Atendente

## 10. Contração, documentação e validação final

- [x] 10.1 Ensaiar a migration de expansão e o backfill sobre snapshot com
  formato de produção, verificar rollback antes da contração e registrar
  contagens/consultas de validação
- [x] 10.2 Preparar a migration de contração que remove `tenants.cnpj` somente
  após o backend novo estar validado, e verificar restauração do valor a partir
  do Office inicial ou snapshot
- [x] 10.3 Atualizar `openspec/config.yaml` e a documentação arquitetural para
  registrar Tenant como conta, Office como empresa contábil e Company como
  empresa/pessoa atendida; verificar que não resta documentação normativa com a
  hierarquia antiga
- [x] 10.4 Executar testes de integração com dois Tenants, dois Offices no mesmo
  Tenant, um Owner, Atendentes com acessos distintos e a mesma Company fiscal em
  dois Offices; verificar ausência de leitura/escrita cruzada em todos os casos
- [x] 10.5 Executar typecheck, testes backend/frontend, verificação do banco e
  `openspec validate add-office-hierarchy --strict`; corrigir até todos os
  comandos concluírem sem erro
