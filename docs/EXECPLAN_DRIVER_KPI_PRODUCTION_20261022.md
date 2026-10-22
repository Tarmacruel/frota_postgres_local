# ExecPlan — Correção urgente dos indicadores de CNH

## Objetivo
Corrigir os KPIs de Condutores para totalizarem todos os registros dos filtros de busca/status/secretaria, sem depender da página. Torná-los filtros clicáveis, acrescentar CNHs não informadas e publicar em produção conforme autorização expressa de 22/10/2026.

## Estado inicial verificado
Homologação e produção limpas em 32110a2. Indicadores de CNH calculados via records.filter sobre dez registros; total de condutores já vinha da API. Backend 672 aprovados/109 ignorados, frontend 371 aprovados, lint 0 erros/40 avisos existentes na publicação anterior.

## Arquivos previstos
Repository/service/schema/rota de condutores, DriversPage, CSS local de indicadores, utilitário de alertas e testes de regressão. Documentação/status e evidências operacionais privadas.

## Alterações funcionais proibidas
Sem migration, alteração de dados, permissões, compartilhamento do catálogo de condutores, regras de matrícula/CNH, assinaturas ou fluxos de posse. PDF/XLSX continuam exportando a página atual, agora identificando o filtro de CNH. Não carregar o cadastro inteiro no navegador para contar.

## Passos de implementação
1. Uma resposta paginada com summary agregado no banco e cnh_status validado por enum.
2. Predicados comuns entre totais e lista: vencida antes de hoje; até 30 e até 60 dias incluindo hoje, cumulativos; não informada = número vazio/nulo ou validade nula. Dia municipal America/Bahia.
3. Summary considera busca/status/secretaria e independe do filtro CNH/página, permitindo alternar categorias. Total clicável limpa apenas CNH; novo filtro reseta página 1 e conserva demais filtros.
4. Indicadores acessíveis com estado selecionado, mensagem de resultados, remoção de filtro, carregamento sem zeros falsos e proteção contra respostas atrasadas. Alertas próximos de vencer coexistem com número ausente.
5. Testar limites, mais de uma página, filtros combinados, escopo vazio, erros e concorrência. Validar homologação, PR/checks, backup e ativação de produção com rollback.

## Validação visual
Desktop/mobile, claro/escuro, seleção/remoção de KPI, paginação e resultado vazio. Produção somente leitura, sem salvar cadastros.

## Testes e build
Testes backend/frontend direcionados e completos; lint/build; PostgreSQL real em transação somente leitura ou rollback em homologação; totais de produção confrontados com SQL independente. Três checks obrigatórios antes do merge.

## Resultado
Implementação validada em homologação: 681 testes backend aprovados/109 ignorados/8 avisos existentes; 375 frontend/66 arquivos; lint 0 erros/39 avisos anteriores e build HML concluído. Comparação com SQL independente no PostgreSQL em transação somente leitura cobriu cinco combinações de busca/status/secretaria, cinco filtros CNH e duas páginas. As contagens não variaram com a paginação e os totais filtrados corresponderam aos indicadores. Corrigido teste anterior de etiquetas que assumia ordem de UUIDs quando timestamps SQLite coincidiam; a verificação agora identifica a autora da nota, preservando a exigência funcional. Publicação autorizada, sem migration; resultado operacional, PR, backup e evidências serão registrados em `storage/backups/20261022-driver-kpis` da produção.

## Pendências / decisões
Até 60 inclui até 30, com texto explicativo. CNH ausente pode coexistir com vencida; sem duplicar o condutor dentro de um mesmo indicador. Preservar o catálogo compartilhado existente, inclusive filtro de secretaria solicitado por perfil Produção.

## Rollback
Backup de fonte, dist, configuração e dump consistente em storage/backups/20261022-driver-kpis na produção. Restaurar código/build anteriores e reiniciar só API se necessário. Sem migration ou restauração automática de banco.
