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
5. [ ] Publicar somente frontend HML, QA desktop/mobile/claro/escuro, documentação e reversão.

## Validação visual
Preservar o formulário por etapas e a densidade atual da listagem. Ajuda curta junto à lotação distingue cadastro atual e conferência histórica. Linha recebe cursor e realce discreto de hover/foco, sem cartões ou novos ícones. Manter a consulta explícita e navegação por teclado pelo botão.

## Testes e build
Conferir lotação compatível, ausente, de outra secretaria, consulta atrasada, troca de veículo, escolha manual e alteração da origem. Na linha, conferir clique em célula, botão sem duplicação, seleção de texto, fechamento/retorno de foco e query/filtros. Executar frontend test/lint/build e QA real sem salvar.

## Resultado
629 testes/86 arquivos (181,61s) e42 direcionados/3 arquivos aprovados; oito regressões adicionadas. Lint zero erros/39 avisos anteriores e build homologation aprovados. Aguardando QA da publicação.

## Pendências / decisões
Sem seleção arbitrária quando a lotação atual não estiver no catálogo autorizado ou não pertencer à origem. Prévia/confirmar regularização continuam explícitos. Sem foco extra na linha: preservar a tabela acessível e o botão como entrada por teclado.

## Rollback
Restaurar assets de frontend-before e substituir index atomicamente. Fonte e03fbcb no source-before.bundle. Sem restauração de banco ou reinício de serviços.
