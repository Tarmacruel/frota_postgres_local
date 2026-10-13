# ExecPlan — Fase 3 — Visão Geral

## Objetivo
Implantar somente o cockpit da Visão Geral em `/analytics`, usando os dados reais V2 e mantendo as demais seções legadas. Drawer continua placeholder, sem conteúdo da Fase 4.

## Estado inicial verificado
- Branch `feature/analytics-evolution-hml`; HEAD `082af32dee326408d023d0133272ae8eaa71eb20`.
- Working tree contém as Fases 1/2 não commitadas; preservar. Preflight em `storage/loan-tests/analytics-phase-3/preflight.txt`.
- Instruções/master/fase lidos; mestre e fase ainda consultados no pacote original. Baseline frontend novo: 243 testes, 45 avisos/0 erros, build aprovado. Backend fase anterior: 70 testes.

## Arquivos previstos
- Componente de cockpit e filtros, hook/API V2, formatadores e testes; integração incremental em AdminAnalyticsDashboard e CSS centralizado.
- Leituras V2 aditivas de situação cadastral e atenção, schemas/testes; necessárias ao conteúdo funcional autorizado da Fase 3. Nenhuma alteração V1 ou migration.
- Documentação, logs e screenshots.

## Direção visual
Tese: painel institucional compacto, com valores comparáveis e evidências próximas às decisões. Conteúdo: filtros, faixa de quatro KPIs, mudanças e principais veículos, custos, situação atual, alertas e qualidade. Interação: foco visível, filtros/chips explícitos, drawer existente; movimento discreto respeitando redução de movimento. Reutilizar tokens, Recharts e miniaturas existentes, sem novas imagens/frameworks.

## Decisões
- Resumo/períodos usam exclusivamente V2. Situação da frota descreve **status cadastral atual**, não disponibilidade histórica ou utilização.
- Atenção ordena veículos por anomalias já registradas e aumento absoluto de custo; informa regra e limite, sem inventar score/probabilidade. Cada entidade abre o shell existente.
- Alertas resumem flags de consumo registradas no recorte, não workflow ou pendências administrativas. Sem afirmar causa comprovada do aumento.
- Três consultas independentes: summary, atenção/alertas e situação atual. Falha afeta somente os blocos dependentes da fonte; retry não refaz fontes saudáveis.
- Datas explícitas e comparação com dias encerrados; formulários aplicam filtros ao confirmar. Filtros V2 mantidos ao trocar de seção; demais seções preservam seus filtros/exports V1 e são identificadas como análises anteriores.
- Exportação V1 permanece em Relatórios; não afirmar que ela exporta o cockpit V2.

## Alterações funcionais proibidas
Sem produção, migrations, alterações de permissões/escopo, fórmulas V2 aprovadas, novos dados inferidos, conteúdo de drawer ou outras fases.

## Passos
- [x] Preflight e leitura.
- [x] Baseline e contratos complementares V2 testados.
- [x] Cockpit e interação com estados independentes.
- [x] Testes backend/frontend, lint/build.
- [x] Screenshots claro/escuro/mobile, documentação/status e parada.

## Validação visual
Somente homologação localhost:6969; reiniciar exclusivamente API HML para ativar leituras V2 e construir frontend. Capturas em `output/playwright/analytics-phase-3/`. Dados reais da HML e cenários fictícios isolados nos testes.

## Testes e build
Comparar baseline; testes de consultas/escopo, ranking e valores ausentes, períodos e formatos, erros parciais/retry, filtros, navegação/foco/drawer e preservação da exportação V1. Gates npm completos.

## Resultado
Implementada somente em HML; [entrega, arquivos e evidências](DELIVERY_PHASE_3.md). Backend 75 testes; frontend 251 testes/51 arquivos; lint 0 erros e mesmos 45 avisos; build aprovado. Runner sem instabilidade. Chromium autenticado confirmou três leituras V2, ausência de V1 no cockpit, falha parcial/retry isolado, foco/drawer e datas preservadas. Sete capturas claro/escuro/celular. Pequeno overflow do tooltip identificado no redimensionamento e corrigido; lint/build repetidos, navegador confirmou ausência de overflow. Console final sem erros/avisos. Fase 4 não iniciada; sem produção, migration, commit ou push.

## Pendências / decisões
Não antecipar detalhe, relatórios V2, métricas de utilização ou workflow. Mudanças e alertas refletem registros e cobertura, não diagnóstico operacional definitivo.

## Rollback
Reverter somente diff desta fase e reconstruir HML. Sem reversão de schema/dados.
