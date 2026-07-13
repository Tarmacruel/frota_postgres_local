# Riscos e débitos — baseline da Fase 0

Classificação: **Crítico** (perda/comprometimento provável ou avanço inseguro), **Alto** (exposição/integridade relevante), **Médio** (fragilidade operacional/manutenibilidade) e **Baixo** (qualidade localizada).

## Atualização de 2026-07-10

| Risco | Situação após desbloqueio |
|---|---|
| R-001 | **Resolvido:** produção incorporada por merge `9611f38`; feature não está atrás de `origin/modulo-analytics` |
| R-002 | **Resolvido:** `heads/current = 0038_require_user_cpf`, sem migration, edição ou `stamp` |
| R-004 | **Mitigado no módulo de posses:** exposição agora segue teto por perfil; revisão transversal continua na Fase 7 |
| R-006 | **Mitigado:** API/repository de hard delete de posse neutralizados; FKs legadas serão tratadas na modelagem futura sem apagar histórico |
| R-010 | **Resolvido por decisão:** transição compatível formalizada no ADR 002 |
| R-012 | **Resolvido pela sincronização:** ações de posse obedecem permissões efetivas; exclusão foi removida da interface |
| R-022 | **Resolvido:** cliente experimental com token em `localStorage` removido |
| R-026 | **Resolvido:** permissões granulares preservadas com teto de perfil no módulo de posses |

Os demais riscos continuam válidos para as fases indicadas.

## Atualização da Fase 1 — 2026-07-11

| Risco | Situação após a Fase 1 |
|---|---|
| R-003 | **Resolvido:** double-submit CSRF, `Origin`/`Referer`, origem explícita e testes negativos/positivos implantados no commit `61d3433` |
| R-009 | **Mitigado para novos eventos:** documento, CPF e contato são mascarados; token/cookie/segredo e binário são omitidos. Auditorias históricas não foram reescritas e permanecem como risco LGPD residual |
| R-011 | **Resolvido:** request ID, IP, User-Agent, método, path e UTC percorrem request, erro e novas auditorias |
| R-016 | **Mitigado no escopo da fase:** suíte passou de 81 para 95 testes, cobrindo request context, proxy, CSRF, 401, 403 e sanitização; E2E e concorrência continuam pendentes |
| R-023 | **Mitigado:** CORS continua explícito e headers mínimos foram centralizados; hardening integral da CSP permanece na Fase 7 |
| R-025 | **Pendente de deploy:** exemplo de produção exige `COOKIE_SECURE=true`, mas o ambiente real precisa ser confirmado sob TLS |

Novos riscos operacionais documentados no `RELATORIO_FASE_1.md`: configurar `CSRF_TRUSTED_ORIGINS` com origens HTTPS reais; manter `TRUSTED_PROXY_NETWORKS` vazio até confirmação dos CIDRs; tratar auditorias legadas com dados integrais; e validar a topologia do proxy antes da Fase 2.

## Atualização da Fase 2 — 2026-07-11

| Risco | Situação após a Fase 2 |
|---|---|
| R-005 | **Parcialmente mitigado no schema futuro:** locks de sequência e índices parciais foram preparados; a confirmação/justificativa da substituição de posse continua para a Fase 3 |
| R-006 | **Mitigado no banco:** FK veículo→posse alterada para `RESTRICT` e triggers bloqueiam DELETE de posse, rota, destino e confirmação |
| R-016 | **Mitigado:** 11 testes PostgreSQL de integridade/migration/concorrência e 97 testes gerais aprovados |
| R-019 | **Mitigado para campos novos:** hodômetros de rota/devolução usam `numeric(12,1)` e checks; campos legados continuam `Float` |
| R-020 | **Mitigado para sequências:** repository usa lock do pai e teste concorrente real; sobreposição administrativa legada continua para a Fase 3 |

Débitos encontrados no ensaio:

- upgrade de banco totalmente vazio em uma única chamada falha na migration antiga 0034 por uso de `PRODUCAO` antes do commit da 0003; o ensaio passou com fronteira explícita de commit, sem editar migration ou usar `stamp`;
- `alembic check` continua apontando diffs preexistentes de JSON/índices/FKs em outros módulos, sem divergência nas entidades da Fase 2;
- os bancos isolados `frota_phase2_clean_20260711_01` e `frota_phase2_copy_20260711_01` foram preservados como evidência; a cópia deve manter acesso restrito até remoção autorizada;
- o banco fonte permanece em 0038 e deve receber a 0039 antes da publicação do código da Fase 3.

