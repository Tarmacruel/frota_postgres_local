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
- [x] Backup HML, migration aditiva, ativação da API HML e publicação frontend; compatibilidade da rotina06h validada.
- [x] Conferência visual sem alterar preços reais, documentação e commits locais.

## Decisões
- Posto e combustível identificam a série; editar muda o valor e, opcionalmente, o início da nova vigência. Trocar a identidade exige novo cadastro.
- Edição preserva o valor da versão original. Para preço vigente, cria nova vigência agora (ou em data futura dentro do intervalo da versão). Para agendado, mantém seu início quando o campo fica vazio; versão substituída não pode ser usada novamente.
- Excluir retira o preço de novos pedidos e mantém a linha no histórico. Não reativa preço antigo ao excluir o vigente. Excluir um agendamento estende apenas seu predecessor ainda válido, preservando o próximo agendamento; predecessor excluído nunca é reativado.
- Histórico apresenta versões encerradas/substituídas/excluídas; pedido já reservado continua podendo ser concluído pelo valor real.

## Validação visual
Tabela e diálogos em desktop e mobile390/360, temas claro/escuro, teclado e confirmação/cancelamento. Os quatro preços reais existentes em22/10 não foram editados/excluídos nesta entrega. A atualização diária autorizada de23/10 reiniciou os cadastros exclusivos dos testes; a conferência final usou um contrato fictício suspenso, sem abertura de saldo. Operações financeiras e concorrência foram comprovadas em banco descartável.

## Testes e build
Backend unitário e PostgreSQL descartável: nova versão, instantâneo reservado, rejeição de prévia antiga, exclusão idempotente, preço agendado, concorrência e APIs/permissões. Frontend: ações, preenchimento, confirmação, histórico e erros. Test/lint/build e migração em staging compatível com a rotina diária.

## Resultado
**Publicado somente na homologação em23/10/2026.** Em22/10 a confirmação de administrador do Windows foi cancelada (`Start-Process -Verb RunAs`: operação cancelada pelo usuário), mantendo a publicação pendente naquele momento. Em23/10, apesar da autorização humana para reabrir a confirmação, não foi necessária nova elevação: a rotina diária06h já havia reiniciado a API6969 com o código atual e aplicado o schema0058. As rotas PATCH/DELETE foram verificadas no OpenAPI ativo; o frontend foi publicado separadamente pelo script exclusivo HML. Nenhuma nova restauração ou reinício foi executado para finalizar esta publicação. Evidências privadas em `storage/backups/20261022-fuel-price-management`, finalização em `finalization-20261023`.

- Backend completo: **698 aprovados/134 ignorados/8 avisos anteriores**. PostgreSQL real descartável: **25 aprovados**, incluindo sete regressões de edição/exclusão, concorrência, permissões, precisão e preços agendados. Banco descartável removido pelo runner.
- Frontend completo: **402 aprovados em 70 arquivos**; direcionados **15 aprovados**; lint **0 erros/39 avisos anteriores**; build HML aprovado, com aviso de bundle anterior preservado.
- Snapshot salvo da produção (schema0055, checksum conferido) restaurado somente em banco temporário no cluster5441 e migrado por0056/0057/0058. **59 tabelas de negócio originais** conferidas por projeção das colunas existentes; HML ativa permaneceu idêntica. Nenhuma conexão ao banco de produção foi necessária. Staging removido ao final.
- Backup integral HML criado em snapshot consistente, fontes anteriores arquivadas e configurações preservadas. Migration0058 adicionou somente `deleted_at` nullable aos preços; **67 tabelas de negócio originais** preservadas, fora o versionamento do Alembic. Dados do usuário não foram restaurados, recriados, editados ou excluídos.
- Rotina06h concluída em23/10 das06:00:03 às06:00:55, execução `20261023-060003-c4ad45`, schema0055→0058,60 tabelas verificadas e configuração preservada. Estado Ready e resultado0. A reinicialização dos preços/vínculos/aberturas exclusivos dos testes decorreu dessa cópia diária previamente autorizada; não se restaurou o backup HML de22/10.
- Antes/depois da publicação frontend de23/10: **68 tabelas idênticas**, configurações e índice de produção preservados, nove assets públicos com SHA256 iguais ao build, readiness dos dois ambientes aprovada. Código funcional permanece no commit `b0dbe4c`.
- QA autenticado criou apenas o catálogo explicitamente fictício `TESTE-HML-PRECOS-20261023`: contrato suspenso, empresa/posto identificados como TESTE HML, sem abertura, pedidos ou movimentos. Edição de gasolina6,1000→6,1250 criou nova versão e manteve a anterior; cancelamento da exclusão não gravou; confirmação da exclusão do etanol retirou a oferta e manteve o histórico. Auditoria: exatamente um UPDATE_FUEL_PRICE e um DELETE_FUEL_PRICE. Comparação excluindo somente as novas linhas da fixture/auditoria confirmou **todas as68 tabelas originais preservadas**. A fixture será reiniciada pela cópia diária normal.
- Interface clara/escura, desktop e mobile390/360, formulário de preço agendado, histórico, foco inicial, Escape/cancelamento e confirmação conferidos. Sem overflow horizontal nas larguras móveis e sem erros de console. Tema claro e viewport original restaurados. Capturas: `prices-feature-proof.png` (seção de preços com ações e histórico), `desktop-light-prices.png`, `desktop-dark-delete.png`, `mobile-dark-delete.png`; inspeção de layout também registrada no navegador. Limite: simulação de tamanho em navegador, sem aparelho físico.

## Pendências / decisões
Entrega concluída, sem pendências de ativação. Mudança funcional explícita: o limite de redesign sobre backend/schema não impede o atendimento desta solicitação. Nenhuma nova aprovação operacional foi acrescentada; exclusão exige apenas confirmação normal do usuário na interface.

## Rollback
Backup do banco HML e do frontend antes da migration. Coluna nova nullable permite reverter o código sem remover dados. Qualquer reversão deve atingir apenas API6969/PG5441 e preservar registros atuais; nenhuma cópia de produção será aplicada nesta entrega.
