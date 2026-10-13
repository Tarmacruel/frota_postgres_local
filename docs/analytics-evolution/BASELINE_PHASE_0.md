# Analytics — baseline da Fase 0

Data: 06/10/2026. **Auditoria concluída; nenhuma correção funcional aplicada. Fases 1 e 2 não iniciadas.**

## 1. Estado inicial e limites da execução

| Item | Evidência |
|---|---|
| Diretório | `D:\FROTAS\frota_emprestimos_testes` |
| Branch inicial/final | `feature/frontend-evolution-hml` |
| HEAD inicial/final | `738ebb7e2049f8558e0f38da88075bd435eadda8` |
| `git status --short` antes de editar | Apenas `?? FROTA_SIREL_ANALYTICS_EVOLUTION_PACKAGE/` |
| Ambiente consultado | Homologação isolada, PostgreSQL `127.0.0.1:5441`, banco `frota_emprestimos_testes` |
| Schema observado | `0049_justification_suggestions`; nenhuma migration executada |
| Escritas da execução | Documentos/evidências, logs locais e saída do build frontend. Nenhuma alteração em código da aplicação, configuração, permissão ou dado de negócio. |
| Produção / Git remoto | Não acessados nem modificados nesta fase; sem commit, push, merge ou deploy. |

Os caminhos `docs/analytics-evolution/00_MASTER_PLAN.md`, `11_STATUS.md` e `phases/analytics-evolution/00_FASE_0_AUDITORIA.md` ainda não existiam na raiz. Foram lidos os equivalentes em `FROTA_SIREL_ANALYTICS_EVOLUTION_PACKAGE/`, além do `AGENTS.md`, `.agent/IMPLEMENT.md`, `.agent/PLANS.md` e `docs/frontend-evolution/02_VISUAL_SPEC.md` reais. Também foram lidos baseline, regras de métricas, qualidade dos dados, manifesto visual e instruções do starter kit. O pacote original foi preservado. Somente o baseline, status e evidências desta fase foram criados no destino definitivo; não houve importação de componentes do starter kit.

O runbook proíbe alterações de backend nesta etapa: os problemas encontrados foram diagnosticados, sem corrigir fórmulas, contratos ou schema. Não foi necessário ExecPlan de implementação visual porque nenhuma tela/componente foi alterado.

## 2. Método e evidências reproduzíveis

- Referências de linha abaixo correspondem ao HEAD acima. A inspeção seguiu rota → serviço → SQL/modelos → schema de resposta → consumidor frontend.
- [Sondas de caracterização](evidence/phase-0-probes.py) executam o serviço real com relógio controlado e banco **simulado**. [Resultados e SQL compilado para PostgreSQL](evidence/phase-0-probes.json). Não são estatísticas da frota, teste de carga ou prova de execução SQL no servidor.
- [Inspeção do banco](evidence/phase-0-readonly.py) exige o diretório, host, porta e banco de homologação; usa `default_transaction_read_only=on`, timeout de 15 s, transação `REPEATABLE READ READ ONLY`, verifica o modo e termina em rollback. [Resultado agregado, colunas e índices efetivos](evidence/phase-0-readonly.json). Não coleta nomes, placas, documentos, senhas ou registros individuais.
- [Logs de testes e build](evidence/test-results/). Logs originais e preflight em `storage/loan-tests/analytics-phase-0/`.

Reprodução, na raiz da homologação:

```powershell
.\backend\.venv\Scripts\python.exe docs/analytics-evolution/evidence/phase-0-probes.py
.\backend\.venv\Scripts\python.exe docs/analytics-evolution/evidence/phase-0-readonly.py
```

Não foi aberto o dashboard autenticado contra o banco: o GET global atual persiste snapshots (seção 7). Isso preservou a natureza somente leitura da auditoria. Não houve criação de usuários, autenticação em nome de terceiros, emissão real ou alteração de operações.

## 3. Inventário real

### Rotas e contratos V1

Todas as rotas em `backend/app/api/routes/analytics.py` exigem `require_permission("analytics", "view")`; exportar usa a mesma permissão. `organization` é UUID opcional, depois restringido pelo usuário. `period_days`: inteiro 1–365, padrão 30. Não existem `date_from`/`date_to` nesses contratos.

| GET `/api/analytics` | Parâmetros de negócio aceitos | Serviço / retorno |
|---|---|---|
| `/overview` (L31) | `period_days`, `organization` | `overview`; `AnalyticsOverviewResponse` |
| `/efficiency` (L41) | anteriores + `vehicle_type` | `efficiency`; lista `AnalyticsEfficiencyItem` |
| `/costs/tco` (L66) | anteriores + `vehicle_type` | `tco`; lista `AnalyticsTcoItem` |
| `/costs/trend` (L54) | `months` (3–24, padrão 12), `vehicle_type`, `organization` | `costs_trend`; lista `AnalyticsCostTrendItem` |
| `/risk/drivers` (L77) | `period_days`, `organization` | `driver_risk`; lista `DriverRiskItem` |
| `/insights` (L87) | `period_days`, `vehicle_type`, `organization` | `insights`; lista `AnalyticsInsightItem` |
| `/export` (L98) | `export_format` (`pdf`/`xlsx`), `period_days`, `vehicle_type`, `organization` | `export`; resposta binária, não `AnalyticsExportResponse` |

