# ExecPlan — Fase 0 — Baseline e segurança

## Continuação autorizada — Fase 4 — 01/10/2026

Objetivo: evoluir os módulos operacionais centrais, em sequência e com subcommit isolado: Veículos, Posses, Condutores, Manutenções e Empréstimos. Aplicar os componentes de fundação sem alterar APIs, payloads, permissões ou fluxos de negócio. Em Posses, preservar termos, retificação unificada, rotas, retorno e encerramento; em Empréstimos, trabalhar somente na implementação real documentada na Fase 0.

Estado inicial: branch `feature/frontend-evolution-hml`, HEAD `ce86bb0`. O working tree contém alterações externas em 11 SVGs de `frontend/public/vehicle-thumbnails/`; elas serão preservadas e excluídas de todos os subcommits da fase. Baseline herdado: teste direto do dashboard 2/2, pool `forks` 193/193, lint 0 erros/46 avisos e build aprovado; runner padrão com 15 falhas intermitentes preexistentes.

Arquivos previstos: as cinco páginas da fase, seus testes diretos existentes ou novos, `frontend/src/styles/frontend-evolution.css`, este ExecPlan, `STATUS.md`, relatório e evidências. Nenhuma alteração em backend, rotas, clientes de API ou configuração de ambiente.

- [x] Veículos — cabeçalho, toolbar, miniatura, chips e overflow; testado antes do subcommit.
- [x] Posses — fluxos condicionais preservados; 12 testes aprovados antes do subcommit.
- [x] Condutores — consulta e ações padronizadas; 2 testes aprovados antes do subcommit.
- [x] Manutenções — consulta e ações padronizadas; 2 testes aprovados antes do subcommit.
- [x] Empréstimos — implementação real, documentos e ações preservados; 8 testes aprovados antes do subcommit.
- [ ] Validar claro/escuro, executar gates completos, atualizar STATUS e parar.

Rollback: cada tela poderá ser revertida pelo próprio subcommit. Não há migration, dependência nova ou alteração de dados.

## Continuação autorizada — Fase 3 — 30/09/2026

Objetivo: evoluir somente o dashboard (`DashboardPage.jsx`) e seus estilos/componentes diretos, usando o board `references/target/02-telas-alvo-board.png` como direção. Preservar as três consultas existentes, seus parâmetros, cálculos, filtros de permissão e destinos das ações. Não alterar shell, páginas de negócio, backend, contratos ou dados.

Tese visual: saudação curta e contextual, quatro KPIs distinguíveis por ícone e cor semântica, ações rápidas compactas e pendências ocupando a área de maior prioridade. A leitura do dia e os atalhos condicionais do perfil permanecem disponíveis em uma coluna de apoio. Os dois temas devem conservar contraste e hierarquia equivalentes.

Arquivos previstos: `frontend/src/pages/DashboardPage.jsx`, `frontend/src/styles/frontend-evolution.css`, teste direto do dashboard, este ExecPlan, `STATUS.md` e relatório/evidências da fase.

- [x] Reestruturar a apresentação do dashboard sem alterar consultas, cálculos ou permissões.
- [x] Adotar `StatCard` e estilos próprios para KPIs, ações, pendências e leitura do dia.
- [x] Cobrir em teste o número/forma das consultas e a filtragem de ações por permissão.
- [x] Rodar testes, lint e build; comparar com o baseline.
- [x] Capturar claro/escuro, atualizar STATUS, registrar commit e parar.

Resultado: saudação contextual compacta, quatro KPIs semânticos, quatro ações rápidas, pendências priorizadas e leitura diária lateral, com atalhos administrativos condicionais preservados. As únicas chamadas continuam sendo `/vehicles`, `/maintenance` e `/possession/active`, sob as mesmas permissões. O teste direto do dashboard aprovou 2 cenários; o pool `forks` aprovou 193 testes; lint manteve 0 erros/46 avisos; build aprovado. O runner padrão concluiu com 178 aprovados e 15 falhas intermitentes nas quatro suítes preexistentes, sem falha no dashboard. Evidências e detalhes em `PHASE_3_DASHBOARD.md`.

Rollback: reverter exclusivamente o commit da Fase 3; não há migration, dependência nova ou alteração de dados.

## Continuação autorizada — Fase 2 — 30/09/2026

