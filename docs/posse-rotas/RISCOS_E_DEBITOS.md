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

## Liberação da Fase 4 — 2026-07-13

| Risco | Situação após a preparação |
|---|---|
| Banco fonte em 0038 | **Resolvido:** backup custom validado e 0039 aplicada; head/current convergem em `0039_possession_trips` |
| Dados/arquivos durante o upgrade | **Resolvido:** 357 posses, 27 ativas, checksums e 10/10 arquivos preservados |
| Ruído do `alembic check` | **Resolvido sem migration:** metadata ORM reconciliado com o schema aplicado; `No new upgrade operations detected` |
| R-017 — validação frontend | **Mitigado:** Vitest, jsdom, React Testing Library e ESLint implantados; 5 testes e lint executados |
| Dependências frontend vulneráveis | **Resolvido:** 9 achados iniciais, incluindo 1 crítico, reduzidos a zero após upgrades validados por testes/build |
| R-028 — escopo de fixture assíncrona | **Resolvido:** `asyncio_default_fixture_loop_scope=function` fixado e 121 testes aprovados |
| R-029 — lock/dependências | **Resolvido:** lockfile regenerado, árvore sem `extraneous` e auditoria limpa |
| Logs runtime no Git | **Resolvido:** `storage/logs/` ignorado e arquivos preservados localmente |

Escopo obrigatório da própria Fase 4, não bloqueio de entrada:

- tratar `409 ACTIVE_POSSESSION_EXISTS` com confirmação e justificativa;
- consumir rotas paginadas e respeitar `operational_details_restricted`;
- ocultar ações conforme o perfil sem substituir a autorização do backend;
- adicionar os seis eventos da Fase 3 aos filtros de auditoria;
- criar testes de componentes dos novos fluxos.

O lint possui 45 warnings legados sem erros. Não existe `typecheck` porque o frontend atual é JavaScript sem contrato de tipos; não foi criado um comando fictício. Evidências completas: `RELATORIO_PRONTIDAO_FASE_4.md`.

## Atualização da Fase 4 — 2026-07-13

| Risco | Situação após a Fase 4 |
|---|---|
| R-012 | **Resolvido:** ações acompanham permissões efetivas; `PADRAO` não recebe mutações e retificação é exclusiva de `ADMIN` |
| R-013 | **Mitigado no fluxo principal:** modal controla foco/Tab/Escape/retorno; labels, `aria-live`, status textual e reordenação por teclado foram testados; auditoria WCAG transversal permanece na Fase 7 |
| R-016 | **Mitigado:** testes frontend cobrem contrato, conflito, perfis, erros HTTP, duplo submit e bloqueio de encerramento; suíte backend permanece em 121 aprovados |
| R-017 | **Resolvido para a infraestrutura prevista:** Vitest/RTL e ESLint são executáveis; a suíte usa um único `vmThreads` worker por estabilidade no volume de rede |
| R-018 | **Parcialmente mitigado:** workspace, timeline, rota inicial e editor de destinos foram extraídos; a página legada continua grande porque termos, evidências e relatórios não foram reescritos fora do escopo |

Débitos identificados:

- a página consulta a rota aberta de cada posse ativa visível porque o contrato da Fase 3 não contém resumo; são no máximo dez consultas por página, e qualquer otimização exige contrato backend explícito;
- a primeira suíte Vitest paralela expirou ao iniciar workers no volume `Z:`; a execução serial é estável e a falha foi preservada no relatório;
- os termos separados e a confirmação append-only continuam intocados até a Fase 5;
- a validação visual autenticada em navegador real permanece para o smoke test de rollout; a Fase 4 produziu descrição verificável e testes de DOM acessível.

## Atualização da Fase 5 — 2026-07-13

| Risco | Situação após a Fase 5 |
|---|---|
| R-010 | **Resolvido no novo fluxo:** termo único autenticado ativado; códigos, anexos e confirmações antigas aparecem somente como legado |
| R-016 | **Mitigado:** testes cobrem transação/rollback, hash, concorrência lógica, versionamento, RBAC, PDF, legado, headers e auditoria |
| R-017 | **Mitigado com ressalva operacional:** 22 testes frontend passam em cópia local controlada; execução direta no volume `Z:` ainda perde o controlador antes da coleta |
| R-018 | **Mitigado no encerramento:** modal e retificação foram extraídos; `PossessionPage` continua concentrando a orquestração documental |

Débitos/riscos residuais para a Fase 6:

- a substituição explícita de posse ativa encerra o registro anterior sem criar confirmação de devolução; relatórios devem distinguir “encerrada por substituição” de “devolução confirmada”;
- a registry de relatórios deve aplicar no backend o mesmo mascaramento de documento/contato/localização e não expor request ID, IP ou User-Agent;
- o PDF oficial não deve ser reutilizado como relatório configurável nem voltar a ser gerado a partir do estado do navegador;
- estabilizar Vitest no volume de rede ou institucionalizar workspace local/CI para repetibilidade;
- anexos separados de devolução legados permanecem armazenados e consultáveis conforme ADR 002; retenção e descarte continuam fora do escopo até política institucional.

