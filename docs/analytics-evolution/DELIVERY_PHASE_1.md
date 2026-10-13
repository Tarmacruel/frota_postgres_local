# Entrega — Fase 1: fundação visual e navegação

Concluída em 06/10/2026 somente na homologação `feature/analytics-evolution-hml`, working tree sobre `082af32dee326408d023d0133272ae8eaa71eb20`. Sem commit/push nesta execução. Fase 2 não iniciada.

## Comportamento entregue

`/analytics` preservada e protegida pelo mecanismo existente. O parâmetro opcional `view` seleciona uma das oito seções e preserva outros parâmetros; valor desconhecido apresenta Visão Geral. Filtros locais permanecem ao alternar seções e abrir/fechar o drawer. Como antes, recarregar a página reinicia os filtros; não foi introduzida persistência entre contas.

Visão Geral contém os quatro KPIs, gráficos e tabelas anteriores. Custos, Combustível, Condutores e Alertas reorganizam esses mesmos resultados, sem requisições ao alternar abas. Manutenção e Utilização têm mensagem explícita de indisponibilidade da análise específica. Relatórios oferece o modal PDF/XLSX existente.

As seis consultas V1 e seus parâmetros são preservados. Cada bloco distingue carregamento, vazio e erro, permitindo repetir a consulta com falha. Respostas de filtros anteriores são descartadas. Não são calculados novos indicadores nem corrigidas fórmulas nesta fase.

Links de entidades abrem somente o shell de detalhe: nenhum endpoint adicional. Pilha suporta abrir, substituir, voltar e fechar. Escape volta um nível ou fecha a raiz; Fechar encerra a pilha e restaura foco. O botão Detalhes inline da tabela de veículos continua disponível.

Rótulos ajustados à semântica já auditada: “Custo operacional por km” em vez de afirmar custo total de propriedade; referência configurada sem alegação de pesquisa de mercado; frota ativa descrita como veículos não inativos. Os valores/formatações e os limites de linhas V1 permanecem. As opções da exportação continuam enviadas, com aviso de que ainda não modificam seu conteúdo fixo.

## Validação

| Verificação | Baseline novo | Final |
|---|---|---|
| `npm run test` | 229 passed / 48 arquivos, 75,88 s | 243 passed / 50 arquivos, 126,60 s |
| `npm run lint` | 0 erros / 46 avisos | 0 erros / 45 avisos |
| `npm run build` | aprovado | aprovado |
| Testes focados após últimos ajustes visuais | — | 15 passed / 3 arquivos |
| `git diff --check` | — | aprovado |
| Console Chromium autenticado | — | 0 erros / 0 avisos |

Os 14 testes novos cobrem contratos V1, navegação por teclado, query string, retenção de filtros, expansão inline, placeholder, falha parcial/retry, carregamento sem zeros fictícios por falha, resposta atrasada, abas sem dados novos, exportação PDF/XLSX, erro de exportação, pilha, Escape, Tab e retorno de foco. O teste do Modal existente também passou.

O runner completo terminou normalmente; não reproduziu a instabilidade histórica. A diferença de duração, isoladamente, não foi tratada como regressão do produto. Não foi alterada configuração do runner. Os ajustes finais de especificidade CSS e atributos de foco das tabelas foram seguidos de nova execução focada e de lint/build.

Logs: [baseline](evidence/phase-1/baseline-test.log), [suíte final](evidence/phase-1/final-test.log), [testes focados](evidence/phase-1/focused-final.log), [lint](evidence/phase-1/final-lint.log), [build](evidence/phase-1/final-build.log), [preflight](evidence/phase-1/preflight.txt), [navegador](evidence/phase-1/browser-check.log), [dimensões finais](evidence/phase-1/browser-final.log).

Não houve alteração de backend; não foram repetidos testes de cálculo/backend nem executados testes de carga. Verificação de permissões nesta fase foi preservação estática da rota/API e uso de conta técnica administrativa em HML; não se declara nova matriz ponta a ponta de perfis.

## Evidências visuais

Chromium, ambiente local de homologação `http://localhost:6969`, conta técnica de testes. Desktop 1440×1050 e celular 390×844. As imagens registram os dados disponíveis após a atualização prévia da base de HML, sem dados inventados na aplicação.

