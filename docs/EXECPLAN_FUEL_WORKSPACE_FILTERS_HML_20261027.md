# ExecPlan — Filtros padronizados de Abastecimentos — 27/10/2026

## Objetivo
Oferecer seletor pesquisável de veículo em Ordens e Ordens abertas, padronizando os filtros comuns com o Histórico. Somente frontend HML.

## Estado inicial verificado
- Fonte3a90e75, árvore limpa; branch feature/fuel-workspace-filters-hml-20261027.
- Baseline anterior final:569 testes/84 arquivos, lint0 erros/39 avisos anteriores, build HML aprovado. Fonte e build atuais coincidem com essa entrega.
- AGENTS, MasterPlan, RepoContext, VisualSpec, IMPLEMENT, PLANS, STATUS e skill frontend lidos; contact sheets atual/alvo inspecionados. Screenshot do usuário e DOM autenticado confirmam a implementação real.
- API de ordens já aceita vehicle_id e fuel_station_id. Histórico usa vehicle_id local e mantém UUID antigo na URL depois de limpar. Catálogos e acesso devem respeitar permissões, sem ampliar acesso do perfil somente ordens.
- Backup privado:storage/backups/20261027-fuel-workspace-filters, build/configurações/bundle e fingerprints de banco somente leitura.

## Arquivos previstos
FuelSuppliesPage, FuelSupplyOrdersPage, componente local dos três filtros comuns, utilitário de opções e testes. CSS local somente se necessário; documentação.

## Alterações funcionais proibidas
Sem API/backend/schema/env/regras financeiras/permissões novas. Sem emissão, confirmação, cancelamento, retificação, anexos ou assinatura em QA. Sem publicação ou reinício produtivo.

## Passos de implementação
1. [x] Inventário, branch, referências e backup.
2. [x] Unificar veículo pela URL e adicionar controles comuns, com reset de página e limpeza coerente.
3. [x] Manter peculiaridades: situação e período de emissão nas ordens, prazo/KPIs/confirmar nas abertas, alertas de consumo no histórico. Buscas e filtros específicos permanecem por aba.
4. [x] Cobrir paginação/KPIs/exportação, navegação/links, escopo e catálogos autorizados; test/lint/build.
5. [x] Publicar só frontend HML, QA desktop/mobile/claro/escuro, integridade e documentação.

## Validação visual
Tese: toolbar compacta, previsível e institucional, com uma listagem por aba. Conteúdo: busca seguida de Filtros recolhível, controles comuns na mesma ordem, filtros específicos e Limpar filtros. Interações: abertura recolhível, pesquisa de opções e estados ativos/foco existentes; sem nova animação ornamental. No celular, manter coluna única e toque44px. Usar o mesmo componente de controles nas três abas.

## Testes e build
Seleção real de veículo deve filtrar no servidor todas as páginas, KPIs e relatório de ordens. Troca de veículo volta à página1; demais filtros e busca permanecem. Veículo persiste ao alternar e ao navegar Voltar/Avançar. Limpar remove vehicle_id sem perder view, contexto de contrato ou indicadores. Vínculo de assinatura continua funcionando. Nenhum catálogo não autorizado consultado; perfis sem acesso a veículos mantêm busca textual. Erros de atualização não escondem seleção nem dados antigos. Testes completos, lint/build e QA autenticada sem escrita de negócio.

## Resultado
Controles comuns extraídos para FuelEntityFilters; opções pesquisáveis preservam descrição e etiquetas. Veículo passa a usar uma única origem pela URL nas três áreas. Clearing mantém view/contrato/retorno/indicadores; navegar Voltar/Avançar reconcilia seleção e consulta. Ordens abertas passa a usar o mesmo toolbar e oferece veículo/secretaria/posto, Limpar filtros e Atualizar. Catálogos gerais de veículos e postos atualizam sob demanda nas abertas; link com veículo recebe rótulo quando autorizado. Sem permissão, mantém busca textual e filtro antigo identificável, sem consultar o catálogo.

50 regressões direcionadas/6 arquivos aprovadas, lint0 erros/39 avisos anteriores, build candidato aprovado. Suíte completa:579 testes/84 arquivos aprovados. Publicado em27/10/2026 às17:48:34 (Brasília), fontea47e2f5, somente frontend HML e sem reinício. Entrada index-BNQc-K77.js observada no navegador público; nove assets servidos conferidos.

QA autenticada em viewport padrão2213×1115, desktop1366×767/1600×900 e mobile390×843/360×800, claro/escuro. Controles comuns na mesma ordem, sem overflow horizontal; seletores mobile acima de44px. Veículo TNU5A11 retornou10 ordens,1 aberta e9 históricos, todos restritos à placa. Nas abertas, combinar outro posto retornou0 e KPIs0; o Histórico preservou seu próprio posto e9 registros. Limpar remove vehicle_id mantendo Histórico; Voltar restaura seleção, URL e dados. Entrada direta nas abertas carrega opções de veículo sob demanda e aplica o filtro corretamente. Exportação completa/combinação com secretaria/situação/datas e paginação cobertas pelas regressões.

Sessão expirou e foi renovada pelo usuário. Após recarregar a guia de QA, pacote final confirmado; console sem erros. Nenhuma emissão, confirmação, retificação, documento ou assinatura foi executada pela QA. Tema claro restaurado, emulação removida e guia temporária encerrada. A guia original foi preservada enquanto o usuário navegou para outras telas, sem recarga ou retorno forçados.

Verificação final:75 tabelas idênticas, incluindo38 tabelas de negócio/documentos; configurações/backend intactos. HML PID21064 e produção PID2512 preservados, ambos prontos. Produção limpa em31543d4; rotina06h saudável, sem nova restauração.

Capturas privadas:history-before.png, orders-desktop-light.png, history-desktop-dark.png, history-mobile-dark.png, open-orders-mobile-light.png e open-orders-desktop-light.png, no diretório de backup. Reversão do frontend anterior pronta. Sem CSS novo: reuso de operation-workspaces.css, SearchableSelect e MobileFilters.

## Pendências / decisões
- Veículo é contexto compartilhado pela URL; os demais filtros preservam seus estados independentes em cada área.
- Seletores restritos aos catálogos que o perfil já pode consultar. Um veículo informado por link permanece identificável mesmo quando não consta no catálogo atual.
- Sem ajustes de dados e sem executar novamente a tarefa06h.

## Rollback
Restaurar frontend-before, copiando assets antes da troca atômica do index. Fonte3a90e75 disponível no bundle. Sem banco, configuração ou reinício.
