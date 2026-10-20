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
- [x] Executar gates, registrar commit e abrir PR com checks obrigatórios.
- [x] Gerar backup do banco e preservar configurações/build/Git anteriores; verificar schema atual.
- [x] Validar endpoints e escopo em conexão de banco somente leitura; preparar build de produção e rollback.
- [x] Integrar o PR após checks, avançar produção por fast-forward e ativar aplicação/build.
- [x] Conferir readiness, autenticação anônima, assets públicos e novas respostas; registrar resultado.

## Validação visual

Reutilizar QA claro/escuro/desktop/celular das fases em HML. Conferir carregamento público de produção e ausência de banner HML após a ativação. A inspeção autenticada depende de sessão disponível; sondas de banco usarão conexão somente leitura e não realizarão operações em dados de negócio.

## Testes e build

Executar frontend `npm run test`, `npm run lint`, `npm run build`; backend completo e `git diff --check`. Respeitar os checks `backend-tests`, `frontend-tests` e `container-smoke` exigidos pela main. Não apresentar testes ignorados como aprovados.

## Resultado

Publicado em **20/10/2026, às 14:15:16 (America/Sao_Paulo)**, em https://frota.sirel.com.br. Commit funcional `818193c02a46110da6cfaaf74d68d2d8dbf58d43`, integrado pelo [PR #68](https://github.com/Tarmacruel/frota_postgres_local/pull/68) no merge `dfc52366c22ff8c4f2a9ea8209f6ce2cd05165ae`. A árvore do merge é idêntica à do build validado. Produção avançou por fast-forward na branch `main`; HML foi alinhada ao mesmo merge. A ativação durou aproximadamente 12 segundos, com reinício somente da API e watchdog reabilitado. PostgreSQL, frontend, Cloudflare e HML permaneceram em execução.

| Verificação | Resultado |
| --- | --- |
| Backend local | 626 aprovados / 109 ignorados / 7 avisos existentes |
| Frontend local | 317 aprovados / 61 arquivos |
| Lint/build | 0 erros / 40 avisos existentes; build de produção aprovado |
| CI do PR | `backend-tests`, `frontend-tests` e `container-smoke` aprovados |
| Banco | `0052_analytics_alert_workflow` preservada; nenhuma migration executada |
| Backup | Dump consistente antes da janela, dump final com API parada, anexos/configurações/build/Git preservados |
| Configurações | Arquivos próprios da produção preservados por SHA-256; flags de produção no build isolado |
| Publicação | Readiness na origem e no domínio público `ok`; dez assets HTML/JS/CSS/imagem conferidos por SHA-256 contra o build |
| Autenticação | Treze rotas protegidas retornam 401 sem sessão; docs/OpenAPI permanecem 404 |
| HML | Origem e domínio público respondem HTTP 200, aplicação/banco `ok` |

A sonda do código candidato usou conexão PostgreSQL com `default_transaction_read_only=on`, sem gravar dados de negócio. Conferiu dez listagens HTTP em primeira/intermediária/última página quando aplicável, três catálogos auxiliares, filtros combinados, estado vazio e foco. Totais observados: 313 veículos, 1.983 posses, três manutenções, 212 abastecimentos, 48 usuários, 9.130 logs, quatro postos, 433 infrações, dois contratos e sete lotes. A consulta de Ordens foi conferida diretamente no repositório (537 registros), porque o GET antigo expira ordens atrasadas como efeito colateral; a sonda de produção não acionou essa rotina de escrita.

O escopo de Veículos e Posses foi comparado integralmente com as respostas legadas para os 13 órgãos distintos encontrados entre usuários de Produção; os conjuntos de IDs foram iguais. PDF e XLSX de Posses foram gerados somente em memória na sonda, com 1.983 registros, assinaturas binárias válidas e tempos de aproximadamente 2,8 s e 0,5 s. Não se apresenta esse tempo como ensaio de carga ou ganho percentual.

A sessão administrativa no navegador público carregou a versão nova sem banner de HML. Posses mostrou 133 ativas e, ao selecionar “Todas”, 1.983 registros com a paginação compacta. A pré-visualização PDF concluiu pela API publicada e confirmou abertura em nova guia. Não foi inspecionado visualmente o conteúdo da guia `blob:`. A geração registra metadados na auditoria pelo fluxo normal; nenhuma posse, abastecimento ou cadastro foi alterado pela validação.

Artefatos locais ignorados: `preflight.json`, `production-before.dump`, `production-offline.dump`, `production-files-before/`, `readonly-validation.json`, `gates.json`, `pr-checks.json`, `activation.json`, `publication.json`, scripts e logs em `storage/loan-tests/production-release-20261020/`. Os backups contêm dados e configurações e não devem ser versionados.

## Pendências / decisões

Ativação realizada pelo mecanismo administrativo do Windows, com script preparado previamente, verificação da identidade do processo e rollback disponível. Proteções de branch não foram alteradas; deploy automático continua desabilitado. A HML foi restabelecida pelo script já existente; não foi criada nova rotina de inicialização automática.

Permanece o limite operacional de 5.000 linhas para o relatório configurável de Posses. Quando ultrapassado, a tela exibe a mensagem específica da API. Não houve ensaio de carga nem comparação de tempo/bytes com a versão anterior na mesma base.

## Rollback

Preservar commit inicial, configurações e build anterior antes da janela. Em falha de aplicação, retornar código/build anteriores e reiniciar apenas a API. Como não há alteração de schema, não realizar restauração ou downgrade de banco. Manter PostgreSQL, Cloudflare e HML em execução durante a publicação.