| Captura | Arquivo |
|---|---|
| Visão Geral clara | [01-light-desktop.png](../../output/playwright/analytics-phase-1/01-light-desktop.png) |
| Visão Geral escura | [02-dark-desktop.png](../../output/playwright/analytics-phase-1/02-dark-desktop.png) |
| Custos escuro | [03-dark-costs.png](../../output/playwright/analytics-phase-1/03-dark-costs.png) |
| Drawer escuro | [04-dark-drawer.png](../../output/playwright/analytics-phase-1/04-dark-drawer.png) |
| Celular escuro | [05-dark-mobile.png](../../output/playwright/analytics-phase-1/05-dark-mobile.png) |
| Celular claro | [06-light-mobile.png](../../output/playwright/analytics-phase-1/06-light-mobile.png) |
| Exportação clara | [07-light-export.png](../../output/playwright/analytics-phase-1/07-light-export.png) |
| Drawer claro | [08-light-drawer.png](../../output/playwright/analytics-phase-1/08-light-drawer.png) |
| Tabela em celular | [09-light-mobile-table.png](../../output/playwright/analytics-phase-1/09-light-mobile-table.png) |
| Drawer em celular | [10-light-mobile-drawer.png](../../output/playwright/analytics-phase-1/10-light-mobile-drawer.png) |

Documento sem overflow horizontal em 390 px; tabela com conteúdo de 560 px dentro de área rolável de 318 px. Drawer desktop ocupa 640 px com bordas e altura da viewport; no celular ocupa a largura disponível. Capturas finais substituem tentativas realizadas durante transições de tema/animação.

## Arquivos alterados/criados

Página e infraestrutura:
- `frontend/src/pages/AdminAnalyticsDashboard.jsx`
- `frontend/src/pages/AdminAnalyticsDashboard.test.jsx`
- `frontend/src/components/Modal.jsx`
- `frontend/src/main.jsx`
- `frontend/src/styles/analytics-evolution.css`

Novos componentes/hooks em `frontend/src/components/analytics/`:
- `AnalyticsSubnav.jsx`, `analyticsSections.js`
- `AnalyticsSection.jsx`, `AnalyticsKpiCard.jsx`, `AnalyticsSeverityBadge.jsx`
- `AnalyticsEntityLink.jsx`, `AnalyticsEntityDrawer.jsx`, `AnalyticsEntityDrawer.test.jsx`
- `useAnalyticsDetailStack.js`, `useAnalyticsV1.js`

Adaptações incrementais no mesmo diretório:
- `AdvancedFilters.jsx`, `KPICards.jsx`
- `EfficiencyChart.jsx`, `CostPerKmRanking.jsx`, `TrendChart.jsx`
- `DriverRiskTable.jsx`, `VehicleDetailsTable.jsx`, `SmartInsightsList.jsx`

Documentação/evidências:
- `docs/analytics-evolution/EXECPLAN_PHASE_1.md`
- `docs/analytics-evolution/11_STATUS.md`
- `docs/analytics-evolution/DELIVERY_PHASE_1.md`
- `docs/analytics-evolution/evidence/phase-1/`: preflight, três logs de baseline, três logs finais, teste focado e dois registros do navegador.
- Dez PNGs em `output/playwright/analytics-phase-1/`, relacionados acima.

Arquivos temporários e sessão ficam somente em `storage/loan-tests/analytics-phase-1/`, ignorado pelo Git. Nenhuma credencial foi copiada para documentação. O pacote original permanece ignorado e intacto.

## Pendências para próximas decisões

- Validar esta fundação visual; não iniciar automaticamente outra fase.
- As limitações V1 registradas na Fase 0 continuam: amplitude de odômetros, nulos convertidos na apresentação legada, filtros parciais, referência fixa, janela de tendência e conteúdo de exportação. Elas não foram corrigidas silenciosamente.
- Drawer de dados reais/drill-down, métricas de manutenção/utilização, novos contratos e workflow dependem das respectivas fases e decisões D03–D10.
- Não houve publicação em produção nem alteração de arquivos de deploy, rotas, API client, permissões ou banco nesta fase. O build foi gerado e inspecionado no ambiente de homologação já existente.
