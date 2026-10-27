# ExecPlan — Abastecimentos e cabeçalhos operacionais — 27/10/2026

## Objetivo
Responder às quatro anotações do usuário: reduzir a altura vazia dos cabeçalhos e descrições genéricas; separar ordens de abastecimento do histórico confirmado em áreas selecionáveis, sem empilhar duas operações completas. Publicar somente frontend da homologação.

## Estado inicial verificado
- Branch inicial feature/hml-production-sync-20261027, HEAD b0377d8, árvore limpa. Nova branch feature/fuel-workspace-compact-headers-hml-20261027.
- Baseline anterior nesta mesma fonte: 511 testes frontend/81 arquivos, 38 direcionados finais, lint 0 erros/39 avisos, build HML aprovado. Sem alteração de backend desde a conciliação.
- Capturas do usuário coincidem com FuelSuppliesPage e ClaimsPage. Ordens e histórico possuem paginação, filtros e indicadores próprios, mas estão empilhados; dois efeitos carregam ambos mesmo sem intenção de consultar histórico.
- AGENTS, IMPLEMENT, PLANS, contexto, especificação visual e status lidos. Fase única autorizada pela revisão solicitada; não avança para outros redesigns ou produção.
- Backup privado em storage/backups/20261027-operation-workspaces: bundle Git, build servido e configurações anteriores. Não haverá restart ou necessidade de elevação da API.

## Arquivos previstos
FuelSuppliesPage e regressões de navegação; PageHeader e MobileFilters (variantes pequenas, sem nova biblioteca); folha CSS de workspace; chamadas PageHeader das telas para remover apenas introduções genéricas. main.jsx, status e este plano. Instruções de modais/formulários e avisos de negócio permanecem.

## Alterações funcionais proibidas
Sem backend, migrations, gravação de saldo, restauração diária, permissões novas, mudanças em cálculos/assinaturas/documentos, exclusão de ações ou publicação em produção. Preservar URLs antigas, contexto/retorno do contrato, KPIs globais, filtros, paginações, comprovantes, PDF/XLSX, cancelamento, prorrogação e retificação.

## Passos de implementação
1. [x] Inspecionar fonte, regras e baseline; criar branch e backup.
2. [x] Separar Ordens/Histórico por parâmetro view; reconhecer links antigos de indicador/veículo e contexto de contrato, manter estado por área e carregar apenas a selecionada.
3. [x] Cabeçalho compacto compartilhado; retirar introduções genéricas, consolidar ações secundárias e filtros adicionais.
4. [x] Regressões funcionais, suíte completa, lint e build candidato HML fora de dist.
5. [ ] Publicação atômica somente frontend, QA desktop/mobile/claro/escuro/teclado, evidências e documentação.

## Validação visual
Tese: superfície institucional densa e legível, orientada a busca, números e registros; eliminar molduras e espaços duplicados. Plano de conteúdo: título/ação, seletor de área, busca/filtros, KPIs e uma tabela. Contexto de contrato e resultado de emissão permanecem quando aplicáveis. Interação: troca de área imediata, filtros recolhíveis e menu de ações reutilizado, com foco visível e transições existentes; sem hero, imagens decorativas ou animação ornamental.

Conferir contact sheet alvo e capturas atuais. Medir cabeçalho e início da tabela antes/depois; zero overflow no corpo em 390/360, claro/escuro. Não preencher artificialmente o espaço abaixo de listas com poucos registros.

## Testes e build
Cobrir carregamento exclusivo, preservação de filtros/paginação ao alternar, links antigos de histórico/KPI, retorno do contrato, permissões e atalhos de emissão/lote/guia. Exportação continua carregando todas as ordens filtradas só quando solicitada. Suíte completa frontend, lint e build --mode homologation em storage/backups/20261027-operation-workspaces/frontend-candidate.

## Resultado
Implementação pronta para publicação HML: 517 testes/81 arquivos e 41 regressões direcionadas aprovadas, incluindo novas áreas, permissão, estado/paginação e erro tardio. Lint sem erros, com os 39 avisos do baseline; build --mode homologation aprovado em diretório candidato. Descrições retiradas de 16 cabeçalhos de página e dos dois cabeçalhos redundantes de abastecimentos; modais e instruções operacionais intactos. No baseline visual desktop 1600×900, cabeçalhos de Sinistros/Abastecimentos tinham 89,90 px; a tabela começava em y=387,54/y=544,96 respectivamente.

## Pendências / decisões
- Ordens é a entrada padrão para quem pode consultá-las. Link antigo por veículo/indicator abre Histórico; order_indicator e criação/contrato abrem Ordens, salvo escolha explícita de área. Sem permissão de ordens, exibir somente Histórico.
- A troca de área preserva busca, filtros e página em memória; parâmetros de contrato/retorno e indicadores não são apagados. Filtros e totais continuam independentes e calculados pelo servidor.

## Rollback
Preservar arquivos atuais e restaurar index/build anterior do backup com publicação de assets antes da troca atômica de index.html. Reverter commits de frontend desta branch se necessário. Não reiniciar API, PostgreSQL ou Cloudflare, nem restaurar dados. Nenhuma configuração alterada.
