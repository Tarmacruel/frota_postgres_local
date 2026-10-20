# ExecPlan — Fase 2 — listagens operacionais

## Objetivo

Carregar somente a página visível em Manutenções, Abastecimentos e Ordens abertas, mantendo filtros, foco, ações e exportações completas. Conferir Condutores, Empréstimos, Sinistros e Multas e reduzir catálogos completos de apoio quando atrasarem a abertura da tela.

## Estado inicial verificado

- 19/10/2026, branch `feature/analytics-evolution-hml`, HEAD `c66376f63349c620b15bffd416fd6523cf49d5da`.
- Working tree contém somente alterações ainda não commitadas da Fase 1. A Fase 1 foi ativada em HML para corrigir a falha observada pelo usuário; `/api/vehicles/options` passou de 404 para 401 sem sessão, e a tela autenticada de Posses carregou 127 registros ativos, 10 por página, com navegação à página 2.
- Baseline após a correção da Fase 1: frontend dirigido 22/22, build aprovado, lint anterior 0 erros/44 avisos; backend completo anterior 625 aprovados/109 ignorados. Reexecutar gates completos nesta fase.
- Manutenções carrega a lista integral; Abastecimentos carrega somente o primeiro lote de 100 para histórico e ordens; Ordens abertas também carrega o primeiro lote e recorta no navegador. Os três estados perdem registros além do lote.

## Arquivos previstos

Páginas e testes de Manutenções, Abastecimentos e Ordens abertas; filtros aditivos das rotas, serviços e repositórios correspondentes; possíveis ajustes de catálogos de apoio; este ExecPlan e `STATUS.md`.

## Alterações funcionais proibidas

Nenhuma mudança de banco, migration, autenticação, permissões, assinatura, regra de abastecimento ou produção. Endpoints e formatos legados continuam disponíveis.

## Passos de implementação

1. Reaproveitar endpoints paginados e ampliar filtros de busca, secretaria e foco onde necessário.
2. Consumir página de 10 registros no frontend, com total do servidor, cancelamento lógico de resposta antiga e correção de página inválida.
3. Carregar todos os registros filtrados apenas ao solicitar PDF/XLSX, quando houver relatório na tela.
4. Conferir listas já paginadas e catálogos de apoio; corrigir os carregamentos completos pertencentes a esta fase.

## Validação visual

Homologação autenticada, primeira/intermediária/última página, filtros e estados vazios; temas claro/escuro e largura reduzida nas telas alteradas.

## Testes e build

Testes dirigidos frontend/backend, `npm run test`, `npm run lint`, `npm run build`, suíte backend e `git diff --check`. Comparar com baseline; registrar capturas e limites.

## Resultado

Implementada e ativada somente em homologação em 19/10/2026. A API isolada da porta 6969 foi reiniciada antes do build final do frontend; banco de HML 5441 preservado. A tela de Posses permanece acessível após a correção da Fase 1. Branch `feature/analytics-evolution-hml`, HEAD `c66376f63349c620b15bffd416fd6523cf49d5da`, working tree com Fases 1 e 2 não commitadas. Nenhuma migration, alteração em produção ou arquivo de deploy.

Arquivos da Fase 2: `backend/app/api/routes/{maintenance,fuel_supplies,fuel_supply_orders}.py`, `backend/app/repositories/{maintenance_repository,fuel_supply_repository,fuel_supply_order_repository,vehicle_repository}.py`, `backend/app/schemas/maintenance.py`, `backend/app/services/maintenance_service.py`, `backend/tests/test_maintenance_service.py`, `frontend/src/api/vehicles.js`, `frontend/src/pages/{MaintenancePage,FuelSuppliesPage,FuelSupplyOrdersPage,ClaimsPage,FinesPage}.jsx`, testes de Manutenções e Abastecimentos, este plano e `STATUS.md`. O repositório de veículos recebeu os campos aditivos `renavam` e `is_provisional` no catálogo leve.

Manutenções, Abastecimentos e Ordens abertas solicitam 10 registros por página. Os totais vêm da API. Busca de ordem por número, placa e outros campos funciona em todas as páginas; busca de manutenção abrange serviço, peças, placa e secretaria. Contadores de ordens abertas e alertas fazem consultas pequenas próprias. PDF/XLSX de Manutenções e Ordens busca todos os lotes filtrados apenas sob demanda.

Backend completo: 625 aprovados/109 ignorados/7 avisos. Frontend completo: 312/312 em 60 arquivos; teste dirigido final de Manutenções e Abastecimentos: 14/14. Lint: 0 erros/43 avisos, versus baseline anterior de 44; build isolado e `npm run build` aprovados; `git diff --check` aprovado. HTML público de HML serviu o mesmo asset `index-DMR67m4H.js` do build local, com HTTP 200 e saúde de app/banco OK.

HML autenticada: Manutenções exibiu 3 registros, com busca reduzindo a 1; Ordens abertas exibiu estado vazio válido; Abastecimentos exibiu 204 abastecimentos e 115 alertas, com 10/10/4 linhas na primeira/intermediária/última página do histórico e 9 linhas na página 49 das ordens. Busca por número de ordem retornou o registro esperado. Sinistros e Multas carregaram após a troca para o catálogo leve. QA visual em tema claro/escuro, desktop e 390×844. Capturas: `output/playwright/phase2/` (ignoradas pelo Git). Nenhum erro novo de console após ativação da Fase 2.

Limites: a base de HML tem só três Manutenções e nenhuma Ordem aberta; a segunda página de Manutenções e a coleta de mais de 100 registros para PDF foram verificadas por teste. A coleta integral de ordens para XLSX foi verificada por teste. Não houve geração real de PDF/XLSX no navegador, conta de teste com escopo restrito nem medição comparável de tempo/bytes antes/depois. O catálogo de infrações permanece para a Fase 3.

## Pendências / decisões

Usuário autorizou explicitamente iniciar a Fase 2 em 19/10/2026 após apontar e solicitar correção da falha de Posses em HML. Parar antes da Fase 3, que exige validação e autorização separadas.

## Rollback

Reverter somente os diffs da Fase 2, preservando a Fase 1 já ativada em homologação.
