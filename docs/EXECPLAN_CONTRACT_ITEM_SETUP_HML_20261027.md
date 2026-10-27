# ExecPlan — Cadastro original e abertura orientada de itens — 27/10/2026

## Objetivo
Pedir somente o preço original no cadastro do item e explicar as pendências de oficina/posto e preço antes de confirmar as quantidades. Resolver preços dentro da abertura, preservando o formulário. Somente HML.

## Estado inicial verificado
- Fonte e229a26, árvore limpa; branch feature/contract-item-setup-clarity-hml-20261027.
- Baseline anterior: 528 testes frontend/82 arquivos, 67 direcionados finais, lint zero erros/39 avisos anteriores, build HML aprovado.
- APIs existentes fornecem itens, preços vigentes, executantes e contexto de abertura. A mensagem genérica vem da validação obrigatória do servidor. Não há necessidade de alterar a regra, backend ou schema.
- Referência interna de preço é necessária aos aditivos. Novos itens partirão do preço original; referências existentes serão preservadas, inclusive quando diferentes por alteração anterior.
- Backup do frontend/configurações/bundle em storage/backups/20261027-contract-item-setup. Publicação de frontend sem reinício de API.

## Arquivos previstos
ContractItemsPanel, testes relacionados e estilos locais de itens; documentação. Reutilizar os modais, MoneyInput e as APIs atuais.

## Alterações funcionais proibidas
Sem produção, backend, migration, permissões, alteração de cálculos ou confirmação automática de preço/abertura. Não gravar dados reais de negócio na QA do navegador. Manter versões, histórico, aditivos e distribuição de reservas.

## Passos de implementação
1. [x] Ler regras, localizar validação, criar branch e backup.
2. [x] Simplificar cadastro preservando a referência interna.
3. [x] Mostrar pendências por item e permitir vincular preço sem perder o rascunho de abertura.
4. [x] Testes de regressão, suíte frontend, lint e build HML.
5. [ ] Publicação HML, QA desktop/mobile/claro/escuro, configuração/dados/PIDs e documentação final.

## Validação visual
Tese: configuração operacional enxuta, uma entrada para o preço original e pendências que indiquem a próxima ação. Conteúdo: item, preço original, aviso específico e botão direto para oficina/posto e preço. Reutilizar transições e foco dos modais, com retorno ao rascunho após a etapa auxiliar; sem decoração adicional.

## Testes e build
Cobrir preço original na criação, preservação de referência existente, itens sem preço vigente, preços futuros/históricos, resolução e cancelamento do vínculo sem apagar quantidades, falha/reconsulta, leitura sem permissão e abertura apenas com dados conferidos. Testar combustível e manutenção. Executar test/lint/build e QA sem confirmar lançamentos no navegador.

## Resultado
Implementação concluída. Novos itens recebem referência interna igual ao preço original, sem segundo campo; edição preserva referências existentes. Abertura consulta contexto fresco do servidor, lista apenas itens ativos sem preço vigente, explica a falta e abre o vínculo de oficina/posto em modal auxiliar. Salvar ou cancelar esse modal mantém quantidades, histórico, documento, justificativa, reservas distribuídas e chave idempotente da abertura. O item e o único fornecedor ativo são preenchidos; o preço é sugerido para conferência, sem gravação automática.

Verificação indisponível impede confirmar com informações antigas. Se o preço vencer entre a conferência e a confirmação, a rejeição do servidor dispara nova consulta e explica como corrigir. Versões futuras ou históricas não atendem à pendência. Nenhum desconto, abertura, vínculo ou referência existente é alterado automaticamente.

Suíte completa: 540 aprovados/82 arquivos. Direcionados finais: 42 aprovados/4 arquivos; lint zero erros/39 avisos anteriores, build HML candidato aprovado. Pequena revisão final só captura o objeto de sequência das consultas para cleanup, mantendo o comportamento e retirando um aviso novo do lint; direcionados, lint e build repetidos depois dessa revisão. Publicação e QA em andamento.

## Pendências / decisões
O requisito de um preço vigente por item continua no servidor. A interface identifica a falta e oferece correção explícita. O preenchimento do preço sugerido será revisável e só terá efeito ao salvar; nenhum vínculo será criado por inferência.

## Rollback
Restaurar frontend-before com assets antes da troca atômica de index.html. Nenhum banco, configuração, API ou Cloudflare precisa ser reiniciado ou restaurado.