Inventário exato de assinaturas também em `phase-0-probes.json`. `vehicle_type` é string livre; não há validação por enum nessa rota.

| Camada | Arquivos e responsabilidade |
|---|---|
| Entrada frontend | `frontend/src/App.jsx:156` protege `/analytics`; `pages/AdminAnalyticsDashboard.jsx:16` mantém filtros locais, seis requests paralelos e modal de exportação |
| API client | `frontend/src/api/analytics.js:3`; Axios; exportação com `responseType: 'blob'` |
| Componentes usados | `components/analytics/AdvancedFilters.jsx`, `KPICards.jsx`, `EfficiencyChart.jsx`, `CostPerKmRanking.jsx`, `TrendChart.jsx`, `SmartInsightsList.jsx`, `DriverRiskTable.jsx`, `VehicleDetailsTable.jsx` |
| Arquivo não integrado | `CategoryFilterBar.jsx` existe, mas busca por referência localiza somente sua declaração; não é o filtro usado pela página |
| Dependências compartilhadas | `PageHeader`, `Modal`, `SearchableSelect`, `useMasterDataCatalog`, `ProtectedRoute`, `AuthContext` |
| Cálculo | `backend/app/services/analytics_service.py`: helpers L129–149; snapshots L236–416; respostas L418–675; exportação L678–977 |
| Persistência | `backend/app/repositories/analytics_repository.py`; `models/fleet_analytics_snapshot.py`; migration histórica `0014_add_fleet_analytics_snapshots.py` |
| Schemas | `backend/app/schemas/analytics.py`; sem versão de regra, cobertura da amostra, proveniência de benchmark, lista de registros de origem ou paginação |
| Fontes usadas no cálculo | `Vehicle`, `FuelSupply`, `MaintenanceRecord`, `Fine`, `Claim`, `Driver`, `LocationHistory`, `Allocation`, `Department` |
| Fontes existentes não usadas pelo Analytics | `VehiclePossession`, viagens da posse, revisões, pagamentos e referências de processos; `VehicleLoan` participa da responsabilidade gravada nas operações, não de uma análise de utilização do V1 |

Stack conferida em `frontend/package.json`: React 18, Router 6, Recharts 2, Axios, Vite 8, Vitest 4/Testing Library. Não é necessário acrescentar framework visual para o plano apresentado.

## 4. Fórmulas e significado atual

`S` = início UTC calculado; `E` = meia-noite UTC do dia da consulta. Custos e litros são somados por veículo. O universo inicial é `Vehicle.status != INATIVO`, não uma frota histórica na data do evento.

| Indicador | Fórmula / origem / trecho | Limitação de interpretação |
|---|---|---|
| Km por veículo | `max(max(odometer_km) - min(odometer_km), 0)` dos abastecimentos entre S e E; serviço L247–270 | Amplitude de leituras, não distância total percorrida; não usa posses, viagens ou leitura anterior a S |
| Litros | `SUM(FuelSupply.liters)` na mesma janela, L247–269 | Inclui o primeiro abastecimento cuja leitura define o início da amplitude |
| Combustível | `SUM(COALESCE(total_amount,0))`, L254 | Ausência de valor é tratada como zero, não como incompletude |
| Manutenção | `SUM(total_cost)` por `start_date`, L274–283 | Inclui aberta/fechada sem distinguir pagamento, tipo ou momento de conclusão |
| Multas | `SUM(amount)` por `infraction_date`, L285–291 | Inclui todos os status; `PAGA`, `PENDENTE`, `RECURSO`, `DEFERIDA` não são distinguidos |
| Consumo L/100km | `litros / km * 100`; se km ≤ 0, `None`, L129–132 | Correto aritmeticamente; confiabilidade depende do denominador e alinhamento do intervalo |
| “TCO/km” | `(combustível + manutenção + multas) / km`; se km ≤ 0, `None`, L135–138 | Não é custo total de propriedade e não comprova despesa paga/liquidada |
| Média da categoria | Média aritmética dos indicadores não nulos dos veículos do mesmo tipo, L300–314 | Não pondera km/litros; inclui o próprio veículo e não exige amostra mínima |
| KPI médio da frota | Média aritmética dos indicadores não nulos; sem amostra → **0**, L429–436 | 0 mistura ausência de medição e medição nula; não é razão de totais |
| Desvio percentual | `(atual - referência) / referência * 100`; nulo se referência 0/ausente ou atual ausente, L145–149 | No TCO a referência é a constante; no consumo é a média da categoria |
| Risco bruto | `0,3 × nº multas + 0,5 × nº sinistros + 0,2 × nº anomalias`, L141–142 | Contagem absoluta; não usa gravidade, pontos, km, tempo de exposição ou custos |
| Risco normalizado | `min(round(risco_bruto * 10, 2), 100)`, L378–383 | Escala/saturação definida pelo código, não probabilidade estatística de acidente |
| Frota ativa | Quantidade de snapshots de veículos depois do escopo, L434 | Inclui `MANUTENCAO`; rótulo “Veículos disponíveis” do frontend é impreciso |
| Alertas ativos | Quantidade recalculada por `_build_insights`, L428/437 | Não são ocorrências persistidas com status, responsável, reconhecimento ou resolução |
| Tendência | Soma mensal dos mesmos três custos, L614–675 | Mensal usa limites diferentes, inclui inativos e independe de `period_days` |

