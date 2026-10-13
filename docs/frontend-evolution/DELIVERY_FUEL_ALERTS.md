# Entrega — Motivo dos alertas no histórico de abastecimentos

Data: 13/10/2026. Ambiente exclusivo: `D:\FROTAS\frota_emprestimos_testes`, branch `feature/analytics-evolution-hml`. [Plano e baseline](EXECPLAN_FUEL_ALERTS.md), [preflight](evidence/fuel-alerts/preflight.txt).

## Resultado

- O badge **Alerta** é um botão. Hover ou foco mostra caixa com o motivo; clique abre drawer lateral com motivo, placa, data, secretaria, posto, combustível, litros, valor, hodômetro e rendimento registrado.
- Texto vem de `anomaly_details` do registro já autorizado/carregado. Não há nova API, cálculo, requisição, persistência ou edição. Motivo ausente: “Motivo não informado no registro deste abastecimento.”
- Tooltip em portal evita corte pela tabela, permite mover o ponteiro para ler e é dispensável por Escape. Após a correção posterior, a rolagem da página/tabela fecha a caixa, e somente um resumo pode estar aberto. Drawer reutiliza Modal e seus controles de foco/Escape. Filtros, paginação, comprovantes, retificação e indicadores Regular preservados.
- Flag operacional continua distinta da Central de casos de Analytics V2. O alerta sinaliza conferência e não comprova irregularidade.

## Arquivos desta demanda

- `frontend/src/components/FuelSupplyAlertBadge.jsx` e `.test.jsx`.
- `frontend/src/pages/FuelSuppliesPage.jsx` e `.test.jsx`.
- `frontend/src/utils/fuelSupplyDetails.js`, `frontend/src/styles/fuel-alerts.css`, `frontend/src/main.jsx`.
- Este relatório, ExecPlan, status frontend/analytics e evidências.
- [Inventário completo do checkpoint, incluindo as pendências anteriores autorizadas](evidence/fuel-alerts/checkpoint-files.txt). Entregas anteriores: [revisão Analytics](../analytics-evolution/REVIEW_2026_10_13.md), [Fase 10 persistência](../analytics-evolution/DELIVERY_PHASE_10.md), [Fase 11](../analytics-evolution/EXECPLAN_PHASE_11.md), [Fase 12](../analytics-evolution/QA_PHASE_12.md).

## Validação

- Frontend completo: **301 aprovados / 59 arquivos**; inclui seis novos testes de motivo/ausência, hover/foco/Escape, leitura do tooltip, scroll e filtros/ações.
- Backend completo com sondas PostgreSQL somente leitura e workflow em schemas descartáveis: **644 aprovados / 88 pulados**, sete avisos preexistentes.
- Lint: **0 erros / 45 avisos preexistentes**. Build aprovado; alerta de chunk >650 KB preexistente. Bundle público final `index-HAep1CnS.js`.
- HML pública autenticada: motivo real conferido, resumo por foco, drawer, Tab contido, Escape e foco devolvido ao badge, busca conservada e zero erros JS. Desktop 1912×922 e mobile 390×844, ambos os temas: sem overflow da página/conteúdo. Tema claro e viewport original restaurados; somente a aba de QA foi fechada.
- Capturas de drawer: [desktop claro](evidence/fuel-alerts/drawer-light-desktop.png), [desktop escuro](evidence/fuel-alerts/drawer-dark-desktop.png), [mobile claro](evidence/fuel-alerts/drawer-light-mobile.png), [mobile escuro](evidence/fuel-alerts/drawer-dark-mobile.png).
- `git diff --check` aprovado antes do commit.

## Limites e checkpoint

Hover e passagem do ponteiro cobertos em regressão automatizada; navegador real validou foco e drawer. Não realizado ensaio de carga ou login real de cada perfil nesta demanda. Sem mudança de banco/produção. A migration 0052 já aplicada à HML na etapa anterior não foi reaplicada.

O usuário autorizou commit de todas as modificações pendentes. Commit funcional `9eae46a62dce221940d17eea3d588e096d09e6ea`, 112 arquivos, working tree limpo após o checkpoint. Checkpoint local identificado pela mensagem `feat(hml): consolidar analytics e detalhar alertas de abastecimento`. O inventário registra os arquivos incluídos; não houve push nem deploy de produção. Registros anteriores com “sem commit” descrevem o momento de cada execução, superado por este checkpoint.

## Correção posterior — Acúmulo de caixas ao rolar

- Screenshot do usuário revelou que o reposicionamento no scroll cancelava o timer de saída e mantinha cada caixa aberta. O histórico agora controla um único badge ativo; scroll da página ou tabela dispensa o resumo mesmo com o botão visível. A rolagem dentro da própria explicação longa permanece possível.
- Branch `feature/analytics-evolution-hml`, HEAD inicial `ceac415`, working tree inicialmente limpo. Arquivos: `FuelSupplyAlertBadge.jsx`, `FuelSupplyAlertBadge.test.jsx`, `FuelSuppliesPage.jsx`, `FuelSuppliesPage.test.jsx`, este relatório, ExecPlan, status frontend/Analytics e duas evidências.
- Regressão cobre dois alertas sucessivos sem mouseleave, timer pendente durante scroll, botão ainda visível, contêiner ancestral, foco e drawer. **15 testes focados**, frontend completo **304 aprovados/59 arquivos**, lint **0 erros/45 avisos preexistentes**, build aprovado com aviso de chunk preexistente, diff check aprovado.
- HML pública autenticada em desktop claro/escuro: caixa fechou ao rolar para baixo/cima; troca de foco entre dois alertas manteve exatamente uma caixa; motivo e drawer preservados, zero erros JS. Bundle `index-D7olhyya.js`. Tema claro restaurado e aba de QA fechada. [Resultado](evidence/fuel-alerts/scroll-fix-qa.json), [captura após rolagem](evidence/fuel-alerts/scroll-dismiss-dark.png).
- Mudança somente frontend, sem backend/migration/banco/produção/push. Commit corretivo continua a demanda autorizada.
