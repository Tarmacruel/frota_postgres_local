# Conciliação de produção com homologação — 27/10/2026

## Comparação

Fonte efetiva de produção:31543d4, árvore idêntica a origin/main a216fa4. Homologação iniciou em18aa89b. A tarefa das06h copia dados e aplica migrations; ela não sincroniza código. Por isso três entregas produtivas ainda não estavam disponíveis no funcionamento da HML.

| Entrega de produção | Resultado na homologação |
|---|---|
| PR78 /62a774c — máscaras BRL e correção de saldo | Incorporada. Campos monetários próprios dos itens também usam BRL, com seis casas nos preços; quantidades mantêm sua unidade. Correção auditável altera somente a diferença e exige a posição esperada. |
| PR79 /6d7b50e — rede por valor | Incorporada e conciliada com quantidades. Não exige preço por litro ou abertura quantitativa para emitir; pedido não reserva saldo. A confirmação desconta o valor real. |
| PR80 /a216fa4 — justificativas no vínculo de ordens | Incorporada. Sugestões rápidas/histórico de `order_funding`, registrados somente após sucesso. |
| PR77 — posto em mais de um contrato | Já integrada antes desta conferência; preservada com seleção explícita quando necessário. |

Não há migrations novas nesta conciliação. HML permanece em0062_items_network_merge, descendente do schema produtivo0061_network_value_fuel e dos itens exclusivos de teste.

## Diferenças intencionais que permanecem

- HML mantém catálogo permanente, abertura de quantidades, ARLA, linhas de serviços/peças, aditivos por item, limite acumulado e demonstrativo com fotografia, PDF e XLSX. Esta entrega não publica essas funcionalidades em produção.
- Contratos de preço fixo e manutenção exigem abertura quantitativa conferida antes de novos pedidos. A rede por valor segue a modalidade produtiva: sem quantidade contratual inventada e sem reserva estimada. Se já houver catálogo quantitativo aberto, sua execução pode registrar os volumes reais sem reserva prévia.
- A modalidade da ordem é congelada na emissão. Uma ordem de preço fixo continua liberando/reservando seus itens ao expirar/reabrir mesmo que o cadastro do contrato passe para rede por valor; uma ordem da rede continua sem reserva se o cadastro mudar para preço fixo.
- Aditivos monetários/prazo da rede por valor preservam o fluxo produtivo; não se força um preço unitário inexistente. Instrumentos por item continuam disponíveis para os contratos submetidos ao controle quantitativo.
- Retificações registram diferenças. Faturas e pagamentos não consomem saldo nem quantidades novamente.

## Publicação e evidências

Branch isolada:feature/hml-production-sync-20261027. Execução registrada em[ExecPlan](EXECPLAN_PRODUCTION_SYNC_HML_20261027.md). Backup privado em `storage/backups/20261027-production-sync`: fonte Git anterior, build/configurações anteriores, dump consistente HML, fingerprints, logs e capturas. Nenhuma credencial deve ser incluída em commits ou relatórios públicos.

Publicação pendente de gates finais e conferência visual. Produção será apenas consultada, sem escrita, reinício ou publicação. Não será executada nova restauração da homologação: a atualização de27/10 concluiu06:00:57, resultado0, com configurações preservadas e aplicação da migration até0062.

## Reversão

Parar somente API6969 com `D:/FROTAS/02-HOMOLOGACAO/sincronizacao/manage_api.ps1 -Action Stop`. Recuperar fonte18aa89b e o frontend anterior do backup, preservando configurações, schema e banco atual; iniciar com `-Action Start` e conferir `/health/ready`. PostgreSQL5441 e Cloudflare permanecem ativos. O dump é reserva de recuperação, não autorização para sobrescrever dados ou conectar à produção.
