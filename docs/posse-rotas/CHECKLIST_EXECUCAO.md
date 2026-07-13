# Checklist de Execução

> Marcar um item somente após existir evidência objetiva no commit, teste ou relatório da fase.

## Estado geral

- [x] Branch `feat/posse-rotas-relatorios-devolucao` criada a partir de `módulo-analytics`.
- [x] Plano inicial documentado.
- [x] Baseline técnico confirmado. Evidência: `BASELINE_TECNICO.md` (2026-07-10).
- [x] Implementação concluída. Evidência: Fases 1–8 versionadas e release `d0f9e06` publicado.
- [x] Ensaio de migration concluído. Evidência: Fase 2 em banco limpo e cópia controlada, registrada em `RELATORIO_FASE_2.md`.
- [x] Validação funcional concluída. Evidência: 152 backend, 24 frontend, build e smoke técnico público aprovados.
- [x] Revisão de segurança/LGPD concluída. Evidência: threat model, inventário, matriz e auditorias de dependência.
- [x] Integração final aplicada diretamente em `main`. Evidência: fast-forward remoto até `f4abcef`, por autorização expressa do solicitante.
- [x] Merge autorizado pelo solicitante nesta conversa; revisão humana/PR original foram excepcionalmente substituídos.

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

- [x] Criação de posse sem rota funcionando. Evidência: teste PostgreSQL/API no commit `2f93d77`.
- [x] Criação atômica de posse com rota inicial funcionando. Evidência: múltiplos destinos persistidos no mesmo commit e rollback forçado do segundo destino.
- [x] Substituição de posse ativa exige confirmação e justificativa. Evidência: `409 ACTIVE_POSSESSION_EXISTS`, lock do veículo/posse e evento `POSSESSION_REPLACE_ACTIVE`.
- [x] Criação de rota funcionando. Evidência: `POST /api/possession/{possession_id}/trips` e teste de posse ativa/encerrada.
- [x] Inclusão de destino funcionando. Evidência: lote, sequência 1–2 e concorrência real validada.
- [x] Encerramento de rota funcionando. Evidência: retorno/hodômetro válidos e inválidos cobertos.
- [x] Cancelamento de rota funcionando. Evidência: justificativa obrigatória e histórico preservado.
- [x] Encerramento de posse bloqueado com rota aberta. Evidência: endpoint legado e retificação administrativa respondem `409 POSSESSION_HAS_OPEN_TRIP`.
- [x] IDOR bloqueado. Evidência: rota existente consultada sob outra posse retorna 404.
- [x] Paginação e filtros server-side implementados. Evidência: `page`, `limit`, filtro `status` e contagem consultados no repository.
- [x] Auditoria das mutações validada. Evidência: seis eventos, request ID e rollback sem auditoria de sucesso testados.
- [x] Testes de serviços e endpoints executados. Evidência: 15 testes direcionados e suíte completa com 121 aprovados.

## Fase 4 — Frontend de posses e rotas

### Liberação de entrada — 2026-07-13

- [x] Backup pré-upgrade criado e validado. Evidência: dump custom de 1.324.309 bytes, SHA-256 registrado e catálogo aprovado.
- [x] Banco fonte atualizado para `0039_possession_trips`. Evidência: `alembic heads/current` convergentes.
- [x] Legado preservado no upgrade. Evidência: 357 posses, 27 ativas, checksums idênticos e 10/10 arquivos presentes.
- [x] Drift do metadata reconciliado sem migration. Evidência: `alembic check` sem novas operações.
- [x] Testes e lint frontend disponíveis. Evidência: Vitest/Testing Library/ESLint no commit `abbf266`.
- [x] Dependências auditadas. Evidência: `npm audit --audit-level=low` com zero vulnerabilidades.
- [x] Suíte/backend e build repetidos. Evidência: 121 testes backend, 5 frontend e build de 964 módulos aprovados.
- [x] Logs runtime removidos do índice Git e preservados localmente por `storage/logs/` no `.gitignore`.
- [x] Escopo preservado: nenhuma tela, endpoint ou regra funcional da Fase 4 implementada nesta preparação.

