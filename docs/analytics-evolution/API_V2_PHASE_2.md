# Analytics V2 — contrato e entrega da Fase 2

Conclusão: 07/10/2026, homologação `feature/analytics-evolution-hml`, HEAD inicial `082af32dee326408d023d0133272ae8eaa71eb20`. Alterações da Fase 1 já estavam no working tree e foram preservadas. Nenhum commit, push, deploy de produção ou migration nesta execução.

## Contrato inicial

`GET /api/analytics/v2/summary`

Parâmetros implementados: `date_from` e `date_to` obrigatórios, `organization` UUID, `vehicle_type` enum real do cadastro e `vehicle_id` UUID opcionais. Datas civis inclusivas, de 1 a 366 dias, a partir de 1901. Esta fundação aceita **somente dias encerrados**, até ontem em `America/Bahia`; dia atual/futuro retorna 422 para não comparar dia parcial com dia completo. Filtros ainda não implementados, como `driver_id`, são rejeitados em vez de ignorados. Não se aceita mudança de timezone pelo cliente.

Exemplo de consulta: `/api/analytics/v2/summary?date_from=2026-09-01&date_to=2026-09-30&vehicle_type=SEDAN`.

Resposta tipada:
- `version`, `generated_at`, `filters` efetivos após restrição organizacional;
- `period` e `previous_period`, com datas, fuso, instantes UTC, fim exclusivo e duração civil;
- `kpis`: valor, qualidade, comparação, fórmula, fontes, numerador/denominador quando aplicável e limitações;
- `current` / `previous`: combustível, manutenção, multas por status, estimativas de sinistros, litros e custo operacional;
- `monthly`: meses consecutivos recortados à janela, inclusive meses sem eventos;
- `mileage` / `previous_mileage`: km, posses válidas/excluídas, cruzamento de período, sobreposição e veículos medidos;
- `driver_risk`: contagens por condutor vinculado aos eventos do recorte e score administrativo com os pesos V1;
- `quality` e `methodology`: cobertura e decisões de interpretação.

Valores `Decimal` são serializados como **strings JSON** para preservar precisão. Indisponibilidade é `null`; fonte sem eventos tem contagem e soma zero. Fonte com valor ausente/inválido tem `value: null`, subtotal conhecido em `known_value` e contagem `missing_or_invalid`. O cliente futuro deve usar as informações de qualidade, não converter `null` em zero.

Sem novos endpoints de detalhe, exportação, workflow ou telas. A UI continua consumindo V1; sua nomenclatura já foi esclarecida na Fase 1. Os labels V2 usam “custo operacional registrado”, nunca TCO ou benchmark de mercado.

## Decisões e evidências

| Baseline / decisão | Regra V2 | Evidência/teste |
|---|---|---|
| A02 / D03: corte UTC e datas inconsistentes | Reutiliza fuso institucional `America/Bahia`; `[00:00 local, 00:00 local do dia seguinte)`; multas por data civil | Helpers de período; testes de meia-noite UTC−03, último instante e primeiro instante excluído |
| Comparação | Janela anterior adjacente com mesma quantidade de dias civis; delta percentual indisponível quando base é zero/ausente | `compare`, testes zero/nulo/direção; setembro 30 dias compara com 02–31/agosto |
| A03: recuo de 31 dias pula meses | Iteração de calendário, recorte do primeiro/último mês | Fevereiro de 2023/2024, virada de ano e preenchimento de lacunas |
| A01 / D04: amplitude de abastecimentos não comprova distância | **Usuário aprovou somente posses encerradas e válidas** | SQL de posses e testes PostgreSQL com regressão, ausência, sobreposição e bordas |
| A04 / D09: 5+3D SELECTs e repetição | Duas consultas agrupadas para todo o summary, incluindo comparação e série mensal; nenhuma consulta por condutor | D=0,1,100,1000 em testes; duas consultas por escopo na base HML |
| A05 / D08: referência sem proveniência | Comparação apenas com período anterior, com fontes e regra explícitas; constantes V1 não aplicadas | Metadados dos KPIs e schemas |
| A07 / D07: filtro parcial | Tipo e veículo aplicados a cada fonte SQL, inclusive contagens de risco e km | Testes SQL/rota e PostgreSQL com SEDAN/HATCH |
| A08 / D06: responsabilidade histórica | Reutiliza `responsible_to`, independente de proprietário/operador atual | Dois órgãos, transferência, atribuição explícita e multa sem hora em dia de transferência |
| D05: registrado ≠ pago | Conserva soma registrada de combustível + manutenção por início + multas de todos os status; separa status das multas | Testes com PAGA/PENDENTE/RECURSO/DEFERIDA e soma decimal exata |
| Sinistros/pagamentos | Estimativa separada; processos de pagamento não somados aos registros | Teste de estimativa 1000 fora do custo operacional; evita dupla contagem |
| Valores ausentes/inválidos | Não negativos e finitos; indisponibilidade propagada com subtotal conhecido | SQL PostgreSQL com NULL, negativo e NaN |