## Atualização da Fase 3 — 2026-07-13

| Risco | Situação após a Fase 3 |
|---|---|
| R-005 | **Resolvido no backend:** substituição exige flag, justificativa, lock do veículo/posse e auditoria; rota aberta bloqueia a operação |
| R-016 | **Mitigado:** 15 testes direcionados e 121 testes totais cobrem domínio, API, CSRF, RBAC, IDOR, rollback, auditoria e concorrência PostgreSQL |
| R-019 | **Mitigado no fluxo:** rotas usam `Decimal`; criação exige continuidade do último hodômetro e encerramentos rejeitam regressão |
| R-020 | **Mitigado no módulo:** criação/substituição bloqueia veículo e posse; rota/destino usam locks dos pais e constraints como última barreira |
| R-021 | **Mitigado para falhas tratadas:** compensação de arquivos foi validada com falha forçada; queda abrupta entre filesystem e banco continua risco residual da Fase 7 |

Riscos para a Fase 4:

- o banco fonte continua em 0038 e deve receber a 0039 antes de publicar o backend que consulta `public_number` e tabelas de rota;
- o frontend atual não confirma substituição: recebe `409 ACTIVE_POSSESSION_EXISTS` até a interface da Fase 4 implementar confirmação e justificativa;
- os filtros da tela de auditoria não enumeram os seis novos eventos, embora a listagem “TODAS” já os exiba;
- não há testes frontend, lint ou typecheck; o build continua sendo a única validação automatizada disponível;
- o `alembic check` mantém os mesmos diffs preexistentes de outros módulos, sem alteração de schema na Fase 3.

## Críticos

| ID | Achado/evidência | Impacto | Tratamento antes/depois |
|---|---|---|---|
| R-001 | Feature 86 commits atrás de `origin/modulo-analytics`; produção tem mudanças extensas em posse, segurança e migrations | Implementar Fase 1 aqui pode remover ou duplicar comportamento de produção | Definir sincronização segura fora da Fase 0; repetir baseline após integração |
| R-002 | Banco em `0038_require_user_cpf`; migration ausente; `alembic current` falha | Migration futura pode usar `down_revision` errado ou danificar schema | Bloquear Fase 1/2 até código e banco usarem o mesmo grafo |

## Altos

| ID | Achado/evidência | Impacto | Fase indicada |
|---|---|---|---|
| R-003 | Sem CSRF nem validação Origin/Referer com autenticação por cookie | Mutação forjada em sessão autenticada | Fase 1 |
| R-004 | Documento e contato integrais enviados a todos os autenticados e incluídos em exportações | Violação de minimização/LGPD | Fases 1, 6 e 7 |
| R-005 | Criação encerra posse ativa sem confirmação, justificativa ou lock | Perda lógica de responsabilidade e corrida entre operadores | Fase 3 |
| R-006 | Banco/feature permitem `ON DELETE CASCADE` de veículo/fotos; produção atual adiciona DELETE de posse | Histórico administrativo pode ser apagado | Decisão arquitetural antes da Fase 2 |
| R-007 | Upload valida apenas `Content-Type` declarado; sem MIME real/malware | Arquivo malicioso ou spoofing | Fase 7, com política definida antes |
| R-008 | Paths persistidos são concatenados ao storage sem contenção explícita | Path traversal se valor persistido for adulterado | Fase 7 |
| R-009 | Auditoria de posse grava documento/contato integrais | Exposição ampliada em log administrativo | Fase 1 |
| R-010 | Produção atual possui termos separados/públicos e “assinatura digital”, em conflito com ADR de termo único e declaração autenticada | Contrato e semântica incompatíveis; risco jurídico/funcional | Decisão humana antes das Fases 2–5 |

## Médios

