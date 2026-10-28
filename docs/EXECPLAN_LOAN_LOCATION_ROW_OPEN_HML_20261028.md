# ExecPlan — Lotação sugerida e abertura pela linha — 28/10/2026

## Objetivo
Preencher a lotação de origem da regularização com a lotação cadastrada do veículo quando compatível com a secretaria de origem, preservando conferência histórica e edição manual. Abrir os detalhes clicando na linha do empréstimo, mantendo botão, semântica de tabela, filtros, foco e posição.

## Estado inicial verificado
- HML em e03fbcb, árvore limpa; nova branch fix/loan-origin-location-row-open-hml-20261028 a partir de feature/loan-guided-forms-hml-20261028.
- Baseline da entrega anterior:621 testes/86 arquivos, lint zero erros/39 avisos e build homologation aprovado; entrada index-B6yz_Ygm.js.
- GET /vehicles/options já oferece current_location.allocation_id; apenas dados auxiliares autorizados e IDs do catálogo de empréstimos serão reutilizados. Não inferir lotação por aproximação do nome.
- AGENTS/runbook/planos/especificação/status e contact sheet consultados. Backup privado de frontend/fonte/configurações/fingerprints em storage/backups/20261028-loan-location-row-open.

## Arquivos previstos
VehicleLoanRegularization, useLoanVehicleIdentity, useLoanFormSteps (estabilidade do callback clear), VehicleLoansPage/CSS e testes correspondentes.

## Alterações funcionais proibidas
Sem backend/API/schema/env/permissões/payloads ou mudanças nas regras de responsabilidade e prévia. Não criar registros de QA, não restaurar dados nem reiniciar APIs. Não alterar produção/rotina06h. A lotação atual é sugestão editável e não prova a lotação histórica.

## Passos de implementação
1. [x] Inventário, branch e backup.
2. [x] Sugestão exata de lotação com proteção contra sobrescrita e dados atrasados.
3. [x] Clique na linha com botão/teclado/foco/consulta preservados.
4. [x] Regressões, suíte frontend, lint/build.
5. [x] Publicar somente frontend HML, QA desktop/mobile/claro/escuro, documentação e reversão.

## Validação visual
Preservar o formulário por etapas e a densidade atual da listagem. Ajuda curta junto à lotação distingue cadastro atual e conferência histórica. Linha recebe cursor e realce discreto de hover/foco, sem cartões ou novos ícones. Manter a consulta explícita e navegação por teclado pelo botão.

## Testes e build
Conferir lotação compatível, ausente, de outra secretaria, consulta atrasada, troca de veículo, escolha manual e alteração da origem. Na linha, conferir clique em célula, botão sem duplicação, seleção de texto, fechamento/retorno de foco e query/filtros. Executar frontend test/lint/build e QA real sem salvar.

## Resultado
629 testes/86 arquivos (181,61s) e 42 direcionados/3 arquivos aprovados; oito regressões adicionadas. Depois do alinhamento CSS dos campos ao lado da ajuda, 57 testes direcionados/4 arquivos passaram novamente. Lint zero erros/39 avisos anteriores e build homologation aprovados.

Fonte funcional b50fb5f; alinhamento final bf8f794 publicado às 13:56:26 de 28/10/2026, entrada index-Cl_6b_nt.js. Nove assets conferidos byte a byte; readiness de homologação e produção 200. Backend/configurações/schema e APIs 6969/PID21432 e 8000/PID2512 preservados. Produção limpa em31543d4. Sem migrations, restauração ou reinício.

Na QA autenticada, GTN8C43 carregou automaticamente a lotação Secretaria de Saúde / Media e Alta Complexidade; troca manual para Patio Municipal preservada. Ajuda informa que o cadastro atual é uma sugestão para conferir a origem histórica. Não houve envio da prévia ou confirmação de regularização.

Clique na célula Educação → Promoção Social abriu TML4E34 cancelado. Fechar manteve CANCELLED e devolveu foco ao botão de consulta; Enter também abriu o painel. Semântica da tabela e botão preservada, cursor pointer e realce de foco conferidos. O teste de seleção de texto impede abrir o painel ao copiar conteúdo. Desktop claro, formulário mobile claro390×843 e painel mobile escuro390×843/360×800 sem overflow horizontal; rodapés fixos conferidos após estabilizar o redimensionamento. Console final sem erros, tema claro e viewport padrão restaurados, guia temporária fechada e navegação atual do usuário preservada.

Comparação final: 75/75 tabelas idênticas, incluindo 27 financeiras; nenhum evento de auditoria/negócio novo durante esta entrega. Baseline mantido. Evidências privadas em storage/backups/20261028-loan-location-row-open: publication.json, final-verification.json, frontend-tests.log, final-focused.log, lint.log e build.log. Capturas: origin-before.png, origin-prefill-desktop.png, origin-prefill-mobile.png e row-opens-detail-mobile-dark.png. Rollback do frontend-before preparado, sem restauração de banco.

## Pendências / decisões
Sem seleção arbitrária quando a lotação atual não estiver no catálogo autorizado ou não pertencer à origem. Prévia/confirmar regularização continuam explícitos. Sem foco extra na linha: preservar a tabela acessível e o botão como entrada por teclado.

## Rollback
Restaurar assets de frontend-before e substituir index atomicamente. Fonte e03fbcb no source-before.bundle. Sem restauração de banco ou reinício de serviços.