### Fonte e validade da quilometragem

Fonte única: `vehicle_possession.start_odometer_km` e `end_odometer_km`. Requer encerramento (`end_date` preenchida), duração positiva, ambos os hodômetros finitos/não negativos, final ≥ inicial e **todo o intervalo da posse dentro do período**. Final exatamente no fim exclusivo da janela é aceito como término do intervalo; início nesse limite pertence à próxima janela. Posses sobrepostas a outra posse encerrada do mesmo veículo são conservadoramente excluídas, sem escolher arbitrariamente qual é correta.

Não soma viagens, não usa abastecimentos como fallback, não distribui km proporcionalmente ao tempo. Posses abertas não fornecem km; ausência de posses válidas retorna `null`. Uma posse válida com leituras iguais mede zero km, mas não habilita divisão por zero.

Responsabilidade: campo explícito da posse; quando ausente, regra histórica existente no **início** da posse. Não se reconstrói troca de responsabilidade dentro da posse nem se rateia a distância por secretaria. Isso é declarado nos metadados.

Km exibido é soma das posses válidas, com cobertura parcial explícita. Custo/km e litros/100 km usam numeradores **dos mesmos veículos com km válido** e a razão dos totais, não média de razões individuais. Não se afirma que os litros foram efetivamente consumidos no percurso: não há medição de tanque cheio no schema. Valores das razões permanecem com qualidade `partial`, inclusive quando todas as posses observadas são válidas; não há garantia de cobertura de todos os deslocamentos da frota.

Os motivos de exclusão podem se sobrepor; `excluded_records` conta cada posse uma vez. A fonte aprovada substitui a condição provisória de km indisponível registrada no início do ExecPlan.

### Escopo e compatibilidade

Permissão idêntica à V1: `require_permission("analytics", "view")`, com autenticação, prontidão da conta e regras existentes. `PRODUCAO` permanece restrito à própria organização; sem órgão mantém sentinela vazia. Solicitar outro órgão não amplia acesso. Resposta usa `Cache-Control: private, no-store`.

Custos/eventos incluem veículos atualmente inativos e condutores com eventos no período, inclusive transferidos/inativos; não depende da lista atual de ativos. Tipo usa cadastro atual, pois não existe histórico de tipo. Responsabilidade explícita prevalece sobre histórico; fallback ambíguo fica fora do órgão, podendo permanecer na visão global. Risco usa eventos de veículos filtrados e não presume “boa condução” de quem não tem eventos atribuídos.

V1 permanece literalmente intacta: rotas, serviço, repository e schemas sem diff. Nenhum consumidor foi migrado para V2. Por isso os defeitos legados ainda existem na V1 até sua substituição nas fases autorizadas.

## Testes e verificação

Baseline novo: **29 testes backend aprovados** (Analytics V1, permissões e fundação de escopo). Resultado final: **70 aprovados** = 29 regressões existentes + 36 testes V2 unitários/rota + 5 testes PostgreSQL somente leitura. `compileall` e `git diff --check` aprovados.

