# Plano de implantação

Versão preparada em 2026-07-13 para publicação local via Cloudflare Tunnel em `https://frota.sirel.com.br`.

## Pré-requisitos e critério de aborto

- branch de validação contém `origin/main`, `origin/modulo-analytics` e `origin/módulo-analytics` como ancestrais;
- árvore versionada, suíte backend, suíte frontend, build, lint e auditorias registrados;
- backup ZIP e SHA-256 verificados e restauração ensaiada;
- banco em `0039_possession_trips` antes do upgrade e código com único head `0040_report_preferences`;
- abortar se backup não abrir, `alembic current` divergir, contagens críticas mudarem, build/teste falhar, migration não alcançar o head, healthcheck falhar ou os headers públicos não forem seguros.

## Sequência controlada

1. Registrar branch, SHA, `alembic heads/current`, contagens e processos atuais.
2. Criar backup com `scripts/backup-local.ps1` e validar ZIP/SHA.
3. Ensaiar restauração e `upgrade head` com `scripts/test-phase8-backup-restore.ps1`.
4. Sincronizar a feature com `origin/main`, repetir toda a validação, commitar e enviar a feature.
5. Promover `main` por fast-forward explícito e enviar `origin/main`, conforme autorização excepcional do solicitante.
6. Executar `scripts/prepare-production-env.ps1`: `APP_ENV=production`, segredo aleatório, cookie Secure, hosts/origens/proxies explícitos e limite de corpo. Segredos não são impressos nem versionados.
7. Executar `scripts/harden-postgres-local.ps1 -RestartService`: rotacionar a senha do papel do app e limitar `listen_addresses` a localhost.
8. Instalar `backend/requirements.txt`, executar `alembic upgrade head` e confirmar `heads=current=0040_report_preferences`.
9. Executar `npm ci`/`npm run build`; nunca publicar servidor Vite de desenvolvimento.
10. Parar somente os processos das portas 3000/8000 e iniciar Uvicorn sem reload e Vite preview por `scripts/ops/frota.ps1 -Action Publish`.
11. Confirmar local e publicamente: `/api/health=200`, `/login=200`, `/docs=404`, assets de produção sem `/@vite/client`, CSP/XCTO/XFO/Referrer/Permissions/Cache-Control e ausência do aviso de manutenção.
12. Confirmar que `/posses` abre o módulo e oferece o tour rápido; login e demais módulos continuam acessíveis.
13. Monitorar logs de frontend/backend, 5xx, tempo de resposta e falhas de autenticação durante a janela.

## Variáveis e runtime

| Item | Produção |
|---|---|
| `APP_ENV` | `production` |
| `SECRET_KEY` / `SIGNATURE_EVIDENCE_SECRET` | aleatórios e distintos, somente `.env` local |
| `COOKIE_SECURE` | `true` |
| CORS/CSRF | somente `https://frota.sirel.com.br` |
| trusted hosts | domínio + loopback |
| trusted proxy networks | loopback |
| limite do corpo | 64 MiB; uploads possuem limite próprio menor |
| backend | `127.0.0.1:8000`, Uvicorn sem reload |
| frontend | build `dist`, preview em `127.0.0.1:3000` |
| PostgreSQL | localhost:5432 |

## Responsabilidade e comunicação

O operador que executa o rollout registra SHA, horários e resultados. O solicitante autorizou nesta conversa a promoção automática para `main` e produção, substituindo excepcionalmente a regra original de PR/revisão humana. Falha após a migration aciona o plano de rollback; falha apenas visual pode ser revertida para o commit anterior sem downgrade destrutivo do banco.

## Registro da execução de 2026-07-13

O plano foi executado para `d0f9e06`. Backup/restauração, migration, build, reinício do app e probes públicos passaram. O restart do serviço PostgreSQL foi negado por privilégio; senha/HBA já restringem acesso e a mudança de listener está persistida para a próxima janela administrativa. Esse item não exigiu rollback porque banco, API e domínio permaneceram saudáveis.