Exemplo **sintético** de ponderação: veículos com 10 L/100 km e 1 L/100 km, respectivamente 100 e 1.000 km, geram média atual 5,5 L/100 km; razão de totais seria `20/1100*100 = 1,81818`. Ambas têm significado distinto; escolher qual exibir exige decisão explícita.

`FuelSupply.consumption_km_l` já existe, mas **não** é a fonte do consumo analítico. `fuel_supply_service.py:206–217` calcula a diferença para o abastecimento anterior dividida pelos litros do novo evento. Sua regra de anomalia em L446–462 compara com histórico, abaixo de 70% ou acima de 140%. O Analytics conta essa flag para risco, mas produz seus próprios alertas de consumo em L525, com outra referência e outra banda. Não unificar as duas regras silenciosamente.

## 5. Verificação dos oito pontos do pacote

### A01 — Km por amplitude de hodômetro: confirmado, alto impacto

Evidência: `analytics_service.py:247–270`; SQL compilado `max(...)`, `min(...)`, `group_by(vehicle_id)` no JSON das sondas. Uma leitura `[1000]` gera km 0 e consumo `null`; `[1000,1500]` e a regressão `[1500,1000]` geram igualmente 500 km. Não existe ordenação temporal ou rejeição de regressão nessa agregação.

Com dois abastecimentos de 50 L, 1.000 e 1.500 km, a fórmula gera 20 L/100 km. Os 100 L incluem o primeiro evento, mas o intervalo medido começa na primeira leitura. Sem posição inicial do tanque/abastecimento completo não se pode afirmar que esses litros foram consumidos nesses 500 km.

**Impacto:** consumo, custo/km, médias, rankings e alertas herdam a limitação. **Decisão antes da Fase 2:** escolher fonte e regra de recorte (posses/viagens/eventos), exclusão de regressões, cobertura e fallback explícito. Não somar posse e suas viagens em duplicidade nem assumir que uma posse cruzando a janela pertence inteira ao período.

### A02 — Fechamento do período e fuso: confirmado, alto impacto

Evidência: `_period_bounds` L168–172; filtros L257, L274, L286, L345–370. Em relógio controlado `2026-10-06 15:00 UTC`, período 30 = `2026-09-06 00:00 UTC` até `2026-10-06 00:00 UTC`, ambos inclusivos. Eventos do dia depois de 00:00 UTC ficam fora. Em UTC−03, o corte final equivale a **05/10 às 21h**, não fim de 06/10.

Multas usam `DATE <= E.date()`: incluem **06/10 inteiro**, diferentemente de abastecimentos/manutenções/sinistros (`TIMESTAMPTZ <= E`). As duas datas inclusivas abrangem 31 datas civis para multas em um `period_days=30`.

**Impacto:** fontes não compartilham a mesma janela; início/fim surpreendem o operador. **Decisão:** período móvel até agora ou dias civis; fuso institucional; recomendar intervalo `[início, fim_exclusivo)` e conversão uniforme, preservando/explicitando V1 enquanto V2 muda semântica.

### A03 — Meses por recuo de 31 dias: confirmado por execução

Evidência: `costs_trend` L624–626. Recuar `offset * 31` e depois aplicar `day=1` pula meses:

| Relógio da sonda | Pedido | Meses retornados |
|---|---|---|
| Março/2023 (fevereiro de 28 dias) | 3 | dezembro/2022, janeiro/2023, março/2023 |
| Março/2024 (fevereiro de 29 dias) | 3 | dezembro/2023, janeiro/2024, março/2024 |
| Maio/2026 (após abril de 30 dias) | 3 | fevereiro, março, maio |
| Outubro/2026 (após setembro de 30 dias) | 3 | julho, agosto, outubro |

O limite superior de cada bucket é corretamente o próximo primeiro dia, exclusivo; o erro está na escolha dos meses. O bucket do mês atual vai até o próximo mês, sem truncar em `now`, podendo incluir lançamentos futuros se existirem.

**Impacto:** gráfico “12 meses” não garante 12 meses consecutivos; comparações mensais não confiáveis. **Decisão:** calendário real, tratamento do mês corrente parcial e compatibilidade V1/V2.

### A04 — N+1 de risco: confirmado por execução

Evidência: lista de todos os condutores ativos L336–339; três `COUNT` por condutor L340–376. O contador de chamadas `execute` da sonda retorna `5 + 3D` SELECTs em `_ensure_snapshots`: D=0 → 5; D=1 → 8; D=10 → 35; D=100 → 305. O escopo da secretaria e o tipo de veículo **não** reduzem a lista inicial de condutores.

