# Fase 7 — relatório final de QA em HML

**Data:** 05/10/2026. **Branch:** `feature/frontend-evolution-hml`. **HEAD de partida:** `1ec4886`.

QA e correções do redesign concluídos em homologação, com ressalvas nos gates e no gerador legado de PDF descritas abaixo. Nenhuma funcionalidade nova, alteração de backend ou publicação em produção nesta fase. Versionamento local autorizado posteriormente pelo usuário, em commit próprio de QA, após a Fase 6 (`ed47ddd`).

## Ambiente e cobertura

Runtime de testes em `http://localhost:6969`, banco isolado na porta 5441. [Site de HML](https://testefrota.sirel.com.br/) e origem local responderam HTTP 200, com os mesmos assets do build. Navegador real: Microsoft Edge headless via Playwright CLI. Não foi uma validação entre diferentes motores de navegador.

| Viewport | Temas | Cobertura principal |
| --- | --- | --- |
| 1366×768 | claro e escuro | 21 vistas em cada tema |
| 1600×900 | claro e escuro | 21 vistas em cada tema |
| 1920×1080 | claro e escuro | 21 vistas em cada tema |
| 1024×768 | claro e escuro | 21 vistas em cada tema |
| 768×1024 | claro e escuro | 21 vistas em cada tema |
| 390×844 | claro e escuro | 21 vistas em cada tema |

As 21 vistas abrangem 17 rotas: Início, Veículos, Empréstimos, Posses, Condutores, Manutenções, Sinistros, Multas, Abastecimentos, Ordens abertas, Cadastros, Postos, Processos de pagamento, Análises, Importar/Exportar, Usuários e Auditoria. Pagamentos inclui suas cinco abas: Processos, Importação, Gestão do contrato, Contratos e Fornecedores.

A matriz principal tem 252 combinações, sem overflow horizontal da página nem alertas de erro de carregamento. Após os ajustes finais, houve conferências dirigidas de 108 combinações de gestão/contraste e 36 do shell, além da recaptura de 126 combinações nos três tamanhos reduzidos. A recaptura apontou contraste inadequado nos alertas de Análises em três tamanhos; o fundo foi corrigido e os 12 retestes de Análises passaram. Tabelas que excedem a largura disponível mantêm rolagem interna. Os contact sheets foram comparados com as referências da iniciativa; PNGs individuais foram usados para os defeitos encontrados.

## Inconsistências corrigidas

| Evidência anterior | Correção limitada ao redesign | Verificação |
| --- | --- | --- |
| Tab alcançava links da sidebar fora da tela; Escape não fechava a navegação móvel | Ocultar os pontos de foco da sidebar fechada; conter foco, fechar com Escape e devolver ao acionador | Teclado real e teste de regressão |
| Busca abria só por receber foco; Tab saía do diálogo e Escape não devolvia foco | Abertura por ação explícita; foco contido/restaurado e callback estável | Tab, Shift+Tab, Enter, Escape e busca de veículo com navegação ao resultado |
| Painéis laterais de pagamento deixavam foco no fundo; linha do processo só abria por clique | Hook compartilhado de foco nos três painéis; número do processo como botão nativo | 18 cenários de painéis, incluindo as quatro abas do detalhe; teste de modal sobreposto |
| Seleção de contratos e lotes também dependia de clique na linha | Botão nativo no número/arquivo, mantendo o clique na linha | 24 cenários por teclado em seis resoluções e dois temas; seleção correta e sem overflow |
| Cabeçalho de gestão reservava 320 px em layout de coluna | Remover a base flex de desktop no celular | Capturas claro/escuro em 390 px |
| Cabeçalho global crescia até 177,6 px em página curta no tablet | Alinhar o conteúdo do grid no início | Empréstimos em 1024 px: altura reduzida para 46 px na medição comparativa |
| Filtros de status se esticavam; largura desktop cortava cartões/tabelas móveis | Alinhar filtros no início e limitar larguras no breakpoint móvel | Matriz responsiva; sem perda de colunas/dados |
| Importar/Exportar ultrapassava o viewport; Empréstimos podia esconder as últimas colunas | Trilhas de grid com mínimo zero e rolagem interna explícita | Empréstimos: área 716/850 px em tablet e 342/629 px em celular, ambas com `overflow-x: auto` |
| Ações e indicadores tinham contraste insuficiente no escuro | Tokens de texto semântico e ações; correção do hover de gestão | Amostra automatizada de botões, rótulos e status sem apontamentos na rodada de 108 casos |
| Alertas inteligentes usavam fundo branco misturado à cor de severidade nos dois temas | Misturar a mesma cor de severidade à superfície do tema ativo | 12 cenários de Análises, sem apontamento de contraste nos controles/status medidos; gráficos intactos |
| Formulários de pagamento em portal não herdavam os gaps da página | Espaçamento de 12 px no formulário do modal | Medição e captura de Novo processo em desktop/celular, claro/escuro |

Em `PaymentProcessesPage.jsx`, as mudanças foram locais: acionador da aba Processos, foco do detalhe de processo, foco do indicador em Gestão do contrato, seleção por teclado e foco do formulário em Contratos. Não houve refactor integral, mudança de handlers de negócio nem reorganização de dados. Importação e Fornecedores conservaram comportamento. Em `DataImportsPage.jsx`, apenas o nome do arquivo recebeu o acionador nativo da seleção já existente.

## Teclado, modais e regressão

- 48 cenários de modais existentes: oito formulários × três viewports × dois temas. Nenhum corte ou overflow interno horizontal; Tab/Shift+Tab contidos, Escape fecha e restaura foco.
- 18 cenários dos três painéis de pagamentos e seis cenários de menus contextuais. Foco inicial, limites, Home/End, setas, Tab, Enter e Escape conferidos conforme o componente. Todos os painéis cabem no viewport após a animação.
- Quatro abas internas do detalhe de processo inspecionadas. Não foram gravadas etapas, checklist ou contratos.
- 24 combinações adicionais das abas de Cadastros e Importar/Exportar em 1366 e 390 px, claro/escuro; oito conferências adicionais de Permissões/Novo processo, sem salvar alterações.
- Busca global consultou um veículo de HML e navegou para a rota com `focus`, preservando o fluxo existente.
- Exportações de Veículos, Postos, Usuários, Auditoria e Pagamentos: cinco XLSX válidos e cinco PDFs com cabeçalho `%PDF-1.3`, conteúdo textual e abertura em nova guia. Os PDFs foram gerados pelos botões existentes; os XLSX foram verificados como pacotes válidos.

Auditoria e Análises têm arquivos de página idênticos ao snapshot anterior à Fase 7. `exportData.js` e a API de pagamentos também são idênticos. Os blocos dos gráficos de pagamento foram comparados literalmente: séries, cores, legendas e semântica intactas. Os 11 hashes das miniaturas SVG preexistentes permanecem iguais.

As evidências de teclado dos painéis foram recapturadas com a guia ativa e animações concluídas. A primeira medição em guia de fundo capturava o início da animação (`translateX(36px)`) e o RAF de foco ainda pendente; não foi tratada como resultado final.

## Quality gates

Comandos executados no diretório `frontend`:

| Comando | Baseline/controle | Resultado final |
| --- | --- | --- |
| `npm run test` | Inicial: 180 aprovados/15 falhas; cópia isolada anterior à Fase 7: 175/20 | **183 aprovados/16 falhas** em 40 arquivos; gate permanece vermelho |
| `npm run test -- --pool=forks` | Histórico da Fase 6: 195/195 | **199/199 aprovados** em 40 arquivos |
| Suítes de Layout e criação em lote, runner padrão | 11/11 na cópia anterior à Fase 7 | 12/12 no estado final |
| Suíte PossessionTripsModal, runner padrão | 5/5 na cópia anterior à Fase 7 | 5/5 no estado final |
| Testes dirigidos de teclado, foco e modal sobreposto | Quatro testes de regressão novos | 13/13 aprovados em quatro arquivos |
| `npm run lint` | 0 erros/46 avisos | **0 erros/46 avisos**, sem novos avisos |
| `npm run build` | aprovado | **aprovado** |
| `git diff --check` | — | aprovado |

A execução intermediária do runner padrão teve 197 aprovados/2 falhas (criação de abastecimento em lote e contador de empréstimos de Layout). As duas suítes passaram isoladas antes/depois. A última execução completa, após os acionadores de contratos/lotes, teve **183 aprovados/16 falhas**: os mesmos 15 nomes do baseline inicial mais `PossessionTripsModal > exibe a validação 422 devolvida pelo contrato ao iniciar rota`. Esse arquivo não foi alterado; seus cinco testes passaram isolados na cópia anterior à fase e no estado final. A comparação nominal está em `failure-comparison.json`.

A última suíte completa com `forks` passou em 199/199. Não foi identificada falha persistente adicional nos controles dirigidos, mas o gate completo padrão continua vermelho e a instabilidade de `vmThreads` continua aberta. Sua configuração e os testes de negócio não foram alterados para fazer o gate passar.

## Evidências e arquivos

Evidências locais em `output/playwright/phase-7/`, excluídas do Git por `.git/info/exclude`. Não publicar capturas ou relatórios com dados de HML como assets da aplicação.

- [Índice de evidências e contact sheets consolidados](../../output/playwright/phase-7/INDEX.md).
- [Matriz principal](../../output/playwright/phase-7/matrix-final.json), [rodada de contraste e gestão](../../output/playwright/phase-7/matrix-polish.json), [rodada do shell](../../output/playwright/phase-7/matrix-shell.json), [recaptura responsiva](../../output/playwright/phase-7/matrix-responsive-final.json), [alertas de Análises](../../output/playwright/phase-7/insights-final.json), [seleção por teclado de contratos/lotes](../../output/playwright/phase-7/record-buttons.json).
- [Modais](../../output/playwright/phase-7/modals.json), [painéis e menus finais](../../output/playwright/phase-7/drawers-menus-settled.json), [abas e formulários complementares](../../output/playwright/phase-7/extra-final.json), [teclado antes/depois](../../output/playwright/phase-7/keyboard-final.json).
- Screenshots `before-*`, `final-*`, `polish-*`, `shell-*`, `responsive-*`, `modal-*`, `drawer-*`, `menu-*`, `extra-*` e contact sheets no mesmo diretório. As capturas `responsive-*` substituem as anteriores nos tamanhos reduzidos; `polish-*`/`shell-*` documentam as correções posteriores à matriz principal.
- Exportações `export-{vehicles,postos,users,auditoria,processos-pagamento}.{pdf,xlsx}` e [registro PDF](../../output/playwright/phase-7/pdf-final.json).
- Logs em `storage/loan-tests/frontend-evolution-phase7/`: `baseline-*.log`, `final-test-record-buttons.log`, `final-forks-record-buttons.log`, `final-lint.log`, `final-build.log`, `keyboard-tests-final.log`, `baseline-two-suites.log`, `final-two-suites.log`, `baseline-trips.log`, `final-trips.log`, `failure-comparison.json` e `hml-http.json`. Rodadas intermediárias mantidas para rastreabilidade.
- Snapshot de rollback `baseline-src/`, cópia isolada `baseline-run/`, diff exclusivo `phase7-only.diff` e hashes dos SVGs no diretório dos logs.

Arquivos de código da Fase 7: `Layout.jsx`, `Layout.test.jsx`, `SearchOverlay.jsx`, `SearchOverlay.test.jsx`, `hooks/useDialogFocus.js`, `hooks/useDialogFocus.test.jsx`, `PaymentProcessesPage.jsx`, `DataImportsPage.jsx` e `styles/frontend-evolution.css`. Documentação: este relatório, `EXECPLAN_PHASE_7.md`, `EXECPLAN.md` e `STATUS.md`.

## Ressalvas e parada

1. Runner padrão intermitente e 46 avisos preexistentes de lint permanecem registrados, sem correções fora do escopo visual.
2. O PDF legado de Auditoria gerou 205 páginas para 200 registros, com colunas estreitas e quebra excessiva de texto. A página e o gerador são idênticos ao baseline desta fase. Conteúdo técnico preservado; melhoria do documento fica como pendência separada. O script inicial tentou ler um blob por `fetch`, bloqueado pela CSP; a verificação final usou o download do PDF já gerado, sem mudar a CSP.
3. Fluxos que gravam dados, efetivam importações, alteram permissões, confirmam abastecimentos ou assinam documentos não foram concluídos no navegador. Foram conferidos os pontos de entrada/formulários e os testes existentes. Não houve assinatura ou operação de negócio em nome do usuário.
4. Contraste foi inspecionado visualmente e por amostragem de controles/status. Não constitui certificação integral de acessibilidade. Outros perfis de usuário e motores de navegador não receberam matriz visual completa.
5. Mantidas as pendências anteriores sobre boards 01/02 duplicados e os SVGs externos ao trabalho.

**Encerrado na Fase 7 em HML. Entrega versionada localmente, sem publicação em produção. Não iniciar nova fase ou promoção de ambiente.**
