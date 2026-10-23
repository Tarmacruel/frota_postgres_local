# Contratos e saldos — homologação

Entrega funcional autorizada em 22/10/2026. Rota preservada: `/processos-pagamento`. Feature flag exclusiva da HML: `CONTRACT_BALANCE_ENABLED=true`; padrão do código é `false`. Nenhuma publicação em produção faz parte desta entrega.

## Preparação pelo gestor

1. Confira empresa contratada, objeto (abastecimento ou manutenção) e início/fim da vigência.
2. Em Rede executante, vincule cada posto/oficina ao contrato. A empresa executante pode ser diferente da contratada. Postos continuam com seu cadastro operacional próprio.
3. Para abastecimento, cadastre preço por posto e combustível, com até seis casas decimais e início de vigência. Nova versão encerra a anterior; pedidos emitidos guardam o preço original.
4. Confira o saldo livre e a data de abertura. O valor sugerido é apenas referência histórica; a confirmação e a justificativa são obrigatórias. A abertura não pode ser sobrescrita.
5. Mudanças posteriores de limite e vigência usam aditivos numerados; correções de saldo usam ajustes com documento e justificativa.

### Editar e excluir preços por posto e combustível

Na tabela **Preços por posto e combustível**, editores financeiros podem usar **Editar** e **Excluir**. O posto e o combustível identificam a série de preços. Editar cria uma nova versão do valor por litro; o início opcional aplica a mudança agora ou em data futura. Um preço agendado mantém seu início quando esse campo fica vazio. Versões encerradas não são reescritas: use Novo preço para uma nova vigência.

Excluir pede confirmação, retira a versão dos novos pedidos e conserva seu registro/auditoria. **Mostrar histórico de preços** inclui versões encerradas, substituídas e excluídas. Excluir um preço vigente não reativa automaticamente um preço antigo. Ao excluir um agendamento, seu predecessor ainda válido pode continuar até o próximo agendamento; preços já excluídos nunca são reativados.

Essas ações não alteram o saldo nem recalculam reservas existentes. A ordem já emitida mantém preço, combustível previsto e valor reservado e pode ser concluída normalmente pelo valor real. Se uma prévia de emissão ficar antiga após uma edição, o servidor pede uma nova conferência do preço. Operadores sem permissão de edição financeira continuam somente com a consulta permitida por seu perfil.

Contratos copiados da produção permanecem pendentes. Nenhum vínculo é inferido por nome e nenhuma despesa anterior à abertura é descontada novamente. O histórico financeiro continua em Faturas e pagamentos > Histórico e projeções.

## Operações

**Contrato exclusivo por posto:** um posto possui apenas um vínculo ativo, seja com contrato individual ou com contrato de rede credenciada. Um posto vinculado ao individual não pode ser incluído em outro contrato da rede. O cadastro de vínculo identifica e desabilita postos já utilizados; o servidor e o banco também impedem duplicação ou reativação conflitante. Para mudar, desative o vínculo anterior e cadastre/reative o novo. Vínculos, preços e reservas anteriores permanecem no histórico; uma ordem já reservada continua vinculada ao contrato original.

Na emissão de abastecimento, selecionar o posto determina automaticamente contrato e executante, sem oferecer outro contrato para escolha. Trocar o posto limpa a consulta e a prévia anteriores. Um posto sem contrato elegível exige conferência do vínculo exclusivo, vigência, preços e saldo inicial; nenhum vínculo é deduzido pelo nome. A escolha de contratos/oficinas no fluxo de manutenção permanece disponível.

**Abastecimento:** escolha posto, contrato, combustível e litros previstos. A prévia mostra preço, reserva e disponível após emissão; um único contrato elegível é selecionado automaticamente. Em lotes, todos os veículos devem ter quantidade, o orçamento considera cada ordem e a gravação é atômica. Servidor recalcula os valores e bloqueia saldo insuficiente. Ordens antigas recebem a ação Vincular contrato e reservar; postos aguardam a equipe emissora regularizar o vínculo.

Confirmação registra comprovante, combustível, litros e valor efetivamente abastecidos. É possível solicitar gasolina comum e confirmar etanol ou gasolina aditivada quando houver substituição no posto. A tela preserva a solicitação original e avisa sobre a troca; não exige nova emissão ou aprovação. Observações podem explicar a indisponibilidade. O preço original continua documentando a reserva, sem recálculo retroativo ou exigência de preço cadastrado para o substituto. A auditoria registra combustível e litros solicitados/realizados e valor real.

