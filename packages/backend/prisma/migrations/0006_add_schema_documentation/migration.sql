-- Document the relational model directly in PostgreSQL metadata.

COMMENT ON TABLE tenants IS 'Representa a conta contratante, responsável pela assinatura, autenticação e fronteira principal de isolamento dos dados.';
COMMENT ON COLUMN tenants.id IS 'Identificador técnico único da conta contratante, gerado automaticamente como UUID e utilizado como raiz de isolamento em todas as relações subordinadas do sistema.';
COMMENT ON COLUMN tenants.name IS 'Nome legível da conta usado para identificação administrativa do Tenant, exibição nas interfaces internas e composição dos dados básicos apresentados ao proprietário.';
COMMENT ON COLUMN tenants.slug IS 'Identificador textual opcional e globalmente único usado para localizar a conta por subdomínio ou contexto de login, sem substituir o identificador técnico interno.';
COMMENT ON COLUMN tenants.status IS 'Estado do ciclo comercial da conta, determinando se o Tenant aguarda pagamento, está ativo ou expirado e se seus usuários podem autenticar e operar recursos.';
COMMENT ON COLUMN tenants.stripe_customer_id IS 'Identificador do cliente correspondente no Stripe, utilizado para correlacionar a conta interna com cobranças, métodos de pagamento e eventos do provedor financeiro.';
COMMENT ON COLUMN tenants.stripe_subscription_id IS 'Identificador da assinatura correspondente no Stripe, usado para acompanhar vigência, renovação, cancelamento e confirmação do pagamento associado ao Tenant.';
COMMENT ON COLUMN tenants.created_at IS 'Data e hora com fuso em que a conta foi registrada no banco, preservada para auditoria, ordenação histórica e análise do processo de aquisição de clientes.';

COMMENT ON TABLE users IS 'Armazena as identidades autenticáveis de proprietários e atendentes pertencentes a uma única conta contratante.';
COMMENT ON COLUMN users.id IS 'Identificador técnico único do usuário, gerado automaticamente como UUID e empregado em autenticação, auditoria e vínculos de acesso aos escritórios da conta.';
COMMENT ON COLUMN users.tenant_id IS 'Identificador da conta à qual o usuário pertence, compondo a fronteira de isolamento que impede autenticação ou associação de acessos entre Tenants diferentes.';
COMMENT ON COLUMN users.name IS 'Nome completo ou nome preferencial do usuário, apresentado nas interfaces e registros de responsabilidade para que ações administrativas sejam atribuídas corretamente.';
COMMENT ON COLUMN users.email IS 'Endereço eletrônico utilizado como credencial de login e destino de comunicações, único dentro do Tenant embora possa ser reutilizado legitimamente em outra conta.';
COMMENT ON COLUMN users.password IS 'Hash seguro da senha definido pelo usuário para autenticação; nunca deve conter senha em texto puro nem ser devolvido por APIs, logs ou consultas de apresentação.';
COMMENT ON COLUMN users.role IS 'Perfil global do usuário dentro do Tenant, distinguindo o proprietário com acesso a todos os escritórios do atendente sujeito a autorizações explícitas.';
COMMENT ON COLUMN users.created_at IS 'Data e hora com fuso em que a identidade foi criada, usada como referência de auditoria, ordenação administrativa e acompanhamento da entrada de usuários.';
COMMENT ON COLUMN users.updated_at IS 'Data e hora com fuso da alteração persistida mais recente no usuário, atualizada automaticamente para apoiar auditorias e sincronizações de dados cadastrais.';

COMMENT ON TABLE invitations IS 'Controla convites emitidos pelo proprietário para ingresso de novos atendentes em uma conta e em seus escritórios.';
COMMENT ON COLUMN invitations.id IS 'Identificador técnico único do convite, gerado automaticamente como UUID e usado para relacionar os escritórios que serão concedidos após o aceite válido.';
COMMENT ON COLUMN invitations.tenant_id IS 'Identificador da conta responsável pela emissão do convite, garantindo que aceite, usuário criado e escritórios concedidos permaneçam no mesmo Tenant.';
COMMENT ON COLUMN invitations.email IS 'Endereço eletrônico da pessoa convidada, usado para entrega e validação do convite antes da criação ou associação definitiva da identidade de usuário.';
COMMENT ON COLUMN invitations.token_hash IS 'Hash irreversível e globalmente único do token enviado ao convidado, permitindo validar o aceite sem armazenar no banco o segredo utilizável em texto puro.';
COMMENT ON COLUMN invitations.status IS 'Estado do convite durante seu ciclo de vida, indicando se ainda está pendente, se já foi aceito ou se expirou e não pode mais criar acesso.';
COMMENT ON COLUMN invitations.invited_by_user_id IS 'Identificador do usuário proprietário que iniciou o convite, preservado para rastreabilidade administrativa e eventual exibição do responsável pela concessão.';
COMMENT ON COLUMN invitations.created_at IS 'Data e hora com fuso em que o convite foi emitido, usada para auditoria, ordenação e cálculo consistente da janela disponível para aceite.';
COMMENT ON COLUMN invitations.expires_at IS 'Data e hora com fuso que encerra a validade do convite, após a qual o token deve ser rejeitado mesmo que seu status ainda não tenha sido atualizado.';

