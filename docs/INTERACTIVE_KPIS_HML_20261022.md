# Indicadores interativos — homologação — 22/10/2026

Implementação exclusiva em `D:\FROTAS\frota_emprestimos_testes`, branch `feature/interactive-kpis-hml-20261022`. Produção permanece na versão anterior, sem alterações locais ou publicação desta demanda.

## Como usar

Clique no indicador para consultar seus registros. O cartão selecionado fica destacado; clique novamente ou use **Limpar indicador** para remover a seleção. A busca, secretaria, status e período continuam delimitando o recorte. Os valores são de **todas as páginas desse recorte** e permanecem estáveis ao escolher um indicador ou paginar. Filtros incompatíveis podem resultar em zero, com a seleção visível para remoção.

O filtro de indicador fica na URL e a seleção volta à primeira página. Exportações mantêm a seleção nos fluxos existentes. Indicadores de moeda e litros mostram a soma dos valores informados e abrem sua composição, com os registros correspondentes. Zero pode ser consultado; carregamento e falha não apresentam contagens antigas como atuais.

No celular, a faixa de indicadores desliza horizontalmente dentro do painel. A página mantém os cartões de registros e a navegação mobile. Há foco visível, botões de teclado, indicação de seleção e equivalência entre claro/escuro.

## Cobertura

| Tela | Indicadores e ação |
| --- | --- |
| Início | Atalhos filtrados para ativos, manutenção, sem condutor, manutenções abertas, inativos, posses ativas, CNHs vencidas e não informadas. Respeitam a permissão do módulo. |
| Veículos | Total, ativos, manutenção, inativos, ativos sem condutor, próprios, locados e cedidos. |
| Empréstimos | Total, aguardando aceite, ativos, devolução em atraso, devolvidos e regularizados. |
| Posses | Total, ativas, encerradas, encerradas sem qualquer foto e sem vínculo ao cadastro de condutores. Legados são identificados no critério. |
| Condutores | Indicadores globais de CNH preservados e agora acessíveis por link direto; filtro de CNH fica na URL. |
| Manutenções | Total, abertas, concluídas, abertas há mais de 30 dias, sem custo e custo informado. |
| Sinistros | Total, abertos, em análise, encerrados, sem anexos e valor estimado. Considera galeria e referência legada ao identificar ausência de anexos. |
| Multas | Total, pendentes, pendentes vencidas, em recurso, pagas, sem condutor vinculado e valor informado. |
| Abastecimentos | Histórico: total, alertas de consumo, sem comprovante, sem valor, litros e valor. Ordens: total, abertas válidas, vencem hoje, vencem em até uma hora, expiradas, concluídas e canceladas. Seleções independentes na mesma tela. |
| Ordens abertas | Indicadores próprios do conjunto aberto: total, válidas, vencimento hoje e em até uma hora. |
| Cadastros | Órgãos, departamentos e lotações levam à categoria correspondente e posicionam a consulta. |
| Postos | Total, ativos, inativos e sem coordenadas. Contagem de vínculos do posto selecionado leva ao painel de usuários. |
| Processos de pagamento | Total, em aberto, vencidos, vencimento em até sete dias, valor pendente informado, valor pago registrado e sem valor. Alertas gerais abrem detalhamento de todos os processos do escopo, independentemente do filtro da lista. KPIs de gestão contratual já interativos foram preservados. |
| Análises | KPIs da visão geral e de custos, combustível, manutenção e utilização abrem composição com período, critérios e limitações. Combustível detalha a composição por veículo sem conceder acesso individual adicional. |
| Importar/Exportar | Lotes por situação, linhas do lote, conflitos, erros, aprovadas, pendentes e ações de criar/atualizar. Filtros de linha executados na API e consulta de resultados oficiais/lote acessível pelos contadores. |
| Usuários | Total, produção, padrão, posto, administradores, troca de senha e CPF pendentes. |
| Auditoria | Total, inclusões, alterações, exclusões, eventos de hoje e outras ações. |

São **79 definições de indicadores SQL em 13 módulos**, além dos KPIs de CNH, início, estrutura organizacional e análises. O significado dos estados e das regras de negócio não foi modificado.

## Validação

- Baseline frontend: 375 testes, lint sem erros/39 avisos e build HML aprovado.
- Entrega frontend: **382 testes/67 arquivos aprovados**, lint sem erros e os mesmos 39 avisos anteriores; build e publicação HML aprovados.
- Backend: **688 aprovados, 109 ignorados**, sem alteração de schema. Integrações ignoradas seguem o ambiente de testes; não foi executada assinatura real de certificado nesta demanda.
- PostgreSQL HML, transação somente leitura: 79 seleções/totais e paginação conferidos. Nenhum carregamento integral de páginas no navegador para calcular os KPIs das listagens.
- API ASGI isolada com conexão HML somente leitura: metadados/seleção, rejeição de filtro inválido, proteção administrativa, escopo vazio, escopo positivo de operador e busca sem resultado. Filtros de conflitos, erros e ações de importação conferidos no PostgreSQL.
- Navegador autenticado: telas operacionais e administrativas sem erro de aplicação; ativos 271/total 313 mantidos na segunda página; filtro CNH não informada 268 em 326 condutores ativos; composição de custos, combustível, alertas e cadastros conferidos. Alertas financeiros mostraram 215 processos com pendências, sem alterar registros.
- Claro/escuro e mobile com largura CSS real de **390 px**: documento 371 px, faixa interna 1344 px e área da faixa 343 px. Sem overflow lateral da página; seleção mobile funcional. Override de viewport e tema temporários restaurados.
- O navegador carregou o bundle final `index-AjCdVTnI.js`; referências dos arquivos e hashes dos CSS publicados comparados ao build. Consulta anônima por urllib retornou 403; a conferência pública foi feita pela sessão autenticada, sem extrair credenciais.

## Implementação e isolamento

O contexto de indicadores é restrito à sessão de consulta e ao módulo. Cada repositório opta explicitamente pela agregação sobre os IDs da **mesma consulta já autorizada e filtrada**, antes da ordenação/paginação. O predicado selecionado afeta linhas e total da paginação; os demais KPIs continuam calculados sobre o recorte geral. Metadados `indicators` e parâmetro `indicator` são aditivos às listagens existentes.

Não houve migration, alteração de autenticação, permissões, configuração, assinatura ou deploy de produção. A atualização diária de dados HML das 06h continua instalada e preserva este código.

A API HML estava na sessão S4U de manutenção; a identidade do processo não podia ser inspecionada pelo terminal interativo. A publicação utilizou uma tarefa temporária com a **mesma identidade de manutenção**, validação de PID/porta e retorno 0, depois removida. A tarefa diária não foi alterada. Nenhum watchdog, túnel ou serviço de produção foi reiniciado.

## Evidências e reversão

Evidências privadas em `storage/backups/20261022-interactive-kpis`: logs de baseline/entrega, `sql-verification.json`, `http-verification.json`, `public-assets.json`, resultados da publicação e screenshots em `evidence/`. O índice anterior foi guardado em `index.html.before`; assets antigos permanecem no `frontend/dist`.

Para reverter a interface, restaurar o índice anterior nesse ambiente ou republicar o frontend do commit anterior, com a configuração HML própria. As extensões de consulta são compatíveis com o frontend anterior. Para reversão completa, reverter o commit desta branch somente em HML e reiniciar sua API com a identidade de manutenção apropriada. Não há alteração de dados ou schema a desfazer.
