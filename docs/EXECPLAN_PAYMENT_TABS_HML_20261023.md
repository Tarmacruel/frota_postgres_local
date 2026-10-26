# ExecPlan — Abas do processo sempre visíveis — homologação

## Objetivo
Corrigir o desaparecimento de Resumo/Financeiro/Checklist/Histórico no painel lateral do processo de pagamento, somente HML, sem alterar dados ou comportamento financeiro.

## Estado inicial verificado
- Branch feature/contracts-balances-hml-20261022; HEAD3baad54; working tree limpo.
- Baseline anterior:474 testes/75 arquivos, lint0 erros/39 avisos, build HML aprovado.
- Processo1234 criado pelo usuário, valor8700; Financeiro reproduz a falha no navegador: nav1,136px, conteúdo25px; corpo848px e scroll912px, grid-auto-rows:auto.
- Causa: linha automática da grade pode encolher a navegação que usa overflow auto. flex-shrink:0 não protege um item de grid. O painel de contrato já tem correção equivalente.

## Arquivos previstos
- frontend/src/styles/payment-workspace.css
- Este plano e docs/frontend-evolution/STATUS.md.

## Alterações funcionais proibidas
Sem backend, API, migrations, dados, permissões, cálculos, etapas, conciliação, exportações, configuração, agendamento ou produção. Nenhum botão de salvar/alterar etapa/conciliar será acionado na QA.

## Passos de implementação
1. [x] Reproduzir e medir geometria antes da alteração.
2. [x] Capturar código/índice/configuração/fingerprints/PID de baseline em storage/backups/20261023-payment-tabs.
3. [x] Preservar tamanho intrínseco das linhas e mínimo44px da navegação.
4. [x] Testes, lint, build e publicação exclusiva do frontend HML.
5. [x] Conferir quatro abas, rolagem e teclado, desktop/mobile claro/escuro; guia original devolvida ao Financeiro, sem rascunho de edição ou comentário pendente.
6. [x] Registrar evidências e commit local desta fase.

## Validação visual
Mesma fatura antes/depois com as quatro abas. Financeiro e Checklist com conteúdo maior que o painel; navegação visível no topo durante a rolagem. Resumo com referências expandidas; Histórico vazio; foco/Enter e fechamento. Desktop atual2035×927 e1600×900, celular390/360. Temas claro/escuro; sem overflow horizontal do corpo. Usar guia própria para QA e preservar a original.

## Testes e build
Frontend474 testes/75 arquivos aprovados; lint0 erros/39 avisos anteriores. Build homologation e diff-check aprovados, aviso anterior de chunk grande. Não criar testes de CSS em JSDOM que não calcula essa geometria; regressão medida no navegador real e guardada em capturas/browser-qa.json.

## Resultado
Publicado exclusivamente no frontend HML. Linhas do corpo usam grid-auto-rows:max-content e navegação mínimo44px: faixa antes1,136px no Financeiro, depois43,98px no desktop e45,23px no celular. Corpo pode rolar sem comprimir a faixa. Checklist de12 itens rolado até o fim (scrollTop1857,5 no celular) manteve as quatro abas fixadas no topo; alternância com Financeiro/Resumo/Histórico e Enter/Escape conferidos. Resumo com três referências abertas e histórico vazio também mantiveram as abas.

QA desktop1600×900 claro/escuro e celular390/360×843 escuro/claro. Sem overflow horizontal do corpo/documento nem erros de console. Nenhuma ação financeira ou salvamento efetuado. Tema claro e tamanho original restaurados; guia exclusiva de QA encerrada. Guia original2035×927 reaberta no Financeiro e conferida: quatro abas, altura43,999px e zero overflow horizontal. Captura final financeiro-corrigido.png; demais capturas em checklist-desktop-fim.png, financeiro-desktop-escuro.png e checklist-mobile390-escuro.png/checklist-mobile360-claro.png.

Publicação verificada: nove assets públicos iguais ao build,68 tabelas e configurações idênticas, backend/PID de API preservados e duas APIs saudáveis. Sem migration, restauração, agendamento, reinício ou alteração em produção.

## Pendências / decisões
Correção incremental em CSS, reutilizando a solução já validada no painel de contrato. Sem redesenhar a tela ou tornar as abas parte de regras financeiras.

## Rollback
Restaurar frontend-index-before.html do backup para frontend/dist/index.html (assets anteriores permanecem); restaurar CSS da fonte3baad54 e republicar se necessário. Sem restore ou reinício da API.