**Impacto:** não afeta só `/risk/drivers`; overview, efficiency, tco e insights repetem esse trabalho. Quantificação completa na seção 7. **Decisão:** agregação por condutor no banco, separação das consultas de veículos e condutores e estratégia de snapshot/cache com escopo e versão de regra.

### A05 — “Mercado” sem proveniência: confirmado no código

Evidência: `MARKET_TCO_BENCHMARK_BY_TYPE`, `analytics_service.py:82–94`: SEDAN 1,35; HATCH 1,20; PICAPE 1,75; SUV 1,90; PERUA_SW 1,55; VAN 2,30; MICRO_ONIBUS 2,80; ONIBUS 3,20; CAMINHAO 3,80; MOTOCICLETA 0,60; MAQUINA 5,50. L332 usa média interna como fallback quando não encontra o tipo; L558–559 ainda chama a referência de mercado.

Não há fonte, data de vigência, região, combustível, versão ou governança nesses valores nem no snapshot/schema de resposta. Isso demonstra ausência de proveniência implementada; não prova que uma fonte externa nunca tenha existido fora do repositório.

**Impacto:** não fundamenta ranking de “eficiência de mercado” nem decisão administrativa automática. **Decisão:** renomear como referência configurada e explicitar limitações, retirar comparação ou adotar média interna com amostra; mercado real só com fonte aprovada. Aprovar também “custo operacional registrado/km” no lugar de TCO, sem presumir pagamento realizado.

### A06 — Exportação: divergência confirmada

Evidência: `AdminAnalyticsDashboard.jsx:96–104` envia `include_charts` e `include_details`; rota `analytics.py:98–114` não os declara. O serviço `export`, L951, exporta apenas `insights`; não agrega overview, tendência, lista integral de veículos ou condutores. Opções da tela não mudam o relatório.

PDF/XLSX são arquivos reais, com brasão e proteção contra fórmula no XLSX, cobertos por 11 testes existentes. PDF contém mensagens; XLSX tem seis colunas técnicas definidas em L63–70, sem ID/placa/nome da entidade e sem `message`. O cabeçalho informa últimos N dias, sem datas exatas nem a secretaria/tipo selecionados. Segurança do formato não equivale a aderência funcional ao que a tela promete.

**Decisão:** na Fase 1, definir apresentação honesta das capacidades existentes; na fase de API/relatórios, aprovar contrato de seções, identificação, metadados dos filtros e limites. Não alterar a emissão existente nesta auditoria.

### A07 — `vehicle_type` não é global: confirmado

| Recurso | Comportamento real |
|---|---|
| Overview | Frontend envia; rota não aceita. KPIs permanecem sem filtro de tipo. |
| Risco dos condutores | Frontend envia; rota não aceita. |
| Efficiency/TCO | Filtra snapshots de veículos depois de recalcular tudo, L451/L479. |
| Tendência | Aplica `JOIN Vehicle`/tipo em SQL, L628–651; não considera período em dias da tela. |
| Insights/exportação | Filtra apenas `vehicle_rows`, L602–603; alertas de condutores continuam sem vínculo com o tipo. |

Sonda com um SEDAN e um condutor de risco, filtro HATCH: efficiency/tco vazios, mas insights ainda retorna `driver_risk_score`. Não é necessário haver veículo HATCH para aparecer esse alerta.

`AdvancedFilters.jsx:33–43` também omite PERUA_SW, MICRO_ONIBUS e MAQUINA, presentes no enum de veículo. O rótulo “Todos os tipos” não resolve a impossibilidade de selecionar individualmente esses tipos.

**Decisão:** o filtro será global ou específico por bloco? Como atribuir tipo ao risco (eventos dos veículos selecionados, não cadastro atual do condutor)? Contrato uniforme no V2; preservar V1 até migração autorizada.

### A08 — Organização, propriedade e responsabilidade: parcialmente mais evoluído que o pacote

Evidências: `api/routes/analytics.py:25–28`; `core/organization_scope.py:11–22`; `repositories/vehicle_scope.py:44–70`; SQL da sonda.