- [x] Componentes extraídos de `PossessionPage` quando necessário. Evidência: `InitialTripFields`, `PossessionTripsModal`, `TripDestinationEditor` e `TripTimeline`.
- [x] Rota inicial opcional disponível na nova posse. Evidência: multipart `initial_trip_json` testado, sem alterar evidências ou documentos existentes.
- [x] Destinos dinâmicos implementados. Evidência: inclusão, remoção e reordenação por botões acessíveis.
- [x] Timeline de rotas implementada. Evidência: paginação, estados textuais e vazio legado em `TripTimeline`.
- [x] Ação “Adicionar destino” implementada. Evidência: contrato aninhado da Fase 3, lote de destinos e prevenção de duplo envio.
- [x] Ação “Registrar retorno” implementada. Evidência: aviso e feedback afirmam que somente a rota termina e a posse continua ativa.
- [x] Ação “Encerrar posse” visualmente distinta. Evidência: ação separada e bloqueada após consulta oficial quando há rota em andamento.
- [x] Estados de loading, erro e conflito implementados. Evidência: testes de `401`, `403`, `409` e `422`, com recarga autoritativa no conflito.
- [x] Proteção por perfil aplicada no frontend. Evidência: mutações por permissões granulares, retificação apenas `ADMIN`, resposta restrita sem origem/destinos.
- [x] Navegação por teclado validada. Evidência: foco/escape/retorno no modal e reordenação de destinos por botões testados.
- [x] Build frontend concluído. Evidência: Vite 8.1.4, 970 módulos em 10,56 s na execução final.
- [x] Testes de componentes executados. Evidência: 8 arquivos e 15 testes aprovados em 92,19 s; falhas de inicialização anteriores registradas em `RELATORIO_FASE_4.md`.

## Fase 5 — Termo único e devolução

- [x] Declaração de devolução versionada. Evidência: constantes v1.0 persistidas por confirmação e teste de linguagem sem promessa criptográfica.
- [x] Checkbox não pré-marcado. Evidência: componente e teste DOM aprovados na cópia local controlada.
- [x] Hodômetro final e condições exigidos. Evidência: schema backend, validação de domínio e campos HTML obrigatórios.
- [x] Hash canônico persistido. Evidência: JSON determinístico UTF-8/SHA-256 e testes de estabilidade/alteração.
- [x] Confirmação autenticada auditada. Evidência: request context persistido e eventos `POSSESSION_RETURN_CONFIRMATION`/`POSSESSION_END` na transação.
- [x] PDF gerado no backend a partir de dados persistidos. Evidência: ReportLab 5.0.0, grafo eager e teste de PDF válido.
- [x] Termo contém rotas e destinos. Evidência: tabelas ordenadas por sequência no gerador backend.
- [x] Termo contém devolução quando aplicável. Evidência: confirmação corrente, declaração, condições, hodômetro e hash; legado recebe aviso explícito.
- [x] Não existe termo separado de devolução. Evidência: endpoint de encerramento agora aceita JSON versionado, novos códigos públicos são nulos e upload separado retorna conflito.
- [x] Preview/download protegidos e auditados. Evidência: RBAC, mascaramento, headers no-cache e eventos `TERM_PREVIEW`/`TERM_DOWNLOAD` testados.
- [x] Testes do termo e da devolução executados. Evidência: 11 testes backend direcionados e 4 testes frontend da Fase 5 aprovados; suíte frontend completa 22/22 na cópia local controlada.

## Fase 6 — Relatórios configuráveis

- [x] Registry única de colunas criada no backend. Evidência: 37 descritores tipados em `possession_report_registry.py`, com extrator fixo, modo, classificação, perfis, presets, máscara e largura.
- [x] Endpoint de metadados autorizado criado. Evidência: `GET /api/possession/reports/metadata` usa `possession.view` e retorna apenas colunas/presets do teto do perfil.
- [x] Presets implementados. Evidência: Resumido, Operacional, Completo e Personalizado são resolvidos exclusivamente pela registry; `PADRAO` recebe apenas Resumido/Personalizado seguro.
- [x] “Mais opções” implementado. Evidência: `PossessionReportBuilder` com modo, preset, filtros, orientação, colunas, restauração e ações oficiais.
- [x] Filtros implementados. Evidência: período/critério temporal, veículo, condutor, status, retorno, confirmação e busca parametrizada são executados no repository backend, com intervalo máximo de 366 dias.
- [x] PDF respeita seleção. Evidência: ReportLab consome `PreparedReport`, repete cabeçalhos, aplica limite de colunas/linhas e retorna arquivo autenticado `no-store`.
- [x] XLSX respeita a mesma seleção. Evidência: openpyxl consome o mesmo `PreparedReport`, preserva ordem/tipos, congela cabeçalho, aplica autofiltro e neutraliza fórmulas.
- [x] Colunas restritas bloqueadas no backend. Evidência: testes de chave desconhecida, incompatível e `driver_document` forjado por `PADRAO` retornam erro seguro antes da consulta.
- [x] Preferência do usuário persistida sem dados pessoais. Evidência: migration `0040_report_preferences`; payload contém somente modo, preset e chaves validadas, com `REPORT_PREFERENCE_UPDATE`.
- [x] Preview e exportação auditados. Evidência: `REPORT_PREVIEW` e `REPORT_EXPORT_XLSX` registram filtros normalizados, chaves, contagem, duração e resultado, sem linhas integrais.
- [x] Testes de consistência PDF/XLSX executados. Evidência: 19 testes backend direcionados e 3 testes frontend do configurador; suíte completa registrada em `RELATORIO_FASE_6.md`.

