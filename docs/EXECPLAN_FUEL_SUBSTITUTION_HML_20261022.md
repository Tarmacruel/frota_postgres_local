# ExecPlan — combustível realizado na confirmação — homologação

## Objetivo
Permitir confirmar combustível diferente do solicitado, junto dos litros e do valor reais do comprovante, conforme solicitação de 22/10/2026. Preservar pedido, preço da reserva e histórico; ajustar o saldo apenas pelo consumo efetivo. Somente homologação.

## Estado inicial verificado
- Raiz HML `D:\FROTAS\frota_emprestimos_testes`, branch `feature/contracts-balances-hml-20261022`, HEAD `b77eeac`, working tree limpo.
- API6969/PG5441; schema0057. Última entrega: backend698 aprovados, PostgreSQL14, frontend389; lint0 erros/39 avisos anteriores; build HML aprovado.
- O seletor de confirmação já é editável, mas a API recusa combustível diferente quando o controle de saldo está ativo.
- O pedido guarda combustível/litros previstos; o abastecimento guarda combustível/litros/valor realizados. A liquidação já usa o valor real do comprovante.

## Arquivos previstos
Serviço de confirmação e testes PostgreSQL; formulário de confirmação e regressões; rótulo do combustível solicitado no componente de reserva; guia funcional/status.

## Alterações funcionais proibidas
Sem produção, migrations, alteração de permissões, preço retroativo, nova reserva na confirmação ou segunda baixa. Não restaurar dados durante esta publicação: preservar configurações e pedidos atuais da HML. Não confirmar ordens reais para testes.

## Passos de implementação
- [x] Remover recusa indevida, mantendo liquidação transacional e registrar previsto/realizado na auditoria.
- [x] Explicitar combustível solicitado e efetivamente abastecido, com aviso de substituição sem aprovação adicional.
- [x] Testar substituições, litros diferentes, saldo menor/maior, divergência e confirmação repetida em banco descartável.
- [x] Executar gates, publicar frontend e reiniciar somente a API HML, sem cópia de banco.
- [x] Inspecionar desktop/mobile claro/escuro, registrar evidências e commit local.

## Validação visual
Abrir confirmação na HML, conferir pedido original e trocar combustível/litros sem salvar uma ordem real. Conferir mobile390 e claro/escuro, com comprovante ainda obrigatório.

## Testes e build
Regressão frontend de FormData com combustível/litros/valor reais e preservação do pedido; PostgreSQL descartável no cluster5441 para saldo, auditoria e repetição. Testes frontend/backend, lint, build HML e diff-check.

## Resultado
Publicado exclusivamente na homologação em 22/10/2026. Evidências privadas em `storage/backups/20261022-fuel-substitution`; código registrado na branch local da entrega de contratos.

- Backend: **698 aprovados/127 ignorados/8 avisos anteriores**. PostgreSQL descartável: **18 aprovados**, incluindo quatro casos por API multipart (etanol abaixo da reserva, gasolina aditivada acima da reserva, gasto acima do saldo e mesmo combustível com normalização de letras/espaços). Confirmação repetida retorna409 e mantém somente uma reserva/baixa; a auditoria registra os dois combustíveis e volumes. Nenhum preço para o combustível substituto foi necessário.
- Frontend final: **394 aprovados em 69 arquivos**, lint **0 erros/39 avisos anteriores**, build HML aprovado (aviso de bundle anterior preservado). Após inspeção em 390px, resumos foram reunidos e o aviso de troca apresentado logo após o seletor para reduzir rolagem, sem esticar o campo monetário vizinho. Nenhuma dependência nova.
- A suíte unitária revelou uma fixture antiga sem a nova propriedade de pedido; ela foi alinhada ao modelo real, incluindo a conferência de auditoria de ordem legada sem combustível previsto. Nenhuma mudança de schema/permissão foi necessária.
- API6969 reiniciada pelo controlador existente, usando tarefa temporária com o mesmo principal S4U da rotina06h; conclusão0, tarefa removida. Rotina diária preservada. Comparação integral das **68 tabelas** e dos arquivos de configuração antes/depois sem diferenças. Fonte anterior e índice frontend preservados para reversão sem restaurar dados.
- Nove assets públicos comparados por SHA-256 com o build final; bootstrap correspondente. Readiness pública da HML e produção saudável. Produção permaneceu no commit `c2226ac`, com working tree limpo; nenhum serviço/arquivo/banco de produção foi modificado.
- QA autenticada em **1366×768 e 390px**, claro/escuro: pedido original gasolina comum/30L mantido na tela, seleção de gasolina aditivada/32,5L e etanol/28L, aviso correspondente e comprovante obrigatório. Documento sem overflow horizontal em 390px. Todas as prévias foram fechadas sem salvar; nenhum comprovante enviado ou abastecimento real confirmado. Tema claro e viewport original restaurados; guia devolvida a Contratos e saldos.
- Capturas finais: `desktop-light-final.jpg`, `desktop-dark-final.jpg`, `mobile-light-final.jpg`, `mobile-dark-final.jpg`. Capturas anteriores no mesmo diretório representam estágios intermediários. Ferramentas temporárias arquivadas em `native-release-tools`; nenhuma tarefa temporária permaneceu. Próxima rotina diária: **23/10/2026 às 06h de Brasília**, estado Ready/último resultado 0.

## Pendências / decisões
O combustível solicitado é uma previsão para calcular a reserva. A confirmação registra a realidade do comprovante, mesmo sem preço cadastrado para o substituto; não recalcula retroativamente a reserva. Não se exige justificativa extra: observações continuam disponíveis, comprovante e auditoria permanecem obrigatórios.

## Rollback
Guardar índice frontend, fonte anterior e configuração HML antes da publicação. Reverter somente os arquivos desta correção e reiniciar API6969 pelo controlador HML; nenhuma restauração de banco é necessária.