- Usuário `PRODUCAO` com permissão é fixado em sua própria `organization_id`; pedir outra secretaria não amplia o escopo. Sem secretaria, recebe UUID sentinela vazio. ADMIN sem filtro recebe visão global. Os demais papéis seguem a permissão concedida e `requested_organization_id`; não há regra organizacional adicional nessa função para PADRAO/POSTO. Preservar o comportamento, não conceder acesso novo.
- Abastecimento é atribuído por `FuelSupply.organization_id`; manutenção, multa e sinistro por `responsible_organization_id`, trazido por `OperationalResponsibilityMixin`. O empréstimo pode deixar `vehicle_loan_id` associado ao registro.
- Se o campo de responsabilidade for nulo, `responsible_to` usa lotação histórica no instante do evento: início ≤ evento e fim > evento; requer uma única secretaria distinta. Não usa a lotação atual como fallback de custo. Multa sem hora exige que a lotação cubra o dia inteiro no fuso America/Bahia; ambiguidade fica fora dos totais por secretaria.
- Logo, “sem responsabilidade explícita” não significa automaticamente excluído: o histórico pode resolvê-la. Global pode conter valores que nenhuma secretaria recebe quando o histórico é ambíguo/ausente; não redistribuir por suposição.
- `_vehicle_ids_for_organization` (L192–205) usa **lotação atual**, não propriedade. Filtro posterior mantém veículo atualmente lotado **ou com algum agregado não zero** no período (L222–224). “Frota ativa da secretaria” mistura presença atual e atividade histórica.
- Condutores são mantidos se pertencem atualmente à secretaria **ou têm risco/anomalia atribuídos a ela** (L232–234). Condutor hoje em outra secretaria com eventos históricos pode aparecer; não reatribuir suas ocorrências pelo cadastro atual.
- `tests/test_vehicle_loan_operations.py:91–110` contém teste de custos antes/durante/depois do empréstimo e fallback histórico. Ele exige PostgreSQL descartável e migrations; foi lido, **não executado** nesta fase que proíbe migrations. As sondas cobrem seleção de escopo e SQL, não substituem essa integração.

**Decisão:** explicitar dimensões distintas: proprietária, operadora atual e responsável pelo evento. Aprovar a semântica do KPI de frota e a exposição de histórico nos futuros detalhes antes da Fase 2. Não usar permissão para ler histórico compartilhado como regra de apropriação financeira.

## 6. Outros achados que afetam as fases seguintes

| ID | Evidência | Impacto / encaminhamento proposto, ainda não implementado |
|---|---|---|
| A09 | `analytics_service.py:435–436`; `KPICards.jsx:6–8`; gráficos/tabela usam `value || 0` | Sem dado vira zero; consumo desconhecido recebe “Eficiente”. Distinguir indisponível, amostra insuficiente e zero medido. |
| A10 | `_build_insights` L525–526 e L547–556 usa `abs(desvio)` | Consumo 50% menor e custo 50% menor geram HIGH. A sonda confirma ambos; já o gráfico de custo pinta desvio negativo como eficiente. Aprovar alertas direcionais ou suspeita de qualidade explicitamente explicada. |
| A11 | L567–578 | Risco começa em 70, CRITICAL em 85; `variance_percentage` é `score-70`, em pontos, não percentual relativo. A tela imprime `%`. Não usar esse campo como percentual confiável sem revisão de unidade. |
| A12 | snapshots L241 excluem INATIVO; tendência L632–651 não filtra status | Custo histórico de veículo hoje inativo desaparece do ranking/overview, mas continua na tendência. Aprovar universo histórico e evitar “total” com bases incompatíveis. |
| A13 | `EfficiencyChart.jsx:13–18`, `CostPerKmRanking.jsx:14–23`, `VehicleDetailsTable.jsx:49–54` | API é por veículo, mas gráficos/tabela identificam só tipo, sem placa; categorias repetidas são veículos distintos. Ausência de detalhe de registro não autoriza inventar agrupamento por categoria. |
| A14 | `AdminAnalyticsDashboard.jsx:145`; slices de EfficiencyChart, CostPerKmRanking, DriverRiskTable, SmartInsightsList | Cortes locais 25/12/20/12/15, sem paginação nem indicação completa do universo; não são limites de resposta backend. |
| A15 | `AdminAnalyticsDashboard.jsx:40–90` | Sem cancelamento/controle de geração da requisição: respostas antigas podem substituir um filtro mais recente. Falha parcial limpa listas; alertas vazios passam a “Sem alertas”, embora exista erro geral. Distinguir falha de inexistência de dados. |
| A16 | `useMasterDataCatalog.js:43–49`; rota `master_data.py:28–34` | Dropdown depende de `master_data:view`, separado de `analytics:view`; a página ignora erro/loading do catálogo. Testar usuário só com Analytics sem ampliar permissões. |
| A17 | schema `AnalyticsInsightItem`, snapshot, `SmartInsightsList.jsx` | Sem identificador estável do alerta/regra, evidências de origem, histórico de atendimento ou estado. “Ativo” não significa pendência administrativa persistida. |

## 7. Performance, persistência e concorrência

`AdminAnalyticsDashboard.jsx:45–55` dispara seis requests por carregamento/filtro/atualização. Cinco chamam `_ensure_snapshots`, e cada um refaz veículos, combustível, manutenção, multas, condutores e 3 contagens por condutor. A tendência executa 3 SELECTs por mês (36 para 12 meses), mais consulta de lotação atual se houver organização; `organization_vehicle_ids` em L623 é calculado, mas não utilizado.

Estimativa estrutural, **sem incluir autenticação, catálogo, escrita/flush e latência**:

- Global: `5*(5+3D)+36 = 61+15D` SELECTs por carga.
- Com organização: mais 8 consultas auxiliares de filtragem, total `69+15D`.
- Banco HML possui 288 condutores ativos: projeção global **4.381 SELECTs**, não uma medição de tráfego/latência. A sonda mediu apenas contagem de chamadas do serviço com banco simulado.

