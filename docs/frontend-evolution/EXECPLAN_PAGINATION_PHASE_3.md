# ExecPlan — Fase 3 — gestão e dados de apoio

## Objetivo

Paginar listagens administrativas e adiar catálogos volumosos até seu uso, preservando filtros, permissões, seleção integral e exportações completas em homologação.

## Estado inicial verificado

- 19/10/2026, branch `feature/analytics-evolution-hml`, HEAD `c66376f63349c620b15bffd416fd6523cf49d5da`.
- Working tree contém as alterações ainda não commitadas das Fases 1 e 2, já ativas em HML. Baseline da Fase 2: frontend 312/312, lint 0 erros/43 avisos, build aprovado; backend 625 aprovados/109 ignorados.
- Cadastros recorta catálogos completos no cliente; Postos carrega todos os postos e até 200 usuários; Usuários recebe apenas os primeiros 50; Auditoria recebe apenas os primeiros 200 logs e 50 usuários. Catálogo de infrações corta em 500. Importações carregam até 5000 veículos e 500 infrações ao abrir. Pagamentos carrega fornecedores e contratos completos.

## Arquivos previstos

Telas de Cadastros, Postos, Usuários, Auditoria, Multas, Importações, Pagamentos e componentes associados; APIs, rotas e repositórios aditivos necessários; testes dirigidos; este ExecPlan e `STATUS.md`.

## Alterações funcionais proibidas

Nenhuma migration, mudança de banco, permissão, regra de negócio, autenticação ou produção. Endpoints e payloads antigos continuam disponíveis. PDF/XLSX preservam o conjunto filtrado integral.

## Passos de implementação

1. Criar respostas paginadas aditivas e filtros no servidor para tabelas administrativas que hoje perdem registros ou carregam coleções inteiras.
2. Adaptar cada tela para buscar a página visível, restaurar página válida após atualização/exclusão e ignorar respostas antigas.
3. Carregar catálogos de apoio ao abrir o formulário ou mediante busca, preservando a possibilidade de selecionar qualquer registro permitido.
4. Revisar dashboards, pagamentos e importações e manter coleta completa apenas durante exportação.

## Validação visual

Conferir em HML primeira/intermediária/última página, busca, filtros, estados vazios, tema claro/escuro, desktop e largura reduzida; guardar capturas em `output/playwright/phase3/`.

## Testes e build

Rodar testes dirigidos, `npm run test`, `npm run lint`, `npm run build`, backend pertinente e `git diff --check`. Registrar antes/depois de tempo e volume se mensurável na mesma base.

## Resultado

- Fase 3 implementada e ativada somente em `https://testefrota.sirel.com.br`; produção e arquivos de deploy de produção não foram alterados. Branch e HEAD permaneceram os do estado inicial; working tree já continha as Fases 1 e 2 e segue sem commit.
- Arquivos desta fase: `backend/app/api/routes/{audit,data_imports,fines,fuel_stations,payment_processes,users,vehicles}.py`, os repositórios, serviços e schemas correspondentes; `frontend/src/api/{dataImports,fines,fuelStations,paymentProcesses}.js`, `frontend/src/components/FineInfractionsCatalog.jsx`, `frontend/src/hooks/useMasterDataCatalog.js`, `frontend/src/pages/{AdminAnalyticsDashboard,AuditPage,CadastrosPage,ClaimsPage,DashboardPage,DataImportsPage,FinesPage,FuelStationsPage,PaymentProcessesPage,UsersPage}.jsx`, `frontend/src/styles.css`, testes dirigidos dessas telas, este plano e `STATUS.md`. Os diffs de outros arquivos no working tree pertencem às Fases 1 e 2 e foram preservados.
- Endpoints paginados aditivos para Usuários, Auditoria, Postos, infrações CTB, contratos e lotes de importação. APIs antigas continuam disponíveis. As tabelas consultam apenas a página exibida, com busca e totais no servidor. Usuários, Auditoria, Postos e contratos mantêm filtros, contadores e seleção. Exportações PDF/XLSX coletam o conjunto filtrado completo somente quando solicitadas.
- Cadastros monta o catálogo de infrações somente ao abrir a aba. As 21 secretarias, 42 departamentos e 56 lotações continuam disponíveis integralmente para a hierarquia, formulários e ações em lote; o volume é pequeno nesta base e a seleção de qualquer registro foi preservada. Nove telas que só precisam de secretarias passaram a consultar apenas `/master-data/organizations`.
- Importar/Exportar pagina lotes e linhas; os seletores de veículos e infrações buscam ao abrir ou pesquisar, inclusive registros fora dos primeiros 30. Pagamentos usa opções leves para filtros e contratos paginados para a tabela. O Dashboard usa endpoints de resumo/página mínima; Análises continuou carregando os indicadores com o catálogo leve de secretarias.
- Validação autenticada em HML: Usuários 47 registros em cinco páginas, última com sete; filtro de Posto retornou um registro, busca sem resultado exibiu estado vazio e manteve contadores globais. Auditoria 7.498 eventos em páginas de 20, última página 375 com 18; filtro DELETE retornou 58 e a combinação DELETE + VEHICLE retornou 18. Infrações CTB 433 em 37 páginas, última com um registro; busca pelo código 7820 encontrou o item. Postos mostrou um registro, e a busca sob demanda localizou usuário fora dos primeiros 30. Contratos mostrou dois registros e um resultado para a busca `2-860`. Lote de 530 linhas apresentou 11 páginas; seletores do ajuste localizaram veículo e infração fora do lote inicial. O formulário de Multas também encontrou a infração 7820. Análises exibiu indicadores sem erro.
- Temas claro e escuro, desktop e 390×844 conferidos. Corrigida quebra de texto em cartões de tabela móvel quando há e-mail longo; a linha passou a medir 295 px, igual à tabela, em viewport de 390 px. Capturas em `output/playwright/phase3/` (ignoradas pelo Git): `audit-desktop-light.png`, `users-desktop-light.png`, `users-mobile-dark.png`, `infractions-desktop-light.png`, `fuel-stations-desktop-light.png`, `contracts-desktop-light.png`, `imports-desktop-light.png`, `analytics-desktop-dark.png`.
- Backend completo: 625 aprovados/109 ignorados/7 avisos, igual ao baseline. Frontend completo: 316/316 em 61 arquivos, ante 312/312 em 60 arquivos na Fase 2. Lint frontend: 0 erros/40 avisos, ante 43 avisos na Fase 2. Build aprovado; HML pública respondeu HTTP 200 com os hashes atuais de CSS/JS, e a API/banco respondeu `status: ok`. `git diff --check` aprovado. Testes dirigidos de exportação de todas as páginas e falha de requisição passaram.

