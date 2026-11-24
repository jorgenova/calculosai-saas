# Plano de testes da folha de pagamento

Este plano cobre o Departamento Pessoal do Superior Contábil, desde o cadastro e a apuração até os pagamentos, documentos, eventos do eSocial e guias. A validação local usa dados fictícios, PostgreSQL isolado e transporte simulado. A homologação oficial fica para uma etapa futura, com os itens 3.1, 5.2 e 5.4 em aberto.

## 1. Ambiente e dados de teste

- Registre a branch ou o commit, a data da execução, a versão do Node e do PostgreSQL e o pacote XSD utilizado. Execute a partir da raiz do checkout da folha.
- Prepare duas empresas no escritório A e uma empresa no escritório B. Use um proprietário e atendentes com combinações de leitura, edição, aprovação, transmissão e acesso a anexos de saúde. Para testar o agrupamento por declarante, associe dois estabelecimentos da mesma raiz de CNPJ em dados de teste separados.
- Prepare um empregado mensalista, um empregado com eventos variáveis e um sócio remunerado da categoria 723. Reserve um caso em que a mesma pessoa tem vínculo de emprego e de sócio e um caso com dependente ou contribuição em outra fonte.
- Use competências em sequência que incluam reajuste, feriado local, pagamento no mês seguinte e férias que atravessem dois meses. Registre a regra de pagamento, o calendário de pró-labore e os valores de entrada de cada caso.
- No ensaio local, use certificado de teste e mantenha a transmissão oficial desabilitada. Use identificadores e documentos fictícios nos registros de evidência.

## 2. Execução automatizada local

Prepare o PostgreSQL local conforme a seção de banco de testes do [README](../README.md). Exporte no terminal as conexões do banco descartável conforme o modelo `packages/backend/.env.test.example`. Use `DATABASE_URL` para a conexão administrativa local e `DATABASE_URL_APP` para o papel da aplicação sujeito a RLS. No teste HTTP, aponte `PAYROLL_API_TEST_ADMIN_URL` para a mesma conexão administrativa local. A suíte usa essa conexão para preparar e remover dados de teste.

Com as dependências do projeto instaladas, execute na ordem.

```sh
npm run test:db:start
npx prisma migrate deploy --schema packages/backend/prisma/schema.prisma
npx prisma migrate status --schema packages/backend/prisma/schema.prisma
npm run test:db:verify
npm run typecheck
npm test --workspace=packages/backend
node --test packages/backend/tests/payrollAccess.test.cjs
npm run build --workspace=packages/frontend
```

