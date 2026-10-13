# ExecPlan — revisão completa do Analytics Evolution

## Objetivo

Revisar as fases implementadas e corrigir inconsistências reproduzidas em cálculos, filtros, escopo, drawer, alertas e exportação, somente em homologação. O desenho da Fase 10 será revisado sem criar/aplicar migration ou implementar mutações.

## Estado inicial verificado

- Branch `feature/analytics-evolution-hml`, HEAD `82f3415fc358e3f5152a9ee4d0fad53594d264e5`.
- Working tree com alterações anteriores das Fases 10–12 e identificação dos alertas: routes V2, serviço V1, testes V1, status, API client, filtros, dashboard/teste e CSS modificados; relatório/service/teste V2, planos 10/11, relatório QA, evidências e componente Relatórios não rastreados. Preservar tudo.
- Baseline imediatamente anterior: backend 602 aprovados/88 pulados com sondas PostgreSQL read-only; frontend 279 aprovados/57 arquivos; lint 0 erros/45 avisos; build aprovado.

## Arquivos previstos

Componentes e hooks de Analytics, entry point, testes correspondentes, serviços V2 de combustível/condutores e exportação quando houver divergência comprovada, relatório de QA/status e evidências. Nenhum arquivo de produção.

## Alterações funcionais proibidas

Migration, DDL/DML operacional, workflow novo de alertas, classificação inferida de manutenção, taxa de utilização sem denominador, mudança silenciosa dos critérios aprovados, troca de biblioteca ou deploy de produção.

## Passos de implementação

1. Confrontar planos de fases, código real, contratos, SQL de escopo/período e testes.
2. Reproduzir/corrigir ordenação temporal das regras de combustível compartilhadas com Condutores.
3. Corrigir navegação que recria filtros e controles de ranking inacessíveis no estado vazio.
4. Tornar paginação cancelável e impedir respostas antigas de afetarem outro contexto; manter origem e acesso ao registro da posse no drill-down de km.
5. Restringir requests V1 às fontes exibidas, cancelar requests substituídos e tratar erros binários de ambos os exportadores.
6. Verificar condutor cadastrado sem evento, mantendo os limites de permissão e organização.
7. Executar testes focados, suítes completas, lint/build, sonda HML somente leitura e inspeção visual se houver sessão disponível.
8. Atualizar QA/status e registrar resultados, arquivos e limitações.

## Validação visual

Reutilizar tokens/layout. Verificar rankings vazios, filtros ao alternar abas, drawer/pilha e mensagens. A falta de sessão autenticada será explicitada; não declarar screenshots históricos como validação atual.

## Testes e build

Testes de regressão dos defeitos, backend completo com probes PostgreSQL opt-in somente leitura, frontend `npm run test`, `npm run lint`, `npm run build`, `git diff --check`. Não aplicar migrations para testar upgrade/downgrade inexistentes de Analytics.

## Resultado

Concluído em 13/10/2026. [Relatório final](REVIEW_2026_10_13.md) registra a matriz das fases, defeitos reproduzidos/corrigidos, arquivos e limitações. Backend completo com sondas read-only: **608 aprovados/88 pulados**; frontend **285 aprovados/57 arquivos**; lint **0 erros/45 avisos preexistentes**; build e diff check aprovados.

Sonda read-only confirmou sete igualdades entre visões, zero escritas e os doze exports. Todas as páginas PDF têm texto dentro dos limites. Navegador com fixtures: 48 casos e fluxos/teclado/falhas. A sessão pública ficou disponível no fim: outras 48 combinações autenticadas, bundle atual, filtros/pilha/registros e downloads PDF/XLSX executivos confirmados. Somente runtime HML isolado reiniciado; sem commit/push ou produção.

## Pendências / decisões

Fase 10 continua apenas proposta e aguarda autorização específica. Revisão do código e correções não autorizam promoção à produção nem substituem aprovação visual autenticada.

## Rollback

Reverter apenas os diffs desta revisão, preservando as alterações de trabalho anteriores. Sem rollback de banco.
