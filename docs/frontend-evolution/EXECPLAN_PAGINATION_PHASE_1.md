# ExecPlan — Fase 1 — listagens de Veículos e Posses

## Objetivo
Carregar somente a página visível nas duas listagens e compactar a navegação compartilhada, preservando filtros, contadores, foco, relatórios e permissões.

## Estado inicial verificado
- Branch HML: `feature/analytics-evolution-hml`; HEAD: `c66376f63349c620b15bffd416fd6523cf49d5da`.
- `git status --short`: limpo.
- Baseline: frontend 304/304 testes; lint 0 erros/45 avisos; build aprovado.
- Veículos e Posses buscam listas inteiras antes de fazer `slice` de 10 linhas; `Pagination` desenha todas as páginas.

## Arquivos previstos
`Pagination.jsx` e seu CSS/teste; páginas e testes de Veículos e Posses; rotas, serviços, repositórios e schemas correspondentes; este ExecPlan e `STATUS.md`.

## Alterações funcionais proibidas
Nenhuma mudança de banco, autenticação, escopo, regras de posse, assinatura, rotas antigas, PDF/XLSX ou publicação em produção.

## Passos de implementação
1. Compactar o componente compartilhado de paginação.
2. Completar filtros, totais e foco nos endpoints paginados existentes, preservando o contrato legado.
3. Consumir páginas de 10 linhas no frontend e buscar todos os registros filtrados apenas na ação de exportar.
4. Ajustar testes e estados de carregamento, página inválida e requisições concorrentes.

## Validação visual
Inspecionar Veículos e Posses em desktop e largura reduzida, nos temas claro e escuro; conferir também paginação de uma tela que já usava o componente.

## Testes e build
`npm run test`, `npm run lint`, `npm run build`; testes backend dirigidos aos dois endpoints; comparação com baseline.

## Resultado em 19/10/2026

Implementação local da Fase 1 concluída na branch `feature/analytics-evolution-hml`, HEAD ainda `c66376f63349c620b15bffd416fd6523cf49d5da`, sem commit ou publicação. O working tree contém apenas os arquivos desta fase. Veículos e Posses consultam `limit=10` na listagem; filtros, resumo e foco são resolvidos no servidor. O componente compartilhado mostra cinco páginas adjacentes, primeira/última e reticências. A API antiga permanece disponível. Veículos busca todas as páginas filtradas apenas ao solicitar PDF/XLSX; Posses conserva o gerador de relatórios do servidor, com filtros próprios.

Arquivos: `backend/app/api/routes/{vehicles,possession}.py`, `backend/app/repositories/{vehicle_repository,possession_repository}.py`, `backend/app/schemas/{vehicle,possession}.py`, `backend/app/services/{vehicle_service,possession_service}.py`, `backend/tests/test_listing_pagination_phase1.py`, `frontend/src/components/Pagination.jsx`, `frontend/src/components/Pagination.test.jsx`, `frontend/src/pages/{VehiclesPage,PossessionPage}.jsx` e respectivos testes, `frontend/src/styles.css`, este ExecPlan e `STATUS.md`.

Validação: frontend 308/308 testes (60 arquivos), lint 0 erros/44 avisos (baseline 45), build aprovado; backend 625 aprovados/109 ignorados/7 avisos; `git diff --check` aprovado. QA local com dados fictícios (31 veículos, 128 posses) mostrou 10 linhas por requisição de listagem, navegação na primeira, intermediária e última página, e capturas de ambas as telas em tema claro/escuro, desktop 1920×1080 e largura 390×844. Evidências locais ignoradas pelo Git: `output/playwright/phase1/`.

Limites da validação: sem sessão/dados de homologação para medir tempo e bytes antes/depois na mesma base, nem executar fluxo visual com perfil de escopo restrito ou gerar um PDF/XLSX real. Os testes automatizados cobrem escopo da API, foco e exportação de todos os registros filtrados de Veículos. O relatório configurável de Posses já é gerado no servidor e usa filtros próprios; a equivalência exata entre filtro de secretaria da tabela (lotação atual) e filtro de secretaria do relatório (responsabilidade histórica) ainda precisa ser validada na homologação. A Fase 1 não foi publicada no endereço público de HML.

## Pendências / decisões
Validar tempo/volume e o relatório de Posses com dados reais em HML após disponibilizar ambiente/sessão; solicitar autorização antes de iniciar a Fase 2. Executar somente esta fase e parar antes da Fase 2.

## Rollback
Reverter apenas o diff desta fase na branch HML; endpoints legados seguem disponíveis.

## Atualização após a publicação em homologação — 19/10/2026

A descrição do resultado acima corresponde ao estado local anterior. Na ativação em HML, a API antiga ainda rodava e `/api/vehicles/options` respondeu 404; Posses quebrou ao ler `summary.active` ausente. O frontend passou a aceitar a resposta paginada antiga e a usar o catálogo legado quando a rota de opções retorna 404. A API isolada da porta 6969 foi reiniciada com o código atual. Em `https://testefrota.sirel.com.br/posses`, a sessão autenticada exibiu 127 posses ativas, dez linhas na primeira página e navegação funcional para a segunda. A versão de produção não foi tocada. O usuário autorizou seguir para a Fase 2 após essa correção.
