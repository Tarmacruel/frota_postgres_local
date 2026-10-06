# Status — Evolução Analytics

Atualizado em 06/10/2026. Histórico inicial preservado no pacote de origem `FROTA_SIREL_ANALYTICS_EVOLUTION_PACKAGE/docs/analytics-evolution/11_STATUS.md`, que tinha Fase 0 PENDENTE e demais fases BLOQUEADAS. Este é o status de execução no diretório definitivo; o pacote original não foi alterado.

| Fase | Estado | Data | HEAD inicial | HEAD final | Observações |
|---|---|---|---|---|---|
| 0 | AUDITORIA CONCLUÍDA — AGUARDA VALIDAÇÃO | 2026-10-06 | 738ebb7 | 738ebb7 | [Baseline e decisões](BASELINE_PHASE_0.md); sem alteração funcional |
| 1 | BLOQUEADA | | | | Fundação visual; depende de validação e autorização |
| 2 | BLOQUEADA | | | | API V2/cálculos; depende das decisões D03–D10 |
| 3 | BLOQUEADA | | | | Visão Geral |
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
