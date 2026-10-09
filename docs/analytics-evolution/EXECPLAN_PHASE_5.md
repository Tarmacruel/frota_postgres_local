# ExecPlan — Fase 5: Custos

## Objetivo

Entregar em homologação a análise de custos V2 por período, fonte, veículo e secretaria, com tendência, Pareto, custo/km e caminho até registros de origem. Manter sinistros estimados fora do custo operacional.

## Preflight

- Branch: `feature/analytics-evolution-hml`.
- HEAD inicial: `74c53a7ece48e40a9676127b31653d313482277b`.
- `git status --short --branch`: alterações locais da Fase 4 em API V2, status e frontend Analytics; novos serviço/teste de detalhe e ExecPlan F4. Serão preservados.
- Planos mestre e fase lidos no pacote `FROTA_SIREL_ANALYTICS_EVOLUTION_PACKAGE/`, pois não há cópias nos caminhos raiz indicados.

## Arquivos previstos

- API/repositório/serviço/schema de Analytics V2 e testes focados.
- Cliente V2, seção Custos, integração em `AdminAnalyticsDashboard`, CSS centralizado e testes focados.
- Este plano e `11_STATUS.md`.

## Limites

Somente HML. Não alterar V1, modelos, migrations, autenticação, permissões, contratos de domínio, exportação ou deploy. Reutilizar responsabilidade histórica e km válido da V2. Valores ausentes não viram zero; custos registrados não são pagamento ou TCO completo.

## Execução

1. Agregar eventos por fonte, veículo e secretaria atribuída; reaproveitar totais e km da V2.
2. Expor listagem paginada de registros contribuintes com permissão por domínio.
3. Implementar filtros civis e visão Custos com composição, tendência, Pareto, secretaria, ranking e navegação até registro no drawer existente.
4. Testar cálculos, escopo, navegação e estados. Executar `npm run test`, `npm run lint`, `npm run build`, testes backend pertinentes e `git diff --check`.
5. Conferir claro/escuro e responsividade em HML; registrar evidências e estado final.

## Rollback

Reverter somente os arquivos desta fase a partir deste plano; preservar integralmente as alterações locais da Fase 4 identificadas no preflight.

## Resultado

- Visão de Custos V2, agregação por secretaria histórica e listagem paginada de eventos concluídas em HML. Estimativa de sinistro separada do custo operacional; multas por data de infração, em todos os status.
- Backend: 42 testes focados e 6 testes PostgreSQL somente leitura aprovados. Frontend: 262 testes/53 arquivos, lint 0 erros/45 avisos existentes, build aprovado. `git diff --check` aprovado.
- Navegação real validada de custo/km e secretaria até o registro de domínio; claro, escuro e celular sem overflow, console sem erros. Capturas em `output/playwright/analytics-phase-5/`.
- Comparação V1 por categoria e tendência de 12 meses preservadas em bloco sob demanda. Sem migration, commit, push ou produção.
- Pendente validação da Fase 5 pelo responsável. Nenhuma fase posterior iniciada.
