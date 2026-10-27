# ExecPlan — Complemento de itens do contrato original — 27/10/2026

## Objetivo
Permitir incluir, após a abertura quantitativa, itens que já constavam no contrato original e foram omitidos do cadastro. Registrar documento, justificativa, quantidades e preços para operação sem gerar aditivo, crédito/débito ou reabrir/sobrescrever o histórico.

## Estado inicial verificado
- Fonte ec2e41b, árvore limpa, nova branch feature/original-item-complements-hml-20261027.
- Baseline: 540 testes frontend/82 arquivos, 42 direcionados finais, lint zero erros/39 avisos anteriores. Backend anterior 708 aprovados/178 pulados; PostgreSQL descartável 69 aprovados, schema 0062_items_network_merge.
- Usuário esclareceu explicitamente que são itens omitidos do contrato original, sem aditivo. Trata-se de extensão funcional do cadastro quantitativo autorizado, não de alteração de backend apenas por redesign. A decisão solicitada na conversa foi recebida; não é necessário pedir novamente aprovação da mesma inclusão.
- Criar itens e preços é bloqueado após abertura nas rotas existentes. Novo fluxo será separado e transacional; rotas antigas continuam protegendo itens já abertos.
- Modelos atuais permitem movimento próprio com chave única e detalhes JSON, dispensando migration.

## Arquivos previstos
Schema/serviço/rota de itens, testes unitários e PostgreSQL real; API frontend, formulário de complemento, painel/extrato de itens, estilos locais e regressões. Reutilizar MoneyInput, Modal, permissões e bloqueio do contrato.

## Alterações funcionais proibidas
Somente HML. Sem escrita/reinício produtivo, reabertura quantitativa, crédito financeiro, desconto de histórico, ajuste de reservas/consumos existentes ou alteração de preços dos itens antigos. Não converter complemento em aditivo nem inferir vínculos por nomes. Não gravar itens de QA em contratos do usuário.

## Passos de implementação
1. [x] Inventário, decisão de escopo, branch e backup inicial de código/build/configurações.
2. [x] API de complemento original: validações, transação/bloqueio, chave idempotente e auditoria.
3. [x] Formulário após abertura, preços/executantes explícitos, histórico e acesso ao extrato.
4. [x] Testes backend/frontend e PostgreSQL descartável: preservação de saldos/histórico, duplicidade, repetição e concorrência.
5. [ ] Backup consistente HML, publicação/reinício exclusivo da API HML, QA visual/permissões e verificação final.

## Validação visual
Tese: complemento cadastral identificável, sem parecer um acréscimo contratual. Ação Adicionar item original permanece após abertura; editor agrupa cadastro original, posição atual, executantes/preços e conferência. Explicar que dinheiro e operações anteriores permanecem iguais. Reutilizar modais amplos/tela inteira, foco e transições locais, claro/escuro.

## Testes e build
Cobrir manutenção, combustível, ARLA e rede por valor com catálogo opcional; referência inicial original, restante zero/limites, histórico e lote obrigatórios, versões de preços existentes preservadas, item/preço/abertura no mesmo commit, rollback de erro, chaves repetidas divergentes e chamadas concorrentes. Duplicidade de código/item original/produto não deve duplicar quantidade. Verificar que o complemento invalida prévia antiga de aditivo sem alterar demonstrativos confirmados. Testar permissões/escopo e lançamentos antigos preservados. Executar suítes completas, lint e build, sem migrations.

## Resultado
Implementação pronta: POST específico para complemento original, mesmas permissões financeiras e escopo do cadastro. Transação com bloqueio do contrato, chave única no extrato quantitativo, validações de código/número original/produto, lote, histórico e executantes. Cadastro normal/edição/preços antigos permanecem bloqueados após abertura. Referência interna do novo item inicia no preço original; nenhum saldo, reserva, consumo ou instrumento anterior é modificado.

Preço vigente de combustível é vinculado por versão exata; não é fechado ou reprecificado pelo complemento. Versão inexistente só é inicializada quando não há preço vigente/agendado do mesmo produto/posto. ARLA/serviços usam preços próprios do item. Rede por valor pode complementar seu catálogo quantitativo já aberto sem preço fixo. Novo extrato guarda documento, justificativa, usuário, preço/versionamento e efeito financeiro NONE; não é movimento de aditivo. Uma prévia anterior de aditivo é invalidada pelo catálogo atualizado, preservando os demonstrativos confirmados.

Backend completo: 719 aprovados/198 pulados (integrações dependem de URL descartável). Frontend: 551 aprovados/83 arquivos, 50 direcionados em quatro arquivos; lint zero erros/39 avisos anteriores e build HML candidato aprovado. PostgreSQL direcionado inicial 18 aprovados após adequar o nome da ação de auditoria ao varchar(30) existente; nenhuma migration necessária. Suíte final PostgreSQL com saldos, itens, rede por valor e complementos: 89 aprovados, incluindo concorrência/permissões/rollback. Banco descartável removido pelo runner.

## Pendências / decisões
- Quantidade remanescente e acréscimos históricos são conferidos explicitamente; não presumir zero nem reconstruir operações antigas. Não redistribuir reservas já vinculadas.
- Registrar ORIGINAL_ITEM_COMPLEMENT no extrato quantitativo e auditoria, com documento/justificativa/chave; não somar como novo acréscimo de aditivo.
- Backend ativo é iniciado pelo gerenciador HML. Reiniciar apenas após testes/backup e identidade confirmada; se Windows exigir elevação, preparar a publicação completa antes da solicitação administrativa.
- Rotina 06h permanece: restauração só pelo script autorizado, sem execução extra nesta fase.

## Rollback
Backup consistente e fontes ec2e41b/build anterior. Sem migration, downgrade ou restauração de produção. Retornar código/backend e frontend com o gerenciador HML preservando todos os dados. Em caso de uso do novo fluxo, manter registros de complemento e histórico; não excluir movimentos.
