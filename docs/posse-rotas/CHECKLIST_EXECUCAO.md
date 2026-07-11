# Checklist de Execução

> Marcar um item somente após existir evidência objetiva no commit, teste ou relatório da fase.

## Estado geral

- [x] Branch `feat/posse-rotas-relatorios-devolucao` criada a partir de `módulo-analytics`.
- [x] Plano inicial documentado.
- [x] Baseline técnico confirmado. Evidência: `BASELINE_TECNICO.md` (2026-07-10).
- [ ] Implementação concluída.
- [x] Ensaio de migration concluído. Evidência: Fase 2 em banco limpo e cópia controlada, registrada em `RELATORIO_FASE_2.md`.
- [ ] Validação funcional concluída.
- [ ] Revisão de segurança/LGPD concluída.
- [ ] Pull Request final aberto para `main`.
- [ ] Merge autorizado por revisão humana.

## Fase 0 — Baseline e governança

- [x] Branch ativa confirmada. `feat/posse-rotas-relatorios-devolucao` em `3f956950959f1e38e544ebff09071043db57359f`.
- [x] SHA de origem registrado. `origin/modulo-analytics` em `bb3b094a9751d0b2ae72c47dc1384cde0580792b`.
- [x] Estrutura do backend inventariada. Evidência: `BASELINE_TECNICO.md`, seção 4.
- [x] Estrutura do frontend inventariada. Evidência: `BASELINE_TECNICO.md`, seção 5.
- [x] Heads do Alembic registrados no baseline inicial. Eram `0014_fleet_analytics` e `10d2f34e089d`; a reconciliação posterior está registrada abaixo.
- [x] Versões de Python, Node e PostgreSQL registradas. Evidência: `BASELINE_TECNICO.md`, seção 3.
- [x] Testes existentes executados. `python -m pytest tests -q`: 6 passed em 1,45 s, com warning de configuração do pytest-asyncio.
- [x] Build atual executado. `npm run build`: sucesso, 369 módulos, 35,11 s.
- [x] Fluxo atual de posse reproduzido. Rastreamento não mutativo ponta a ponta documentado em `BASELINE_TECNICO.md`, seção 6.
- [x] Matriz RBAC validada com o código real. Divergências e exposição de dados registradas em `BASELINE_TECNICO.md`, seções 4.4 e 9.
- [x] Riscos e débitos técnicos da implementação registrados. Evidência: `RISCOS_E_DEBITOS.md`.

## Desbloqueio anterior à Fase 1

- [x] Baseline registrado em commit próprio: `6127290`.
- [x] `origin/modulo-analytics` incorporada por merge explícito: `9611f38`.
- [x] Código funcional de produção preservado; helpers experimentais com token/localStorage removidos.
- [x] Grafo Alembic reconciliado sem migration ou `stamp`: head/current `0038_require_user_cpf`.
- [x] ADR 002 aprovado para compatibilidade, legado, exclusão e tetos de perfil.
- [x] Hard delete de posse bloqueado, auditado e coberto por teste.
- [x] Tetos de `ADMIN`, `PRODUCAO`, `PADRAO` e `POSTO` aplicados no backend e frontend.
- [x] Exposição integral para `PRODUCAO` e mascarada/restrita para `PADRAO` coberta por testes.
- [x] Suíte backend pós-merge: 81 testes aprovados em 6,54 s.
- [x] Build frontend pós-merge: 1.071 módulos em 1 min 33 s.
- [x] Schema de `vehicle_possession` conferido sem alteração: 31 colunas, 7 índices e 3 constraints.

## Fase 1 — Segurança, auditoria e contexto