COMMENT ON TABLE offices IS 'Representa cada escritório ou empresa contábil operada de forma isolada dentro de uma mesma conta contratante.';
COMMENT ON COLUMN offices.id IS 'Identificador técnico único do escritório, gerado automaticamente como UUID e utilizado para delimitar todos os dados operacionais vinculados a essa empresa contábil.';
COMMENT ON COLUMN offices.tenant_id IS 'Identificador da conta proprietária do escritório, formando com o id as chaves compostas que bloqueiam associações acidentais entre Tenants diferentes.';
COMMENT ON COLUMN offices.name IS 'Nome empresarial ou nome de exibição do escritório contábil, usado para seleção do contexto operacional e identificação clara nas interfaces da conta.';
COMMENT ON COLUMN offices.cnpj IS 'Cadastro Nacional da Pessoa Jurídica do escritório, armazenado de forma normalizada e globalmente único para identificar a empresa contábil responsável.';
COMMENT ON COLUMN offices.created_at IS 'Data e hora com fuso em que o escritório foi cadastrado, preservada para auditoria, ordenação e acompanhamento da expansão operacional da conta.';
COMMENT ON COLUMN offices.updated_at IS 'Data e hora com fuso da última alteração persistida no escritório, atualizada automaticamente para indicar a atualidade de seus dados cadastrais.';

COMMENT ON TABLE office_accesses IS 'Registra autorizações explícitas que permitem a atendentes trabalhar em um ou mais escritórios do mesmo Tenant.';
COMMENT ON COLUMN office_accesses.id IS 'Identificador técnico único da autorização de acesso, gerado automaticamente como UUID para permitir auditoria e manutenção individual do vínculo.';
COMMENT ON COLUMN office_accesses.tenant_id IS 'Identificador da conta comum ao usuário e ao escritório autorizados, usado nas chaves compostas para impedir concessões que atravessem fronteiras de Tenant.';
COMMENT ON COLUMN office_accesses.user_id IS 'Identificador do atendente que recebe a autorização explícita, validado dentro do mesmo Tenant e combinado ao escritório para evitar acessos duplicados.';
COMMENT ON COLUMN office_accesses.office_id IS 'Identificador do escritório ao qual o atendente poderá acessar, sempre pertencente ao mesmo Tenant informado e único em conjunto com o usuário autorizado.';
COMMENT ON COLUMN office_accesses.created_at IS 'Data e hora com fuso em que a autorização foi concedida, mantida para rastrear quando o atendente passou a poder operar no escritório correspondente.';

COMMENT ON TABLE invitation_offices IS 'Relaciona um convite pendente aos escritórios cujo acesso será atribuído ao atendente depois da aceitação.';
COMMENT ON COLUMN invitation_offices.id IS 'Identificador técnico único do vínculo entre convite e escritório, gerado automaticamente para permitir tratamento e auditoria granular da concessão futura.';
COMMENT ON COLUMN invitation_offices.tenant_id IS 'Identificador da conta compartilhada pelo convite e pelo escritório, compondo as referências que impossibilitam relacionar registros de Tenants distintos.';
COMMENT ON COLUMN invitation_offices.invitation_id IS 'Identificador do convite que receberá o escritório durante o aceite, validado no mesmo Tenant e combinado ao office_id para impedir duplicidade.';
COMMENT ON COLUMN invitation_offices.office_id IS 'Identificador do escritório que será concedido ao futuro atendente, restrito ao Tenant do convite e único dentro da lista de acessos planejados.';

