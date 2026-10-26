# ExecPlan — Correção da criação de processo — homologação

## Objetivo
Corrigir o HTTP 500 na criação de processos de pagamento, referência 12f0e248-0cd9-4bfe-b487-63d256753d2e, preservando o rascunho e evitando nova tentativa sem conferir persistência.

## Estado inicial verificado
- Branch feature/contracts-balances-hml-20261022, HEAD df317ed, working tree limpo.
- Log da API HML: MissingGreenlet em PaymentProcessService.create → _replace_references → record.references.clear(), depois do flush. Checklist também acessa coleção ainda não inicializada.
- Consulta somente leitura: nenhum processo 1234 no contrato informado; três operações sem conciliação. Transação da tentativa foi revertida.
- Baseline anterior: frontend473/75, lint0 erros/39 avisos, build HML aprovado. A validação anterior do formulário usava API mockada; não cobria esse erro de persistência real.
- API HML6969, PostgreSQL5441/schema0059. Produção fora do escopo.

## Arquivos previstos
- backend/app/services/payment_process_service.py
- backend/tests/test_contract_balances_postgres.py
- frontend/src/components/payments/PaymentProcessDialog.jsx e teste (mensagem de falha sem confirmação).
- Este plano e docs/frontend-evolution/STATUS.md.

## Alterações funcionais proibidas
Sem migration, mudança de contrato de API, saldo, permissões, configuração, restauração diária ou publicação em produção. Nenhuma gravação financeira no HML para validar; testes reais somente em banco descartável frota_contract_tests_* no cluster5441.
O limite de backend do runbook de redesign não se aplica: esta é correção funcional solicitada do servidor, sem redesign ou schema.

## Passos de implementação
- [x] Diagnosticar log, conferir ausência de gravação e preservar campos do rascunho pela UI.
- [x] Registrar backup de código/configuração/fingerprints e processo antes da publicação.
- [x] Reproduzir a falha com POST real e PostgreSQL descartável: três casos MissingGreenlet; importação também reproduziu o acesso ao checklist não inicializado.
- [x] Inicializar referências/checklist antes do flush nas duas entradas (manual e importação).
- [x] Teste real de edição revelou FOR UPDATE em outer joins opcionais: limitar o lock a PaymentProcess em edição/exclusão. Bloqueio do contrato e recusa de exclusão conciliada preservados.
- [x] Rodar testes e publicar frontend HML; reiniciar somente API HML pelo gerenciador validado. Tentativa de criar tarefa temporária foi negada pelo Windows, sem criar tarefa. Reinício autorizado com elevação concluído às17:52:52, sem alterar tarefa diária.
- [x] Verificar saúde, preservação dos dados/configurações/produção e devolver rascunho preenchido sem salvar.

## Validação visual
Modal conferido após reautenticação do usuário: três serviços e valor8700, campos1234/datas preservados. Comparação de todos os campos do DOM com a captura anterior idêntica, botão habilitado e zero alertas de erro, sem enviar. Captura rascunho-recuperado.png. Mensagem de resultado incerto não atribui todo HTTP500 a queda de conexão; teste de HTTP500 cobre preservação/bloqueio de repetição. Sem alterações de CSS/layout/tokens, mantendo a QA claro/escuro/mobile da fase visual anterior.

## Testes e build
- Regressões vermelhas antes das correções e verdes depois, em PostgreSQL descartável5441: criação manual, combustível/manutenção com três serviços, checklist/referências, leitura/edição, conciliação repetida sem duplo consumo, exclusão permitida/recusada e importação repetida sem duplicar checklist.
- Suíte PostgreSQL completa34 aprovados. Backend padrão698 aprovados/143 pulados (sem URL descartável; CONTRACT_BALANCE_ENABLED=false para os fakes legados),8 avisos. Execução inicial sem o flag padrão gerou15 falhas nos fakes sem métodos de banco; não é baseline da configuração da suíte. Controle novo é habilitado explicitamente na fixture PostgreSQL.
- Frontend474 aprovados/75 arquivos; direcionado14. Lint0 erros/39 avisos anteriores. Build homologation aprovado, aviso anterior de chunk grande. git diff --check aprovado.
- Verificação pública: nove assets iguais ao build, duas APIs saudáveis;68 tabelas, configurações, tarefa06h e PID de produção preservados. API HML reiniciada intencionalmente. Processo1234 continua ausente e três operações continuam sem conciliação.

## Resultado
Correção publicada e validada em homologação. Após reautenticação pelo usuário, os mesmos três serviços foram selecionados e os campos restaurados pela UI normal. Comparação integral do rascunho idêntica; Salvar e conciliar habilitado, nenhum POST emitido. Guia original mantida aberta como entrega. Produção preservada.

## Pendências / decisões
Não repetir automaticamente POST do usuário: chave manual contém UUID e não garante deduplicação por número. Após confirmar ausência, restaurar o rascunho por controles normais e deixar envio ao usuário.

## Rollback
Backup em storage/backups/20261023-payment-create-fix. Restaurar somente fontes afetadas de df317ed e frontend index anterior (assets preservados), reiniciando exclusivamente API HML pelo gerenciador validado. Não restaurar banco: esta entrega não altera schema/dados de negócio.
