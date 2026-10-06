# Justificativas assistidas — entrega para validação

Data: 05/10/2026. Branch: `feature/frontend-evolution-hml`; base `4774bbc`.

## Resultado

Modelos fixos por finalidade e até três justificativas pessoais frequentes aceleram o preenchimento. Nenhum texto é preenchido ou enviado automaticamente. Escolher uma sugestão permite edição e pede confirmação antes de substituir texto diferente. “Esquecer” remove somente a sugestão pessoal, preservando auditoria. Falhas de consulta mantêm entrada manual disponível.

Catálogo único: `backend/app/core/justification_presets.json`, entregue pela API autenticada. Sem IA generativa, tela administrativa, importação de justificativas antigas ou armazenamento do histórico no navegador. Consulta ao montar o campo, sem requisições por tecla; respostas de contas anteriores são descartadas.

## Abrangência

| Módulo | Finalidades separadas |
| --- | --- |
| Posses e rotas | Retificação unificada, substituição, correção legada de devolução e cancelamento de rota |
| Abastecimentos e ordens | Retificação de abastecimento, reabertura, prorrogação e cancelamento de ordem |
| Veículos, sinistros e pagamentos | Retificação cadastral, justificativa de encerramento e exclusão de pagamento |
| Empréstimos | Criação administrativa, edição administrativa, regularização, envio, aceite, rejeição, cancelamento, solicitação de devolução, aceite/rejeição/cancelamento da devolução |

São 22 contextos independentes. “Motivo do empréstimo” permanece descritivo. Limites, declarações, validações e payloads existentes foram preservados. Cancelar ordem agora abre modal com motivo opcional e confirmação explícita; erros mantêm o texto para nova tentativa.

## Persistência e transações

Migration aditiva `0049_justification_suggestions`, posterior a `0048_possession_rectification`. Tabela com usuário, contexto, texto, chave normalizada, contagem e último uso; índice único por usuário/contexto/chave. Agrupa somente espaços e caixa, preservando texto final para apresentação. Ordena frequência, recência e identificador como desempate estável; mantém até 50 textos por conta/contexto.

Registro junto à auditoria na transação da operação. Upsert atômico e trava transacional por usuário/contexto protegem incremento e descarte concorrentes. Erros, conflitos e rollback não contam. Retificação unificada de posse conta uma vez, mesmo quando produz auditoria de devolução. Sinistros contam quando a justificativa muda, evitando aprender texto antigo em edições de anexos.

`GET /api/justification-suggestions?context=...` e `DELETE /api/justification-suggestions/{id}` derivam a conta da sessão e verificam contexto/permissões no servidor. Exclusão de registro de outra conta retorna 404. Auditoria continua recebendo o texto pelo mecanismo existente.

## Validação

| Verificação | Resultado |
| --- | --- |
| Backend, suíte ampla de serviços e APIs afetados | 169 aprovados, 9 ignorados, 4 avisos |
| Backend, verificação final de sugestões/auditoria/importação de pagamentos | 17 aprovados |
| `npm run test` | 226 aprovados em 48 arquivos |
| `npm run lint` | 0 erros; 46 avisos, iguais ao baseline |
| `npm run build -- --outDir ../storage/loan-tests/assisted-justifications/dist` | Aprovado; build isolado |
| `git diff --check` | Aprovado |
| QA em Chrome e Edge | Duas contas fictícias, sincronização, isolamento e esquecimento |
| QA visual e interação | Claro/escuro, desktop/celular, teclado, substituição e entrada manual após falha |

Testes cobrem normalização, ranking, limite, concorrência (12 incrementos do mesmo texto e 55 novos textos), rollback, auditoria, conflitos/repetição, permissões, campos obrigatórios/opcionais e integrações de formulário. A normalização não reduz o comprimento usado para validar o texto salvo. O teste de ranking controla o relógio para não depender da resolução temporal do Windows.

Baseline frontend: 216 aprovados/10 falhas em vmThreads; execução após alterações: 194/32. As 13 suítes afetadas passaram isoladamente e a suíte completa passou com forks. `frontend/vite.config.js` troca somente o pool para forks; o comando padrão final passou integralmente. Os nove testes de backend ignorados exigem a variável legada `PHASE3_TEST_DATABASE_URL`; integração com PostgreSQL descartável executada com `LOAN_MIGRATION_TESTS=1`.

Logs locais: `storage/loan-tests/assisted-justifications/`, incluindo `baseline-*.log`, `final-test.log`, `final-lint.log`, `final-build.log`, `final-backend.log`, `backend-final-directed.log`, `directed-results.json`, `browser-chrome.log` e `browser-edge.log`. As execuções de backend se sobrepõem; as contagens não devem ser somadas.

## Screenshots

- [Desktop claro](../../output/playwright/assisted-justifications/vehicle-light.png)
- [Histórico sincronizado no Chrome](../../output/playwright/assisted-justifications/chrome-synced.png)
- [Celular escuro](../../output/playwright/assisted-justifications/chrome-dark-mobile.png)
- [Isolamento da segunda conta](../../output/playwright/assisted-justifications/chrome-other-account.png)
- [Cancelamento de ordem opcional](../../output/playwright/assisted-justifications/order-cancel-dark.png)
- [Aprendizado do texto final editado](../../output/playwright/assisted-justifications/edge-learned-final-text.png)
- [Falha de consulta e entrada manual no celular](../../output/playwright/assisted-justifications/edge-manual-fallback-mobile.png)