Valor menor libera a sobra; valor maior utiliza o saldo livre. Gasto realizado acima do saldo é registrado como divergência, bloqueando novos pedidos. Recomponha o saldo por ajuste/aditivo e regularize a divergência explicitamente. Cancelamento e expiração liberam a reserva uma vez. Reabrir ordem expirada exige nova reserva ao preço vigente.

**Manutenção:** Novo pedido informa veículo, oficina, contrato, descrição e orçamento. A emissão autoriza e reserva diretamente com a permissão atual. Iniciar serviço cria o registro operacional; pedido apenas autorizado não marca o veículo em manutenção. Concluir registra custo real, peças e conclusão, liberando sobra ou apontando divergência. Serviço iniciado deve ser concluído com o custo real, inclusive zero; retificação de custo exige justificativa e lança somente a diferença.

**Faturas:** continuam processos, etapas, checklist, referências, documentos, assinaturas, importações e exportações. A conciliação seleciona operações inteiras do contrato; uma operação pertence a uma única fatura. O valor já consumido não é descontado novamente. Diferenças exigem justificativa e têm lançamento próprio. Alterar uma operação/fatura sinaliza conciliação desatualizada. Cancelar a fatura não estorna serviços executados; processo conciliado não é apagado nem troca de contrato.

## Fórmulas e acesso

- Saldo contratual = abertura + aditivos/ajustes − consumo realizado.
- Disponível = saldo contratual − reservas abertas.
- Pago/a pagar acompanham faturas separadamente.
- Sem abertura confirmada, saldo desconhecido aparece como traço.
- KPIs filtram toda a população consultada; extrato, reservas e operações têm filtros/paginação e PDF/XLSX de todos os resultados.

O contrato é bloqueado transacionalmente antes de reservas/execuções. Chaves de requisição evitam duplicação em tentativas repetidas. Valores são calculados com Decimal e arredondamento final em centavos. O extrato PostgreSQL rejeita UPDATE/DELETE; correções são novos lançamentos. Visibilidade de operações/extrato respeita secretaria; o saldo compartilhado não concede acesso aos detalhes das demais. Postos recebem apenas o orçamento da sua ordem.

## Atualização diária e recuperação

Tarefa nativa existente: **FROTA Homologacao - Atualizar dados 06h**, 06h de Brasília, mesmo principal S4U. Código ativo em `D:\FROTAS\02-HOMOLOGACAO\sincronizacao\refresh_data.py`, cópia versionada em `scripts/homologation/refresh_data.py`.

Produção é exportada em snapshot somente leitura. O job restaura em banco temporário HML, confere tabelas/arquivos, aplica `scripts/migrate-hml-refresh.py`, confere colunas de negócio originais e só então troca banco/arquivos e reinicia a API6969. Falha anterior à ativação preserva o ambiente; falha na ativação chama rollback. Arquivos `.env`, cookies, segredos e assinaturas de HML continuam isolados.

Preços, vínculos, aberturas e pedidos exclusivos dos testes são reiniciados diariamente. Após a cópia, contratos voltam a aguardar configuração. Estado e logs privados ficam em `storage/production-refresh` e `storage/backups/sincronizacao-producao/<execução>`; snapshots completos têm retenção de sete dias. A rotina não modifica produção.

Rollback funcional rápido: desabilitar a flag somente na `.env` de HML e reiniciar sua API pelo controlador existente; a interface volta aos processos anteriores. Banco/extrato permanecem preservados. Para reverter uma troca da rotina, executar sua função `rollback` com o estado da execução e o mesmo principal de manutenção. Backup anterior à entrega: `storage/backups/20261022-contract-balances/hml-before.dump`; índice frontend anterior no mesmo diretório. Nunca executar restauração no cluster5432.

## Verificação técnica

`scripts/run-contract-postgres-tests.py` cria e remove um banco descartável estritamente no cluster5441. Exercita concorrência pelo último saldo, repetição concorrente de emissão, lote atômico, expiração/reabertura, imutabilidade, manutenção, comprovante/retificação, cancelamento, projeção por vínculos exatos, acesso por secretaria, APIs e aditivo idempotente. Testes unitários cobrem ainda arredondamento, preço versionado, conciliação, divergência e abertura.

`scripts/homologation/test_refresh_failure.py` faz restore/migration real em staging e injeta falha antes da ativação, comprovando preservação dos fingerprints e saúde da HML. É um teste manual opt-in; não faz parte de pytest. A publicação de 22/10 também executa a rotina completa com schemas diferentes. Evidências e screenshots ficam no backup privado da entrega.
