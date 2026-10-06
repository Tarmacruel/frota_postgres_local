# Estratégia para economizar contexto/créditos do Codex

## Não carregar tudo

O repositório tem páginas grandes (`PossessionPage.jsx`, `PaymentProcessesPage.jsx`, `DataImportsPage.jsx`) e um CSS global muito extenso. Trabalhe por localização de seletor/componente.

## Fluxo por fase

1. Ler o prompt da fase.
2. Ler o ExecPlan/status.
3. Abrir somente os arquivos listados para a fase.
4. Abrir o contact sheet.
5. Abrir 1–4 screenshots da fase.
6. Usar o starter-kit em vez de gerar componentes do zero.
7. Testar.
8. Atualizar status.

## Reutilização pronta

O diretório `starter-kit/` já fornece:

- folha de tokens/overrides;
- miniaturas SVG;
- componente `VehicleThumbnail`;
- `PageHeader`;
- `StatCard`;
- `StatusChip`;
- `IconButton`;
- `ActionMenu`;
- exemplos de composição.

O Codex deve adaptar, não regenerar esses arquivos sem motivo.

## Evitar prompts vagos

Use os prompts de `prompts/`. Eles já contêm escopo, arquivos, referências e critério de parada.
