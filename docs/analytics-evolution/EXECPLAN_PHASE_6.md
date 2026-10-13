# ExecPlan — Fase 6 — Combustível

## Objetivo

Entregar em HML análise rastreável de abastecimentos, valor, litros, preço/L, km de posses válidas, razão km/L, evolução, ranking, posto e anomalias verificáveis. Cada anomalia expõe regra, amostra e registro original no drawer existente.

## Estado inicial verificado

- Branch `feature/analytics-evolution-hml`; HEAD `74c53a7ece48e40a9676127b31653d313482277b`.
- `git status --short --branch` antes da edição: alterações locais não commitadas das Fases 4 e 5 em API/repositório/testes V2, status, cliente/componentes/página/CSS Analytics; novos serviços/testes de detalhe e custos, ExecPlans 4/5, componente/teste de Custos. Preservar tudo.
- Baseline documentado da Fase 5: frontend 262 testes/53 arquivos, lint 0 erros/45 avisos, build aprovado; backend Analytics 42 testes focados e 6 PostgreSQL somente leitura.
- Plano mestre e fase lidos em `FROTA_SIREL_ANALYTICS_EVOLUTION_PACKAGE/` porque os caminhos raiz indicados não existem.

## Arquivos previstos

- Serviço/repositório/rota V2 de combustível e testes.
- Cliente V2, seção Combustível, integração na página Analytics e drawer de abastecimento, CSS e testes.
- Este plano e `11_STATUS.md`.

## Alterações funcionais proibidas

Não modificar V1, cadastro, fluxos de ordem/abastecimento, regras persistidas de anomalia, comprovantes, modelos, migrations, autenticação, permissões, PDF/XLSX ou deploy. Não transformar litros abastecidos em consumo efetivo nem inferir tanque cheio.

## Passos de implementação

1. Reusar filtros civis V2, `analytics:view`, escopo histórico `responsible_to`, fonte de km de posses válidas e permissões de leitura do módulo de abastecimentos.
2. Consultar eventos escalares em lote, ordenar por veículo/data e calcular agregados com tratamento explícito de ausências.
3. Definir regras analíticas versionadas e documentadas: volume acima de capacidade cadastrada com 2% de tolerância; hodômetro regressivo; abastecimentos até 24 h e até 10 km; razão de intervalo km/L fora de 70–140% da mediana de ao menos cinco intervalos anteriores comparáveis do mesmo veículo/combustível; preço/L fora de ±30% da mediana de ao menos cinco abastecimentos anteriores no mesmo posto/combustível nos 90 dias anteriores. Essas bandas são critérios de triagem, não diagnóstico de fraude ou consumo real. Amostra insuficiente suprime o alerta estatístico.
4. Mostrar KPIs, evolução, ranking, postos, qualidade e anomalias, cada uma com regra/amostra e acesso ao abastecimento/veículo/recibo pelo drawer existente.
5. Preservar a comparação V1 sob demanda, identificando seu critério próprio.

## Validação visual

Inspecionar Analytics Combustível em claro/escuro desktop e celular, navegação do alerta até o registro, foco/Voltar e overflow. Salvar capturas em `output/playwright/analytics-phase-6/`.

## Testes e build

Executar testes focados de cálculo/escopo/permissão e SQL PostgreSQL read-only quando aplicável; depois `npm run test`, `npm run lint`, `npm run build`, `compileall` e `git diff --check`.

## Resultado

Implementada em HML no branch `feature/analytics-evolution-hml`, HEAD inicial/final `74c53a7ece48e40a9676127b31653d313482277b`, sem commit, push, migration ou publicação em produção. A API e a tela V2 consultam registros existentes; os cinco tipos de anomalia são regras de triagem somente leitura. A inspeção em banco real identificou e corrigiu a composição do km/L agregado para usar km e litros dos mesmos veículos abastecidos no recorte.

Verificação: 48 testes focados de backend, 6 sondas PostgreSQL somente leitura, 266 testes de frontend em 54 arquivos, lint 0 erros/45 avisos preexistentes, build, `compileall` e `git diff --check` aprovados. Chromium HML autenticado: anomalia → abastecimento com regra/amostra, posto → lista → abastecimento, tema claro/escuro, móvel 390 px sem overflow horizontal, console 0 erros/0 avisos. Capturas em `output/playwright/analytics-phase-6/`.

Arquivos funcionais desta fase: `backend/app/services/analytics_v2_fuel.py`, `backend/app/api/routes/analytics_v2.py`, `backend/tests/test_analytics_v2_fuel.py`, `frontend/src/api/analyticsV2.js`, `frontend/src/components/analytics/AnalyticsFuel.jsx`, `AnalyticsFuel.test.jsx`, `AnalyticsEntityDrawer.jsx`, `AnalyticsEntityDrawer.test.jsx`, `frontend/src/pages/AdminAnalyticsDashboard.jsx`, `AdminAnalyticsDashboard.test.jsx`, `frontend/src/styles/analytics-evolution.css`. Documentação: este plano e `11_STATUS.md`. Os arquivos compartilhados já tinham alterações locais das Fases 4 e 5, preservadas.

## Pendências / decisões

As regras novas serão somente analíticas e não alterarão a flag `is_consumption_anomaly` persistida. Os dados não incluem marcador estruturado de tanque cheio; km/L é uma razão de abastecimentos ou posses indicada com sua fonte e limitação.

## Rollback

Reverter apenas os arquivos desta fase, preservando as alterações locais das Fases 4 e 5 identificadas no preflight.
