# ExecPlan — promoção integral da homologação isolada — 06/10/2026

## Autorização e objetivo

O usuário autorizou publicar em produção todas as atualizações desde o início do ambiente isolado. A alteração de `main` será posterior, em etapa separada. Esta autorização substitui a restrição anterior a homologação apenas para a presente publicação.

## Estado inicial

- Fonte validada: `feature/frontend-evolution-hml`, `503dc86`.
- Checkout de produção: `D:\FROTAS\frota_certificado_homologacao`, branch `feature/certificado-digital-hml`, `12150b1`, limpo.
- Produção: PostgreSQL 5432, banco `frota_db`, migration `0043_certificate_foundation`; API 8000, frontend 3000, domínio `frota.sirel.com.br`.
- Homologação: diretório separado, PostgreSQL 5441 e API 6969.
- Watchdog de produção executa como SYSTEM. A sessão atual não é elevada; a ativação deverá usar o mecanismo administrativo do Windows, sem alterar permissões do sistema.

## Escopo

21 commits descendentes da base de produção, abrangendo empréstimos entre secretarias e regularização, responsabilidade operacional, retificação unificada de posses, melhorias operacionais, sete fases da evolução visual, retificação de comprovantes, justificativas assistidas e miniaturas por tipo. Seis migrations: 0044 a 0049. Dependências de aplicação e configurações de produção serão preservadas; não copiar `.env`, dados nem cookies/flags de homologação para produção.

## Execução

- [x] Inventariar fonte, produção, configurações, banco e processos.
- [x] Executar suíte completa e build com configuração de produção.
- [x] Criar backup protegido de banco, arquivos e configurações.
- [x] Restaurar snapshot em banco descartável no cluster de testes e ensaiar migrations; comparar dados preexistentes.
- [x] Preparar ativação e reversão concretas antes da janela.
- [x] Atualizar checkout de produção por fast-forward, aplicar migrations, ativar build e reiniciar somente a aplicação.
- [x] Verificar saúde, autenticação, headers, versão e arquivos pelo domínio público.
- [x] Registrar resultado e sincronizar documentação. Não alterar `main` nesta etapa.

## Reversão

Preservar backup anterior e commit de origem. Antes da liberação, falha de migration implica restaurar o banco sob manutenção. Depois de novas operações, não fazer downgrade destrutivo de empréstimos, revisões ou auditoria; preferir correção compatível e preservar dados novos. Falha apenas de frontend permite servir novamente o build anterior.

## Evidências

Artefatos locais, sem segredos versionados: `storage/loan-tests/production-release-20261006/`.

## Resultado — produção atualizada

Ativação concluída em **06/10/2026, 08:32:43 (America/Sao_Paulo)**. Código `503dc86`, banco `0049_justification_suggestions`, em **https://frota.sirel.com.br**. O checkout de produção avançou de `12150b1` por fast-forward; a branch `main` não foi alterada. API reiniciada, frontend compilado ativado e watchdog reabilitado. PostgreSQL e Cloudflare permaneceram em execução.

| Validação | Resultado |
| --- | --- |
| Backend completo, incluindo PostgreSQL descartável | 547 aprovados, 19 ignorados, 7 avisos |
| Frontend, versão final 503dc86 | 227 aprovados em 48 arquivos |
| Lint frontend | 0 erros, 46 avisos preexistentes |
| Build específico de produção | Aprovado; flags/origens de produção, sem configuração de homologação |
| Ensaio das seis migrations sobre snapshot atual | Aprovado; 49 tabelas conferidas |
| Migration na produção | 0043 → 0049; contagens preexistentes preservadas |
| Origem API, origem frontend e domínio público | Saúde OK; HTML atualizado e 24 arquivos JS/CSS/SVG correspondentes por SHA-256 |
| Autenticação e documentação | 401 sem sessão em auth, empréstimos e sugestões; docs/OpenAPI 404 em produção |
| Configuração | `.env` backend e frontend de produção preservados byte a byte |

A migration 0044 inicializa a secretaria proprietária dos veículos a partir da lotação ativa não ambígua. O trigger preexistente também atualizou `vehicles.updated_at` nos 284 veículos abrangidos. O ensaio comparou cada coluna antiga: nenhuma outra coluna preexistente mudou. Não houve importação de operações, usuários ou justificativas de homologação; tabelas novas iniciaram vazias. A conferência de hashes usa UTC para comparar datas entre clusters.

Os 19 testes ignorados dependem de configurações opcionais/legadas; não são apresentados como aprovados. A suíte de empréstimos/migrations foi executada com `LOAN_MIGRATION_TESTS=1`. A verificação pública não realizou operações de negócio em nome de usuários nem criou dados fictícios em produção.

Backups mantidos: `production-before.dump`, `production-offline.dump`, `production-files-before/` (uploads, configurações, frontend e bundle Git). O backup final foi obtido com a API parada. Os dois bancos descartáveis usados para comparar antes/depois foram removidos após validação. Nenhum backup deve ser versionado ou publicado.

Evidências locais: `preflight.json`, `rehearsal.json`, `production-migration.json`, `activation.json`, `publication.json`, logs completos e scripts de ativação/verificação. [Screenshot do login publicado](../output/playwright/production-release-20261006/login-production.png). O 401 inicial de `/api/auth/me` no navegador sem sessão é esperado.

O navegador também registra o bloqueio do beacon externo de analytics injetado pelo Cloudflare pela política existente `script-src 'self'`. O login e os assets da aplicação carregaram normalmente; a política de produção foi preservada. Nenhum login de usuário ou assinatura real foi efetuado na verificação pública.

## Próxima etapa separada

Transformar a versão de produção em `main`, conforme intenção do usuário para depois desta entrega. Antes dessa mudança, revisar a diferença com `origin/main` e o workflow que pode disparar deploy quando `FROTA_DEPLOY_ENABLED=true`; nenhuma alteração de branch padrão ou workflow foi feita nesta publicação.
