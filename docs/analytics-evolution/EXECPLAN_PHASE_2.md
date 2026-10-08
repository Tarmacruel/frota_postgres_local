# ExecPlan — Fase 2 — API V2 e cálculos

## Objetivo
Introduzir `/api/analytics/v2/summary` em paralelo à V1, com período explícito, comparação equivalente, agregações e proveniência. Somente homologação; nenhuma migration ou fase posterior.

## Estado inicial verificado
- Branch `feature/analytics-evolution-hml`, HEAD `082af32dee326408d023d0133272ae8eaa71eb20`.
- Working tree contém a Fase 1 não commitada; será preservada integralmente. Preflight completo em `storage/loan-tests/analytics-phase-2/preflight.txt`.
- Leituras: AGENTS, runbook, design system, status, baseline Fase 0. Mestre e fase consultados no pacote original porque caminhos finais ainda ausentes. Schemas de exemplo avaliados como referência, não copiados diretamente.
- Baseline backend: 29 testes aprovados, configuração isolada em SQLite em memória; nenhum teste de migration habilitado. Frontend herdado: 243 testes, lint 45 avisos/0 erros, build aprovado.

## Arquivos previstos
Schemas, helpers de período/comparação, repositório e serviço V2, rota V2 e inclusão em main; testes unitários/rota/SQL; documentação e evidências. Não alterar frontend nesta fase.

## Alterações funcionais proibidas
Sem migration, banco/schema, produção, contratos V1, permissões ou operações administrativas. Não implementar alert workflow, drill-down, relatórios V2 nem telas de fases posteriores.

## Decisões iniciais vinculadas ao baseline
- D03: reutilizar `America/Bahia`; datas civis inclusivas convertidas para `[início, próximo dia)` UTC. Intervalo de até 366 dias. Períodos completos para comparação; rejeitar dia atual/futuro nesta fundação, sem comparar dia parcial com dia completo.
- D04 inicial: fonte oficial de km perguntada ao usuário. Até decisão, nenhum fallback implícito por amplitude de abastecimentos; métricas dependentes indisponíveis.
- D04 aprovada durante a execução: **somente posses encerradas e válidas**. Implementação: duração positiva, leituras finitas não negativas/não regressivas, intervalo inteiramente contido na janela, sem sobreposição com outra posse encerrada. Sem rateio, viagens ou fallback de abastecimentos. Razões usam totais dos mesmos veículos com km válido, com cobertura parcial explicitada. Ausência de posses válidas é `null`, não zero.
- D05: preservar composição registrada V1 (combustível + manutenção por início + multas de todos os status), sem alegar pagamento. Separar multas por status e estimativas de sinistros. Não somar processos de pagamento aos registros, evitando duplicidade.
- D06: responsabilidade no evento com fallback histórico não ambíguo existente, jamais propriedade/lotação atual. Eventos incluem veículos atualmente inativos; não declarar frota historicamente disponível.
- D07: filtro validado de tipo/veículo aplicado em SQL a todas as fontes. Outros filtros do contrato proposto só quando aplicáveis e implementados; não aceitar filtros ignorados.
- D08: sem benchmark de mercado; comparação com período anterior calculado e proveniência explícita. Referências fixas V1 não usadas para decisões V2.
- D09: leitura pura, sem snapshots/cache pessoal ou compartilhado. Agregações por período/entidade independentes da quantidade de condutores.
- D10: dados inexistentes não implementados; sem migration.

## Passos de implementação
- [x] Leitura/preflight e delimitação do working tree herdado.
- [x] Baseline backend.
- [x] Contratos/helpers e agregações V2.
- [x] Testes de datas, métricas, escopo/permissão, SQL e quantidade de consultas.
- [x] Validação somente leitura em HML, documentação/status e encerramento.

## Validação visual
Nenhuma tela ou consumidor frontend será alterado. As capturas da Fase 1 continuam válidas; a UI permanece na V1.

## Testes e build
Baseline e regressão V1; testes novos de helpers, schemas, rotas e execução SQL isolada. Testes em banco real apenas HML e somente leitura. Não habilitar testes que executam migrations. Frontend sem alterações nesta fase.

## Resultado
Concluída em 07/10/2026, aguardando validação. Backend: 70 testes aprovados; frontend: 243 testes, lint 0 erros/45 avisos preexistentes e build aprovado. Duas consultas por resumo em HML, read-only confirmado, nenhum snapshot ou schema alterado. V1 e frontend intactos nesta fase. Contrato, decisões, arquivos e evidências em `API_V2_PHASE_2.md`. Sem commit/push ou reinício do serviço; não iniciar Fase 3.

## Pendências / decisões
Fonte oficial de km respondida e registrada acima; demais regras sensíveis explicitadas, sem mudança silenciosa. Fases futuras podem ampliar cobertura, sem presumir que km observado representa toda a distância percorrida.

## Rollback
Remover apenas V2 e inclusão do router; V1 e frontend da Fase 1 independentes. Sem alteração de dados a reverter.
