# Itens, quantidades e alterações contratuais — homologação

Entrega de26/10/2026 em `D:/FROTAS/frota_emprestimos_testes`, rota `/processos-pagamento`. Flag `CONTRACT_QUANTITY_ENABLED=true` somente na configuração HML. Código mantém a flag desligada por padrão. Não promover esta branch automaticamente à produção.

## Preparar um contrato

1. Abra **Configuração → Itens e quantidades**. Cadastre todos os itens originais, seus códigos permanentes, numeração, categoria, unidade, quantidade e preço original e referência atualizada. Combustível e ARLA têm produto correspondente; serviços e peças usam sua unidade contratada.
2. Use **Vincular preço** para selecionar item e executante. Um preço de combustível existente precisa ser escolhido expressamente; não há associação por nome ou importação presumida. Cada executante usado no pedido precisa ter preço vigente para suas linhas.
3. Confira também vigência, empresa, rede e abertura financeira existentes.
4. Em **Conferir quantidades**, informe adjudicação por item/lote/global, documento, justificativa, quantidade ainda não executada e acréscimos anteriores de cada item. Zero precisa ser informado explicitamente; campo vazio continua pendente. A quantidade remanescente inclui os pedidos reservados.
5. Distribua todas as reservas abertas entre os itens, preservando exatamente dinheiro, combustível, litros e preço originais. Esse vínculo não cria outra reserva monetária. Confirme a conferência.

O catálogo original fica protegido após a abertura. Confira sua completude antes de confirmar. As operações antigas não são reconstituídas ou distribuídas automaticamente. Saldo/quantidade desconhecidos aparecem como pendentes, não como zero. Novos pedidos ficam bloqueados enquanto a configuração obrigatória estiver incompleta.

## Registrar alteração contratual

Use **Registrar aditivo** (abre **Registrar alteração contratual**). Informe instrumento, número, assinatura, início dos efeitos, referência, justificativa e PDF opcional até25MB. Selecione prazo, preços, quantidades/valor ou sua combinação.

- Prazo mostra a vigência anterior e solicita a nova data, sem gerar crédito ou quantidade.
- Preços distinguem reajuste, revisão e reequilíbrio. Selecione os itens e os executantes afetados; um único executante é preenchido automaticamente. Informe referência e preços novos, declarando explicitamente ausência de efeito global ou o valor financeiro conferido no instrumento.
- Quantitativos usam o preço de referência atualizado do item. A soma deve corresponder ao total declarado no documento. O efeito dos preços fica separado para não duplicar o acréscimo.
- A numeração do documento pode diferir do contrato original: o vínculo usa o UUID permanente, com os dois números na fotografia e no relatório.

**Conferir impactos** não lança movimentações. A prévia exibe dinheiro, vigência, preços, quantidades e memória dos25%, incluindo acumulado anterior, posterior e margem. Qualquer alteração concorrente invalida a prévia. **Confirmar alteração e ver relatório** aplica tudo na mesma transação, com bloqueio do contrato e identificação idempotente.

O demonstrativo salvo é reaberto pelo histórico e permite prévia PDF, download PDF, XLSX e recuperação do instrumento anexado. Repetir a geração de arquivo não repete o lançamento. O anexo fica em armazenamento privado da HML e exige as permissões financeiras existentes.

Correções são novos instrumentos vinculados. Não há edição destrutiva do demonstrativo original. Reversões quantitativas não podem ultrapassar o acréscimo corrigido nem retirar quantidade já consumida/reservada. Instrumentos genéricos antigos permanecem históricos e não são classificados automaticamente.

Efeitos futuros não têm ativação agendada nesta versão: a confirmação é aceita a partir da data declarada. Datas documentais anteriores são registradas, mas as novas versões passam a valer na confirmação; pedidos e preços utilizados anteriormente permanecem preservados.

## Operação e cálculo

Abastecimento reserva litros do combustível e do ARLA previsto, além do total financeiro. Manutenção usa linhas de serviço/peça, quantidade e preço; sua soma forma o orçamento. A conclusão informa quantidade e custo reais, convertendo reserva em consumo e liberando a sobra.

