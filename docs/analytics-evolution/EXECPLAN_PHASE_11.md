# ExecPlan — Fase 11 — Relatórios

## Objetivo

Exportar PDF/XLSX dos recortes V2 já aprovados, com período, filtros, fonte e cobertura. Remover opções visuais que o endpoint V1 ignora. Preservar V1 e proteção contra fórmulas.

## Estado inicial verificado

- Branch `feature/analytics-evolution-hml`, HEAD `82f3415fc358e3f5152a9ee4d0fad53594d264e5`.
- `git status --short --branch`: sincronizada com origin, com `11_STATUS.md` modificado e `EXECPLAN_PHASE_10_PART_1.md` não rastreado, ambos da etapa documental anterior. Preservar esses arquivos.
- `/api/analytics/export` aceita `export_format`, `period_days`, `vehicle_type`, `organization`. O frontend envia também `include_charts` e `include_details`, que o backend não declara e não usa. O arquivo V1 contém insights fixos.
- V2 fornece `summary`, `costs`, `fuel`, `maintenance`, `utilization` e `drivers` somente leitura. A Fase 10 tem apenas desenho, sem casos persistidos; perfis de workflow de alertas e personalizado não têm fonte/exportador aprovado ainda.

## Arquivos previstos

- `backend/app/api/routes/analytics_v2.py` e novo serviço de exportação V2; testes focados de conteúdo, filtros, permissão e headers.
- `frontend/src/api/analyticsV2.js`, `frontend/src/components/analytics/AnalyticsReports.jsx`, testes e `frontend/src/pages/AdminAnalyticsDashboard.jsx`.
- Este ExecPlan e `11_STATUS.md`.

## Alterações funcionais proibidas

Nenhuma migration, mutação, alteração de fórmula V1/V2, autenticação, escopo, rota existente ou dado operacional. Não afirmar TCO completo, pagamento, consumo efetivo ou casos de alerta persistidos.

## Passos de implementação

1. Adicionar rota V2 paralela com enum fechado de perfil e formato; reutilizar validação de filtros civis e escopo organizacional.
2. Gerar conteúdo por perfil a partir dos serviços V2 existentes, mantendo custo realizado e sinistro estimado separados. Exportar fontes, metodologia e cobertura. Respeitar permissões de registros/condutores como nos endpoints de origem.
3. Escapar **toda** célula textual XLSX com o sanitizador V1; renderizar PDF com texto escapado. Incluir cabeçalho institucional, período/filtros, nomes de arquivos e headers privados.
4. Substituir a seção Relatórios por formulário específico com apenas seis perfis V2 efetivamente suportados e PDF/XLSX. Manter exportação V1 acessível nas análises anteriores, sem caixas de seleção ignoradas.
5. Testar conteúdo, headers, rejeição de parâmetros não aceitos, permissões, XLSX hostil, frontend completo, lint, build e visual claro/escuro.

## Validação visual

Conferir formulário e feedback de exportação em desktop e viewport reduzida, temas claro/escuro, sem alterar tokens existentes. Registrar capturas se o ambiente autenticado estiver disponível.

## Testes e build

Executar testes de backend pertinentes e `npm run test`, `npm run lint`, `npm run build` no frontend. Registrar resultado em `11_STATUS.md`.

## Resultado

Implementado somente em HML. Nova exportação V2 em seis perfis com PDF/XLSX, filtros civis, fonte/critério, tendências e cobertura pertinentes. Custo operacional registrado e sinistro estimado permanecem separados. A V1 continua disponível como “insights anteriores”; os controles `include_charts` e `include_details` foram retirados da UI e do request. Nenhuma migration ou mutação operacional.

Testes: backend completo 591 aprovados/97 pulados; frontend completo 278 aprovados/57 arquivos; lint 0 erros/45 avisos preexistentes; build aprovado. Os 12 arquivos (6 perfis × 2 formatos) foram gerados em transação PostgreSQL HML somente leitura e seus cabeçalhos binários validados. API local HML respondeu 401 à nova rota sem sessão e o HTML local aponta para o bundle novo. `git diff --check` aprovado.

Validação visual autenticada pendente: a sessão do navegador de homologação expirou e redirecionou para login. Não há screenshot novo nem afirmação de validação visual/pública dessa interface. A amostra PDF foi validada por geração, estrutura e testes; não houve renderização PNG manual nesta execução.

## Pendências / decisões

Perfis “alertas de workflow” e “personalizado” ficam fora da interface porque não há fonte/contrato de exportação implementado. A V1 de insights permanece disponível pelo endpoint anterior e não é chamada de workflow.

## Rollback

Reverter apenas arquivos da Fase 11; V1 permanece funcional. Nenhum schema ou dado é alterado.