Em escopo global, `_ensure_snapshots:414–415` chama `replace_period_snapshots` e `commit`. O repositório L28–38 apaga todo o período, adiciona cada snapshot e faz flush. Portanto GET não é leitura pura; cinco requests paralelos substituem o mesmo período. Não há índice único por período/escopo/entidade no modelo nem nos índices observados. **Risco a reproduzir em teste isolado futuro:** duplicação persistida/contenda sob concorrência. Não foi afirmada ocorrência real nem reproduzida disputa no banco nesta fase.

Com `organization_id` não nulo, L411–412 retorna snapshots em memória sem persistir. `list_period_snapshots` existe, mas não é chamado pelo serviço: não há cache efetivo de resultados nesse fluxo. Retenção de períodos antigos não aparece no caminho auditado.

`responsible_to` inclui subconsulta correlacionada de histórico quando a atribuição é nula. Índices individuais de veículo/condutor/data/responsabilidade e índices de snapshots estão registrados em `phase-0-readonly.json`. Não foi feito teste de carga nem EXPLAIN em escala produtiva; afirmar que um índice composto resolverá o problema seria prematuro. Primeiro reduzir número de consultas; depois medir plano/tempo com distribuição representativa e validar índices.

## 8. Dados disponíveis, ausentes e qualidade observada

Snapshot somente leitura em **06/10/2026 19:14:44 UTC**, exclusivamente HML. A base de testes não representa indicador atual de produção. SQL exato, colunas e resultados em `phase-0-readonly.json`.

| Verificação | Resultado observado | Consequência |
|---|---|---|
| Veículos | 284: 252 ATIVO, 25 INATIVO, 7 MANUTENCAO | Universo V1 sem inativos tem 259, incluindo manutenção; isso não prova disponibilidade operacional |
| Capacidade de tanque ausente ou ≤ 0 | 248 de 284 | Regra “litros acima do tanque” não pode classificar a maioria; mostrar cobertura |
| Proprietária ausente | 0 de 284 | Campo existe e está preenchido neste snapshot; não equivale a operadora |
| Abastecimentos | 188; 0 sem valor; 188 sem condutor; 20 sem consumo derivado; 0 sem organização | Atribuição financeira disponível, risco por condutor de abastecimento sem cobertura; ausência de flag ligada a condutor não significa boa condução |
| Regressões entre leituras sucessivas | 5 transições (`lag`, ordenado por data/criação/id) | Precisam investigação; não foram corrigidas nem imputadas |
| Cobertura abastecimento na janela atual de 30 dias | 13 veículos com registro, 4 com apenas um registro/km zero; consulta inclui todos os status | Confirma limitação do denominador em dados HML; não é uma execução dos KPIs |
| Manutenções | 2; 0 abertas; 2 sem responsabilidade explícita | Verificar fallback de lotação histórica antes de tratar como não atribuídas |
| Multas | 2 PENDENTE; 1 sem condutor; 2 sem responsabilidade explícita | V1 soma multa pendente como custo; risco incompleto para evento sem condutor |
| Sinistros | 1; condutor e estimativa preenchidos | Estimativa não comprova gasto realizado |
| Posses | 1.283; 1.146 encerradas; 34 encerradas sem par completo de hodômetros; 16 com final < inicial | Não basta trocar a fonte para posse e somar todas; regras de validade/cobertura são necessárias |

As contagens de problemas podem se sobrepor e não constituem um score agregado de qualidade.

| Análise futura | O que há de fato | O que falta / decisão necessária |
|---|---|---|
| Preventiva × corretiva; peças × mão de obra | `MaintenanceRecord`, L28–32: datas, descrição, texto `parts_replaced`, `total_cost` | Não há tipo estruturado nem valores separados; schema vivo confirma. Não classificar texto por adivinhação; decidir captura/migration em fase apropriada. |
| Custo de sinistro | `Claim.valor_estimado`, L54 | Sem custo realizado próprio/itens pagos no sinistro. Exibir estimado separado. |
| Custo total de propriedade | `Vehicle.ownership_type` e cadastro; três fontes operacionais no V1 | Não há base estruturada por veículo para aquisição/depreciação/valor residual/seguro/tributos/custo de locação. Não chamar a soma atual de TCO. |
| Despesa paga/liquidada | `PaymentProcess` já tem amount, stage, paid_at, liquidation_date, competence_month; `PaymentProcessReference` tem reference_type/external_id | **Não é correto dizer que não há pagamento no banco.** Analytics não o usa; referências não oferecem rateio monetário por veículo/registro nem reconciliação automática com os três custos. Exige regra para evitar dupla contagem. |
| Km e utilização | Posses têm início/fim e hodômetros; viagens (`possession_trip.py:83–120`) têm saída/retorno, status e hodômetros | Escolher fonte sem duplicar posse/viagem, recortar sobreposições e definir denominador de utilização. Posse não comprova motor ligado/movimento. |
| Disponibilidade histórica | Status **atual** e intervalos de manutenção/posse | Não há agenda estruturada de todas as indisponibilidades nem horário operacional da frota; “72% utilizada” do mockup não é regra aprovada. |
| Telemetria / máquinas | Registros administrativos e tipo MAQUINA | Não foram encontrados horímetro, tempo de motor ligado ou telemetria de condução nos modelos consultados. Não aplicar km como unidade universal sem decisão. |
| Consumo normalizado | Litros, hodômetro, combustível, tanque opcional e consumo derivado | Não há marcador estruturado de tanque cheio; precisam amostra mínima, qualidade da sequência e política para combustíveis/categorias heterogêneos. |
| Benchmark de mercado | Constantes no código e número no snapshot | Falta fonte, data, regra e governança; ver A05. |
| Alertas administrativos | Insights recalculados | Faltam estado persistido, responsável, trilha de ação, versão de regra e origem detalhada; provável contrato/schema futuro. |

