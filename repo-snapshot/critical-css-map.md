# Mapa de seletores do `styles.css` no snapshot analisado

> Linhas são aproximadas para o HEAD `12150b19919b999cd47668abe4c3e6b5f3504329`; confirme no working tree local.

| Área | Seletores / região observada |
|---|---|
| tokens light | `:root` — início do arquivo |
| tokens dark | `:root[data-theme='dark']` — ~linha 111 |
| environment banner | `.environment-banner` — ~linha 180 |
| shell | `.app-shell` — ~linha 724 |
| sidebar | `.app-sidebar` — ~linha 737 |
| nav icon/item | `.nav-icon`, `.nav-link` — ~linha 900 |
| topbar | `.app-topbar` — ~linha 1000 |
| surface | `.surface-panel` — ~linha 1305 |
| KPIs | `.metrics-grid`, `.metric-card` — ~linha 1310 |
| dashboard hero | `.hub-hero` — ~linha 1353 |
| dashboard actions | `.hub-action-card`, `.hub-side-card` — ~linha 1376 |
| filtros | `.filter-row`, `.filter-inline`, `.toolbar-card` — ~linha 1482 |
| tabela | `.data-table` — ~linha 1612 |
| status | `.status-badge` — ~linha 1646 |
| desktop layout | media query >= 900/1100 — regiões ~2800–3150 |
| importação | `.data-import-*` — região ~3600 |
| pagamentos | `.payment-*` — região ~3900–4100 |
| densidade desktop atual | `body.internal-app-active ...` — ~linha 5009 em diante |

## Consequência

O bloco `body.internal-app-active` no fim do arquivo sobrescreve muitos estilos anteriores e é uma das razões para a aparência muito compacta observada nos prints. A estratégia do pacote importa `frontend-evolution.css` depois do arquivo atual para permitir ajustes controlados sem apagar centenas de regras existentes na Fase 1.
