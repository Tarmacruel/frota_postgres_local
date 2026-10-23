# ExecPlan — editar e excluir preços de combustível — homologação

## Objetivo
Adicionar edição e exclusão de preços por posto/combustível no acompanhamento de contratos, preservando preços de reservas e abastecimentos já emitidos. Solicitação funcional de 22/10/2026, somente homologação.

## Estado inicial verificado
- HML: `D:\FROTAS\frota_emprestimos_testes`, branch `feature/contracts-balances-hml-20261022`, HEAD `703a781`, working tree limpo; API6969/PG5441, schema0057.
- Baseline anterior: backend698 aprovados; PostgreSQL18; frontend394/69 arquivos; lint0 erros/39 avisos anteriores; build HML aprovado.
- Preços já têm versões e vigências, mas apenas criação. Reservas guardam preço/quantidade próprios e referência à versão original.

## Arquivos previstos
Modelo/migration aditiva de exclusão lógica, schemas/APIs/serviço de preços e testes; componente de tabela e diálogos de preços; documentação de entrega e status.

## Alterações funcionais proibidas
Sem publicação, migrations ou reinício em produção. Sem alterações em saldos, reservas ou operações anteriores, apagamento físico de preços referenciados ou restauração do banco ativo. Preservar permissões de gestão financeira e a rotina diária06h.

## Passos de implementação
- [x] Edição por nova versão e exclusão lógica auditadas, com bloqueio transacional do contrato.
- [x] Tabela com ações, situação, histórico consultável e confirmação de exclusão; desktop/mobile e claro/escuro.
- [x] Regressões de preços vigentes/agendados, reservas preservadas, concorrência e permissões; gates completos.
- [ ] Backup HML, migration aditiva, publicação/reinício HML e compatibilidade da rotina06h sem substituir dados ativos.
- [ ] Conferência visual sem alterar preços reais, documentação e commit local.

## Decisões
- Posto e combustível identificam a série; editar muda o valor e, opcionalmente, o início da nova vigência. Trocar a identidade exige novo cadastro.
- Edição preserva o valor da versão original. Para preço vigente, cria nova vigência agora (ou em data futura dentro do intervalo da versão). Para agendado, mantém seu início quando o campo fica vazio; versão substituída não pode ser usada novamente.
- Excluir retira o preço de novos pedidos e mantém a linha no histórico. Não reativa preço antigo ao excluir o vigente. Excluir um agendamento estende apenas seu predecessor ainda válido, preservando o próximo agendamento; predecessor excluído nunca é reativado.
- Histórico apresenta versões encerradas/substituídas/excluídas; pedido já reservado continua podendo ser concluído pelo valor real.

## Validação visual
Tabela e diálogos no desktop1366 e mobile390, temas claro/escuro, teclado e confirmação/cancelamento. Não salvar mudanças nos quatro preços reais do usuário. Operações de escrita serão comprovadas em banco descartável.

## Testes e build
Backend unitário e PostgreSQL descartável: nova versão, instantâneo reservado, rejeição de prévia antiga, exclusão idempotente, preço agendado, concorrência e APIs/permissões. Frontend: ações, preenchimento, confirmação, histórico e erros. Test/lint/build e migração em staging compatível com a rotina diária.

## Resultado
Código e migrations validados; aplicação aditiva no banco HML concluída. A confirmação de administrador do Windows para iniciar o controlador de reinício foi cancelada (`Start-Process -Verb RunAs`: operação cancelada pelo usuário). Não houve reinício nem publicação frontend. Solicitada autorização para reabrir a confirmação; aguardar resposta antes de nova tentativa de elevação. A versão anterior permanece funcionando. Evidências privadas em `storage/backups/20261022-fuel-price-management`.

- Backend completo: **698 aprovados/134 ignorados/8 avisos anteriores**. PostgreSQL real descartável: **25 aprovados**, incluindo sete regressões de edição/exclusão, concorrência, permissões, precisão e preços agendados. Banco descartável removido pelo runner.
- Frontend completo: **402 aprovados em 70 arquivos**; direcionados **15 aprovados**; lint **0 erros/39 avisos anteriores**; build HML aprovado, com aviso de bundle anterior preservado.
- Snapshot salvo da produção (schema0055, checksum conferido) restaurado somente em banco temporário no cluster5441 e migrado por0056/0057/0058. **59 tabelas de negócio originais** conferidas por projeção das colunas existentes; HML ativa permaneceu idêntica. Nenhuma conexão ao banco de produção foi necessária. Staging removido ao final.
- Backup integral HML criado em snapshot consistente, fontes anteriores arquivadas e configurações preservadas. Migration0058 adicionou somente `deleted_at` nullable aos preços; **67 tabelas de negócio originais** preservadas, fora o versionamento do Alembic. Dados do usuário não foram restaurados, recriados, editados ou excluídos.

## Pendências / decisões
Mudança funcional explícita: o limite de redesign sobre backend/schema não impede o atendimento desta solicitação. Nenhuma nova aprovação operacional foi acrescentada; exclusão exige apenas confirmação normal do usuário na interface.

## Rollback
Backup do banco HML e do frontend antes da migration. Coluna nova nullable permite reverter o código sem remover dados. Qualquer reversão deve atingir apenas API6969/PG5441 e preservar registros atuais; nenhuma cópia de produção será aplicada nesta entrega.
