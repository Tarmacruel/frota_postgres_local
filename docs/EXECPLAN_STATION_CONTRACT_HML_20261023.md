# ExecPlan — contrato exclusivo por posto — homologação

## Objetivo
Cada posto possui no máximo um vínculo contratual ativo: rede credenciada ou contrato individual. O posto selecionado determina automaticamente contrato e executante na emissão, sem escolha de outro contrato. Solicitação funcional expressa de23/10/2026; somente homologação.

## Estado inicial verificado
- Repositório `D:\FROTAS\frota_emprestimos_testes`, branch `feature/contracts-balances-hml-20261022`, HEAD `ca864db`, working tree limpo; API6969/PG5441, schema0058.
- Gates da entrega anterior: backend698 aprovados, PostgreSQL25, frontend402/70arquivos, lint0erros/39avisos, build HML aprovado.
- Modelo garante apenas par contrato/posto único, permitindo um posto ativo em vários contratos. Formulário mostra seletores redundantes de contrato e prestador.

## Arquivos previstos
Modelo/migration de índice parcial por posto ativo, serviço de vínculo/reativação e catálogo, formulário de reserva/hook, diálogo de vínculo e testes PostgreSQL/frontend; guia operacional e status.

## Alterações funcionais proibidas
Sem produção, alteração de saldos/reservas/despesas ou inferência de vínculos por nome. Sem restauração adicional da produção. Sem exclusão de vínculos históricos. Manutenção continua admitindo escolha entre contratos/oficinas elegíveis.

## Passos de implementação
- [x] Índice único de vínculo ativo por posto; bloqueio concorrente e validação na criação/reativação.
- [x] Catálogo identifica postos já vinculados; formulário explica exclusividade sem alterar automaticamente vínculos existentes.
- [x] Abastecimento identifica contrato e executante pelo posto; troca de posto limpa estado anterior; situações sem contrato ou inconsistentes bloqueiam emissão.
- [x] Regressões de concorrência, reativação, histórico, permissões, troca rápida de posto e manutenção; gates completos.
- [x] Backup HML, staging da migration, ativação exclusiva HML, assets/saúde/dados, QA claro/escuro e mobile.
- [x] Documentação, evidências e commit local.

## Validação visual
Ordem sem seletores de contrato/prestador para abastecimento; identificação do vínculo, prévia de reserva e mensagens para posto sem contrato elegível. Diálogo de vínculo impede escolher posto já utilizado. Desktop/mobile, claro/escuro, sem salvar pedidos reais.

## Testes e build
PostgreSQL descartável para vínculo direto versus rede, concorrência, desativação/reativação e preservação de reservas. Frontend valida seleção automática, troca de posto sem payload antigo, falhas e seleção de manutenção preservada. Backend/frontend completos, lint/build e staging compatível com rotina06h.

## Resultado
Publicado exclusivamente na homologação em23/10/2026. Regra funcional autorizada pelo usuário; restrições de redesign sobre backend/schema não impedem esta alteração de negócio.

- Migration0059 adiciona apenas índice parcial único sobre `contract_providers.fuel_station_id` enquanto ativo; vínculos anteriores não são removidos. Criação e reativação bloqueiam o posto transacionalmente, conferem conflito e retornam409 com orientação. A desativação permite novo vínculo sem transferir reservas antigas.
- Catálogo financeiro informa contrato ativo por posto. Seletor de vínculo desabilita postos já vinculados e identifica o número do contrato. Abastecimento mostra contrato/posto como dados automáticos; manutenção mantém seus seletores. Hook descarta catálogos e prévias antigos após troca de posto, litros ou atualização; resposta inconsistente bloqueia emissão.
- Backend completo: **698 aprovados/139 ignorados/8 avisos anteriores**. A primeira execução importou a flag HML habilitada e falhou em15 mocks legados; diagnóstico arquivado. Reexecução com `CONTRACT_BALANCE_ENABLED=false` apenas no processo da suíte legada passou; os testes PostgreSQL habilitam explicitamente a funcionalidade e validam o comportamento real.
- PostgreSQL descartável: **30 aprovados**, incluindo cinco novas regressões de exclusividade, concorrência entre contratos distintos, bloqueio de reativação, índice direto, catálogo/permissões e conclusão de ordem reservada no contrato anterior. Frontend: **409 aprovados em71 arquivos**, direcionados14; lint0erros/39avisos anteriores; build HML aprovado com aviso anterior de bundle.
- Backup consistente HML, fonte `ca864db` e índice frontend anteriores preservados em `storage/backups/20261023-station-contract`. Migration testada em staging: **67 tabelas de negócio idênticas**. Injeção de dois vínculos fictícios ativos fez a migration falhar sem alterar schema ou dados; staging removido. Preflight da rotina06h reconheceu produção0055→HML0059, quatro migrations pendentes, sem nova cópia de dados.
- Índice aplicado à HML com67 tabelas de negócio e configurações preservadas. O controlador normal não podia ler a identidade do processo S4U; criação da tarefa auxiliar exigiu elevação do Windows. Reinício concluído sob a mesma identidade S4U/Limited da rotina06h, sem nova restauração; tarefa temporária removida. API6969 com novo PID20872 desde08:20:42 de Brasília.
- Frontend publicado pelo script HML; nove assets públicos conferidos por SHA256, readiness dos dois ambientes aprovada, índice/configurações de produção preservados. Sem publicação/reinício/migration no ambiente de produção.
- QA autenticado em guia separada: posto fictício INDIVIDUAL preencheu contrato individual e reserva183,00 para30L a6,1000; troca para REDE preencheu seu contrato e reserva195,00 a6,5000. Nenhum seletor de contrato ou executante permaneceu no abastecimento. Posto sem contrato elegível ficou bloqueado; diálogo de vínculo desabilitou postos ocupados. Desktop, mobile390/360 e claro/escuro conferidos sem overflow horizontal ou erros de console. Guia QA fechada sem pedidos; tema claro e viewport original restaurados; rascunho da guia do usuário não foi alterado.
- Duas fixtures explicitamente fictícias foram criadas com abertura de1000,00 cada para permitir a prévia financeira; **zero pedidos, reservas ou consumo**. As68 tabelas originais permaneceram idênticas após excluir somente as linhas dessas fixtures/auditorias da comparação. Serão reiniciadas pela rotina06h normal. Capturas: `desktop-light-individual.png`, `mobile-dark-network.png`, `station-contract-proof.png`; relatórios e scripts de verificação no diretório privado da entrega.

## Pendências / decisões
A exclusividade vale para vínculos ativos; histórico pode conter contratos anteriores. A distinção operacional entre individual/rede decorre do contrato ao qual o gestor vincula o posto, sem classificação automática por nome ou transferência silenciosa. Nenhum novo campo de modalidade é necessário para garantir a separação solicitada.

## Rollback
Backup privado do banco, fonte e índice frontend antes da ativação. Reverter somente HML; índice novo não altera linhas existentes e pode permanecer como proteção durante reversão de código. Rotina06h continua migrando em staging antes de trocar ambiente.