Para incluir os testes do leiaute e da assinatura, disponibilize `openssl` e `xmllint` e aponte `ESOCIAL_XSD_DIRECTORY` para a pasta extraída dos esquemas de eventos. Aponte `ESOCIAL_COMMUNICATION_XSD_DIRECTORY` para a pasta que contém o XSD de envio de lotes. Execute a suíte com essas variáveis e confira que o caso de assinatura e XSD foi executado. Para exercitar a recuperação de timeout pela API, execute `payrollAccess.test.cjs` com `PAYROLL_API_TEST_ADMIN_URL`, `DATABASE_URL_APP` e `ESOCIAL_XSD_DIRECTORY`. [Documentação técnica do eSocial](https://www.gov.br/esocial/pt-br/documentacao-tecnica/documentacao-tecnica)

| Suíte ou verificação | O que comprovar |
| --- | --- |
| `payrollCalculation.test.cjs` | Rubricas e bases por pessoa, teto previdenciário, IRRF no mês de pagamento, férias, adiantamento e quinzenas. |
| `payrollAccess.test.cjs` | Fluxo da API com banco real de testes, permissões, versões, pagamentos, documentos, isolamento e retorno simulado da fila. |
| `payrollEsocialXml.test.cjs` | XMLs cadastrais e periódicos válidos, assinatura verificável, vínculo a demonstrativos e recibos, rejeições e respostas parciais. |
| Migrações e `test:db:verify` | Aplicação em banco descartável, preservação de empresas preexistentes, chaves compostas, políticas RLS e auditoria. Para validar a atualização, prepare uma base na versão anterior à folha e repita após aplicar as migrações. |
| Typecheck e build | Backend e frontend compilam. |

A rodada local anterior aprovou as suítes de cálculo e XML, a API com PostgreSQL, a verificação de migrações, o typecheck e o build do frontend. O teste HTTP foi executado separadamente com conexão ao banco de testes. Registre uma nova evidência quando repetir esses comandos.

## 3. Cenários de regressão e aceite local

Inicie o backend com `npm run dev:backend:test` e o frontend com `npm run dev:frontend`, em terminais separados. Na home, abra **Departamento Pessoal → Selecionar empresa para esta área** e escolha a empresa de teste. O Departamento Pessoal também fica nas áreas de trabalho do cadastro da empresa. Use a API para as rotinas de integração que exigirem esse acesso. Registre o resultado de cada linha, mesmo quando uma suíte automatizada cobrir parte do cenário.

### Cadastros, vigências e acesso

| Caso | Procedimento | Resultado esperado |
| --- | --- | --- |
| CAD-01 | Salvar admissão incompleta, tentar validar, preencher os campos apontados e tentar novamente. | O rascunho é salvo. A validação aponta as pendências e ativa o vínculo após o preenchimento. |
| CAD-02 | Cadastre um sócio com o CPF do empregado na mesma empresa. Tente repetir uma matrícula de empregado no mesmo escopo. | A pessoa é reutilizada com vínculos distintos. A matrícula duplicada é recusada. |
| CAD-03 | Ajuste salário e pró-labore com nova vigência. Consulte as competências antes e depois do reajuste e tente criar vigências conflitantes. | Cada competência usa o valor aplicável. O histórico permanece acessível e o conflito é tratado. |
| CAD-04 | Registre dependente, VR, VT e outra fonte com início e fim diferentes. Consulte antes, durante e depois de cada vigência. | Entram apenas os registros aplicáveis. Campos exigidos para cada condição são validados. |
| SEG-01 | Alterne o escritório ativo com o mesmo usuário. Tente consultar diretamente um vínculo, uma folha e um documento do outro escritório ou de outra empresa. | A interface reflete o escopo ativo e a API recusa o acesso fora dele. |
| SEG-02 | Use atendentes com leitura, edição, aprovação ou transmissão concedidas separadamente. | Cada operação exige a permissão correspondente na empresa. |
| SEG-03 | Consulte o afastamento e tente abrir seu anexo com e sem permissão de saúde. | A informação operacional fica disponível conforme o acesso à folha. O anexo é restrito e o acesso autorizado aparece na auditoria. |

### Política, cálculo e férias

| Caso | Procedimento | Resultado esperado |
| --- | --- | --- |
| CAL-01 | Configure mensal com saldo no quinto dia útil. Compare meses que incluem sábado, domingo e feriado cadastrado. Configure outra data para pró-labore. | O calendário aplica a regra e os feriados da política. O vencimento de pró-labore segue sua configuração. |
| CAL-02 | Compare mensal com vale e saldo no mesmo mês, vale na competência com saldo no mês seguinte e duas quinzenas contratuais. | As parcelas somam o líquido da competência, o adiantamento é abatido uma vez e o IRRF usa o mês de pagamento aplicável. |
| CAL-03 | Tente mudar a política de uma competência com adiantamento pago ou folha aprovada. Depois, registre vigência futura. | O período protegido rejeita a troca. A configuração futura mantém o histórico. |
| CAL-04 | Lance salário-base, hora extra, falta descontável, ausência justificada, VR e VT. Compare a memória e repita com IRRF positivo. | Cada rubrica fica identificada, com respectivas bases. A ausência justificada preserva a remuneração conforme a classificação. FGTS aparece como encargo do empregador. |
| CAL-05 | Apure uma empresa só com empregados, uma só com sócios e uma com ambos. Repita para a mesma pessoa em dois vínculos e com contribuição em outra fonte. | A folha considera os vínculos elegíveis e concilia a base previdenciária e as retenções sem duplicar o teto aplicável. |
| CAL-06 | Faça dois pagamentos a um mesmo CPF no mesmo mês, de competências distintas. Repita com um pagamento no mês seguinte. | O IRRF considera os pagamentos anteriores do mês correspondente. A competência de remuneração permanece identificada. |
| CAL-07 | Tente apurar com vigência salarial ausente, unidade ou lançamentos sem suporte, divisor inválido ou tabela ainda indisponível. | A prévia indica a pendência e impede a aprovação da apuração afetada. |
| FER-01 | Cadastre 15 dias de férias de 23/11/2026 a 07/12/2026 para salário de R$ 3.000,00. Confira aviso, vencimento e recibo. | O teste local calcula R$ 1.500,00 de férias e R$ 500,00 de terço. Distribui R$ 1.066,67 em novembro e R$ 933,33 em dezembro. O recibo identifica o pagamento confirmado. |
| FER-02 | Confirme o pagamento antecipado e apure as duas competências. Tente sobrepor outro período de férias ou aprovar com pagamento de férias pendente. | As duas competências conciliam o pagamento uma vez. Sobreposição e pendência de pagamento exigem correção antes da aprovação. |

No caso local de novembro de 2026, o teste com salário de R$ 3.000,00, 10 horas extras a 50%, 2 horas de falta e 8 horas justificadas produz bruto de R$ 3.204,60, desconto de VT de R$ 120,00 e de VR de R$ 40,00, INSS de R$ 269,86, IRRF de R$ 0,00, FGTS de R$ 254,18 e líquido de R$ 2.747,46. Esses são valores da suíte local. A conferência independente com a referência do DP é o item 3.1. [Memória do caso](ARCHITECTURE.md#evidências-para-concluir-a-homologação)

### Fechamento, pagamentos e documentos

| Caso | Procedimento | Resultado esperado |
| --- | --- | --- |
| FOL-01 | Gere rascunho, altere uma entrada e tente aprovar a prévia anterior. Recalcule e repita a aprovação com duas sessões. | A versão desatualizada é recusada. Só uma versão aprovada e um conjunto de demonstrativos são gravados. |
| FOL-02 | Após aprovar, altere uma vigência e consulte a folha anterior. Abra uma correção com motivo e tente aprová-la com pagamentos ainda por conciliar. | O histórico reproduz os dados aprovados. A correção é rastreável e o conflito de pagamento é apontado. |
| FOL-03 | Confira folha de salários, folha de pró-labore, demonstrativo individual e documentos de férias. Compare a prévia com a versão aprovada. | Cabeçalho, competência, versão, rubricas, totais e identificação visual de rascunho condizem com o estado exibido. |
| PAG-01 | Confirme pagamento com data, valor e referência. Envie novamente a mesma confirmação e tente confirmar outro valor ou mês. | A confirmação idêntica preserva um único registro. Divergências exigem revisão. |
| PAG-02 | Solicite o recibo antes e depois da confirmação. Repita fora das permissões da empresa. | O recibo autorizado vincula o desembolso ao demonstrativo, à evidência e à versão da folha. A consulta sem vínculo ou acesso é recusada. |

### eSocial e guias

| Caso | Procedimento | Resultado esperado |
| --- | --- | --- |
| ESO-01 | Prepare um declarante com referências de tabelas e estabelecimentos. Repita no outro ambiente e com autorização vencida ou mapeamento incompleto. | Autorizações, lotações e referências permanecem segregadas. A prontidão indica as pendências. |
| ESO-02 | Prepare S-2200 fora do fechamento, S-2230 de férias e S-2300 com e sem adesão no cadastro do sócio. Valide os XMLs do cenário. | O S-2200 independe da folha periódica. O S-2230 referencia o vínculo e o afastamento. O S-2300 é preparado conforme a opção do sócio. |
| ESO-03 | Registre transmissão externa sobre versão aprovada, repita o registro e tente mudar o responsável com evento pendente. Concilie o resultado e tente novamente. | A identidade e a evidência são preservadas. A troca exige a conciliação dos eventos afetados. |
| ESO-04 | Monte S-1200 com salário, pró-labore, vale e saldo. Monte S-1210 com pagamento no mês seguinte e com duas competências pagas no mesmo mês. | Cada valor pago aponta para o demonstrativo da competência correta. O S-1210 segue o mês de pagamento e o ambiente de origem. |
| ESO-05 | Simule fechamento S-1299, reabertura S-1298, retificação vinculada ao recibo de origem e novo fechamento. | O histórico preserva o fechamento original e os recibos. Os eventos refletem a sequência e a versão em uso. |
| ESO-06 | Simule rejeição, timeout após início do envio e lote com retorno parcial. Consulte com o protocolo recuperado e teste um protocolo de outro ambiente. | O identificador continua o mesmo. O resultado indeterminado exige conciliação. A consulta registra recibos e totalizadores apenas para os eventos identificados no ambiente correto. |
| ESO-07 | Prepare uma entrega periódica com mais de um estabelecimento, quinzenas contratuais, férias ou contribuição em outra fonte. | Confira o encaminhamento pelo fluxo externo e a conciliação da mesma versão aprovada conforme as limitações atuais do fluxo integrado. |
| GUI-01 | Registre DCTFWeb, DARF e GFD de forma independente. Simule diferença de valor sem justificativa e depois repita com justificativa. | Cada obrigação mantém seus próprios dados. A diferença exige justificativa. |
| GUI-02 | Anexe um comprovante, registre quitação e consulte com outra empresa. Simule fechamento aceito com GFD pendente e depois reabertura. | O acesso ao anexo é restrito. O estado do eSocial e os estados das guias são independentes. |

## 4. Homologação futura

As três validações abaixo continuam em aberto no OpenSpec. Quando houver os insumos, use os critérios de aceite para registrar a conclusão de cada uma.

- [ ] **3.1 — Conferência dos cálculos pelo Departamento Pessoal.** Obter uma referência anonimizada com competência, datas de pagamento, política, entradas e valores esperados. Comparar salário-base, horas extras, faltas, afastamentos, VR, VT, INSS, IRRF, FGTS e líquido por pessoa. Registrar divergências, resolução, responsável e aceite do DP.
- [ ] **5.2 — Ensaio em Produção Restrita do eSocial.** Configurar um ambiente de homologação com certificado do transmissor, dados controlados e empregador de teste autorizado. Usar um estabelecimento, um empregado e um sócio remunerado. Conferir tabelas e vínculos, aprovar a folha, confirmar pagamentos de teste e processar S-1200, S-1210 e S-1299 nas competências aplicáveis. Guardar versão, protocolos, recibos, totalizadores e tratamento das rejeições.
- [ ] **5.4 — Validação do roteiro com o escritório.** Revisar com o escritório as evidências da 3.1 e da 5.2. Confirmar responsáveis, autorizações, ativação, conciliação de resultados indeterminados e suspensão de novos envios. Registrar o aceite e as pendências de operação. [Roteiro do piloto](ARCHITECTURE.md#piloto-de-folha-de-pagamento)

O ensaio da 5.2 usa exclusivamente Produção Restrita. A ativação de produção é uma decisão posterior do escritório, após as validações e a confirmação da competência e da empresa piloto.

## 5. Registro de execução

Use os status **Aprovado**, **Falhou**, **Bloqueado** ou **Pendente**. Para cada falha, guarde o passo de reprodução, a diferença entre esperado e observado e o resultado do reteste.

| Data e responsável | Ambiente e revisão | Caso | Versão da folha | Resultado | Evidência ou pendência |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |

Considere a rodada local aprovada quando os testes obrigatórios tiverem evidência e as falhas de cálculo, acesso, duplicidade de pagamentos, versionamento e perda de identidade de eventos estiverem resolvidas. A homologação fica concluída quando as três validações da etapa futura forem aceitas com evidências.