## Pendências / decisões

Fase 3 autorizada expressamente pelo usuário em 19/10/2026. Parar após a validação; qualquer fase seguinte exige nova autorização.

- A comparação de tempo/bytes antes e depois na mesma base não é recuperável, pois não houve captura anterior à Fase 3. Os limites de 10, 12, 20 ou 50 registros por página foram confirmados por código e pelos totais/linhas da HML, sem atribuir um ganho percentual não medido.
- Não havia credencial de perfil com escopo restrito para reteste autenticado. Permissões dos endpoints novos replicam as exigências das rotas correspondentes; a suíte do backend e os testes existentes passaram.
- PDFs/XLSX não foram abertos no navegador nesta fase; testes verificam a coleta de todas as páginas filtradas antes de exportar. Falhas de listagem foram verificadas com respostas simuladas em testes, sem desligar a API pública de HML.
- Não foram executadas operações de escrita de negócio nem alterações de banco. A fase termina aqui, sem iniciar outra.

## Rollback

Reverter apenas os diffs desta fase, preservando as Fases 1 e 2.

### Correção posterior — PDF de todas as posses — 19/10/2026

- O usuário relatou HTTP 422 ao gerar o PDF com a aba “Todas”. A base de HML contém 1.583 posses; o relatório configurável tinha limite próprio de 1.500 linhas, apesar de a listagem e o XLSX incluírem mais registros.
- `backend/app/services/possession_report_service.py`: limite de PDF ampliado para 5.000 linhas, igual ao limite já usado pelo XLSX. Consulta integral, escopo do usuário, filtros, auditoria e contrato da API preservados. Nenhum dado ou migration foi alterado.
- `frontend/src/components/PossessionReportBuilder.jsx`: falhas de respostas binárias agora extraem a mensagem da API e a exibem junto das ações quando o modal está fechado. Testes dirigidos em `backend/tests/test_phase6_possession_reports.py` e `frontend/src/components/PossessionReportBuilder.test.jsx`.
- Gates finais: backend 626 aprovados/109 ignorados/7 avisos; frontend 317/317 em 61 arquivos; lint 0 erros/40 avisos, igual ao baseline; build aprovado; `git diff --check` aprovado. O bundle `index-CwXxlqyp.js` servido em HML tem SHA-256 idêntico ao build local.
- HML autenticada: aba “Todas” exibiu 1.583 posses; a pré-visualização concluiu e abriu nova guia com título “Relatório configurável de posses”. A auditoria do servidor registrou `REPORT_PREVIEW`, modo `POSSESSION`, 1.583 registros, `SUCCESS`, 3.941 ms. O conteúdo da guia `blob:` não foi inspecionado por restrição do navegador; o teste backend gerou bytes PDF e confirmou os 1.583 registros preparados. Produção permaneceu inalterada.
- O limite operacional de 5.000 linhas continua ativo. Se o conjunto filtrado o ultrapassar, a API retorna erro e a mensagem específica aparece ao lado dos botões.
