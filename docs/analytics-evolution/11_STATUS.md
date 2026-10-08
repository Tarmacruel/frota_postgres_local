# Status — Evolução Analytics

Atualizado em 07/10/2026. Histórico inicial preservado no pacote de origem `FROTA_SIREL_ANALYTICS_EVOLUTION_PACKAGE/docs/analytics-evolution/11_STATUS.md`, que tinha Fase 0 PENDENTE e demais fases BLOQUEADAS. Este é o status de execução no diretório definitivo; o pacote original não foi alterado.

| Fase | Estado | Data | HEAD inicial | HEAD final | Observações |
|---|---|---|---|---|---|
| 0 | AUDITORIA CONCLUÍDA — AGUARDA VALIDAÇÃO | 2026-10-06 | 738ebb7 | 738ebb7 | [Baseline e decisões](BASELINE_PHASE_0.md); sem alteração funcional |
| 1 | IMPLEMENTADA EM HML — AGUARDA VALIDAÇÃO | 2026-10-06 | 082af32 | working tree sobre 082af32 | [Entrega, arquivos e capturas](DELIVERY_PHASE_1.md); somente fundação V1 |
| 2 | IMPLEMENTADA EM HML — AGUARDA VALIDAÇÃO | 2026-10-07 | 082af32 | working tree sobre 082af32 | [Contrato, decisões e evidências](API_V2_PHASE_2.md); V1 intacta, sem migration |
| 3 | IMPLEMENTADA EM HML — AGUARDA VALIDAÇÃO | 2026-10-07 | 082af32 | working tree sobre 082af32 | [Cockpit, arquivos, testes e capturas](DELIVERY_PHASE_3.md); drawer somente shell |
| 4 | BLOQUEADA | | | | Drawer/drill-down |
| 5 | BLOQUEADA | | | | Custos |
| 6 | BLOQUEADA | | | | Combustível |
| 7 | BLOQUEADA | | | | Manutenção |
| 8 | BLOQUEADA | | | | Utilização |
| 9 | BLOQUEADA | | | | Condutores |
| 10 | BLOQUEADA | | | | Alertas/workflow |
| 11 | BLOQUEADA | | | | Relatórios |
| 12 | BLOQUEADA | | | | QA/performance |

## Log

### 2026-10-07 — Fase 3

- Executada somente em `feature/analytics-evolution-hml`, HEAD `082af32dee326408d023d0133272ae8eaa71eb20`; alterações não commitadas das Fases 1/2 preservadas. [Preflight](evidence/phase-3/preflight.txt), [ExecPlan](EXECPLAN_PHASE_3.md) e [entrega/lista de arquivos](DELIVERY_PHASE_3.md).
- Visão Geral em `/analytics` usa V2: quatro KPIs comparativos, O que mudou, evolução/distribuição de custos, status cadastral atual da frota, atenção por veículo, resumo de flags de consumo e qualidade/cobertura. Nenhuma inferência de pagamento, causa, disponibilidade histórica ou responsabilidade pessoal.
- Leituras aditivas `fleet-status` e `attention`, com filtros/permissões/escopo existentes, somente leitura e consultas agrupadas. Fórmulas da Fase 2 e km de posses encerradas válidas preservados. V1 intacta; demais seções e exportação anteriores mantidas e identificadas.
- Três fontes independentes, erro/retry por dependência, respostas antigas descartadas, datas/tipo/secretaria aplicados explicitamente, chips e filtros preservados. Miniaturas existentes conforme tipo. Drawer somente shell; nenhuma implementação da Fase 4.
- Baseline novo: **243 testes / 50 arquivos**, lint **0 erros / 45 avisos**, build aprovado. Final: **251 testes / 51 arquivos**, lint **0 erros / mesmos 45 avisos**, build aprovado. Backend **75 passed**, incluindo cinco novos casos de ranking/limite/escopo/permissão. `compileall` e `git diff --check` aprovados. Runner completo normal (116,21 s).
- API local HML reiniciada com validação de identidade do processo; PostgreSQL não reiniciado, nenhuma migration. Chromium real autenticado em `localhost:6969`: três requests V2 e nenhum V1 no cockpit; claro/escuro, desktop/celular, Enter/Escape/foco e filtros; erro 503 simulado por interceptação somente no navegador e retry restrito à fonte. Tooltip corrigido para não gerar overflow horizontal no celular; gates lint/build repetidos. Console final **0 erros / 0 avisos**.
- Sete screenshots em `output/playwright/analytics-phase-3/`; logs e scripts em `evidence/phase-3/`. Sem produção, commit ou push. Fase 3 encerrada para validação; **Fase 4 permanece bloqueada**.

