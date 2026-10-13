# Entrega — Fase 3 — Visão Geral

## Escopo e ambiente

Implementada em 2026-10-07, exclusivamente na branch `feature/analytics-evolution-hml`, HEAD `082af32dee326408d023d0133272ae8eaa71eb20`. As Fases 1/2 já estavam no working tree sem commit e foram preservadas. [Preflight](evidence/phase-3/preflight.txt) e [ExecPlan](EXECPLAN_PHASE_3.md).

O cockpit está disponível em `/analytics`, na instância isolada `http://localhost:6969`. Frontend reconstruído e somente a API HML reiniciada, após validar PID, criação, executável, comando e listener da instância. PostgreSQL permaneceu ativo. Nenhuma migration, acesso à produção, commit ou push nesta fase.

## Conteúdo e contratos

- Quatro KPIs V2 com comparação: custo operacional registrado, custo por km, quilometragem de posses válidas e litros abastecidos por 100 km registrados. Fórmulas, cobertura e limitações acessíveis em cada indicador. Valores ausentes não viram zero; base anterior nula/zero não produz percentual fictício.
- “O que mudou?” compara combustível, manutenção e multas com o período anterior equivalente. Exibe variação observada, sem atribuir causa ou afirmar pagamento.
- Evolução mensal no intervalo aplicado e distribuição dos três custos. Sinistros estimados separados do total; subtotal conhecido identificado quando há valores faltantes.
- Situação da frota: status cadastral **atual**, sem alegação de disponibilidade histórica. A secretaria deste bloco corresponde à lotação operadora atual.
- Atenção: até oito veículos, ordenados por quantidade de anomalias registradas, depois maior aumento absoluto de custo e UUID para desempate estável. Entram veículos com anomalia ou aumento conhecido positivo. Valores faltantes não geram aumento artificial. Não há score novo, diagnóstico causal ou imputação de responsabilidade pessoal.
- Alertas: flags de anomalia de consumo já existentes nos abastecimentos. Contagens incluem todo o recorte, embora os links se limitem aos veículos do ranking. Não são alertas com atendimento/resolução.
- Qualidade: custos ausentes/inválidos, eventos sem condutor, posses válidas e excluídas, cruzamentos de janela e sobreposições. Exclusões podem ter mais de um motivo; não somar suas categorias como grupos disjuntos.

### Leituras aditivas V2

`GET /api/analytics/v2/fleet-status` e `GET /api/analytics/v2/attention` usam o mesmo `common_filter`, permissão `analytics:view`, `analytics_organization_scope` e `Cache-Control: private, no-store` de summary. Filtros: `date_from`, `date_to`, `organization`, `vehicle_type`, `vehicle_id`. Datas obrigatórias/validadas também para fleet-status, mas sua base cadastral atual é explicitamente indicada.

`AnalyticsV2Cockpit.fleet` faz uma consulta agrupada por `Vehicle.status`, com `current_operator` quando há secretaria. `attention` reaproveita `AnalyticsV2Repository.summary_rows`, `totals` e `compare` aprovados na Fase 2, e busca placas/tipos dos até oito selecionados em uma única consulta adicional. Sem consulta por veículo, snapshots ou escrita nesses serviços. Cockpit completo: até cinco SELECTs analíticos (summary: 2, attention: até 2, fleet: 1), além das dependências habituais de autenticação/catálogo.

V1 e fórmulas da Fase 2 permanecem intactas. Fonte de km continua a regra aprovada: **somente posses encerradas, válidas e inteiramente contidas na janela**, com as exclusões documentadas na Fase 2. Validade estrutural não comprova plausibilidade física de toda leitura registrada; esta fase não introduz limiares arbitrários para corrigir o banco.

## Interação, limites e preservação

- Datas civis encerradas em America/Bahia, de 1 a 366 dias. Secretaria/tipo e datas aplicados juntos ao confirmar; chips removem filtros categóricos. Atualização manual mantém o recorte.
- Três consultas independentes. Falha em summary afeta seus KPIs/custos/qualidade; falha em attention afeta ranking/alertas; fleet permanece independente. Retry refaz apenas a fonte correspondente. Respostas antigas são descartadas após mudança de filtros.
- Visão Geral não solicita V1. As demais seções preservam suas consultas, filtros, detalhes inline e exportação PDF/XLSX anteriores. Filtros V2 sobrevivem à troca de seção; aviso esclarece que os relatórios V1 não exportam o cockpit V2.
- Entidades abrem o shell de drawer existente. Enter, Escape, retorno do foco e manutenção do recorte verificados. **Nenhum conteúdo de detalhe da Fase 4 foi implementado.**
- Miniaturas reaproveitam `VehicleThumbnail` com tipo cadastrado, incluindo Perua/SW e Hatch existentes; nenhum SVG foi criado/alterado.
- Tokens e componentes do design system preservados nos dois temas. Tooltip do gráfico contido em sua área para evitar transbordamento horizontal ao redimensionar no celular.
- Cross-filter em gráficos não acrescentado: os gráficos atuais mostram fontes de custo, cuja seleção não equivale a um filtro global suportado por todas as fontes. Não se simulou um recorte incompatível.

