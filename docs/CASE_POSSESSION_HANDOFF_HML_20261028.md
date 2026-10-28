# Posse do TOB7D75 após devolução — homologação, 28/10/2026

## Diagnóstico

Na cópia de homologação atualizada às 06h, o início proposto de 27/10/2026 14:16 atravessa movimentações efetivas posteriores, todas no horário de Brasília:

| Empréstimo | Entrega efetiva | Devolução efetiva |
| --- | --- | --- |
| Administração → Segurança e Transporte | 27/10 08:42:21.646591 | 27/10 16:27:10.700602 |
| Administração → Meio Ambiente | 27/10 16:40:35.537380 | 27/10 16:45:44.415276 |

As 17h da imagem são `expected_return_at`, prazo previsto, não `returned_at`. Não há evidência de erro de fuso ou impedimento por ADMIN vinculado à Administração. A regra resolve a responsabilidade pelo instante da operação, preservando o histórico mesmo quando o empréstimo tem status RETURNED. Não se deve liberar todos os períodos apenas pelo status atual.

O início real da posse ainda precisa ser confirmado com Ana. Se ocorreu após os empréstimos, registrar o horário real posterior à última devolução. Se ocorreu às 14h16, conferir os horários efetivos/documentos dos empréstimos e tratar eventual retificação administrativa auditável. A intervenção não criou a posse nem mudou o histórico.

## Alteração e coordenação

Coordenado com o chat `Esboçar anexos no encerramento` por pedido humano expresso. A outra entrega terminou e não havia arquivos em edição. Branch `fix/possession-handoff-guidance-hml-20261028`, baseada em c29fadb; implementação 9141ec3. Toda a ancestralidade e o build frontend publicado foram preservados.

`operational_scope.py` mantém o mesmo predicado temporal e retorna 409 com código `POSSESSION_CROSSES_HANDOFF`, mensagem legível, início informado e marcos efetivos com precisão completa no JSON. A mensagem usa America/Bahia (Brasília), diferencia entrega/devolução, informa o primeiro conflito e, para posse aberta, a última movimentação do intervalo. O formulário existente já apresenta `detail.message`. Não altera permissões, modelos, migrations, endpoints ou regras temporais.

## Validação

- 35 testes backend aprovados: operações/empréstimos, autorização, atribuição temporal, oito regressões locais e criação real via API em banco descartável. A API rejeita o início anterior à devolução com orientação e cria a posse iniciada no marco de devolução, atribuída à origem.
- 13 testes frontend aprovados: formulário de posse e leitura das mensagens estruturadas. Nenhuma alteração ou reconstrução do frontend.
- Três falhas preexistentes reproduzidas também com o serviço original: `test_responsibility_history_and_return_cutoff` (exigência atual de pedido de manutenção), `test_temporal_attribution_legacy_null_and_report_totals` (custos de manutenção), `test_new_vehicle_inherits_origin_and_can_be_loaned` (MissingGreenlet no carregamento de permissões). Excluídas da rodada verde direcionada; não foram atribuídas a esta alteração.
- Bancos de testes descartáveis no cluster isolado 5441; nenhum registro de QA no banco HML compartilhado.

## Publicação

API HML reiniciada por `02-HOMOLOGACAO/MANUTENCAO.ps1 -Action restart`, via wrapper próprio elevado, com validação de identidade e sem parar PostgreSQL. Novo runner 26296/API 21432 às 09h50; produção 8000/PID2512 e PostgreSQL HML 5441/PID15100 preservados.

Conferência final concluída: 75 tabelas idênticas antes/depois, `.env` e configuração frontend iguais, frontend servido idêntico, mesma entrada pública `index-DCvH-SE2.js`. Readiness local HML/produção e pública HML aprovada. Produção limpa em 31543d4, código de produção inalterado. SHA256 do serviço HML publicado: d46ef1dc3fcf0f8bec1f424a4bfa8587227a05ba85c5c5027284ab6b0dbbc092.

A primeira verificação do wrapper falhou no cliente HTTP: Cloudflare recusou o User-Agent padrão e injeta um beacon no HTML público. A verificação foi corrigida para usar User-Agent aceito, comparar HTML local e referências de assets públicas, e passou sem novo reinício ou mudança na aplicação. O resultado inicial do wrapper permanece no backup como evidência, acompanhado de `final-verification.json` aprovado.

Backup privado: `storage/backups/20261028-possession-handoff-guidance`, incluindo serviço original, fingerprints, logs de testes, reinício e verificação final. Para reversão pontual, restaurar apenas `operational_scope.before.py` ao caminho original e reiniciar somente a API HML pelo gerenciador; não restaurar banco, frontend, branches antigas ou configurações.
