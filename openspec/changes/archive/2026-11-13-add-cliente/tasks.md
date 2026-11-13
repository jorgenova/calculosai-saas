## 1. Schema e migrations

- [ ] 1.1 Gerar migration `0003_tenant_slug_baseline` documentando o estado real
      já em produção (coluna `slug` + policy `tenant_select` com `slug IS NOT
      NULL`) sem alterar comportamento — verificação: `prisma migrate status`
      sem drift
- [ ] 1.2 Adicionar `Cliente`, `PeriodoRegime` e os enums (`ClienteStatus`,
      `RegimeTributario`, `TipoIdentificacaoFiscal`) ao `schema.prisma` —
      verificação: `prisma generate` roda sem erro
- [ ] 1.3 Gerar migration `0004_add_cliente` via `prisma migrate dev` com as
      tabelas, o índice único `(tenantId, tipoIdentificacao,
      identificacaoFiscal)` e RLS igual ao padrão de `User` — verificação:
      `prisma migrate dev` aplica limpo em ambiente local
- [ ] 1.4 Validar isolamento por RLS manualmente (mesmo processo do
      `cerebro-do-projeto.md`: `SET ROLE app_user` + `set_config` alternando
      tenant real/inexistente) — verificação: `Cliente` de outro tenant nunca
      retorna

## 2. Domínio — histórico de regime tributário

- [ ] 2.1 Implementar `src/domain/periodoRegime.ts`: função pura que recebe o
      período vigente + a troca solicitada e devolve as duas operações
      (encerrar vigente, abrir novo), validando que a nova data é posterior ao
      início do vigente — verificação: teste unitário sem banco cobrindo troca
      válida e data inválida (anterior ao início do vigente)
- [ ] 2.2 Teste unitário garantindo que o histórico nunca fica com sobreposição
      nem lacuna após múltiplas trocas em sequência

## 3. Validação de identificação fiscal

- [ ] 3.1 Implementar validação local de dígito verificador de CPF e CNPJ (sem
      chamada à Receita Federal/BrasilAPI — diferente do `cnpj.ts` existente,
      usado só pelo Tenant) — verificação: testes unitários com CPF/CNPJ válidos
      e inválidos conhecidos

## 4. Backend — cadastro e consulta

- [ ] 4.1 `POST /cliente`: cadastro com CNPJ ou CPF, razão social e regime
      inicial — verificação: cria `Cliente` `Ativo` + primeiro `PeriodoRegime`
      vigente numa transação
- [ ] 4.2 Rejeitar cadastro com identificação fiscal já existente no Tenant, em
      qualquer estado (`Ativo`, `EncerramentoPendente`, `Encerrado`) —
      verificação: teste cobrindo os 3 estados
- [ ] 4.3 `GET /cliente`: lista só `Ativo` e `EncerramentoPendente` por padrão
      (INV-06) — verificação: `Cliente` `Encerrado` não aparece
- [ ] 4.4 `GET /cliente?incluindoEncerrados=true` (ou rota equivalente): lista
      todos os estados, para telas/relatórios — verificação: `Encerrado`
      aparece
- [ ] 4.5 Qualquer usuário autenticado do Tenant (Owner ou Atendente) acessa as
      rotas acima, sem restrição por departamento (INV-04) — verificação: teste
      com usuário Atendente

## 5. Backend — troca de regime tributário

- [ ] 5.1 `POST /cliente/:id/regime`: usa o módulo de domínio (tarefa 2.1) numa
      transação — verificação: histórico com dois períodos após a chamada,
      igual ao cenário da spec

## 6. Backend — ciclo de vida de atendimento

- [ ] 6.1 `POST /cliente/:id/encerrar`: só Owner, transição direta `Ativo →
      Encerrado` — verificação: 403 para Atendente
- [ ] 6.2 `POST /cliente/:id/solicitar-encerramento`: Atendente ou Owner,
      `Ativo → EncerramentoPendente`, grava `solicitanteId`/`dataSolicitacao` —
      verificação: Cliente continua na listagem padrão, sinalizado
- [ ] 6.3 `POST /cliente/:id/aprovar-encerramento` e
      `POST /cliente/:id/rejeitar-encerramento`: só Owner —
      verificação: 403 para Atendente, inclusive o próprio solicitante;
      aprovação move pra `Encerrado`, rejeição volta pra `Ativo`
- [ ] 6.4 `POST /cliente/:id/reativar`: só Owner, `Encerrado → Ativo`, sem tocar
      no histórico de `PeriodoRegime` — verificação: períodos anteriores
      inalterados após reativação

## 7. Frontend

- [ ] 7.1 Tela de listagem de Clientes usando `design-system/Table` +
      `design-system/Badge` para o estado — verificação: renderiza com dados
      reais do backend local
- [ ] 7.2 Modal de cadastro de Cliente (`design-system/Modal`) com campo
      CNPJ/CPF, razão social e regime inicial — verificação: cadastro
      end-to-end via UI cria o Cliente
- [ ] 7.3 Ações de estado (solicitar/aprovar/rejeitar encerramento, encerrar
      direto, reativar) condicionadas ao Papel do usuário logado — verificação:
      botões de decisão (aprovar/rejeitar/reativar) não aparecem pra Atendente

## 8. Fechamento

- [ ] 8.1 Rodar `npm run typecheck` no monorepo inteiro — verificação: sem erros
- [ ] 8.2 Arquivar este change (`openspec archive add-cliente`) para promover
      `specs/cliente/spec.md` a `openspec/specs/cliente/spec.md` — verificação:
      `openspec spec show cliente` retorna a spec
- [x] 8.3 Remover `docs/specs/cliente.md` — feito antecipadamente em
      2026-09-10, na migração da documentação do projeto pro método OpenSpec
      (o conteúdo já vive em `specs/cliente/spec.md` deste change)
