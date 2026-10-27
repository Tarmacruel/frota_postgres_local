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
5. [x] Backup consistente HML, publicação/reinício exclusivo da API HML, QA visual/permissões e verificação final.

## Validação visual
Tese: complemento cadastral identificável, sem parecer um acréscimo contratual. Ação Adicionar item original permanece após abertura; editor agrupa cadastro original, posição atual, executantes/preços e conferência. Explicar que dinheiro e operações anteriores permanecem iguais. Reutilizar modais amplos/tela inteira, foco e transições locais, claro/escuro.

## Testes e build
Cobrir manutenção, combustível, ARLA e rede por valor com catálogo opcional; referência inicial original, restante zero/limites, histórico e lote obrigatórios, versões de preços existentes preservadas, item/preço/abertura no mesmo commit, rollback de erro, chaves repetidas divergentes e chamadas concorrentes. Duplicidade de código/item original/produto não deve duplicar quantidade. Verificar que o complemento invalida prévia antiga de aditivo sem alterar demonstrativos confirmados. Testar permissões/escopo e lançamentos antigos preservados. Executar suítes completas, lint e build, sem migrations.

## Resultado
Implementação pronta: POST específico para complemento original, mesmas permissões financeiras e escopo do cadastro. Transação com bloqueio do contrato, chave única no extrato quantitativo, validações de código/número original/produto, lote, histórico e executantes. Cadastro normal/edição/preços antigos permanecem bloqueados após abertura. Referência interna do novo item inicia no preço original; nenhum saldo, reserva, consumo ou instrumento anterior é modificado.

Preço vigente de combustível é vinculado por versão exata; não é fechado ou reprecificado pelo complemento. Versão inexistente só é inicializada quando não há preço vigente/agendado do mesmo produto/posto. ARLA/serviços usam preços próprios do item. Rede por valor pode complementar seu catálogo quantitativo já aberto sem preço fixo. Novo extrato guarda documento, justificativa, usuário, preço/versionamento e efeito financeiro NONE; não é movimento de aditivo. Uma prévia anterior de aditivo é invalidada pelo catálogo atualizado, preservando os demonstrativos confirmados.

Backend completo: 719 aprovados/198 pulados (integrações dependem de URL descartável). Frontend: 551 aprovados/83 arquivos, 50 direcionados em quatro arquivos; lint zero erros/39 avisos anteriores e build HML candidato aprovado. PostgreSQL direcionado inicial 18 aprovados após adequar o nome da ação de auditoria ao varchar(30) existente; nenhuma migration necessária. Suíte final PostgreSQL com saldos, itens, rede por valor e complementos: 89 aprovados, incluindo concorrência/permissões/rollback. Banco descartável removido pelo runner.

Publicação concluída somente na HML às 12:33:33 (Brasília), fonte 50a74c5, entrada index-DpW5VCB2.js. Gerenciador com privilégios administrativos confirmou a identidade e reiniciou apenas a API 6969 (novo PID 21064). Dump HML consistente preparado antes da ativação; 75 tabelas preservadas na troca. Sem migration, restauração ou alteração de configuração. Rollback de fontes/backend/build anterior preparado; não foi necessário usá-lo.

QA autenticada após o usuário renovar a sessão: ação Adicionar item original permanece com a abertura confirmada, editor com preço original único, quantidades/histórico em branco para conferência e executante único sugerido. Preço com seis casas preenche a sugestão, sem gravar. Documento/justificativa e rodapé acessíveis por teclado/rolagem. Escape devolve foco à ação. Desktop 1600×900, mobile 390×843/360×800, claro/escuro e zero overflow horizontal do modal. Algumas capturas móveis registram quadro intermediário da animação nativa; dimensões DOM estabilizadas confirmam tela inteira, e capturas claras finais foram inspecionadas. Rascunho fictício de QA descartado sem envio.

Durante a conferência foi registrada uma inclusão real independente do rascunho de QA. A comparação estrita confirmou um novo item, um preço e um movimento ORIGINAL_ITEM_COMPLEMENT; todos os registros anteriores das 27 tabelas operacionais/financeiras permanecem idênticos, incluindo todos os lançamentos monetários e controles. Verificação não sobrescreveu a baseline: exclui somente os novos IDs ligados ao evento original para comparar os registros anteriores. O rascunho QA-SEM-SALVAR não foi persistido. A lista atualizada mostra dois itens e mantém a ação para novas inclusões.

Nove assets conferidos por conteúdo, schema 0062 e gatilho imutável quantitativo preservados, APIs saudáveis. Produção limpa em 31543d4, PID 2512 inalterado; nenhum arquivo ou banco produtivo modificado. Rotina 06h Ready/resultado zero, próxima execução 28/10 às 06h; nenhuma cópia extra. Tema claro e viewport padrão restaurados, guia temporária fechada e guia original devolvida à configuração do contrato solicitado após o login. Console sem erros.

Evidências privadas: storage/backups/20261027-original-items-complement, com add-original-action-desktop.png, original-form-desktop.png, original-form-mobile-light.png, logs dos testes, dump/fingerprints, final-verification.json e post-publication-data-comparison.json. [Guia operacional](ORIGINAL_ITEM_COMPLEMENTS_HML_20261027.md). Branch isolada enviada ao remoto, sem merge em main.

## Pendências / decisões
- Quantidade remanescente e acréscimos históricos são conferidos explicitamente; não presumir zero nem reconstruir operações antigas. Não redistribuir reservas já vinculadas.
- Registrar ORIGINAL_ITEM_COMPLEMENT no extrato quantitativo e auditoria, com documento/justificativa/chave; não somar como novo acréscimo de aditivo.
- Backend ativo é iniciado pelo gerenciador HML. Reiniciar apenas após testes/backup e identidade confirmada; se Windows exigir elevação, preparar a publicação completa antes da solicitação administrativa.
- Rotina 06h permanece: restauração só pelo script autorizado, sem execução extra nesta fase.

## Rollback
Backup consistente e fontes ec2e41b/build anterior. Sem migration, downgrade ou restauração de produção. Retornar código/backend e frontend com o gerenciador HML preservando todos os dados. Em caso de uso do novo fluxo, manter registros de complemento e histórico; não excluir movimentos.
