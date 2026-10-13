# ExecPlan — Fase 4 — detalhamento contextual

## Objetivo
Abrir veículo/condutor de rankings, alertas, gráficos e tabelas, percorrer registros do período e voltar mantendo filtros.

## Estado inicial verificado
- Branch: `feature/analytics-evolution-hml`; HEAD: `74c53a7ece48e40a9676127b31653d313482277b`.
- `git status --short --branch`: branch alinhada com origin, sem alterações.
- Baseline confirmado antes da mudança funcional: frontend 256 testes/52 arquivos; lint anterior 0 erros/45 avisos.
- Plano mestre e fase consultados no pacote original; caminhos de raiz ainda não instalados.

## Arquivos previstos
- API V2 de Analytics e serviço de detalhe somente leitura; testes de rota/escopo.
- Componentes e estilos de Analytics, cliente de API e testes de interação.
- Este plano e `11_STATUS.md`.

## Alterações funcionais proibidas
- Produção, deploy, banco, migrations, V1, autenticação, regras de posse/abastecimento e edição de registros.

## Passos de implementação
1. Reutilizar filtro V2 e escopo de organização; entregar identidade, indicadores e timeline do recorte para veículo/condutor.
2. Usar a pilha existente no drawer e APIs de domínio para consulta de registro.
3. Conectar todos os pontos com entidade identificável; carregar a explicação da origem quando métrica/alerta.

## Validação visual
- Contact sheets atual/alvo conferidos. Chromium autenticado no HML local: alerta → veículo → abastecimento; drawer claro/escuro desktop, escuro mobile e condutor sem eventos V2. Capturas em `output/playwright/analytics-phase-4/`.

## Testes e build
- Testes focados backend/frontend, `npm run test` (258), `npm run lint` (0 erros/45 avisos anteriores), `npm run build` e `git diff --check` aprovados. Backend Analytics: 44 testes. `compileall` aprovado.

## Resultado
- Fase 4 implementada somente em HML. O endpoint V2 agrega identidade, totais e eventos paginados com escopo histórico e permissões de fonte. Drawer usa pilha e GETs de domínio, sem edição duplicada. Filtros/rota mantidos.

## Pendências / decisões
- O painel V1 usa `period_days`; o detalhe V2 deve usar dias civis encerrados equivalentes, com essa diferença explícita.
- Ranking V1 pode incluir condutor sem eventos na janela V2; o drawer mostra contexto vazio, sem criar dados. Sem permissão de módulo, somente agregados Analytics ficam visíveis.
- Aguardando validação da Fase 4. Nenhuma fase seguinte iniciada.

## Rollback
- Reverter somente os arquivos desta fase; nenhum schema ou dado persistido é alterado.