## Fase 7 — Hardening, LGPD e acessibilidade

- [x] Threat model atualizado. Evidência: `THREAT_MODEL.md`, 20 ameaças com controle, teste e residual.
- [x] Testes de IDOR ampliados. Evidência: suíte integrada mantém vínculo posse/rota/destino/arquivo e 152 testes backend aprovados.
- [x] Headers de segurança revisados. Evidência: CSP, HSTS em produção, frame denial, nosniff, no-referrer, Permissions-Policy e no-store.
- [x] CORS revisado. Evidência: produção aceita somente `https://frota.sirel.com.br` e falha ao iniciar com origem HTTP.
- [x] Cookies revisados para produção. Evidência: configuração exige Secure, segredo forte e origem CSRF explícita; testes fail-closed.
- [x] Arquivos protegidos contra path traversal e cache indevido. Evidência: containment, magic bytes/DOCX, limite e nomes opacos testados.
- [x] Mascaramento validado em todos os perfis. Evidência: `MATRIZ_ENDPOINTS_PERFIS.md`, RBAC e bloqueio de foto integral para PADRAO.
- [x] Presets mínimos confirmados. Evidência: Resumido sem documento, contato, coordenadas ou metadados técnicos.
- [x] Logs verificados contra vazamento de dados. Evidência: inventário e testes de auditoria sem binário/relatório integral/segredo.
- [x] eMAG/WCAG 2.1 AA verificados no fluxo principal. Evidência: `CHECKLIST_ACESSIBILIDADE.md` e 24 testes frontend.
- [x] Dependências revisadas. Evidência: `npm audit` 0; `pip-audit` reduzido de 21 para um residual `ecdsa` não alcançável por HS256.

## Fase 8 — Testes, rollout e integração com main

- [x] Backup e restauração testados. Evidência: ZIP/SHA válidos, 51 entradas, banco descartável restaurado e removido.
- [x] Migration ensaiada em cópia recente. Evidência: 0039 → 0040 em 65.788 ms, contagens idênticas.
- [x] Testes backend completos executados. Evidência: 152 aprovados, 17 pulados e 3 warnings em 26,35 s.
- [x] Testes frontend completos executados. Evidência: 12 arquivos e 24 testes aprovados em 8,29 s na cópia local controlada.
- [x] Build de produção executado. Evidência: Vite 8.1.4, 974 módulos, build aprovado.
- [x] Smoke test técnico executado. Evidência: health/login 200, docs 404, auth sem sessão 401, headers/bundle/runtime conferidos; perfis cobertos em testes isolados sem mutação real.
- [x] Desempenho e N+1 verificados. Evidência: preload em três SELECTs para cinco posses e limites de 1.500/5.000 linhas.
- [x] Rollback documentado. Evidência: `PLANO_ROLLBACK.md` com retorno de app, restauração e preservação pós-backup.
- [x] Branch sincronizada com `módulo-analytics`. Evidência: ambas as grafias remotas são ancestrais da feature.
- [x] Divergência com `main` analisada. Evidência: `origin/main` incorporada em `961bb6e`, feature 151/0 antes do commit final.
- [x] Promoção para `main` concluída. Evidência: `origin/main` avançou de `359ecc8` para `f4abcef` sem force-push.
- [x] Evidências públicas pós-deploy registradas em `RELATORIO_VALIDACAO_FINAL.md`.
- [x] Merge automático realizado conforme autorização excepcional do solicitante. Integração foi fast-forward e preservou `origin/main` como ancestral.

## Registro de evidências