Cancelamento/expiração liberam uma única vez; reabertura revalida preços e disponibilidade. Substituição do combustível na confirmação libera o item solicitado e consome o efetivamente fornecido. Excesso ou item sem vínculo registra o fato e uma divergência, impedindo novos pedidos até regularização. Retificações movimentam apenas diferenças. Faturas e pagamentos não descontam novamente.

A margem de25% tem controle próprio: quantidade original × referência atualizada, agrupada conforme adjudicação. Acréscimos anteriores não aumentam a base; prorrogação não zera o acumulado. Histórico não conferido impede novos acréscimos. Abertura, extrato, reservas, consumo, ajustes e demonstrativos preservam autoria e histórico.

## Rotina06h e compatibilidade paralela

A tarefa Windows e a entrada oficial `D:/FROTAS/02-HOMOLOGACAO/ATUALIZAR-DADOS.ps1 -Daily` permanecem inalteradas. A restauração continua em banco temporário; migrations e conferência das colunas originais ocorrem antes da troca. Falha mantém o banco e a API anteriores. Não foi realizada nova cópia da produção nesta entrega.

As configurações e os pedidos exclusivos dos testes são reiniciados na cópia diária. Contratos copiados sem abertura quantitativa permanecem pendentes. Os PDFs fornecidos pelo usuário são referências de desenvolvimento; não foram lançados em contratos reais.

Outra conversa autorizada está desenvolvendo a modalidade **NETWORK_VALUE** para a rede Prime, sem preço por litro/reserva prévia. A revisão paralela `0061_network_value_fuel` foi incorporada ao grafo por compatibilidade de schema, com merge `0062_items_network_merge`. A operação dessa modalidade é uma entrega separada, ainda pendente de integração na HML: uma proteção explícita impede tratá-la como contrato de preço fixo. Não cadastrar preços fictícios para contornar essa pendência. Pedidos antigos e valores desse schema são preservados na cópia. Não foi escolhida modalidade automaticamente em contratos reais.

## Publicação, testes e evidências

- 706 testes backend;52 testes PostgreSQL real em bancos descartáveis;486 frontend (78 arquivos), nove direcionados finais; lint sem erros e39 avisos anteriores; build explícito de homologação.
- Exemplos documentais:2TA modifica somente S10/S500, preservando outros preços;4TA reproduz R$485.743,75 e mantém o vínculo com numeração diferente. Apenas bancos descartáveis receberam essas simulações.
- Ensaios de migração0059/0060 e0061 de rede por valor até o head HML preservaram67 tabelas originais e criaram sete tabelas vazias. Falha de migration simulada pelo fluxo real da rotina não parou a API nem trocou o banco ativo.
- Ativação HML preservou as67 tabelas originais; a extensão de compatibilidade preservou todas as74 tabelas e os dados de QA existentes. Somente a flag quantitativa foi acrescentada à configuração.
- QA real: dois contratos **TESTE HML ITENS26/10**, fornecedor, posto e veículo fictícios. Abertura em tela, instrumento combinado de ARLA com anexo, relatórios e recuperação do anexo, pedido com30L diesel+2L ARLA/R$201,90 e cancelamento, manutenção de R$450,00 concluída por R$270,00. Saldos e quantidades conferidos no banco HML.
- Desktop e celular, claro/escuro, campos, rolagem, tabela adaptada, ausência de overflow horizontal, foco e Escape conferidos. Viewport efetivo móvel487×1055 por zoom já existente do navegador. Tema, dimensão e URL original restaurados.

Evidências, dumps consistentes, zip de anexos, configurações, bundle Git e build anterior: `storage/backups/20261026-contract-items` (privado, ignorado pelo Git). Relatórios fictícios baixados também foram conferidos: PDF de uma página renderizado e XLSX com a fotografia dos valores. O hash do PDF anexado e recuperado é idêntico.

## Reversão

Somente HML: parar API6969 pelo gerenciador validado, preservar gravações novas, desativar a flag quantitativa, restaurar a fonte e o build de referência documentados no bundle/backup e iniciar a API. Manter migrations aditivas e movimentos; não executar downgrade ou restaurar banco automaticamente. Não usar o comando geral de parada que também desliga PostgreSQL. Produção, PostgreSQL5432 e Cloudflare não fazem parte desta publicação.