Objetivo: evoluir somente o shell global, preservando rotas, permissões, notificações, usuário, busca, tema e todo o conteúdo das páginas. Estado inicial verificado: branch `feature/frontend-evolution-hml`, HEAD `1880e58`, working tree limpo; baseline herdado da Fase 1 com 190 testes aprovados no pool `forks`, 16 falhas preexistentes no comando padrão, lint sem erros/46 avisos e build aprovado.

Tese visual: uma moldura institucional escura e estável organiza uma área de trabalho clara, densa e silenciosa. Plano de conteúdo: marca e grupos na sidebar; rota e busca na topbar; ações de sistema e identidade do usuário agrupadas ao final. Tese de interação: transições curtas no estado ativo, no recolhimento da sidebar e no drawer responsivo, sempre respeitando redução de movimento.

Arquivos previstos: `frontend/src/components/Layout.jsx`, `frontend/src/styles/frontend-evolution.css`, testes diretos do Layout, este ExecPlan, `STATUS.md` e relatório/evidências da fase. Não alterar páginas, rotas, APIs, regras condicionais, backend ou configuração de homologação/produção.

- [x] Reorganizar apenas agrupamentos semânticos do shell, sem remover controles.
- [x] Aplicar sidebar escura, estado ativo, topbar e superfícies equivalentes nos dois temas.
- [x] Validar desktop, tablet/drawer, busca, tema, usuário e notificações.
- [x] Rodar testes, lint e build; comparar com o baseline.
- [x] Capturar claro/escuro, atualizar STATUS, registrar commit e parar.

Resultado: sidebar de 228 px/72 px compacta no desktop, drawer abaixo da faixa de homologação em larguras menores, scrim clicável até 1179 px, topbar de 48 px, busca e ações preservadas, avatar contextual e contraste equivalente. `npm run test` manteve as 16 falhas preexistentes (175 aprovados); pool `forks` aprovou 191; lint manteve 0 erros/46 avisos; build aprovado. Evidências e detalhes em `PHASE_2_SHELL.md`.

Rollback: reverter exclusivamente o commit da Fase 2; não há migration, dependência nova ou alteração de dados.

## Continuação autorizada — Fase 1 — 30/09/2026

Usuário autorizou somente tokens, folha CSS aditiva, seis componentes base e miniaturas. Estado inicial desta fase: branch `feature/frontend-evolution-hml`, HEAD `a71c9c0`, working tree limpo. Aplicar a lista de arquivos prevista abaixo; não reorganizar páginas nem alterar o runner de testes.

Plano executado: adaptar starter-kit local, manter os raios menores 4/6/8/10 já solicitados, usar tokens `--ui-*` sem substituir os atuais, importar a folha depois de ambos os CSS existentes, completar teclado/foco do ActionMenu e validar regressão visual claro/escuro. Os testes padrão e com forks serão executados separadamente; as 16 falhas anteriores do pool padrão continuarão explicitamente registradas caso persistam. Nenhuma mudança de backend, dependência, configuração de homologação ou produção está prevista.

- [x] Integrar tokens, componentes e 11 miniaturas do kit.
- [x] Testar contratos acessíveis e teclado/foco, incluindo itens desabilitados.
- [x] Executar test/lint/build e comparação com baseline.
- [x] Conferir componentes e páginas existentes nos dois temas.
- [x] Atualizar STATUS, registrar commit da Fase 1 e parar.

## Objetivo

Registrar o estado real de homologação e preparar uma evolução visual incremental. Nesta execução, somente Fase 0; parar ao entregar o diagnóstico.

## Estado inicial verificado

- Pasta `D:\FROTAS\frota_emprestimos_testes`.
- Branch de origem `feature/emprestimos-testes-evolucao`, HEAD `06d44c1c4da59db94467006436fc47d4f469dc82`.
- Branch de trabalho `feature/frontend-evolution-hml`.
- Working tree rastreado inicialmente limpo; pacote ZIP/pasta não rastreados.
- Snapshot remoto `12150b1` confirmado, um commit atrás desta cópia.
- Baseline: teste padrão 149/165 aprovados, forks 165/165; lint 0 erros/46 avisos; build aprovado.
- Diagnóstico completo e referências: [BASELINE_PHASE_0.md](BASELINE_PHASE_0.md).