### 2026-10-07 — Fase 2

- Executada somente em `feature/analytics-evolution-hml`, HEAD `082af32dee326408d023d0133272ae8eaa71eb20`; Fase 1 não commitada preservada. Preflight em `evidence/phase-2/preflight.txt`. [ExecPlan](EXECPLAN_PHASE_2.md) e [entrega/arquivos](API_V2_PHASE_2.md).
- Nova API paralela `GET /api/analytics/v2/summary`: filtros comuns validados, schemas, comparação com período anterior equivalente, meses consecutivos, metadados e cobertura. Datas civis encerradas em `America/Bahia`, limites UTC com fim exclusivo. Dia atual/futuro rejeitado nesta fundação.
- Fonte de km explicitamente aprovada pelo usuário: **somente posses encerradas e válidas**. Exclui leituras ausentes/não finitas/regressivas, duração inválida, posses parcialmente fora do período e sobreposições; sem rateio ou soma adicional de viagens. Razões calculadas pelos totais dos mesmos veículos com km válido, com cobertura parcial e limitações explícitas.
- Custos registrados mantêm combustível + manutenção por início + multas de todos os status, detalhadas por status; não são denominados pagos/liquidados. Sinistros estimados separados; nenhuma inferência sobre pagamento ou benchmark de mercado.
- Permissão `analytics:view` e escopo organizacional existentes reutilizados. Tipo/veículo filtram todas as fontes; responsabilidade explícita ou histórica no evento/início da posse. Eventos históricos incluem cadastros hoje inativos. V1, API client, rotas frontend e telas sem alteração nesta fase.
- N+1 eliminado **na V2**: duas consultas agrupadas por summary, incluindo períodos e contagens de condutores, sem gravação de snapshots. V1 continua compatível e conserva seu comportamento anterior até migração futura de consumidores.
- Baseline backend novo: **29 passed**. Final: **70 passed** (29 regressões, 36 testes V2 unitários/rota e 5 PostgreSQL), `compileall` e `git diff --check` aprovados. Testes incluem permissões, isolamento de órgão/concorrência, datas, meses, faltantes, razões ponderadas, km e quantidade de consultas.
- PostgreSQL: fixtures fictícias somente em CTEs, sem DDL/DML; sonda sobre base HML em read-only confirmou duas consultas por escopo, zero escritas, snapshots inalterados e Alembic antes/depois `0049_justification_suggestions`. [Resultado](evidence/phase-2-readonly.json). Nenhuma migration executada.
- Gates frontend adicionais: **243 passed / 50 arquivos**, lint **0 erros / 45 avisos preexistentes**, build aprovado. Runner sem falhas; resultados iguais aos da Fase 1. Logs em `evidence/phase-2/`.
- Sem frontend novo, não houve nova captura visual nesta fase; screenshots da Fase 1 mantidos. Endpoint validado em ASGI e SQL/serviço no HML; API em execução não reiniciada. Sem commit/push/deploy de produção. Fase 2 encerrada para validação; **Fase 3 permanece bloqueada**.

### 2026-10-06 — Fase 1