## 9. Permissões, navegação e design system a preservar

- `/analytics` em `App.jsx:156–161`, `ProtectedRoute.jsx:16–24`, menu `Layout.jsx:109–110`: permissão `analytics:view`; não é exclusividade hardcoded de ADMIN apesar do nome da página.
- `api/deps.py`, `require_permission`: respeita permissão individual e defaults do papel; `get_current_user_ready` exige senha atualizada e CPF. ADMIN recebe Analytics por padrão; PRODUCAO não recebe esse módulo no default e depende de concessão. Não mudar isso como efeito colateral do redesign.
- Detalhe futuro de abastecimento, multa, sinistro, posse etc. não pode assumir que `analytics:view` concede leitura irrestrita do módulo de origem. Definir endpoint/resumo compatível com os escopos e testar combinações de permissões antes de implementar drill-down.
- Filtros atuais vivem apenas em estado local; não há subrotas/query string nem pilha de detalhe. Escolha sugerida para decisão da Fase 1: manter `/analytics` e adotar query string validada para subvisão/filtros, com fallback compatível, sem reconstruir o shell.
- `frontend/src/main.jsx:4–6` carrega `styles.css` e depois `styles/frontend-evolution.css`. Tokens `--ui-*`, superfícies e tipografia existentes devem prevalecer; Manrope e IBM Plex Sans já estão disponíveis.
- **Não registrar falso defeito de tema:** `styles.css:3394–3396` mistura alertas com branco, mas `frontend-evolution.css:1802–1809` já sobrescreve para `var(--ui-surface)` dentro de `.management-page--analytics`. A análise considerou a cascata real.
- Gráficos usam Recharts/`--analytics-*`; ainda há tamanhos e margens inline nos componentes. São estado existente, não motivo para redesenhar páginas inteiras.
- `CategoryFilterBar` e exemplos do starter kit não devem substituir cegamente AdvancedFilters/Modal/tokens reais. Nenhum arquivo do starter kit foi integrado.

### Referências visuais e limite da validação

Foram inspecionados o composite alvo e a captura `01_ATUAL_ANALYTICS_TOPO.png` do pacote. A captura histórica traz URL de produção; ela foi apenas lida como arquivo local, **sem acessar produção**. Estrutura observada confere com o código: quatro KPIs, filtros, gráfico com tipos repetidos e ranking TCO. Valores do screenshot não foram usados para validar cálculos ou inferir dados atuais. O composite contém dados ilustrativos e separações ainda inexistentes, como preventiva/corretiva.

Não foram produzidos screenshots autenticados novos nem alegada aprovação visual em claro/escuro/mobile nesta fase somente leitura. As referências fornecidas não substituem essa validação na Fase 1. Nenhuma mudança visual foi feita; a futura fase deve capturar ambos os temas e celular no ambiente de homologação autorizado, com dados de teste e sem disfarçar dados indisponíveis.

## 10. Baseline de testes desta execução

| Comando | Resultado novo | Cobertura e limite |
|---|---|---|
| `npm run test` em frontend | **229 passed**, 48 arquivos, 78,59 s | Suíte geral. Busca por Analytics nos arquivos de teste não encontrou cobertura direta de dashboard/componentes analíticos. |
| `npm run lint` | **0 erros, 46 warnings**, exit 0 | Baseline preexistente, sem alteração de código; não esconder warnings como ausência total de avisos. |
| `npm run build` | **Sucesso**, exit 0 | Build normal da homologação; sem deploy nem configuração de produção. |
| `pytest -q tests/test_analytics_metrics.py` | **11 passed**, 0,43 s | Quatro helpers, cinco casos de fórmula maliciosa no XLSX, exportação XLSX e PDF com insights simulados. Não valida datas, agregações SQL ou escopo ponta a ponta. |
| `pytest -q tests/test_user_permissions.py tests/test_vehicle_loan_foundation.py` | **18 passed**, 0,38 s | Permissões/fundação de escopo, não equivalem a todos os endpoints Analytics. |
| `phase-0-probes.py` | Concluído | Demonstra janelas, saltos de meses, 5+3D, assinaturas de endpoints, escopo, alertas negativos e filtro parcial. SQL compilado e chamadas simuladas; sem banco real. |
| `phase-0-readonly.py` | Concluído | Schema/índices e qualidade agregada do banco HML, modo read-only confirmado. |