- [x] Request/correlation ID implementado. Evidência: `request_context.py` e testes de geração, preservação e substituição.
- [x] IP e User-Agent normalizados. Evidência: testes de peer não confiável, cadeia confiável, limite e UTC.
- [x] Auditoria recebe contexto sem acoplamento indevido. Evidência: `ContextVar`, parâmetro opcional compatível e teste de sanitização.
- [x] Proteção CSRF implementada. Evidência: double-submit para cookie autenticado em POST/PUT/PATCH/DELETE.
- [x] Origin/Referer validados nas mutações. Evidência: testes de origem ausente, indevida, permitida e fallback de Referer.
- [x] Erros não expõem stack trace ou segredos. Evidência: envelopes 401/403/422/500 com request ID e log interno sem valores da exceção.
- [x] Testes 401/403/CSRF executados. Evidência: suíte backend com 95 testes aprovada em 2026-07-11.
- [x] Rotas atuais continuam funcionando. Evidência: suíte completa e build frontend aprovados.

## Fase 2 — Modelo de dados e migrations

- [x] Modelo de rota criado. Evidência: `VehiclePossessionTrip` no commit `185066c`.
- [x] Modelo de destino criado. Evidência: `VehiclePossessionTripDestination` no commit `185066c`.
- [x] Modelo versionado de confirmação criado. Evidência: append-only, unique current e cadeia de substituição testada.
- [x] Número público da posse definido. Evidência: sequence `NO CYCLE`, backfill 1–350 sem nulos/duplicatas na cópia.
- [x] Constraints e índices criados. Evidência: 42 constraints e 19 índices nas tabelas novas.
- [x] Índice parcial de rota em andamento criado. Evidência: `uq_possession_trip_open`, validado em PostgreSQL.
- [x] Legado preservado. Evidência: contagens e checksums de IDs/referências idênticos antes/depois; 10/10 arquivos presentes.
- [x] Upgrade executado em banco limpo. Evidência: `frota_phase2_clean_20260711_01` em `0039_possession_trips`.
- [x] Upgrade executado em cópia de banco existente. Evidência: `frota_phase2_copy_20260711_01`, 350 posses preservadas.
- [x] Downgrade técnico avaliado e documentado. Evidência: guarda contra dados novos e rollback por backup no relatório.
- [x] Testes de integridade e concorrência executados. Evidência: 11 testes PostgreSQL aprovados em 2,60 s.

## Fase 3 — Backend de posses e rotas

- [ ] Criação de posse sem rota funcionando.
- [ ] Criação atômica de posse com rota inicial funcionando.
- [ ] Substituição de posse ativa exige confirmação e justificativa.
- [ ] Criação de rota funcionando.
- [ ] Inclusão de destino funcionando.
- [ ] Encerramento de rota funcionando.
- [ ] Cancelamento de rota funcionando.
- [ ] Encerramento de posse bloqueado com rota aberta.
- [ ] IDOR bloqueado.
- [ ] Paginação e filtros server-side implementados.
- [ ] Auditoria das mutações validada.
- [ ] Testes de serviços e endpoints executados.

## Fase 4 — Frontend de posses e rotas

- [ ] Componentes extraídos de `PossessionPage` quando necessário.
- [ ] Rota inicial opcional disponível na nova posse.
- [ ] Destinos dinâmicos implementados.
- [ ] Timeline de rotas implementada.
- [ ] Ação “Adicionar destino” implementada.
- [ ] Ação “Registrar retorno” implementada.
- [ ] Ação “Encerrar posse” visualmente distinta.
- [ ] Estados de loading, erro e conflito implementados.
- [ ] Proteção por perfil aplicada no frontend.
- [ ] Navegação por teclado validada.
- [ ] Build frontend concluído.
- [ ] Testes de componentes executados.

## Fase 5 — Termo único e devolução

- [ ] Declaração de devolução versionada.
- [ ] Checkbox não pré-marcado.
- [ ] Hodômetro final e condições exigidos.
- [ ] Hash canônico persistido.
- [ ] Confirmação autenticada auditada.
- [ ] PDF gerado no backend a partir de dados persistidos.
- [ ] Termo contém rotas e destinos.
- [ ] Termo contém devolução quando aplicável.
- [ ] Não existe termo separado de devolução.
- [ ] Preview/download protegidos e auditados.
- [ ] Testes do termo e da devolução executados.

