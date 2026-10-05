# ExecPlan — Fase 6 — Gestão e administração

## Objetivo
Evoluir incrementalmente Cadastros, Postos, cinco abas de Processos de pagamento, Análises, Importar/Exportar, Usuários e Auditoria, somente em homologação. Autorizado em 05/10/2026; parar antes da Fase 7.

Tese visual: superfícies institucionais discretas, alta densidade legível e hierarquia coerente com os módulos operacionais. Conteúdo: cabeçalho compacto, ações existentes, filtros, indicadores e área de trabalho. Interação: foco visível, seleção de aba explícita e hover discreto usando os tokens existentes, sem animação ornamental.

## Estado inicial verificado
- Branch `feature/frontend-evolution-hml`, HEAD `1ec4886`.
- 11 SVGs de miniaturas previamente modificados pelo usuário; preservar integralmente.
- STATUS anterior: Fase 5 concluída. Runtime real em localhost:6969/testefrota.sirel.com.br, PostgreSQL de testes em 5441.
- Contact sheets atual e alvo consultados; boards 01/02 duplicados conforme baseline.
- Baseline inicial: 180 testes aprovados/15 falhas no runner padrão; lint 0 erros/46 avisos; build aprovado. Logs em `storage/loan-tests/frontend-evolution-phase6/`.

## Arquivos previstos
Sete páginas desta fase, `frontend/src/styles/frontend-evolution.css`, este plano, STATUS e relatório da fase. Evidências locais em `output/playwright/phase-6/`.

## Alterações funcionais proibidas
Não alterar backend, banco, APIs, payloads, autenticação, permissões, cálculos, cores/semântica dos gráficos, exportações ou conteúdo de Auditoria. Não alterar produção. Não refatorar PaymentProcessesPage integralmente.

## Passos de implementação
- [x] 1. Cadastros e Postos: cabeçalhos, navegação, filtros e tabelas.
- [x] 2. Pagamentos / Processos: cabeçalho e fila.
- [x] 3. Pagamentos / Importação: triagem e resultado; contagem de erros destacada, estados e submissão intactos.
- [x] 4. Pagamentos / Gestão do contrato: filtros, ranking e superfícies; séries, cores e cálculos intactos.
- [x] 5. Pagamentos / Contratos: tabela, seleção, detalhe e aditivos; formulário e handlers intactos.
- [x] 6. Pagamentos / Fornecedores: lista compacta, contador local e formulário existente, sem mudar campos ou ações.
- [x] 7. Análises: hierarquia e espaçamento; componentes de gráficos intactos.
- [x] 8. Importar/Exportar: lotes, revisão e estados explícitos; erros/rejeições com chips de perigo e rótulos originais.
- [x] 9. Usuários e Auditoria: perfis/estados legíveis, CPF mascarado intacto e todos os campos técnicos preservados.
- [x] 10. Gates, inspeção visual claro/escuro, relatório, STATUS e parada.

## Validação visual
Navegador real em 1366×768 nos temas claro/escuro, todas as telas e cinco abas de pagamentos. Conferir áreas de trabalho, overflow, ações e modais sem realizar mutações nos dados.

## Testes e build
Executar npm run test, npm run lint, npm run build; comparar falhas com baseline atual. Usar pool forks para distinguir falhas do runner já documentadas. Teste direto existente de Usuários.

## Resultado
Implementação concluída em 05/10/2026, com diffs pequenos nas sete páginas e estilos centralizados. As cinco abas de pagamentos foram tratadas em subetapas independentes, sem reestruturar handlers, formulários ou consultas. Auditoria conserva colunas, renderização e exportadores; Análises conserva todos os componentes, cores e cálculos dos gráficos.

Gates: runner padrão final 179 aprovados/16 falhas; os mesmos 16 nomes de falha foram reproduzidos em cópia isolada do HEAD inicial `1ec4886`. Runner forks final: 195/195. Lint: 0 erros/46 avisos. Build aprovado. Uma execução concorrente do baseline com forks teve 194/195 (VehicleLoanForms); isso está documentado como instabilidade do teste e não foi ocultado.

A inspeção visual identificou e corrigiu a largura insuficiente de Registro em Auditoria, contraste dos botões secundários no escuro e overflow da grade de Análises. Evidências claro/escuro e checagens de interação em `output/playwright/phase-6/`.

Validação final: 22 capturas de tela/aba e tema sem alertas de erro de carregamento ou overflow horizontal da página. Site público de testes respondeu HTTP 200 com o asset do build final. STATUS atualizado; execução encerrada antes da Fase 7.

## Pendências / decisões
Usar estrutura existente das páginas e CSS centralizado. Nenhuma dependência nova. Processos possui aba Importação no working tree e será preservada e incluída na fase.

## Rollback
Reverter somente os diffs desta fase nas sete páginas e folha aditiva e refazer build de homologação. Não há alteração de dados, backend ou configurações. Preservar os SVGs preexistentes.