Os testes PostgreSQL usam CTEs com dados fictícios que sombreiam os nomes das tabelas somente naquela consulta. Não executam INSERT/UPDATE/DELETE, CREATE/ALTER, migration ou criação de banco. A conexão é fixada em HML `127.0.0.1:5441/frota_emprestimos_testes`, `default_transaction_read_only=on`, timeout 15 s e rollback. Testes de concorrência verificam que chamadas simultâneas não compartilham resultados/escopos; não são teste de carga.

Reprodução no diretório `backend`:

```powershell
$env:TEST_DATABASE_URL='sqlite+aiosqlite:///:memory:'
$env:ANALYTICS_V2_READONLY_TESTS='1'
./.venv/Scripts/python.exe -m pytest -q tests/test_analytics_v2.py tests/test_analytics_v2_postgres.py tests/test_analytics_metrics.py tests/test_user_permissions.py tests/test_vehicle_loan_foundation.py
```

Sem a flag opt-in, os cinco testes PostgreSQL são pulados; testes unitários/rota não precisam de banco real. Nunca habilitar testes de migration para reproduzir esta fase.

[Sonda real](evidence/phase-2-readonly.py) e [resultado](evidence/phase-2-readonly.json): execução global e para dois órgãos, duas consultas por resumo; tempos pontuais 0,2117 / 0,0892 / 0,0291 s, sem alegar benchmark de carga. Sessão read-only confirmada, zero escritas, contagem de snapshots inalterada, Alembic antes/depois `0049_justification_suggestions`. Evidência não contém nomes/placas/credenciais.

Frontend não foi alterado nesta fase. Gates adicionais do working tree herdado da Fase 1: `npm run test` **243 passed / 50 arquivos**, `npm run lint` **0 erros / 45 avisos preexistentes**, `npm run build` aprovado. Resultado preservado em relação à Fase 1, runner sem falhas. Não há nova tela para screenshots nesta fase; capturas da Fase 1 permanecem como referência visual. Endpoint validado em ASGI e serviço/SQL em HML; API em execução não foi reiniciada nem houve deploy.

Logs persistidos: [baseline backend](evidence/phase-2/baseline-backend.log), [backend final](evidence/phase-2/final-backend.log), [frontend](evidence/phase-2/frontend-test.log), [lint](evidence/phase-2/frontend-lint.log), [build](evidence/phase-2/frontend-build.log), [read-only](evidence/phase-2/readonly.log) e [preflight](evidence/phase-2/preflight.txt).

## Arquivos desta fase

- `backend/app/main.py`: inclusão aditiva do router.
- `backend/app/api/routes/analytics_v2.py`: endpoint, filtro comum e escopo.
- `backend/app/schemas/analytics_v2.py`: contratos tipados.
- `backend/app/services/analytics_v2_periods.py`: períodos, calendário, comparação e validade de leituras.
- `backend/app/repositories/analytics_v2_repository.py`: agregações de eventos e posses.
- `backend/app/services/analytics_v2_service.py`: resumo, cobertura, fórmulas e metadados.
- `backend/tests/test_analytics_v2.py`, `backend/tests/test_analytics_v2_postgres.py`.
- `docs/analytics-evolution/EXECPLAN_PHASE_2.md`, `API_V2_PHASE_2.md`, `11_STATUS.md`.
- `docs/analytics-evolution/evidence/phase-2-readonly.py`, `.json` e logs em `evidence/phase-2/`.

## Limitações e parada

Não representa despesas pagas/liquidadas, TCO, disponibilidade histórica, utilização, telemetria ou consumo real de tanque. Filtros adicionais, dia em curso, ranking paginado, benchmarks administráveis e detalhe ficam para fases próprias. As duas leituras seguem o isolamento transacional já existente; não se promete snapshot imutável entre consultas diante de edições concorrentes.

Nenhuma migration necessária ou executada. Encerrar para validação; **não iniciar Fase 3**.