## Fase 6 — Relatórios configuráveis

- [ ] Registry única de colunas criada no backend.
- [ ] Endpoint de metadados autorizado criado.
- [ ] Presets implementados.
- [ ] “Mais opções” implementado.
- [ ] Filtros implementados.
- [ ] PDF respeita seleção.
- [ ] XLSX respeita a mesma seleção.
- [ ] Colunas restritas bloqueadas no backend.
- [ ] Preferência do usuário persistida sem dados pessoais.
- [ ] Preview e exportação auditados.
- [ ] Testes de consistência PDF/XLSX executados.

## Fase 7 — Hardening, LGPD e acessibilidade

- [ ] Threat model atualizado.
- [ ] Testes de IDOR ampliados.
- [ ] Headers de segurança revisados.
- [ ] CORS revisado.
- [ ] Cookies revisados para produção.
- [ ] Arquivos protegidos contra path traversal e cache indevido.
- [ ] Mascaramento validado em todos os perfis.
- [ ] Presets mínimos confirmados.
- [ ] Logs verificados contra vazamento de dados.
- [ ] eMAG/WCAG 2.1 AA verificados no fluxo principal.
- [ ] Dependências revisadas.

## Fase 8 — Testes, rollout e integração com main

- [ ] Backup e restauração testados.
- [ ] Migration ensaiada em cópia recente.
- [ ] Testes backend completos executados.
- [ ] Testes frontend completos executados.
- [ ] Build de produção executado.
- [ ] Smoke test executado.
- [ ] Desempenho e N+1 verificados.
- [ ] Rollback documentado.
- [ ] Branch sincronizada com `módulo-analytics`.
- [ ] Divergência com `main` analisada.
- [ ] PR final para `main` aberto.
- [ ] Evidências anexadas ao PR.
- [ ] Nenhum merge automático realizado.

## Registro de evidências

| Data | Fase | Commit/PR | Comandos executados | Resultado | Responsável |
|---|---|---|---|---|---|
| 2026-07-10 | 0 | árvore local em `3f95695` | Git refs/diffs; versões; `alembic heads/current/history --verbose`; consultas somente leitura ao PostgreSQL; `pytest tests -q`; `npm run build`; `Diagnostico.ps1` | Baseline documentado; 6 testes e build passaram; `alembic current` falhou por revisão ausente; diagnóstico teve falso positivo | Codex |
| 2026-07-10 | Desbloqueio Fase 1 | `6127290`, `9611f38`, `7942826` | merge explícito; consultas de schema; `alembic heads/current/history --verbose`; `pytest tests -q`; `npm run build`; `git diff --check` | Produção sincronizada; Alembic em `0038`; 81 testes e build passaram; nenhuma migration/schema alterados | Codex |
| 2026-07-11 | 1 | `61d3433` | `python -m pytest tests -q`; `npm run build`; `python -m alembic heads`; `python -m alembic current`; `python -m alembic history --verbose`; `git diff --check` | 95 testes e build aprovados; head/current `0038_require_user_cpf`; request context, CSRF/Origin, auditoria, erros e headers validados; nenhuma migration | Codex |
| 2026-07-11 | 2 | `185066c` | `alembic heads/current/history`; upgrades clean e cópia; `pytest tests/test_phase2_possession_schema.py -q`; `pytest tests -q`; `npm run build`; consultas de catálogo/contagens/checksums; `alembic check`; `git diff --check` | 0039 aplicada nos dois bancos isolados; 11 testes PostgreSQL e 97 testes gerais aprovados; 350 posses e referências preservadas; falhas preexistentes de upgrade vazio/autogenerate registradas | Codex |
