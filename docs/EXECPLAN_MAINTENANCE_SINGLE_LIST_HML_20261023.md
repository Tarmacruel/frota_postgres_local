# ExecPlan — Manutenções em listagem única — homologação

## Objetivo
Eliminar a exibição simultânea de pedidos e serviços que repete manutenções concluídas. Uma única tabela, um conjunto de filtros/KPIs e uma paginação devem manter autorizações, execução, cancelamento, consulta e histórico.

## Estado inicial verificado
- Branch `feature/contracts-balances-hml-20261022`, HEAD `c618db4`, working tree limpo.
- Baseline anterior:429 testes frontend/72 arquivos; lint0 erros/39 avisos preexistentes; build HML aprovado.
- Tela autenticada coincide com fonte:2 pedidos concluídos aparecem acima das5 manutenções; cada pedido concluído possui `maintenance_record_id` para um registro já listado.
- APIs existentes suportam paginação, escopo e ações. Sem necessidade de backend/migration para esta entrega.

## Arquivos previstos
`MaintenancePage`, utilitário de composição paginada, diálogo de ações compartilhado com `MaintenanceOrdersPanel`, testes desses fluxos e status/documentação.

## Alterações funcionais proibidas
Sem backend/schema/migration, regras financeiras, permissões, restauração, agendamento, produção ou alteração de payload financeiro. Não vincular por placa/nome; usar apenas FK explícita. Preservar exportações, filtros, foco direto e modo legado.

## Direção visual
Tese: uma superfície operacional densa, sem painel de cartões repetindo serviços. Conteúdo: filtro e indicadores únicos, tabela, detalhes de pedido apenas ao solicitar. Interação: ações de início/conclusão na linha; detalhes em diálogo, foco e estados de carregamento existentes; aparência/gestos mobile preservados.

## Passos de implementação
- [x] Backup de fonte/índice e68 fingerprints de HML, configurações/processoAPI e índice de produção.
- [x] Reunir fila sem execução (autorizadas/canceladas) e registros canônicos na tabela única.
- [x] Compartilhar diálogo de início/conclusão/cancelamento entre contrato e listagem; detalhes sob demanda por FK.
- [x] Testes de deduplicação, paginação entre fontes, filtros/KPIs/exportação e permissões.
- [x] Testes completos, lint/build, publicação HML e QA claro/escuro/desktop/mobile.
- [x] Evidências, status e commit local da entrega.

## Composição e desempenho
Registros iniciados/concluídos continuam paginados no servidor. Somente autorizações e cancelamentos sem `maintenance_record_id` são consultados em lotes100 e mantidos em cache por escopo/período; a busca local dessa fila também cobre placa/secretaria, que a busca de pedidos atual não abrange. A tabela prioriza autorizadas, mantém a ordem dos registros do servidor e põe canceladas ao final. Uma página combinada lê no máximo duas páginas adjacentes de serviços, sem carregar todo o histórico. KPIs usam agregados do servidor e a fila completa; custo contabiliza serviços realizados, sem somar orçamento. Exportação percorre lotes somente por solicitação.

## Validação visual
Listagem atual sem repetição, filtro de autorizadas/canceladas, detalhes de contrato/oficina/orçamento, retificação, foco e teclado. Desktop1366/original e celular390/360, claro/escuro, sem salvar operações de negócio durante QA.

## Testes e build
Cobrir limites entre fila/registros/canceladas, fila com mais de100 linhas, pesquisa e escopo, modo legado, ação vinculada por FK, campos preservados em erro e acesso de consulta. Executar suíte frontend, lint, build HML e diff-check.

## Resultado
Concluído e publicado exclusivamente em https://testefrota.sirel.com.br/manutencoes em23/10/2026.

- **448 testes frontend aprovados/73 arquivos** na suíte final; **49 direcionados/4 arquivos**. Cobertos limites de paginação nas duas fontes, fila com101 autorizações, preservação de agregados globais/custo, busca por placa/secretaria, foco porID, exportação única e permissões. Teste de ciclo completo comprovou que autorização→início→conclusão substitui a linha em vez de duplicá-la; custo zero passa pela API própria; falha conserva o custo digitado.
- Lint **0 erros/39 avisos preexistentes**; build privado/HML e diff-check aprovados. Publicação pelo script HML, sem reinício, migrations, restauração ou escrita de dados de negócio. Nove assets públicos iguais ao build porSHA-256;68 tabelas e configurações idênticas ao baseline, backend/processoAPI preservados e readiness HML/produção saudável.
- QA autenticado comprovou **uma tabela, um grupo de indicadores e cinco registros**, incluindo apenas uma ocorrência do serviçoGTN8C66. KPIs mantiveram5 manutenções/5 concluídas/custo7.620,00 ao filtrar autorizações vazias. Consulta de pedido mostrou contrato, oficina, orçamento1.458,00 e custo1.200,00 porFK; retificação abriu e foi cancelada, sem gravar. Não há novas fixtures nem pedidos emitidos.
- Desktop1366×768/original2268×1045 e celular390/360, claro/escuro. Cards expandem/fecham, menu de ações, detalhes em diálogo e Escape conferidos, sem overflow ou erros de console. KPIs foram ajustados para não deixar o custo isolado ou partir os centavos no desktop; carrossel mobile preservado.
- PDF real foi gerado e abriu guiaBlob, com feedback de sucesso na aplicação. O conteúdo dessa guia não foi inspecionado: a política do navegador bloqueia o protocoloBlob. Exportação dos registros únicos foi validada nos testes; nenhum contorno ao bloqueio foi usado.
- Guia principal devolvida a Manutenções, sem filtro/dialog/rascunho, tema claro, lateral expandida e override de viewport removido. Evidências em `storage/backups/20261023-maintenance-single-list`: logs finais, `publication-verification.json`, backup de fonte/índice e capturas `desktop-light.png`, `desktop-dark.png`, `mobile-light.png`, `mobile-dark.png` e `mobile-details-light.png`.

## Pendências / decisões
Não esconder pedidos pendentes para resolver a duplicação: eles precisam entrar na mesma tabela. Registros com efeito financeiro usam conclusão/retificação próprias; exclusão bloqueada pelo servidor deixa de aparecer como ação aplicável. O painel de pedidos no contexto de Contratos e saldos permanece disponível.

## Rollback
Backup `storage/backups/20261023-maintenance-single-list`: fonte anterior `source-before.zip`, índice `frontend-index-before.html`, assets anteriores mantidos. Repor índice/fonte anterior somente no frontend HML, sem reiniciar API nem restaurar banco.
