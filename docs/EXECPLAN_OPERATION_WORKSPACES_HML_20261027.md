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
5. [x] Publicação atômica somente frontend, QA desktop/mobile/claro/escuro/teclado, evidências e documentação.

## Validação visual
Tese: superfície institucional densa e legível, orientada a busca, números e registros; eliminar molduras e espaços duplicados. Plano de conteúdo: título/ação, seletor de área, busca/filtros, KPIs e uma tabela. Contexto de contrato e resultado de emissão permanecem quando aplicáveis. Interação: troca de área imediata, filtros recolhíveis e menu de ações reutilizado, com foco visível e transições existentes; sem hero, imagens decorativas ou animação ornamental.

Conferir contact sheet alvo e capturas atuais. Medir cabeçalho e início da tabela antes/depois; zero overflow no corpo em 390/360, claro/escuro. Não preencher artificialmente o espaço abaixo de listas com poucos registros.

## Testes e build
Cobrir carregamento exclusivo, preservação de filtros/paginação ao alternar, links antigos de histórico/KPI, retorno do contrato, permissões e atalhos de emissão/lote/guia. Exportação continua carregando todas as ordens filtradas só quando solicitada. Suíte completa frontend, lint e build --mode homologation em storage/backups/20261027-operation-workspaces/frontend-candidate.

## Resultado
Publicada somente no frontend HML em 27/10/2026. Fonte principal f53a825 e refinamento 8528f76: o seletor de exportação recebeu texto visível Exportar após a conferência visual para diferenciar o menu de ações gerais. Prop opcional do ActionMenu preserva o acionador anterior em todos os outros usos.

- 517 testes em 81 arquivos aprovados. Após o refinamento de texto do acionador, 41 regressões direcionadas, lint e build HML novamente aprovados; lint permanece em 0 erros/39 avisos anteriores. Asserções de exportação carregam todas as ordens filtradas só sob demanda. Nenhum arquivo de backend, teste de backend ou schema foi alterado.
- Textos introdutórios retirados de 16 páginas e de Abastecimentos; o segundo cabeçalho de ordens e a moldura do histórico foram substituídos pela navegação de áreas. Modais, avisos e instruções de preenchimento permanecem.
- Medições desktop 1600×900: cabeçalho de Abastecimentos 89,90 → 43,22 px e tabela y=544,96 → 378,20 (166,76 px acima). Sinistros 89,90 → 39,24 px e tabela y=387,54 → 332,87. Uma única listagem presente, inclusive ao consultar histórico; sem espaço artificial para preencher listas curtas.
- QA autenticada: alternância e busca mantida; ordens filtradas com página2 preservada após ir/voltar; filtros adicionais recolhidos/expandidos; menu de exportação por ArrowDown/Escape e foco restaurado; emissão em lote acessível pelo novo menu e cancelada sem selecionar/gravar. Contexto do contrato e links antigos também cobertos pelas regressões.
- Celular real medido em 390×844 e 360×801 CSS, claro/escuro, uma área por vez, navegação com alvos de 44 px e zero overflow horizontal, inclusive com filtros expandidos. Capturas e geometria no backup privado. A simulação de viewport do navegador vinculou-se à guia original; seu estado foi conferido sem formulário/valores pendentes, atualizado e devolvido à rota Abastecimentos, tema claro e dimensões originais1597×930.
- Publicação final às 09:25:38, com assets copiados antes da troca atômica de index.html. Nove assets servidos conferidos por conteúdo; entrada final /assets/index-Cy-gfDo7.js também observada no navegador público. Configurações, código de backend, 75 tabelas por fingerprints e ambos os PIDs de API preservados. Produção permanece limpa em31543d4. Nenhuma gravação de negócio, reinício, migration ou restauração.
- Rotina das 06h permanece saudável, resultado0, próxima execução28/10 às06h. Backup contém fonte/build/configurações anteriores e extrato de verificação sem dados pessoais. Nenhum documento de produção foi copiado para o código ou alterado.

## Pendências / decisões
- Ordens é a entrada padrão para quem pode consultá-las. Link antigo por veículo/indicator abre Histórico; order_indicator e criação/contrato abrem Ordens, salvo escolha explícita de área. Sem permissão de ordens, exibir somente Histórico.
- A troca de área preserva busca, filtros e página em memória; parâmetros de contrato/retorno e indicadores não são apagados. Filtros e totais continuam independentes e calculados pelo servidor.
- A remoção de descrições introdutórias no cadastro de empréstimos não altera o vínculo de origem; seus dados e regras continuam nos formulários e no backend. Esta fase trata somente da organização da interface.

## Rollback
Preservar arquivos atuais e restaurar index/build anterior do backup com publicação de assets antes da troca atômica de index.html. Reverter commits de frontend desta branch se necessário. Não reiniciar API, PostgreSQL ou Cloudflare, nem restaurar dados. Nenhuma configuração alterada.
