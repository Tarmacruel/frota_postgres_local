# ExecPlan — Fase 1 — Fundação visual e navegação

## Objetivo
Implantar somente a fundação de navegação e componentes do Analytics sobre os contratos/dados V1, preservando `/analytics`. Autorização do usuário em 06/10/2026; não iniciar Fase 2.

## Estado inicial verificado
- Diretório: `D:\FROTAS\frota_emprestimos_testes`.
- Branch: `feature/analytics-evolution-hml`.
- HEAD: `082af32dee326408d023d0133272ae8eaa71eb20`.
- `git status --short`: vazio; pacote ignorado localmente, preservado.
- Documentos mestre/fase lidos dentro de `FROTA_SIREL_ANALYTICS_EVOLUTION_PACKAGE/`, pois ainda não existem nos caminhos finais; status/baseline e design system lidos na raiz.
- Banco de homologação atualizado da produção nesta data, com configurações e assinatura desabilitada preservadas; auditoria da Fase 0 permanece histórica.
- Baseline novo: 229 testes frontend, lint 0 erros/46 avisos, build aprovado; logs persistidos em `evidence/phase-1/`.

## Direção visual e interação
- Tese visual: área institucional compacta, superfícies discretas e tipografia/tokens já adotados pelo Frota.
- Conteúdo: cabeçalho e subnav; filtros V1; quatro indicadores existentes e blocos atuais; detalhe lateral sem carregamento novo. Sem hero, métricas ilustrativas ou novas dependências.
- Interação: seleção de seção e foco claros, drawer com entrada curta e estados por bloco; respeitar movimento reduzido.
- Navegação: query string `view`, mantendo `/analytics`; filtros em estado local, preservados ao navegar entre seções/abrir detalhe. Seção desconhecida retorna visualmente à Visão Geral.
- Visão Geral preserva os blocos existentes. Custos/Combustível/Condutores/Alertas reorganizam apenas dados já carregados; Manutenção/Utilização explicam a indisponibilidade de análise específica. Relatórios mantém emissão existente.
- Drawer adapta a pilha do starter kit e reaproveita Modal para portal, foco, scroll e teclado. Escape volta um nível quando aplicável; Fechar encerra a pilha. Conteúdo explicitamente limitado à fundação, sem consultas de detalhe.

## Arquivos previstos
- `frontend/src/pages/AdminAnalyticsDashboard.jsx` e teste de interação.
- `frontend/src/components/analytics/`: componentes base, hook e adaptações incrementais nos blocos V1.
- `frontend/src/components/Modal.jsx`: opções aditivas de estilo/tecla Escape, preservando defaults existentes.
- Estilos centralizados `frontend/src/styles/analytics-evolution.css` e import em `main.jsx`.
- Este plano, `11_STATUS.md` e evidências/screenhots.

## Alterações funcionais proibidas
Nenhum backend, endpoint, payload, cálculo, migration, permissão, escopo organizacional ou configuração de produção. Não corrigir métricas V1 nesta fase. Preservar exportação e detalhes existentes. Não integrar exemplos de V2 nem dados mock na aplicação.

## Passos de implementação
- [x] Preflight e leitura das instruções.
- [x] Baseline novo e referência visual.
- [x] Componentes base e shell acessível, subnav, filtros compactos.
- [x] Estados por bloco e drawer de demonstração controlada pelos dados existentes.
- [x] Testes de interação e gates.
- [x] Screenshots claro/escuro, drawer e celular; atualizar status e parar.

## Validação visual
Somente `http://localhost:6969` / domínio de homologação, conta técnica local de testes. Capturas em `output/playwright/analytics-phase-1/`. O GET Analytics V1 grava snapshots em HML como comportamento existente; nenhum código/backend será alterado por isso. Não acessar produção.

## Testes e build
Testes de navegação, retenção de filtros, teclado/foco/Escape/pilha, placeholder sem requests novos, falha parcial/retry, estado vazio e exportação existente. Executar `npm run test`, `npm run lint`, `npm run build` e comparar com baseline novo.

## Resultado
Concluída em homologação, aguardando validação. Suíte completa com 243 testes aprovados, lint 0 erros/45 avisos e build aprovado. Ajuste final de CSS/atributos das tabelas validado com 15 testes focados, lint/build e navegador. Dez capturas inspecionadas; nenhuma alteração em backend ou produção. Ver `DELIVERY_PHASE_1.md`.

## Descobertas e decisões
- Os estilos legados de `body.internal-app-active` tinham prioridade sobre largura/altura do drawer; os seletores locais foram ajustados, mantendo os demais modais intactos.
- A transformação global de tabelas em cartões no celular ocultava cabeçalhos e alongava excessivamente os blocos analíticos. Nesta página, as tabelas mantêm cabeçalhos e rolagem horizontal focável, sem overflow do documento.
- Capturas iniciais durante transições de tema/animação foram substituídas por capturas com animações concluídas; nenhuma falha de contraste foi atribuída indevidamente ao estado final.
- Um teste de foco aguardava apenas o efeito imediato do drawer, antes do requestAnimationFrame do Modal. O teste passou a aguardar esse frame; não houve mudança artificial no comportamento do produto.

## Pendências / decisões
Fórmulas, datas, benchmark, cobertura, N+1 e V2 permanecem reservados às fases futuras. Fundação não apresenta dados novos para abas sem suporte V1.

## Rollback
Reverter somente os arquivos desta fase e reconstruir frontend de homologação. Não há migration ou alteração de dados administrativos a reverter.