## Arquivos previstos

Fase 0: `AGENTS.md`, `.agent/`, `docs/frontend-evolution/`, `repo-snapshot/`, `references/`, índice/evidências locais. Nenhuma edição de aplicação.

**Proposta para Fase 1, somente após autorização:**

1. `frontend/src/styles/frontend-evolution.css`: tokens semânticos e estilos restritos às classes novas; preservar contraste já corrigido e propor raios compatíveis com 4/6/8/10.
2. `frontend/src/main.jsx`: importar a nova folha depois de `styles.css` e `styles-light.css`.
3. `frontend/src/components/ui/PageHeader.jsx`, `StatCard.jsx`, `StatusChip.jsx`, `VehicleThumbnail.jsx`, `IconButton.jsx`, `ActionMenu.jsx` e `index.js`: adaptar o starter-kit sem regras de domínio.
4. `frontend/public/vehicle-thumbnails/{hatch,sedan,suv,pickup,van,microbus,bus,truck,motorcycle,machine,default}.svg`: assets genéricos.
5. `frontend/src/test/frontendEvolutionComponents.test.jsx`: validar acessibilidade, teclado/foco, seleção de ações, estados desabilitados e fallback de miniatura; ampliar cobertura do kit.
6. `docs/frontend-evolution/EXECPLAN.md`, `STATUS.md` e evidências da Fase 1.

`frontend/vite.config.js` somente se a próxima autorização incluir ajuste isolado do runner de testes; esse problema é preexistente e não será mascarado dentro do redesign. Sem alterações de dependências previstas.

Não tocar em páginas, `Layout.jsx`, `App.jsx`, backend, CSS legado ou fluxos de negócio na Fase 1. Adoção dos componentes nas telas começa nas fases seguintes.

## Alterações funcionais proibidas

Não modificar rotas, permissões, autenticação, payloads, indicadores, PDF/XLSX, assinaturas, regras de empréstimos/posses/abastecimento, banco ou configuração de produção. Não instalar o starter-kit em bloco nem importar seus exemplos de páginas.

## Passos de implementação

- [x] Ler AGENTS, todos os documentos numerados, regras de ExecPlan e contact sheets.
- [x] Localizar pacote ausente da raiz e instalar somente contexto documental/referências.
- [x] Conferir branch/HEAD/status e comparar com remoto/snapshot sem integrar código remoto.
- [x] Criar branch visual a partir da homologação atual.
- [x] Localizar implementação real de Empréstimos e registrar dependências.
- [x] Executar test/lint/build, preservar logs e comparar teste com forks.
- [x] Capturar Início/Veículos/Posses nos dois temas.
- [x] Criar baseline, ExecPlan e STATUS.
- [x] Fase 1 — autorizada e concluída em continuação; ver PHASE_1_FOUNDATION.md.

## Validação visual

Baseline em 1366×768, perfil Admin, seis imagens em `docs/frontend-evolution/evidence/phase-0/`. Contact sheets são mapa e direção, sem impor dados fictícios. Dois boards alvo são duplicados; consultar diagnóstico antes de tratar o board 02 como referência distinta.

## Testes e build

Comandos e resultados exatos em BASELINE. Na próxima fase, repetir os três gates oficiais e a execução complementar em forks; comparar avisos/falhas com este baseline. Não declarar o gate padrão aprovado enquanto suas 16 falhas não forem resolvidas ou explicitamente aceitas como limitação preexistente.

## Resultado

Fase 0 entregue, código de frontend/backend idêntico ao HEAD inicial. O commit desta fase registra somente contexto e diagnóstico; nenhum redesign aplicado.

## Pendências / decisões

- Autorizar ou não a Fase 1, incluindo definição sobre o runner e preservação dos cantos menores.
- Considerar o board 02 duplicado; não inventar uma referência ausente.
- Manter importação após `styles-light.css` e usar `data-theme` existente.
- Adaptar foco/teclado do ActionMenu; o exemplo não atende sozinho a todos os requisitos.
- Os 46 avisos de lint são baseline, não escopo automático de correção.

## Rollback

A Fase 0 só acrescenta documentação/referências. Reverter seu commit documental caso necessário, mantendo o commit operacional `06d44c1`. Nas fases futuras, commits separados e reversão normal de Git; sem migração ou mecanismo customizado.