## Validação

| Verificação | Baseline | Resultado final |
| --- | --- | --- |
| Frontend `npm run test` | 243 testes / 50 arquivos | **251 testes / 51 arquivos** |
| `npm run lint` | 0 erros / 45 avisos | **0 erros / mesmos 45 avisos** |
| `npm run build` | aprovado | **aprovado**, repetido após ajuste CSS |
| Backend pertinente | Fase 2: 70 testes | **75 passed** |
| `compileall` / `git diff --check` | — | aprovados |

Backend: `test_analytics_v2_cockpit.py`, `test_analytics_v2.py`, `test_analytics_v2_postgres.py`, `test_analytics_metrics.py`, `test_user_permissions.py`, `test_vehicle_loan_foundation.py`; `TEST_DATABASE_URL=sqlite+aiosqlite:///:memory:` e `ANALYTICS_V2_READONLY_TESTS=1`. Os cinco testes PostgreSQL herdados usam CTEs fictícias somente leitura. Os novos testes cobrem critérios/ordem, valores desconhecidos, limite, consulta em lote, status cadastral, escopo obrigatório e negação de permissão nas duas rotas.

Frontend novo: seleção por teclado, fórmulas/cobertura, falha parcial/retry, aplicação explícita e remoção de filtro, preservação ao ocultar/reabrir, rejeição de janela invertida, resposta obsoleta, falta de dados, catálogo indisponível, virada de ano/fuso e formatação. Regressões V1 de navegação, drawer e exportação mantidas. A primeira execução focada detectou apenas uma fixture sem callback de entidade; corrigida antes do gate completo. Runner completo terminou normalmente em 116,21 s, sem reproduzir a instabilidade antiga.

Chromium autenticado na HML: três requests V2 e nenhum V1 ao abrir Overview; endpoints reais responderam; claro/escuro, 1440×1050 e 390×844; erro 503 simulado **apenas por interceptação no navegador**, sem mudança no servidor, e retry somente de attention; datas preservadas após drawer; Escape devolveu foco; sem overflow horizontal final. Console final: **0 erros / 0 avisos**. A API real foi validada com a conta administrativa de testes; restrições de perfil/órgão verificadas nos testes de rota, não por criação de usuários novos.

Logs e scripts de reprodução sem credenciais em [evidence/phase-3](evidence/phase-3/). Sessão/cookies permanecem somente em armazenamento ignorado.

## Screenshots

- [Desktop claro](../../output/playwright/analytics-phase-3/01-overview-light.png)
- [Desktop escuro](../../output/playwright/analytics-phase-3/02-overview-dark.png)
- [Drawer escuro, somente shell](../../output/playwright/analytics-phase-3/03-drawer-dark.png)
- [Celular escuro](../../output/playwright/analytics-phase-3/04-mobile-dark.png)
- [Celular claro](../../output/playwright/analytics-phase-3/05-mobile-light.png)
- [Erro parcial simulado](../../output/playwright/analytics-phase-3/06-partial-error.png)
- [Viewport celular com datas aplicadas](../../output/playwright/analytics-phase-3/07-mobile-viewport.png)

## Arquivos desta fase

Backend:
- `backend/app/api/routes/analytics_v2.py` — duas rotas aditivas no arquivo da Fase 2.
- `backend/app/services/analytics_v2_cockpit.py` — leituras e contratos do cockpit.
- `backend/tests/test_analytics_v2_cockpit.py` — cinco casos novos.

Frontend:
- `frontend/src/api/analyticsV2.js`
- `frontend/src/components/analytics/AnalyticsOverview.jsx`
- `frontend/src/components/analytics/AnalyticsOverview.test.jsx`
- `frontend/src/components/analytics/analyticsV2Format.js`
- `frontend/src/components/analytics/useCockpitResource.js`
- `frontend/src/components/analytics/useAnalyticsV1.js` — ativação condicional.
- `frontend/src/pages/AdminAnalyticsDashboard.jsx`
- `frontend/src/pages/AdminAnalyticsDashboard.test.jsx`
- `frontend/src/styles/analytics-evolution.css`

Registro/evidências:
- `docs/analytics-evolution/EXECPLAN_PHASE_3.md`
- `docs/analytics-evolution/DELIVERY_PHASE_3.md`
- `docs/analytics-evolution/11_STATUS.md`
- `docs/analytics-evolution/evidence/phase-3/` — preflight, sete logs de gates/baseline, quatro logs de navegador e três scripts de validação.
- `output/playwright/analytics-phase-3/` — sete capturas.

## Parada

Fase 3 implementada em homologação e entregue para validação. Fase 4 permanece bloqueada. Detalhes de entidades, análises específicas completas, exportação V2 e workflow ficam para as respectivas fases. Sem pendência técnica bloqueante identificada nos gates executados.