| Data | Fase | Commit/PR | Comandos executados | Resultado | Responsável |
|---|---|---|---|---|---|
| 2026-07-10 | 0 | árvore local em `3f95695` | Git refs/diffs; versões; `alembic heads/current/history --verbose`; consultas somente leitura ao PostgreSQL; `pytest tests -q`; `npm run build`; `Diagnostico.ps1` | Baseline documentado; 6 testes e build passaram; `alembic current` falhou por revisão ausente; diagnóstico teve falso positivo | Codex |
| 2026-07-10 | Desbloqueio Fase 1 | `6127290`, `9611f38`, `7942826` | merge explícito; consultas de schema; `alembic heads/current/history --verbose`; `pytest tests -q`; `npm run build`; `git diff --check` | Produção sincronizada; Alembic em `0038`; 81 testes e build passaram; nenhuma migration/schema alterados | Codex |
| 2026-07-11 | 1 | `61d3433` | `python -m pytest tests -q`; `npm run build`; `python -m alembic heads`; `python -m alembic current`; `python -m alembic history --verbose`; `git diff --check` | 95 testes e build aprovados; head/current `0038_require_user_cpf`; request context, CSRF/Origin, auditoria, erros e headers validados; nenhuma migration | Codex |
| 2026-07-11 | 2 | `185066c` | `alembic heads/current/history`; upgrades clean e cópia; `pytest tests/test_phase2_possession_schema.py -q`; `pytest tests -q`; `npm run build`; consultas de catálogo/contagens/checksums; `alembic check`; `git diff --check` | 0039 aplicada nos dois bancos isolados; 11 testes PostgreSQL e 97 testes gerais aprovados; 350 posses e referências preservadas; falhas preexistentes de upgrade vazio/autogenerate registradas | Codex |
| 2026-07-13 | 3 | `2f93d77` | `pytest tests/test_phase3_possession_routes.py -q`; `pytest tests -q`; `python -m compileall -q app`; `npm run build`; `alembic heads/current/history --verbose`; `alembic check`; `git diff --check` | 15 testes direcionados e 121 totais aprovados; build aprovado; código/clean em 0039, fonte em 0038; ruído preexistente do autogenerate preservado | Codex |
| 2026-07-13 | Liberação Fase 4 | `abbf266` | backup/restore-list/hash; upgrade 0039; consultas de preservação; `alembic heads/current/history/check`; `pytest tests -q`; `npm test`; `npm run lint`; `npm run build`; `npm audit`; `git diff --check` | fonte em 0039; 357 posses e arquivos preservados; 121 testes backend e 5 frontend aprovados; lint sem erros; build aprovado; audit e Alembic limpos | Codex |
| 2026-07-13 | 4 | árvore de trabalho sobre `4295b98` | `pytest tests -q` com bancos isolados; `compileall`; `alembic heads/current/history/check`; `npm test`; `npm run lint`; `npm run build`; `npm audit`; `git diff --check` | 121 backend e 15 frontend aprovados; head/current 0039; build de 970 módulos; lint sem erros e 45 warnings baseline; zero vulnerabilidades; nenhum schema/backend alterado | Codex |
| 2026-07-13 | 5 | árvore de trabalho sobre `4295b98` | `pytest tests/test_phase5_possession_return.py -q`; `pytest -q`; `compileall`; Vitest no `Z:` e em cópia local controlada; `npm run lint`; `npm run build`; `npm audit`; `alembic heads/current/history/check`; `git diff --check`; versões do ambiente | 14 direcionados incluídos em 118 backend aprovados, 17 integrações PostgreSQL sem URL isolada puladas; 22/22 frontend aprovados localmente; build 974 módulos; lint 0 erros/45 warnings baseline; audit zero; head/current 0039 e nenhuma operação de upgrade nova | Codex |
| 2026-07-13 | 6 | árvore sobre commit `d86ce42` | `alembic heads/current/history`; upgrade/downgrade/reupgrade e `alembic check` em bancos efêmeros; `pytest tests/test_phase6_possession_reports.py -q`; `pytest -q`; Vitest em `Z:` e cópia local; `npm run lint`; `npm run build`; `npm audit`; probes SQL read-only | migration 0040 validada e bancos efêmeros removidos; 19 direcionados incluídos em 137 backend aprovados/17 pulados; 25/25 frontend; build 975 módulos; lint 0 erros/45 warnings baseline; audit zero; posse em 5 linhas/3 SELECTs; banco existente preservado em 0039 | Codex |
| 2026-07-13 | 7–8 | `d0f9e06` | merge `origin/main`; backup/restore descartável; `pytest`; Vitest local; build/lint; npm/pip audit; parser PowerShell; Alembic heads/current/check/upgrade; probes HTTP/headers/processos/contagens | 152 backend e 24 frontend; migration 0039→0040 em produção; health/login 200 e docs 404; tour no bundle, aviso removido; runtime em loopback; PostgreSQL protegido por senha/HBA, restart administrativo pendente | Codex |
| 2026-07-13 | Revisão documental pós-rollout | árvore sobre `1619fbf` | inventário de emissores; `pytest`; testes PostgreSQL em banco descartável; Vitest; build/lint; npm/pip audit; `compileall`; `pip check`; `git diff --check`; Alembic heads/current/history; inspeção visual de PDF | termo institucional com brasão e assinaturas; 194 backend, 29 PostgreSQL, 35 focados e 28 frontend aprovados; build 974 módulos; head/current 0040; pip-audit reduzido a 1 residual sem correção; publicação frontal/commit e smoke ainda pendentes | Codex |
