# ExecPlan — Contratos e saldos — homologação

## Objetivo
Executar o plano integral aprovado em 22/10/2026: reservas no pedido, consumo real, rede credenciada, preços versionados, manutenção com autorização direta, conciliação sem desconto duplicado e nova experiência de acompanhamento. Exclusivamente em homologação.

## Estado inicial verificado
- Raiz: `D:\FROTAS\frota_emprestimos_testes`; API 6969; PostgreSQL 5441.
- Branch: `feature/contracts-balances-hml-20261022`; HEAD inicial `9ab03a6`; working tree inicialmente limpo.
- Baseline no mesmo HEAD: frontend 382 testes, lint sem erros/39 avisos anteriores; backend 688 aprovados/109 ignorados; build HML aprovado. Evidências da entrega de KPIs preservadas em storage/backups.
- Schema 0055. Dois contratos FUEL, cinco fornecedores, quatro postos, nenhum vínculo financeiro operacional, três manutenções concluídas. Não corrigir cadastros reais por inferência.
- Produção em outra raiz, API 8000, PostgreSQL 5432; não alterar nem reiniciar.

## Arquivos previstos
Backend: modelos/migration aditivos, serviço transacional de saldos, integração com abastecimentos/manutenções/pagamentos, APIs e testes. Frontend: módulo de contratos, formulários operacionais, navegação e testes. Rotina HML: restauração em staging com migrations e validação antes da troca.

## Alterações funcionais proibidas
Sem publicação/DDL/escrita em produção. Sem integração bancária, cotas por secretaria, rateio de pedido entre contratos ou aumento de acesso a dados de outras secretarias. Não remover faturas, checklist, importação/exportação, documentos ou assinaturas existentes.

## Passos de implementação
- [x] 1. Base: extrato imutável, abertura validada, rede, preços, reservas/consumo/ajustes e testes de concorrência.
- [x] 2. Integração: pedidos simples/lote, expiração/cancelamento/prorrogação, conclusão/retificação, ordens de manutenção e conciliação.
- [x] 3. Interface: visão geral, contratos, pedidos/movimentações, prestadores, faturas; mobile e claro/escuro.
- [x] 4. Rotina 06h: copiar produção somente leitura para staging, conferir, migrar, validar e ativar com rollback. Dados exclusivos de testes reiniciam diariamente, conforme escolha do usuário.
- [x] 5. Gates, publicação HML, conferência autenticada, documentação e commit local.

## Decisões
Saldo único; emissão reserva; insuficiência bloqueia pedido; execução já realizada registra verdade e divergência, bloqueando novas reservas até regularização. Preço por posto/combustível; reserva ajustada pelo real. Saldo inicial confirmado pelo gestor. Sem inferência por nomes. Manutenção autoriza diretamente, inicia e conclui execução sem aprovação extra. Faturas conciliam operações, não consomem novamente; diferença exige justificativa. Uma operação é conciliada integralmente em um processo.

## Validação visual
Inspecionar visão geral, configuração, extrato e operações em desktop/mobile de 390px e temas claro/escuro; teclado, loading, erros e estados sem configuração. Preservar sessão e guias do usuário.

## Testes e build
Testes unitários e PostgreSQL real isolado: fórmula, concorrência, idempotência, lotes, preço, cancelamento/expiração/reabertura, execução acima do saldo, retificação, aditivo, conciliação e permissões. Regressão frontend/backend, lint e build. Simulação de refresh com schemas diferentes e migration falhando sem afetar HML ativa.

## Resultado
Publicado exclusivamente em https://testefrota.sirel.com.br/processos-pagamento. Código registrado na branch local `feature/contracts-balances-hml-20261022`. Guia funcional e operacional em [CONTRACT_BALANCES_HOMOLOGATION.md](CONTRACT_BALANCES_HOMOLOGATION.md). Evidências privadas em `storage/backups/20261022-contract-balances`.

### Validação intermediária — 22/10/2026
Base e integração aprovadas: 697 testes backend/121 ignorados (12 de PostgreSQL exigem banco descartável explícito); suite PostgreSQL real 12/12 em banco exclusivo criado e removido pelo runner. Após ajuste da prévia dos lotes, núcleo financeiro 10/10; preview soma o arredondamento de cada ordem para coincidir com as reservas efetivas. Frontend 388/388 em 68 arquivos, direcionados finais 19/19; lint 0 erros/39 avisos anteriores; build HML aprovado. Nenhuma dependência nova.