COMMENT ON TABLE companies IS 'Mantém as empresas ou pessoas atendidas por um escritório, com isolamento operacional e ciclo de encerramento próprio.';
COMMENT ON COLUMN companies.id IS 'Identificador técnico único da empresa atendida, gerado automaticamente como UUID e usado em relações operacionais dentro do escritório responsável.';
COMMENT ON COLUMN companies.tenant_id IS 'Identificador da conta que contém o escritório responsável pela empresa, utilizado nas chaves compostas e políticas de segurança para reforçar isolamento.';
COMMENT ON COLUMN companies.office_id IS 'Identificador do único escritório responsável pelo atendimento da empresa, definindo a fronteira operacional para consultas, alterações e regras de acesso.';
COMMENT ON COLUMN companies.identification_type IS 'Tipo do documento fiscal armazenado em tax_id, distinguindo pessoa física de pessoa jurídica e compondo a regra de unicidade dentro do escritório.';
COMMENT ON COLUMN companies.tax_id IS 'Número normalizado do CPF ou CNPJ da empresa atendida, único por tipo dentro do escritório, mas reutilizável em outro Office independente.';
COMMENT ON COLUMN companies.name IS 'Nome civil, razão social ou nome de exibição da empresa atendida, utilizado nas interfaces, pesquisas e documentos operacionais do escritório.';
COMMENT ON COLUMN companies.status IS 'Estado do relacionamento de atendimento, indicando atividade normal, solicitação de encerramento pendente ou vínculo encerrado após decisão autorizada.';
COMMENT ON COLUMN companies.requested_by_user_id IS 'Identificador do atendente que solicitou o encerramento do vínculo, preenchido quando aplicável para preservar autoria e permitir decisão posterior do proprietário.';
COMMENT ON COLUMN companies.requested_at IS 'Data e hora com fuso em que o encerramento foi solicitado, permitindo medir o tempo de análise e reconstruir cronologicamente o fluxo de aprovação.';
COMMENT ON COLUMN companies.decided_by_user_id IS 'Identificador do proprietário que aprovou ou rejeitou a solicitação de encerramento, mantido como evidência da decisão administrativa realizada.';
COMMENT ON COLUMN companies.decided_at IS 'Data e hora com fuso em que a solicitação recebeu decisão, usada em auditorias e na reconstrução do histórico de encerramento ou continuidade.';
COMMENT ON COLUMN companies.created_at IS 'Data e hora com fuso do cadastro inicial da empresa no escritório, preservada para auditoria, ordenação e análises da carteira de atendimento.';
COMMENT ON COLUMN companies.updated_at IS 'Data e hora com fuso da alteração persistida mais recente na empresa, atualizada automaticamente para sinalizar a atualidade do cadastro e do estado.';

COMMENT ON TABLE company_tax_periods IS 'Registra o histórico temporal dos regimes tributários adotados por cada empresa atendida sem sobrescrever períodos anteriores.';
COMMENT ON COLUMN company_tax_periods.id IS 'Identificador técnico único do período tributário, gerado automaticamente como UUID para manter histórico independente e referências estáveis ao registro.';
COMMENT ON COLUMN company_tax_periods.tenant_id IS 'Identificador da conta à qual pertence a empresa do período, compondo a chave de escopo que impede referências tributárias entre Tenants diferentes.';
COMMENT ON COLUMN company_tax_periods.office_id IS 'Identificador do escritório responsável pela empresa durante o período, reforçando isolamento operacional e integridade da referência composta.';
COMMENT ON COLUMN company_tax_periods.company_id IS 'Identificador da empresa à qual o período tributário pertence, validado em conjunto com Tenant e Office para evitar histórico associado ao contexto errado.';
COMMENT ON COLUMN company_tax_periods.tax_regime IS 'Regime tributário vigente no intervalo, limitado aos valores suportados para permitir cálculos, obrigações e regras fiscais consistentes no domínio.';
COMMENT ON COLUMN company_tax_periods.start_date IS 'Data civil de início da vigência do regime tributário, sem componente de horário, usada para ordenar períodos e determinar a regra aplicável em cada competência.';
COMMENT ON COLUMN company_tax_periods.end_date IS 'Data civil final da vigência do regime, nula apenas para o período atual e nunca anterior à data inicial, preservando uma linha do tempo tributária válida.';
COMMENT ON COLUMN company_tax_periods.created_at IS 'Data e hora com fuso em que o período foi registrado no sistema, preservada para auditoria mesmo quando a data de vigência informada for retroativa.';
