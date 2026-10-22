# ExecPlan — Indicadores interativos de todas as telas — homologação

## Objetivo
Pedido funcional de 22/10/2026: tornar os KPIs clicáveis, filtrar/detalhar seus dados completos e incluir indicadores úteis à operação. Somente HML. Esta demanda autoriza as extensões de consulta/contrato necessárias aos totais e filtros; não é apenas a iniciativa de redesign descrita no runbook. Não há mudanças de schema ou de regras de negócio.

Tese visual: indicadores compactos sobre as superfícies e cores institucionais existentes, com seleção e foco inequívocos, sem competir com as tabelas.
Conteúdo: título/filtros, indicadores, contexto do filtro ativo e lista paginada; detalhes por drawer quando filtrar não representar a métrica.
Interação: seleção e remoção por clique/teclado, transição curta de borda/superfície, carregamento sem contagens falsas; respeitar movimento reduzido e toque.

## Estado inicial verificado
- Raiz HML D:\FROTAS\frota_emprestimos_testes; produção D:\FROTAS\frota_certificado_homologacao não será editada.
- HEAD inicial c2226ac; working tree limpo. Branch criada feature/interactive-kpis-hml-20261022.
- Baseline frontend aprovado: 375 testes, lint 0 erros/39 avisos e build HML. Logs storage/backups/20261022-interactive-kpis.
- Condutores já têm KPI por consulta global e filtro; diversos módulos têm totais no banco, porém abastecimentos/importações ainda contêm contadores locais. Dashboard e vários painéis não têm ação.

## Arquivos previstos
Componente/hook compartilhados de indicadores; páginas operacionais e administrativas; componentes de analytics; contexto de consulta SQL e pequenos pontos de integração nas listagens existentes. Testes de contagens/filtros/escopo e interação. Nenhuma migration.

## Alterações funcionais proibidas
Produção, autenticação, permissões, assinatura, regras de manutenção/posse/pagamento, dados de negócio reais, links públicos e emissão PDF/XLSX. Não baixar todas as páginas para calcular KPI no navegador.

## Passos de implementação
1. Inventariar métricas e confirmar baseline.
2. Consultas SQL agregadas sobre a mesma base filtrada e autorizada de cada listagem, antes de paginação. Filtro de indicador separado dos filtros gerais; agregados estáveis quando um indicador é escolhido.
3. Indicadores acessíveis, refletidos na URL, seleção/remover/reset de página; exportações seguem o filtro.
4. Dashboard com atalhos filtrados; analytics/pagamentos com detalhamento pertinente, cadastros/importações com navegação ou filtro contextual.
5. Testar SQL real somente leitura, permissões, paginação, respostas atrasadas, teclado, temas e mobile. Publicar somente HML com configuração própria.

## Validação visual
Capturar desktop claro/escuro e 390px em HML, seleção, zeros, remoção e detalhes. Usar conta existente sem salvar registros reais.

## Testes e build
Frontend test/lint/build; backend focados e suíte aplicável; SQL independente com transação read-only no cluster 5441. Registrar resultados e limitações.

## Resultado
Concluído e publicado somente em HML. 79 definições SQL em 13 módulos; início, CNH, cadastros, importações e composição analítica integrados. Detalhamento em [INTERACTIVE_KPIS_HML_20261022.md](INTERACTIVE_KPIS_HML_20261022.md).

- Frontend final: 382 testes/67 arquivos aprovados, lint sem erros/39 avisos anteriores, build HML aprovado.
- Backend: 688 aprovados/109 ignorados; 8 avisos de depreciação existentes. Nenhuma migration.
- SQL real: 79 filtros/contagens e paginação aprovados em transação read-only no 5441; API verificou escopo vazio, escopo positivo, busca vazia e permissões administrativas.
- Browser: listagens, filtros, segunda página, dashboard, CNH, cadastros, composição financeira e combustível conferidos. Zero erros JS observados.
- Mobile real 390px CSS e claro/escuro: faixa interna com scroll, documento sem overflow lateral, seleção funcional; viewport e tema restaurados.
- Publicação com identidade de manutenção S4U, tarefa temporária removida, API HML saudável e configuração preservada. Tarefa diária das 06h permanece Ready.
- Referências dos nove assets observadas no navegador e dois CSS públicos conferidos byte a byte com o build. CLI anônima teve 403; conferência autenticada registrada.
- Produção sem mudanças locais e readiness saudável.

## Pendências / decisões
Uma entrega funcional abrangente autorizada pelo usuário, incremental sobre as páginas existentes. Os indicadores de soma abrem os registros que compõem a soma; não se apresentam como contagens. Metadados técnicos sem significado operacional não viram KPI. Sem pendência funcional conhecida nesta entrega; publicação em produção depende de nova solicitação.

## Rollback
Índice/bundle anterior em storage/backups/20261022-interactive-kpis e assets antigos preservados. Código na branch HML, configuração e produção intactas. Sem alterações de banco para desfazer.
