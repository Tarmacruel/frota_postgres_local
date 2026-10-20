# ExecPlan — Publicação das melhorias de carregamento — 20/10/2026

## Objetivo e autorização

O usuário autorizou commitar esta leva, aplicá-la em produção e restabelecer a homologação. O escopo reúne as Fases 1, 2 e 3 de paginação e a correção do PDF de todas as posses, já validadas em HML. Esta autorização permite a publicação em produção anteriormente vedada pelo AGENTS.md.

## Estado inicial verificado

- HML: `D:\FROTAS\frota_emprestimos_testes`, branch `feature/analytics-evolution-hml`, HEAD `c66376f63349c620b15bffd416fd6523cf49d5da`; working tree contém apenas a leva de paginação, testes e documentação correspondente, ainda sem commit.
- Produção: `D:\FROTAS\frota_certificado_homologacao`, branch `main`, mesmo HEAD inicial, working tree limpo. Runtime Windows nas portas 8000/3000, PostgreSQL 5432; watchdog local existente. Deploy Docker automático permanece desabilitado.
- HML isolada: PostgreSQL 5441/API 6969. Restabelecida pelo script `scripts/loan-tests.ps1 -Action start`; readiness público respondeu HTTP 200, aplicação e banco `ok`.
- Baseline validado em 19/10: frontend 317 testes aprovados; backend 626 aprovados/109 ignorados/7 avisos; lint 0 erros/40 avisos; build aprovado. Não há mudanças em dependências, modelos, migrations, autenticação ou configuração de deploy nesta leva.

## Arquivos previstos

Commit dos diffs das três fases e do PDF, este plano e status. Artefatos operacionais protegidos/ignorados em `storage/loan-tests/production-release-20261020/`. Build isolado com as configurações próprias da produção.

## Alterações proibidas

Não copiar dados, anexos, segredos ou flags de HML para produção. Preservar banco, migrations, permissões, rotas antigas e fluxos operacionais. Não alterar proteções de branch nem habilitar deploy automático.

## Passos de implementação

- [x] Restabelecer HML e verificar readiness público.
- [x] Conferir origem, working trees e runtime ativo de produção.
- [ ] Executar gates, registrar commit e abrir PR com checks obrigatórios.
- [ ] Gerar backup do banco e preservar configurações/build/Git anteriores; verificar schema atual.
- [ ] Validar endpoints e escopo em conexão de banco somente leitura; preparar build de produção e rollback.
- [ ] Integrar o PR após checks, avançar produção por fast-forward e ativar aplicação/build.
- [ ] Conferir readiness, autenticação anônima, assets públicos e novas respostas; registrar resultado.

## Validação visual

Reutilizar QA claro/escuro/desktop/celular das fases em HML. Conferir carregamento público de produção e ausência de banner HML após a ativação. A inspeção autenticada depende de sessão disponível; sondas de banco usarão conexão somente leitura e não realizarão operações em dados de negócio.

## Testes e build

Executar frontend `npm run test`, `npm run lint`, `npm run build`; backend completo e `git diff --check`. Respeitar os checks `backend-tests`, `frontend-tests` e `container-smoke` exigidos pela main. Não apresentar testes ignorados como aprovados.

## Resultado

Em execução.

## Pendências / decisões

Produção executa como SYSTEM e a sessão de trabalho não é elevada. A ativação usará o mecanismo administrativo existente do Windows, com script previamente preparado e validação do processo alvo. Não há migration para aplicar.

## Rollback

Preservar commit inicial, configurações e build anterior antes da janela. Em falha de aplicação, retornar código/build anteriores e reiniciar apenas a API. Como não há alteração de schema, não realizar restauração ou downgrade de banco. Manter PostgreSQL, Cloudflare e HML em execução durante a publicação.