- Execução autorizada expressamente pelo usuário; limitada à branch `feature/analytics-evolution-hml`, HEAD `082af32dee326408d023d0133272ae8eaa71eb20`. Working tree limpo no preflight. Produção não acessada nesta fase.
- [ExecPlan próprio](EXECPLAN_PHASE_1.md). Documentos mestre/fase e starter kit consultados no pacote original, preservado, porque esses caminhos ainda não estão instalados na raiz.
- Implementados navegação com oito seções em `/analytics?view=...`, componentes base reutilizáveis, filtros V1 compactos, estados por consulta, repetição de falhas e shell lateral acessível com pilha. Sem cálculos, endpoints ou dados novos.
- Visão Geral conserva todos os blocos V1; demais seções reorganizam consultas existentes. Manutenção/Utilização e drawer informam indisponibilidade do detalhe. Exportação PDF/XLSX e expansão inline de veículos preservadas.
- Rótulos esclarecidos conforme D02: custo operacional por km, referência configurada sem alegação de mercado, frota não inativa; opções de exportação mantidas com aviso sobre conteúdo fixo. Fórmulas permanecem inalteradas.
- Baseline novo: **229 testes / 48 arquivos**, lint **0 erros / 46 avisos**, build aprovado. Final: **243 testes / 50 arquivos**, lint **0 erros / 45 avisos**, build aprovado; após ajuste visual final, **15 testes focados aprovados**, lint/build repetidos. Runner terminou sem falha ou travamento; execução completa em 126,60 s.
- Chromium autenticado em `http://localhost:6969/analytics`: claro/escuro, desktop 1440×1050, celular 390×844, seções, export modal, Escape/foco e ausência de overflow geral verificados. Console final sem erros/avisos. Dez screenshots em `output/playwright/analytics-phase-1/`.
- Backend, API client, permissões, rota protegida, schema e deploy sem alterações. GETs V1 podem gravar seus snapshots habituais somente em HML. Nenhuma operação administrativa foi criada para validar esta UI.
- [Lista completa de arquivos e evidências](DELIVERY_PHASE_1.md). Fase 1 encerrada para validação; Fase 2 permanece bloqueada. Sem commit/push ou publicação em produção nesta execução.

### 2026-10-06 — Fase 0

- Estado inicial: `D:\FROTAS\frota_emprestimos_testes`; branch `feature/frontend-evolution-hml`; HEAD `738ebb7e2049f8558e0f38da88075bd435eadda8`; somente o pacote Analytics estava não rastreado. Preflight registrado antes de editar.
- Leitura: AGENTS/runbook/PLANS/design system reais e documentos correspondentes dentro do pacote, pois os caminhos Analytics ainda não estavam instalados na raiz. Nenhum componente de exemplo copiado para a aplicação.
- Alterações: somente este status, `BASELINE_PHASE_0.md` e `evidence/` com duas sondas documentais, dois resultados JSON e logs/preflight. Não alterados frontend/backend funcionais, permissões, contratos, banco ou migrations.
- Evidências: oito pontos do baseline original confrontados com código e casos reproduzíveis; 17 achados no total, mapa de fórmulas/fontes/rotas, escopo histórico, qualidade e campos ausentes. SQL e índices efetivos registrados sem dados identificadores.
- Banco: somente HML em `127.0.0.1:5441/frota_emprestimos_testes`, transação read-only com rollback; schema `0049_justification_suggestions`. Nenhuma consulta à produção.
- Testes novos de baseline: frontend **229 passed / 48 arquivos**; lint **0 erros / 46 warnings existentes**; build aprovado. Backend Analytics **11 passed**; permissões/fundação de escopo **18 passed**. Runner sem instabilidade nesta execução. Logs em `evidence/test-results/` e `storage/loan-tests/analytics-phase-0/`.
- Cobertura limitada: não foram executados os testes de integração que criam PostgreSQL e aplicam migrations; sondas de cálculo usam banco simulado, não são teste de carga ou validação de API ponta a ponta.
- Screenshots: referências locais `01_ATUAL_ANALYTICS_TOPO.png` e `10_PREVIA_ALVO_COMPOSITE.png` inspecionadas. Não houve captura autenticada nova: os GETs globais atuais gravam snapshots. Nenhuma aprovação visual claro/escuro/mobile foi declarada; nenhuma tela foi modificada.
- Principais impedimentos: km por amplitude de abastecimentos; corte UTC/inconsistência com datas de multas; meses omitidos por recuo de 31 dias; consultas 5+3D repetidas; GET com gravação; referência “mercado” sem proveniência; filtros/exportação parciais; lacunas de dados.
- Decisões antes da Fase 1: navegação e limites da apresentação (D01), rótulos/exportação compatíveis com capacidades reais (D02).
- Decisões antes da Fase 2: janela/fuso, fonte e validade de km, ponderação, status/regime dos custos, universo/organização histórica, abrangência dos filtros, referências/alertas e arquitetura das consultas (D03–D10 no baseline).
- HEAD final igual ao inicial; sem commit/push/deploy. Fase 0 encerrada para validação. Não avançar automaticamente.
