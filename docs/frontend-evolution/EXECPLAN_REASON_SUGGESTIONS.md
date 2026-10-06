# ExecPlan — Justificativas assistidas

## Objetivo e escopo autorizado

Entrega funcional independente das fases concluídas do redesign. Implementar modelos fixos e sugestões pessoais sincronizadas pela conta para todos os campos de justificativa administrativa. Manter obrigatoriedade, limites, permissões, declarações, confirmações e auditoria. Somente homologação; encerrar para validação sem publicar em produção ou iniciar outra fase.

## Contexto e decisões

- Base: branch `feature/frontend-evolution-hml`, HEAD `4774bbc`. Encontrada implementação parcial local de sugestões em cinco formulários, adaptada ao plano aprovado.
- A hipótese inicial de histórico em localStorage foi substituída expressamente pelo usuário por persistência na conta. Backend, migration e endpoints foram autorizados para esta melhoria funcional, sem relação com necessidades do redesign.
- Catálogo único versionado no backend, entregue pela API. Nenhuma dependência de arquivos do backend no build de produção do frontend; falhas preservam entrada manual.
- Aprendizado somente de novos usos efetivamente salvos, na transação da operação, com incremento atômico. Nenhum backfill.
- Sinistros contam quando a justificativa muda, sem aprender texto antigo de edições de anexos. Retificação unificada de posse conta uma vez, mesmo com auditoria de devolução.
- Banco descartável `loan_workflow_*` no cluster de testes 5441 e servidor local 6971 para QA. Banco de trabalho, build e runtime público 6969 preservados.
- Baseline novo em `storage/loan-tests/assisted-justifications/baseline-*.log`: vmThreads 216 aprovados/10 falhas. Após alterações, 194/32; todas as 13 suítes afetadas passaram isoladas e a suíte completa passou com forks. O pool padrão foi alterado para forks, restrito à configuração de testes. Resultado final padrão: 226/226.

## Execução concluída — 05/10/2026

- [x] Mapear 22 contextos nos módulos de posses/rotas, abastecimentos/ordens, veículos, sinistros, pagamentos e empréstimos, incluindo regularização.
- [x] Criar migration aditiva 0049, tabela pessoal e índice único; normalização, ranking, limite de 50 e esquecimento.
- [x] Integrar registro transacional à auditoria e preservar endpoints/payloads das operações existentes.
- [x] Criar GET e DELETE autenticados com isolamento e permissões no servidor.
- [x] Integrar campo reutilizável, três frequentes, modelos explícitos, confirmação antes de substituir e nenhuma submissão automática.
- [x] Substituir prompt de cancelamento de ordem por modal, mantendo motivo opcional.
- [x] Testar concorrência, rollback, auditoria, conflitos, contagem única, isolamento e normalização sem alterar comprimento do texto salvo.
- [x] Executar gates: frontend 226 aprovados; lint 0 erros/46 avisos preexistentes; build aprovado. Backend amplo 169 aprovados/9 ignorados, dirigido final 17 aprovados.
- [x] Validar dados fictícios, duas contas, Chrome/Edge, temas claro/escuro, desktop/celular, teclado, sincronização e falha de consulta.
- [x] Registrar arquivos, testes, screenshots e limites no [relatório final](ASSISTED_JUSTIFICATIONS.md) e no STATUS.

## Resultado e pendências

Concluída e publicada em homologação em 06/10/2026, após autorização expressa do usuário: https://testefrota.sirel.com.br. Migration 0049 aplicada antes de ativar a API atualizada, com backup prévio e verificação de permissões, saúde e hashes dos assets. Detalhes no relatório final. Produção inalterada; nenhuma outra fase iniciada.

Os nove testes ignorados da suíte ampla exigem a variável legada `PHASE3_TEST_DATABASE_URL`; testes reais de integração utilizaram `LOAN_MIGRATION_TESTS=1` e bancos descartáveis. QA visual não constitui certificação de todos os motores de navegador ou acessibilidade integral.

## Rollback

Retirar somente esta implementação e, se necessário, executar downgrade 0049 após retirar o código consumidor. A auditoria existente não depende da nova tabela. Não há alteração de deploy de produção.