| ID | Achado/evidência | Impacto | Fase indicada |
|---|---|---|---|
| R-011 | Sem request ID, IP/User-Agent normalizados e handler uniforme | Baixa rastreabilidade de incidentes | Fase 1 |
| R-012 | `PADRAO` vê botão “Encerrar”, mas backend retorna 403 | UX enganosa e matriz divergente | Fase 4 |
| R-013 | Modal sem focus trap, foco inicial/retorno e mensagens sem `aria-live` | Barreiras WCAG/eMAG | Fases 4 e 7 |
| R-014 | PDF/XLSX de posse gerados no navegador com colunas fixas, dados integrais e sem auditoria | Manipulação/divergência e exposição | Fase 6 |
| R-015 | XLSX sem neutralização explícita de `=`, `+`, `-`, `@` | Formula injection | Fase 6 |
| R-016 | Ausência de testes de posse, RBAC, CSRF, upload, arquivos, auditoria, concorrência e migrations | Regressões sem detecção | Todas as fases subsequentes |
| R-017 | Não há testes frontend, lint ou typecheck declarados | Regressões de UI/contrato | Fase 4 |
| R-018 | `PossessionPage` com 1.007 linhas e `PossessionForm` com 626 | Alto acoplamento e teste difícil | Refatoração mínima na Fase 4 |
| R-019 | Hodômetros legados em `Float`; encerramento não impede final inferior ao inicial | Precisão e dados incoerentes | Fases 2 e 3 |
| R-020 | Validação de sobreposição administrativa em Python, sem lock | Corrida pode burlar a verificação | Fase 3 |
| R-021 | Arquivos e banco não compartilham transação; queda pode gerar órfãos | Vazamento de storage/inconsistência | Fases 3 e 7 |
| R-022 | Cliente Axios alternativo usa `localStorage`, embora não importado | Reintrodução acidental de token exposto a XSS | Remover/reconciliar na Fase 1 |
| R-023 | CORS libera todos os métodos/headers e não há headers de segurança | Superfície maior e hardening ausente | Fases 1 e 7 |
| R-024 | Rate limit de login em memória | Estado perdido em restart e inconsistente em multiprocesso | Fase 1/7 |
| R-025 | Cookie `Secure=False` no ambiente carregado | Cookie trafega em HTTP se ambiente for exposto | Configuração/deploy da Fase 1 |
| R-026 | Produção e banco já contêm permissões granulares; feature usa apenas papéis | Implementação de Fase 1 poderia regredir autorização | Sincronização antes da Fase 1 |

## Baixos e operacionais

| ID | Achado/evidência | Impacto | Tratamento |
|---|---|---|---|
| R-027 | `Diagnostico.ps1` usa `$Host`, não encontra `psql` e retorna sucesso falso | Operador recebe saúde incorreta | Corrigir em tarefa própria, não nesta fase |
| R-028 | `pytest-asyncio` avisa que `asyncio_default_fixture_loop_scope` não está definido | Mudança futura de comportamento | Fixar configuração quando ampliar testes |
| R-029 | `npm list` mostra dependências extraneous e versões por intervalos | Builds menos reproduzíveis | Higienizar lock/dependências em tarefa controlada |
| R-030 | Backup legado usa porta 5434; fluxo principal usa 5432 | Backup pode atingir instância errada | Consolidar scripts e documentar porta |
| R-031 | “PDF” de analytics é texto com MIME `application/pdf` | Arquivo inválido em leitores estritos | Corrigir no escopo de analytics |
| R-032 | README ainda descreve operação via `main` e dois perfis em partes | Orientação operacional desatualizada | Atualização documental separada |

## Decisões necessárias

Antes da Fase 1, revisão humana deve decidir:

1. estratégia de incorporação de `modulo-analytics` na feature;
2. prevalência entre o ADR novo e os termos/assinaturas/deletes já implantados;
3. matriz granular de permissões versus papéis `ADMIN/PRODUCAO/PADRAO`;
4. autorização de documento, contato, localização, termo integral e relatórios;
5. proxies confiáveis, HTTPS e origens institucionais;
6. política de upload, antivírus e retenção;
7. banco/fixture PostgreSQL descartável para testes E2E e migrations.

## Débitos não corrigidos nesta fase

Nenhum achado acima foi corrigido, porque a Fase 0 proíbe alterações funcionais e orienta registrar falhas preexistentes como baseline.