## Atualização da Fase 6 — 2026-07-13

| Risco | Situação após a Fase 6 |
|---|---|
| R-004 | **Mitigado nos relatórios de posse:** preset padrão minimizado; documento/contato não são enviados a `PADRAO`; coordenadas exigem seleção manual operacional. Revisão transversal permanece na Fase 7. |
| R-014 | **Resolvido no módulo de posses:** as listas fixas e a geração oficial no navegador foram removidas; backend fornece registry, dataset, PDF/XLSX, RBAC e auditoria. |
| R-015 | **Resolvido no módulo de posses:** textos iniciados por `=`, `+`, `-`, `@`, inclusive após whitespace, recebem apóstrofo no XLSX; função e arquivo final foram testados. |
| R-016 | **Mitigado:** 19 testes direcionados e 137 testes backend totais cobrem registry, RBAC, filtros, formatos, legado, preferência, formula injection, headers e auditoria. |
| R-017 | **Mitigado com ressalva operacional:** 25 testes frontend passam em cópia local controlada; o controlador Vitest ainda trava antes da coleta no volume `Z:`. |

Débitos/riscos residuais para a Fase 7:

- o banco existente permanece deliberadamente em `0039_possession_trips`; aplicar `0040_report_preferences` é pré-condição de deploy do configurador e deve ocorrer antes de remover o bloqueio de manutenção;
- o upgrade integral de banco vazio em uma única transação continua falhando na migration legada `0034` pelo uso do enum `PRODUCAO`; o ensaio seguro exigiu a fronteira `upgrade 0033` e depois `upgrade head`, sem editar migration aplicada ou usar `stamp`;
- PDF e XLSX são gerados em memória com limites de 1.500 e 5.000 linhas; streaming e teste de estresse acima desses limites continuam fora do escopo;
- o preload elimina N+1 (5 posses/3 `SELECT`s no probe), mas posses com quantidade excepcional de rotas/destinos ainda podem elevar memória dentro do teto de linhas;
- auditorias de falha são best-effort quando a própria transação/conexão de banco está indisponível;
- o módulo de posse continua atrás do bloqueio temporário `MODULE_AVAILABILITY.possession.maintenance=true`; smoke test autenticado em navegador real e decisão de ativação permanecem necessários;
- revisão transversal de logs, CORS, cookies, headers, retenção de relatórios e acessibilidade WCAG/eMAG continua exclusivamente na Fase 7.

## Atualização das Fases 7 e 8 — 2026-07-13

| Risco | Situação final |
|---|---|
| R-004 | **Resolvido no contrato:** serializers, arquivos e registry impedem envio de documento/contato/localização a PADRAO; inventário e matriz registram as saídas. |
| R-007 | **Mitigado:** limite, tipo declarado, magic bytes e estrutura DOCX validados. Scanner antimalware permanece decisão de infraestrutura. |
| R-008 | **Resolvido:** paths absolutos, `..` e resolução fora do storage são rejeitados e testados. |
| R-013 | **Mitigado:** modais e tour possuem foco/Tab/Escape/retorno, labels, aria-live, status textual e redução de movimento; leitor de tela real permanece recomendação institucional. |
| R-017 | **Mitigado operacionalmente:** 24 testes passam em cópia local controlada; o volume de rede continua inadequado para os workers Vitest. |
| R-023/R-025 | **Resolvidos para produção:** origens HTTPS explícitas, cookie Secure, segredo forte e headers fail-closed; scripts usam loopback. |
| R-024 | **Residual médio:** rate limit de login continua em memória e é adequado apenas ao runtime de processo único atual. Distribuição futura exige store compartilhado. |

Riscos residuais aceitos para o rollout:

- `ecdsa 0.19.2` é dependência transitiva com aviso sem correção; o caminho vulnerável não é alcançável porque JWT aceita exclusivamente HS256. Alterar algoritmo exige nova revisão.
- PDF/XLSX são gerados em memória sob limites de 1.500/5.000 registros; streaming permanece evolução futura.
- retenção e scanner antimalware dependem de decisões administrativas/infraestrutura e estão registrados sem prazo inventado.
- 45 warnings ESLint legados e três avisos de status Starlette não representam falha de build/teste.
- o serviço PostgreSQL precisa de um restart administrativo para aplicar `listen_addresses=localhost`; até lá, a senha foi rotacionada e o HBA já rejeita endereços não loopback.
- a rotação do JWT encerrou sessões existentes por desenho; usuários precisam autenticar novamente.

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
