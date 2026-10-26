# ExecPlan — Guias do contrato visíveis no extrato — HML

## Objetivo
Corrigir o desaparecimento de Resumo/Movimentações/Faturas/Configuração no extrato do contrato, somente na homologação.

## Estado inicial verificado
- Branch `feature/contracts-balances-hml-20261022`, HEAD `9cdb35c`, working tree limpo.
- Baseline:473 testes/75 arquivos, lint0 erros/39 avisos anteriores e build HML aprovado na fase anterior.
- Reproduzido no navegador real: extrato com7 lançamentos deixa a faixa de guias com1,25px de altura, embora seu conteúdo tenha29px. Grade com linhas automáticas comprime a linha cujo overflow é auto. Reservas vazias deixam as guias visíveis.

## Arquivos previstos
`frontend/src/styles/contracts-balances.css`; este plano e STATUS.

## Alterações funcionais proibidas
Nenhuma mudança de APIs, dados, permissões, navegação, exportações, cálculos, banco, serviços ou produção.

## Passos de implementação
1. [x] Reproduzir e medir a causa em guia própria de QA.
2. [x] Guardar índice/fonte/configurações e fingerprints somente leitura.
3. [x] Preservar as alturas intrínsecas das linhas do painel e a altura mínima da navegação.
4. [x] Rodar gates, publicar exclusivamente frontend HML e conferir alternância/rolagem/claro/escuro/mobile.
5. [x] Documentar evidências; commit local ao encerrar esta fase.

## Validação visual
Comparar alturas antes/depois no mesmo contrato; alternar extrato/reservas/serviços; conferir guias visíveis e clicáveis na carga, durante rolagem, volta ao extrato e teclado. Desktop e mobile nos dois temas. Sem gravação financeira.

## Testes e build
Testes existentes de navegação no contrato, suíte completa, lint e build HML. Sem testes de CSS em JSDOM, que não reproduz dimensionamento de grid/sticky. A regressão é conferida no navegador com geometria real e capturas.

## Resultado
Publicado somente no frontend HML. `grid-auto-rows: max-content` preserva o tamanho intrínseco das linhas do corpo rolável; navegação mantém mínimo44px. Antes a faixa media1,25px com sete lançamentos; depois43,98px, com quatro botões visíveis. Reservas/serviços/configuração mantiveram a mesma altura; Faturas e Resumo acessíveis e retorno ao extrato validado. Ao rolar até o fim, a navegação permanece fixada no topo do corpo, sem recorte dos rótulos.

QA em desktop1600×900 e mobile390/360×843, claro/escuro; guias móveis45,23px e altura maior quando a barra horizontal ocupa espaço, sem overflow horizontal do corpo. Teclado Enter acessou Resumo e Movimentações após a rolagem. Console sem erros. Capturas antes/depois e `browser-qa.json` guardados no backup; tema claro/viewport restaurados e guia exclusiva de QA encerrada.

Gates:473 testes/75 arquivos aprovados; lint0 erros/39 avisos anteriores; build HML e diff-check aprovados. Nove assets públicos conferidos porSHA-256,68 tabelas e configurações idênticas à captura inicial, backend/PID preservados e duas APIs saudáveis. Nenhuma gravação de dados de negócio, alteração em produção, migration, restauração, agendamento ou reinício.

## Pendências / decisões
Correção incremental de CSS; não reestruturar o componente nem trocar o padrão de navegação.

## Rollback
Backup em `storage/backups/20261023-contract-tabs`; restaurar o índice anterior para reverter a publicação (assets mantidos), ou reverter o CSS desta fase. Sem restore/migration/reinício de API.
