# ExecPlan — Fase 7 — QA final de homologação

## Objetivo
Executar QA visual, responsivo, teclado, temas e regressão da evolução do frontend. Corrigir somente inconsistências do redesign, sem novas funcionalidades. Autorizado em 05/10/2026; encerrar com STATUS e relatório final de HML. Não publicar em produção.

## Estado inicial verificado
- Branch `feature/frontend-evolution-hml`; HEAD `1ec4886`.
- Working tree contém a Fase 6 ainda sem commit e 11 miniaturas SVG preexistentes. Preservar ambos.
- Snapshot integral de `frontend/src` anterior à Fase 7 em `storage/loan-tests/frontend-evolution-phase7/baseline-src/`; diff e hashes de miniaturas registrados no mesmo diretório.
- Runtime validado de testes: localhost:6969, PostgreSQL 5441, domínio testefrota.sirel.com.br. Não usar exemplos antigos de 3010/8010 para esta cópia.
- Baseline medido: test padrão 180 aprovados/15 falhas, lint 0 erros/46 avisos, build aprovado. Histórico: 195/195 com forks e runner padrão instável. Cópia isolada anterior à Fase 7 posteriormente registrou 175/20.
- Contact sheets atuais e evidências da Fase 6 consultados; referência alvo permanece institucional, densa e incremental.

## Arquivos previstos
Folha aditiva `frontend/src/styles/frontend-evolution.css`; componentes/páginas apenas se a evidência exigir correção localizada de apresentação ou teclado. Este plano, relatório final HML, EXECPLAN e STATUS. Evidências locais em `output/playwright/phase-7/`.

## Alterações funcionais proibidas
Não adicionar funcionalidades, mudar dados, endpoints, payloads, permissões, autenticação, backend, cálculos ou cores semânticas de gráficos. Preservar PDF/XLSX, assinatura, busca, auditoria, posse e abastecimento. Não refatorar páginas inteiras. Não publicar em produção.

## Passos de implementação
- [x] 1. Baseline de gates e matriz visual inicial.
- [x] 2. Inspecionar falhas de layout, contraste, foco, menus e modais; registrar evidências antes de corrigir.
- [x] 3. Aplicar correções mínimas e centralizadas do redesign.
- [x] 4. Matriz final nas três resoluções desktop e três larguras reduzidas, claro/escuro.
- [x] 5. Teclado, menus, modais, navegação e regressão de exportações/ações existentes.
- [x] 6. Gates finais, comparação com baseline, documentação e parada.

## Validação visual
1366×768, 1600×900, 1920×1080, 1024×768, 768×1024 e 390×844. Todas as 17 rotas principais e cinco abas de pagamentos. Abas complementares e modais conferidos por amostragem explícita. Screenshot, overflow da página, rolagem interna e erros de carregamento registrados. Teclado: Tab/Shift+Tab, Enter, Escape, foco/restauração e menus, sem submeter mutações.

## Testes e build
npm run test, npm run lint, npm run build. Runner forks para comparar com instabilidades conhecidas. Cobertura direcionada apenas quando necessária para um bug corrigido. Sem apresentar falhas como aprovação.

## Resultado
Concluído em HML em 05/10/2026. Corrigidos foco da navegação móvel, busca global e três painéis de pagamento, acesso por teclado a processos/contratos/lotes, dimensões de cabeçalhos/filtros/tabelas, rolagem de Empréstimos, grid de Importar/Exportar, contraste de controles/status/alertas e gaps de formulário em portal. Sem funcionalidades novas.

Matriz principal: 252 combinações de vistas/viewports/temas; retestes dirigidos de gestão/contraste e shell. 48 cenários de modais, 18 de painéis, seis de menus, abas complementares e cinco pares de exportações PDF/XLSX. Evidências e ressalvas em [PHASE_7_HML_REPORT.md](PHASE_7_HML_REPORT.md).

Gates: 199/199 com forks; última execução padrão 183 aprovados/16 falhas (15 nomes iguais ao baseline e uma falha variável em PossessionTripsModal, não alterado, com 5/5 isolados antes/depois). Uma execução intermediária teve 197/2, com suas suítes aprovadas isoladas no baseline (11/11) e final (12/12). Testes dirigidos de teclado: 13/13. Lint mantém 0 erros/46 avisos; build e diff-check aprovados. HTTP 200 no site HML, assets iguais à origem local. STATUS atualizado. Parar sem produção.

Arquivos de código efetivamente alterados: Layout e seu teste, SearchOverlay e seu novo teste, novo useDialogFocus e seu teste, ajustes locais em PaymentProcessesPage e DataImportsPage, além do CSS centralizado. Os demais arquivos da Fase 6 e os 11 SVGs preexistentes foram preservados.

## Pendências / decisões
Exportações podem ser geradas em HML para verificar regressão. Não cadastrar dados nem assinar documentos em nome do usuário. Fluxos cuja conclusão altere registros terão abertura, conteúdo e acessibilidade conferidos, com limitação explícita no relatório.

Decisões de 05/10/2026: manter o runner e a lógica de negócio; registrar as falhas variáveis com controles isolados. Os três painéis customizados exigiram um hook de foco compartilhado; modificado um subcomponente por vez, sem refactor da página. Não alterar o PDF legado de Auditoria: colunas estreitas e paginação excessiva foram documentadas, preservando todos os detalhes. Medições de painéis em animação foram substituídas por evidências com guia ativa e animação concluída.

## Rollback
Restaurar somente os arquivos modificados pela Fase 7 a partir do snapshot baseline-src, preservando a Fase 6 e os SVGs. Refazer build de HML. Nenhuma alteração de dados ou backend prevista.
