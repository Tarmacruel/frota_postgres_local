# ExecPlan — Conciliação de produção e homologação —27/10/2026

## Objetivo
Conferir a fonte efetivamente publicada em produção e integrar suas melhorias ausentes à homologação, preservando itens, quantidades e aditivos exclusivos da HML. Somente HML receberá código/build/reinício; produção será consultada em leitura. A cópia das06h atualiza dados, não código.

## Estado inicial verificado
- HML em18aa89b, branch anterior feature/contract-items-amendments-hml-20261026, working tree limpo; nova branch feature/hml-production-sync-20261027.
- Produção local main31543d4, limpo. Sua árvore de arquivos é idêntica a origin/main a216fa4; IDs diferem pela forma de integração/publicação.
- Faltam PR78 (máscaras BRL e correção auditável de saldo),79 (rede por valor real sem reserva) e80 (justificativas rápidas para vínculo contratual de ordens). Posto em vários contratos já está integrado.
- HML schema0062_items_network_merge, produção0061_network_value_fuel. Cópia de hoje concluída06:00:57, tarefa resultado0. Não executar outra restauração.
- Baseline anterior HML:706 backend,486 frontend,52 PostgreSQL; lint0 erros/39 avisos, build aprovado.
- Backup privado storage/backups/20261027-production-sync: bundle Git, frontend servido e configurações HML antes de alterações.
- Regras AGENTS, runbook e documentos visuais/status lidos. A ordem atual autoriza conciliar comportamento/backend de produção; não é um redesign novo e não exige aprovação adicional de fase.

## Arquivos previstos
Merge auditado de origin/main, resolução dos conflitos nos serviços de saldo/abastecimento, hook de contrato, formulários e inspetor. Integrar MoneyInput aos campos monetários exclusivos dos itens preservando seis casas nos preços. Regressões de compatibilidade entre modalidade e quantidades, documentos/status e evidências.

## Alterações funcionais proibidas
Não escrever/reiniciar/publicar produção; não copiar .env de produção, restaurar dados novamente, confirmar saldo/quantidade real automaticamente ou apagar histórico. Preservar permissões, assinatura, documentos, PDFs/XLSX, rotas, períodos e política original de cada ordem.

## Passos de implementação
1. [x] Inventariar produção real, remoto e HML; identificar diferenças e preparar backup/branch.
2. [x] Integrar commits e conciliar a rede por valor com o controle por item: sem preços/reservas pressupostos, mantendo a política congelada da ordem e os pedidos fixos antigos.
3. [x] Integrar máscaras/correção de saldo/justificativas e preservar interface quantitativa, precisão e relatórios.
4. [x] Rodar regressões reais PostgreSQL e suítes completas frontend/backend, lint/build HML.
5. [ ] Publicar só HML com backup e reversão; conferir interface desktop/mobile e temas, schema/configuração/rotina06h e documentar resultado.

## Validação visual
Tese: manter a superfície operacional existente e a leitura compacta, sem novos adornos. Conteúdo: modalidade, dinheiro, quantidades aplicáveis e próxima ação. Interação: campos BRL com edição precisa, prévia preservada e visibilidade condicional; sem novas animações decorativas. Inspecionar campo BRL, contrato Prime, pedidos fixos, editor de itens e justificativas em claro/escuro e celular.

## Testes e build
Comparar cada commit produtivo com a integração; testar NETWORK_VALUE com a flag quantitativa ligada, política congelada após mudança da modalidade, confirmação/retificação/conciliação sem débito duplicado, preço fixo com combustível/ARLA e manutenção, correção auditada de saldo e sugestões gravadas só após sucesso. Testes padrão com flags legadas controladas e regressões em banco descartável5441. Build sempre --mode homologation fora de frontend/dist até a publicação.

## Resultado
Integração pronta para publicação HML. Backend padrão:708 aprovados/177 pulados (integrações exigem URL descartável). PostgreSQL real5441:69 aprovados, incluindo rede com flag quantitativa ativa, execução/retificação com catálogo opcional e reabertura de pedido fixo após mudança do contrato para rede por valor. Frontend:511 aprovados/81 arquivos. Lint0 erros/39 avisos anteriores. Build candidato --mode homologation aprovado fora de frontend/dist. Uma expectativa antiga do teste de formulário numérico foi atualizada para o texto BRL; regressão adicional comprova seis casas preservadas no payload.

## Decisões e pendências
- Contrato de rede por valor não será obrigado a cadastrar preço/litro ou reservar quantidades por valor estimado. A modalidade congelada da ordem governa sua conclusão e reabertura, inclusive se o cadastro atual mudar.
- Quando existir catálogo quantitativo conferido no contrato, a execução pode registrar quantidades reais; ausência de catálogo em rede por valor não impede o fluxo produtivo, nem inventa quantidades contratuais.
- O bloqueio temporário NETWORK_VALUE da entrega anterior será removido somente após integração e regressões.

## Reversão
Gerenciador validado para parar/iniciar somente API6969. Restaurar fonte18aa89b e build/configurações do backup HML se necessário, preservando schema aditivo e registros novos. Sem downgrade ou restauração automática de banco; PostgreSQL e Cloudflare não serão reiniciados.
