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

Publicada na homologação em 27/10, às 08:01:17, com refinamento posterior somente de texto no frontend. Merge 86fe9ae e ajuste d537298. Produção permaneceu em 31543d4, com working tree limpo e mesmo processo; foi apenas consultada, sem escrita, reinício ou publicação. A atualização diária de 27/10 havia concluído às 06:00:57, resultado 0; nenhuma nova restauração foi executada.

Validação: 708 testes backend, 69 PostgreSQL real, 511 frontend/81 arquivos; 38 regressões da interface após o refinamento final. Lint com 0 erros e 39 avisos anteriores; build em modo homologation aprovado. As 75 tabelas foram preservadas na ativação e as 27 tabelas de contratos, abastecimentos, manutenção e pagamentos continuaram idênticas durante a QA visual. Configurações sem alteração e nove assets servidos conferidos.

Interface autenticada conferida em desktop e mobile 390×843 CSS, claro/escuro, sem overflow. Pedido Prime sem preço ou reserva e correção BRL com prévia conferidos sem salvar; contrato fixo continua exigindo conferência quantitativa, com reserva existente preservada e editor por item disponível. A sessão original foi devolvida à página inicial, com tema e dimensões restaurados. [Captura final](../storage/backups/20261027-production-sync/sync-final-proof.png).

A branch isolada inclui a linha produtiva inteira como ancestral, sem apagar funcionalidades exclusivas da HML. A tarefa das 06h continua sendo sincronização de dados; futuras melhorias de código feitas diretamente em produção precisarão da mesma integração auditada, em vez de sobrescrever a árvore HML.

## Reversão

Parar somente API6969 com `D:/FROTAS/02-HOMOLOGACAO/sincronizacao/manage_api.ps1 -Action Stop`. Recuperar fonte18aa89b e o frontend anterior do backup, preservando configurações, schema e banco atual; iniciar com `-Action Start` e conferir `/health/ready`. PostgreSQL5441 e Cloudflare permanecem ativos. O dump é reserva de recuperação, não autorização para sobrescrever dados ou conectar à produção.