Scripts no mesmo diretório: `qa-chrome.js` e `qa-edge.js`, com contas exclusivamente fictícias. A inspeção visual dos formulários compartilhados é complementada pelos testes de integração; não houve execução manual de todas as operações em cada navegador.

## Ambiente, pendências e reversão

QA inicial em servidor local 6971, build isolado e banco descartável `loan_workflow_*` no cluster de testes 5441. Durante essa validação, o banco de trabalho e a versão servida em 6969 foram preservados. A publicação posterior autorizada está registrada abaixo. Nenhum arquivo de deploy de produção alterado.

Ao encerrar, o servidor e as duas sessões de navegador de QA foram fechados e o banco fictício descartável foi removido. Build, logs e screenshots foram preservados para revisão.

Entrega disponível para validação no endereço público de homologação. Nenhuma outra fase iniciada. Chrome e Edge usam Chromium; não há certificação de Firefox/Safari ou acessibilidade integral.

Reversão: retirar somente esta implementação e, se necessário, executar downgrade após retirar o código consumidor. A tabela de sugestões é independente da auditoria; removê-la não remove registros de auditoria.

## Publicação autorizada — 06/10/2026

Publicado o código do commit `7fcbc6b` em **https://testefrota.sirel.com.br**, servido pelo runtime isolado `127.0.0.1:6969`. Backup do banco de homologação e do frontend anterior em `storage/loan-tests/assisted-justifications/before-publication/`.

Aplicada somente a migration `0048_possession_rectification` → `0049_justification_suggestions` no banco `frota_emprestimos_testes`, porta 5441, após validação do diretório do cluster e das configurações de homologação. Confirmadas as permissões SELECT/INSERT/UPDATE/DELETE da conta da aplicação na nova tabela. Reiniciada somente a API de testes; PostgreSQL preservado em execução.

Verificação pós-publicação na origem local e no domínio público: aplicação/banco saudáveis, página HTTP 200, GET/DELETE de sugestões presentes no OpenAPI e hashes SHA-256 dos 17 assets JS/CSS do build validado correspondentes. A consulta sem sessão retorna 401. A tabela de sugestões iniciou vazia, sem importação de histórico. Nenhuma operação funcional foi executada em dados existentes durante a publicação.

Evidência local: `storage/loan-tests/assisted-justifications/publication.json`. Produção permanece inalterada.

## Arquivos de implementação e testes

- `backend/app/main.py`
- `backend/app/models/__init__.py`
- `backend/app/services/audit_service.py`
- `backend/app/services/claim_service.py`
- `backend/app/services/fuel_supply_order_service.py`
- `backend/app/services/fuel_supply_service.py`
- `backend/app/services/payment_process_service.py`
- `backend/app/services/possession_return_service.py`
- `backend/app/services/possession_service.py`
- `backend/app/services/possession_trip_service.py`
- `backend/app/services/vehicle_loan_regularization.py`
- `backend/app/services/vehicle_loan_service.py`
- `backend/app/services/vehicle_service.py`
- `frontend/src/components/ClaimForm.jsx`
- `frontend/src/components/FuelSupplyOrderDeadlineForm.jsx`
- `frontend/src/components/FuelSupplyRectifyForm.jsx`
- `frontend/src/components/FuelSupplyRectifyForm.test.jsx`
- `frontend/src/components/PossessionForm.jsx`
- `frontend/src/components/PossessionForm.test.jsx`
- `frontend/src/components/PossessionReturnCorrectionModal.jsx`
- `frontend/src/components/PossessionTripsModal.jsx`
- `frontend/src/components/PossessionTripsModal.test.jsx`
- `frontend/src/components/VehicleLoanForms.jsx`
- `frontend/src/components/VehicleLoanForms.test.jsx`
- `frontend/src/components/VehicleLoanRegularization.jsx`
- `frontend/src/components/VehicleLoanRegularization.test.jsx`
- `frontend/src/pages/FuelSuppliesPage.jsx`
- `frontend/src/pages/PaymentProcessesPage.jsx`
- `frontend/src/pages/PossessionPage.jsx`
- `frontend/src/pages/PossessionPage.test.jsx`
- `frontend/src/pages/VehiclesPage.jsx`
- `frontend/src/styles/frontend-evolution.css`
- `frontend/vite.config.js`
- `backend/alembic/versions/0049_justification_suggestions.py`
- `backend/app/api/routes/justification_suggestions.py`
- `backend/app/core/justification_presets.json`
- `backend/app/models/justification_suggestion.py`
- `backend/app/services/justification_suggestions.py`
- `backend/tests/test_justification_suggestions.py`
- `frontend/src/api/justificationSuggestions.js`
- `frontend/src/components/FuelSupplyOrderCancelForm.jsx`
- `frontend/src/components/FuelSupplyOrderCancelForm.test.jsx`
- `frontend/src/components/FuelSupplyOrderDeadlineForm.test.jsx`
- `frontend/src/components/JustificationField.jsx`
- `frontend/src/components/JustificationIntegrations.test.jsx`
- `frontend/src/components/ReasonSuggestions.jsx`
- `frontend/src/components/ReasonSuggestions.test.jsx`
- `frontend/src/hooks/useReasonSuggestions.js`
- `frontend/src/pages/PaymentProcessesPage.test.jsx`
- `frontend/src/pages/VehiclesPage.test.jsx`
- `frontend/src/test/mockJustificationSuggestions.js`
- `frontend/src/utils/reasonSuggestions.js`
- `frontend/src/utils/reasonSuggestions.test.js`

Documentação: este relatório, `EXECPLAN_REASON_SUGGESTIONS.md` e `STATUS.md`. Evidências: `output/playwright/assisted-justifications/`.
