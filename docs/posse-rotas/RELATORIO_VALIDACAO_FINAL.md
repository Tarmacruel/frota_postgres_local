# Relatório de validação final — Fases 7 e 8

Data: 2026-07-13. Branch de validação: `feat/posse-rotas-relatorios-devolucao`.

## Escopo e integração

As Fases 7 e 8 foram executadas em conjunto por solicitação expressa. A feature incorporou `origin/main` no merge `961bb6e` e contém como ancestrais as duas grafias históricas de analytics. Antes do commit final, a divergência era: feature 151 commits à frente/0 atrás de `origin/main`, 35/0 de `origin/modulo-analytics` e 118/0 de `origin/módulo-analytics`. Os conflitos em `FuelSupplyForm.jsx`, `PossessionForm.jsx` e `PossessionPage.jsx` preservaram a implementação mais nova e o utilitário de data trazido da produção.

## Correções de hardening

- configuração de produção fail-closed para segredo, cookie, CORS, CSRF e hosts;
- CSP, frame denial, nosniff, no-referrer, Permissions-Policy e `no-store`;
- limite global de request, magic bytes/estrutura DOCX e contenção de storage;
- nomes opacos de download sem dado pessoal/header injection;
- bloqueio de foto integral para PADRAO;
- runtime de produção sem HMR/reload e scripts de rotação de segredo/senha;
- aviso “melhorias em implantação” removido e rota de posses reativada;
- tour contextual acessível, dispensável e reexecutável, sem armazenar PII.

## Testes e resultados pré-rollout

| Comando/ensaio | Resultado real |
|---|---|
| `pytest tests -q` após sincronização | primeira execução: 151 passed, 17 skipped, 1 falha de expectativa do novo `no-referrer`; teste contratual corrigido |
| `pytest tests -q` após upgrades de segurança | 152 passed, 17 skipped, 3 avisos de depreciação, 26,35 s |
| `pytest test_phase7_security_hardening.py` | 15 passed, 2,123 s |
| `npm test` em cópia local controlada | 12 arquivos, 24 testes aprovados, 8,29 s |
| `npm run build` na cópia controlada | 974 módulos, 634 ms; chunk principal 505,91 kB (116,23 kB gzip) |
| `npm run lint` | 0 erros, 45 warnings legados |
| `npm audit` | 0 vulnerabilidades em 351 pacotes |
| `pip-audit` antes/depois | 21 avisos/5 pacotes; após atualização, 1 aviso transitivo `ecdsa` sem fix e fora do algoritmo aceito |
| `pip check` / `compileall` | dependências consistentes; compilação sem erro |
| `git diff --check` | sem erro de whitespace; apenas avisos de conversão LF/CRLF do worktree Windows |
| parser PowerShell | 10 scripts novos/alterados sem erro sintático |

Versões validadas: Python 3.12.10, pip 26.0.1, Node 24.14.0, npm 11.12.1, Vite 8.1.4, FastAPI 0.139.0, Starlette 1.3.1, PostgreSQL 16. O frontend não possui typecheck porque o projeto é JavaScript; não foi declarado comando inexistente.

## Backup, migration e dados

- backup: `storage/backups/frota-backup-20260713-145744.zip`, 17.555.349 bytes, ZIP/SHA-256 válidos, 51 entradas;
- cópia restaurada: `frota_phase8_restore_20260713151916`, removida após o ensaio;
- revision antes/depois: `0039_possession_trips` → `0040_report_preferences`;
- duração do upgrade no ensaio: 65.788 ms;
- contagens idênticas antes/depois: 35 usuários, 223 veículos, 357 posses, 0 rotas, 0 destinos, 0 confirmações e 2.203 auditorias;
- tabela de preferência criada vazia, com quatro constraints; `alembic check` sem operação nova.

## Desempenho e limites

O probe read-only já registrado na Fase 6 encontrou, para cinco posses, três `SELECT`s em 210,20 ms no modo posse e um `SELECT` em 200,08 ms no modo rota sem linhas. `joinedload/selectinload` impede crescimento de queries por linha. PDF limita 1.500 e XLSX 5.000 registros; ambos são gerados em memória. O risco residual é consumo de memória por registros com quantidade excepcional de rotas/destinos dentro desses tetos.

## Acessibilidade e privacidade

O fluxo crítico possui labels, foco controlado, Tab/Escape, `aria-live`, estado textual, reordenação por botões, redução de movimento e desenho mobile-first. O inventário confirma que documento/contato/localização não são enviados a PADRAO e que preferência/tour não guardam PII. Teste com leitor de tela real permanece recomendação de homologação, não achado bloqueador.

## Rollout efetivo

- commit de aplicação publicado: `d0f9e06`;
- commit de evidências e ponta promovida à `main`: `f4abcef`; promoção fast-forward, sem force-push;
- `alembic heads` e `alembic current`: `0040_report_preferences`; `alembic check`: `No new upgrade operations detected`;
- upgrade real executado de `0039` para `0040` sem `stamp`, downgrade ou alteração de migration aplicada;
- contagens pós-upgrade: 35 usuários, 223 veículos, 357 posses, 0 rotas, 0 destinos, 0 confirmações, 0 preferências e 2.211 auditorias. As entidades de negócio permaneceram iguais ao backup; oito auditorias novas foram acumuladas durante a janela de operação;
- runtime: Uvicorn `127.0.0.1:8000` sem reload/access log e Vite preview `127.0.0.1:3000` sobre `dist`;
- probes local/público: `/api/health=200`, `/login=200`, `/docs=404`, `/api/auth/me=401` sem sessão;
- HTML público sem `/@vite/client`, com asset hash; bundle contém o tour e não contém “melhorias em implantação”;
- respostas públicas contêm `Cache-Control: no-store`, CSP, HSTS, XCTO, X-Frame-Options, Referrer-Policy, Permissions-Policy e request ID na API;
- nenhum erro foi registrado nos arquivos de stderr do novo runtime durante os probes.

O serviço PostgreSQL recusou reinício por ausência de privilégio do usuário da sessão. A senha do papel da aplicação foi rotacionada, `postgresql.auto.conf` recebeu `listen_addresses='localhost'` para o próximo restart e o `pg_hba.conf` já permite somente `127.0.0.1/32` e `::1/128`. O listener permanece temporariamente em `0.0.0.0`/`::`, mas conexões remotas não encontram regra HBA e são rejeitadas. Reiniciar `postgresql-x64-16` em janela administrativa fecha a superfície de listener.

A verificação visual autenticada pelo navegador não pôde usar a conexão do navegador nesta sessão, e a rotação do JWT invalida cookies anteriores. O tour foi validado por dois testes de componente, presença no bundle de produção e ausência do bloqueio na rota. O smoke por perfil permanece coberto em banco isolado pelas suítes RBAC/API, sem criar dados fictícios em produção.

## Riscos residuais aceitos

- scanner antimalware e retenção institucional dependem de decisões externas;
- `ecdsa` transitivo possui aviso sem correção, mas JWT usa allowlist exclusiva de HS256;
- PDF/XLSX continuam em memória dentro de limites explícitos;
- 45 warnings de lint legados e três avisos Starlette não são erros;
- teste assistivo com NVDA/JAWS deve integrar a homologação institucional contínua.