Rotina 06h: fonte 0055 exportada somente leitura; restore e migrations 0056/0057 no staging. Falha injetada depois da migration impediu a ativação, manteve fingerprints de todas as tabelas ativas e readiness da HML; nenhuma chamada a Stop. Evidência `refresh-failure-test.json`. Publicação pelo mesmo principal S4U da manutenção, em tarefa temporária; agendamento diário preservado.

### Resultado final — 22/10/2026

- Backend completo: **698 aprovados**, 121 ignorados e oito avisos anteriores; depois foram acrescentados dois testes opt-in à suíte PostgreSQL. Núcleo financeiro final: **10 aprovados**. PostgreSQL real: **14 aprovados**, incluindo legado sem reserva, abertura ausente, contrato vencido e aditivo repetido; banco descartável removido pelo runner.
- Frontend completo: **389 aprovados em 68 arquivos**; direcionados finais **7 aprovados** após ajustes de atualização dos KPIs, conciliação desatualizada e apresentação de pagamentos. Lint **0 erros/39 avisos anteriores**, build HML aprovado; aviso de bundle acima de 650 kB já existia e continua documentado nos logs. Nenhuma dependência nova.
- QA autenticada em **1366 px, 390 px e 360 px**, claro/escuro. Corrigido o horário de conclusão de manutenção recém-iniciada (servidor fornece agora quando vazio), com teste de regressão. Corrigida a contenção dos carrosséis na visão geral; documento mobile sem overflow horizontal (341/360 e 371/390 por conta da barra de rolagem). Dez KPIs da visão geral clicáveis; valores monetários sem quebra de dígitos.
- Fluxos reais da interface usando somente fixtures fictícias: abastecimento de 30 L × R$ 6,40 reservou R$ 192; manutenção reservou R$ 500 e concluiu por R$ 470, deixando R$ 9.530; fatura de R$ 470 conciliada manteve R$ 9.530. XLSX baixado e XML conferido. Ordens herdadas exibem ação própria e botão de emissão bloqueado enquanto não houver contrato configurado. Nenhuma abertura de contrato real foi confirmada.
- Duas cópias completas de produção passaram pelo staging e migrations; a última **20261022-152334-e6ae69** removeu todas as fixtures. **60 tabelas** de origem verificadas, **447 arquivos** copiados/442 referências conferidas. Schema HML **0057**; produção **0055**. Todas as oito novas tabelas financeiras vazias após a limpeza, contratos reais pendentes de configuração, produção com working tree limpo.
- Nove assets públicos conferidos por SHA-256 contra o build, bootstrap com as mesmas referências; APIs local/pública de ambos os ambientes saudáveis. Console final sem erros. Tarefa diária **Ready**, próxima execução **23/10/2026 às 06h de Brasília**, sem tarefas temporárias restantes.
- Capturas: `desktop-light-final.jpg`, `mobile-light-final.jpg`, `mobile-dark-final.jpg`, `desktop-dark-reconciliation.jpg` e `mobile-dark-operation.jpg`. As duas últimas mostram dados fictícios já removidos.

Na publicação, uma checagem HTTP posterior recebeu 403 com o User-Agent padrão do Python, apesar de cópia, API e frontend já concluídos; a verificação pública final com identificador de cliente passou. O wrapper temporário foi corrigido para aguardar somente o processo publicador, sem aguardar seus descendentes de API; finalização e saúde conferidas. O agendamento diário não foi alterado. Logs iniciais preservados para rastreabilidade.

## Pendências / decisões
Implementação integral autorizada pelo usuário. As regras de redesign sobre não alterar backend/schema não se aplicam à demanda funcional explicitamente aprovada. Aberturas e configurações serão conferidas pelo usuário; nenhum saldo real será confirmado automaticamente pelo implementador.

## Rollback
Backup HML antes do DDL; feature flag própria do ambiente; restaurar código/frontend e banco HML anterior se necessário. A rotina mantém staging e backup anterior até saúde confirmada. Nenhuma ação de rollback alcança produção.
