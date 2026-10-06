# Retificação unificada de posses

Entregue em homologação em 30/09/2026, na cópia `D:\FROTAS\frota_emprestimos_testes`.

## Utilização

Em **Posses**, localize o registro e escolha **Retificar**. A mesma tela reúne condutor, início, odômetros, observação, documento da entrega e fotos adicionais. Nas posses encerradas, também apresenta fim e condições do veículo na devolução. Informe uma única justificativa e, quando houver devolução, confirme a declaração autenticada antes de salvar.

O acesso pelos detalhes dos termos também abre essa tela. Não há mais um botão separado de retificação da devolução. Posses ativas continuam sendo encerradas pelo fluxo normal de encerramento.

Uma posse posterior não bloqueia, por si só, a correção. São aceitos períodos adjacentes, inclusive quando o fim coincide exatamente com o início da próxima posse. Sobreposições reais, datas que excluam rotas registradas e odômetros incompatíveis com essas rotas continuam bloqueados. Uma retificação não modifica os valores da posse seguinte nem reabre posses encerradas.

## Rastreabilidade

- Cada retificação grava uma versão imutável com valores anteriores e posteriores, usuário, data e justificativa, além da auditoria central.
- O histórico pode ser consultado na própria tela. Registros anteriores à implantação continuam na auditoria e nas confirmações já existentes; não se inventam versões retroativas.
- Nas posses encerradas, uma nova confirmação de devolução preserva a anterior e seu hash. Dados, confirmação e auditoria são gravados em uma única transação.
- Documentos digitais substituídos preservam suas evidências anteriores. Anexos substituídos usam novos caminhos e mantêm o arquivo anterior referenciado na versão.
- A versão esperada evita sobrescrever alterações concorrentes. Em conflito, a tela mantém o preenchimento e exige recarregar antes de salvar. Envios repetidos são bloqueados durante o salvamento.
- O contador do registro também avança no encerramento; portanto, os números do histórico de retificações não precisam ser consecutivos.

## Implementação e compatibilidade

Migration aditiva `0048_possession_rectification`: contador `vehicle_possession.revision` e tabela `possession_revisions`, com restrição de versão única e trigger contra alteração/exclusão de evidências. Aplicada somente ao PostgreSQL de testes, após execução em bancos descartáveis. O downgrade recusa excluir evidências já gravadas.

`GET /api/possession/{id}/rectification-context` reúne dados atuais, declaração e versões. `PUT /api/possession/{id}` recebe o formulário completo e `expected_revision`. O endpoint antigo de correção da devolução encaminha a operação à mesma regra e exige a versão esperada; clientes antigos devem recarregar a interface. Mantidos os perfis Admin/Produção com permissão de edição e o escopo da secretaria.

## Verificação

- Backend: **444 aprovados, 19 skips condicionais**, com PostgreSQL isolado habilitado. Inclui sete cenários novos de integração: correção conjunta com posse seguinte, conflitos/validações, concorrência/permissões, registros ativos e legados, rollback após falha, limites de rotas e preservação de anexo substituído.
- Frontend: **162 aprovados**, usando `npm test -- --pool=forks`. O pool `vmThreads` apresenta interferência entre mocks de suítes existentes; a execução isolada em processos passou integralmente.
- Build concluído. Lint dos arquivos da interface sem erros; permanecem dois avisos anteriores de dependências de hooks em `PossessionPage.jsx`.
- Login, contexto de retificação e módulos existentes verificados em localhost e no túnel. A conferência no navegador abriu uma posse encerrada sem salvar alterações. Evidências locais em `storage/loan-tests/unified-rectification-*.log/json` e `output/playwright/phase6-unified-rectification.png`.
- Saúde de produção HTTP 200; repositório de produção limpo, HEAD `12150b19919b999cd47668abe4c3e6b5f3504329`. Nenhuma publicação ou migration em produção.

Endereço: https://testefrota.sirel.com.br/posses (também disponível em http://localhost:6969/posses). Atualize com Ctrl+F5 caso o navegador ainda exiba a interface anterior.