Nos dois comandos pytest foi definido `TEST_DATABASE_URL=sqlite+aiosqlite:///:memory:`. Não foi habilitado `LOAN_MIGRATION_TESTS`; testes PostgreSQL que criam banco/aplicam migrations não foram executados. Não houve instabilidade do runner neste baseline (nenhum retry necessário), nem falha de aplicação nos gates. Uma primeira consulta exploratória usou o nome incorreto `vehicle_possessions`; foi rejeitada em transação read-only e ajustada para o nome real `vehicle_possession`, com rollback e execução final bem-sucedida.

## 11. O que pode ser usado e decisões antes das Fases 1/2

### Classificação de confiabilidade

| Uso | Classificação nesta auditoria |
|---|---|
| Dados cadastrais, contagens de registros, litros/valores informados com janela e escopo explícitos | Utilizáveis como dados registrados, acompanhados de cobertura. Não equivalem automaticamente a gasto pago, km real ou disponibilidade. |
| Helpers matemáticos com entradas válidas; geração binária PDF/XLSX | Aritmética/formato verificados por testes. Isso não valida o conjunto de dados usado pela tela. |
| Atribuição explícita e fallback histórico de responsabilidade | Regra identificada e SQL conferido; integração histórica existente ainda precisa ser executada em banco descartável quando autorizada. |
| Km, consumo agregado, custo/km, médias e alertas dependentes | **Não homologar como precisão operacional** antes de decidir denominador, amostra, período e referências. |
| Série mensal V1 | **Defeito reproduzido**; não usar como sequência mensal confiável. |
| Risco | É score administrativo de contagens, com cobertura incompleta; não mede comportamento/probabilidade e não deve gerar ação automática. |
| Benchmark “mercado”, TCO, preventiva/corretiva, utilização do mockup | Não sustentados como apresentados; dependem de regras/dados adicionais. |

### Decisões pendentes — propostas, não aprovações

| Decisão | Antes de | Proposta para validação |
|---|---|---|
| D01 — limite visual e navegação | Fase 1 | Manter `/analytics`, shell/tokens/Modal existentes; decidir query string para subvisões. Mostrar indisponibilidade/cobertura sem fabricar métricas do mockup. |
| D02 — rótulos e exportação | Fase 1 | Aprovar “custo operacional registrado/km”, referência configurada e descrição de exportação limitada aos alertas; não prometer gráficos/detalhes que V1 não gera. |
| D03 — tempo | Fase 2 | Fuso institucional, dias civis ou janela móvel, fim exclusivo, mês parcial e calendário correto. |
| D04 — km e consumo | Fase 2 | Prioridade entre viagem/posse/eventos, validade, recorte, amostra mínima, ausência e ponderação; não trocar por soma de posses sem tratar as inconsistências encontradas. |
| D05 — custo | Fase 2 | Multas por quais status? Manutenção por início/conclusão? “Registrado” versus “pago/liquidado”? Sinistro estimado separado; pagamentos sem dupla contagem. |
| D06 — escopo e universo | Fase 2 | Responsável no evento versus operadora/proprietária; inativos históricos, condutores transferidos e significado da frota ativa/disponível. |
| D07 — filtro de tipo | Fase 2 | Cobertura por endpoint e vínculo dos eventos de risco; comportamento dos KPIs e exportação no mesmo recorte. |
| D08 — alertas e benchmarks | Fase 2 | Proveniência, bandas direcionais, mínimo de amostra, unidade do desvio, versão/explicação da regra; não equiparar recomendação a obrigação administrativa. |
| D09 — arquitetura de consulta | Fase 2 | Agregações SQL por entidade, leitura sem gravação incidental ou snapshot explicitamente gerido, isolamento por escopo, retenção, concorrência e medição de performance. |
| D10 — dados ausentes | Planejar na Fase 2, implementar apenas na fase autorizada | Captura estruturada de manutenção, custos, disponibilidade etc.; qualquer migration depende de aprovação própria. Não antecipar essas entregas. |

Testes de aceite a exigir na futura Fase 2: limites de dia/fuso, fevereiro bissexto/não bissexto, meses consecutivos, uma/nenhuma leitura, regressão, valores ausentes, denominador inválido, médias ponderadas, inativos, multas por status, dois órgãos com empréstimo/transferência, usuário sem órgão, filtro de tipo em todos os blocos, permissões do detalhe, concorrência e quantidade limitada de queries. Não foram escritos como mudança funcional nesta fase.

## 12. Arquivos e encerramento

Criados somente `docs/analytics-evolution/BASELINE_PHASE_0.md`, `11_STATUS.md` e `evidence/` (duas sondas documentais, dois resultados JSON e logs dos cinco gates). O diretório original do pacote permanece intacto. `storage/loan-tests/analytics-phase-0/` contém logs/preflight ignorados pelo Git; `frontend/dist/` foi regenerado pelo gate de build.

HEAD e branch preservados; nenhum diff em arquivos funcionais rastreados. **Parada ao fim da Fase 0.** A próxima fase permanece bloqueada até validação do usuário; este relatório não autoriza nenhuma correção ou implementação posterior.
