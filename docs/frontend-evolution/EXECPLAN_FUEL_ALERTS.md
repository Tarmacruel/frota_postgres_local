# ExecPlan — Resumo dos alertas de abastecimento

## Objetivo
Exibir o motivo registrado no histórico por hover/foco e por drawer lateral ao clicar. Commitar também as alterações anteriores do Analytics autorizadas pelo usuário, somente em homologação.

## Estado inicial verificado
- Branch `feature/analytics-evolution-hml`, HEAD `82f3415fc358e3f5152a9ee4d0fad53594d264e5`.
- [Preflight com status completo](evidence/fuel-alerts/preflight.txt). Diffs anteriores preservados.
- Últimos gates: frontend 295 testes; lint 0 erros/45 avisos; build aprovado. Backend 644 aprovados/88 pulados.
- API já entrega `is_consumption_anomaly` e `anomaly_details`; screenshot e working tree confirmam badge sem interação.

## Arquivos previstos
FuelSuppliesPage, componente específico de resumo, CSS centralizado, testes, main (import CSS), status/evidências. Alterações anteriores de Analytics entram no checkpoint autorizado.

## Alterações funcionais proibidas
Alterar detector, casos de workflow, permissões, escopo, banco ou produção; recalcular ou inventar motivo; duplicar edição/comprovante.

## Passos de implementação
1. Botão no badge de alerta; tooltip em portal para evitar clipping pela tabela, hover/foco/Escape.
2. Drawer usando Modal existente, motivo registrado e dados do mesmo registro, sem nova requisição ou mutação.
3. Tests, gates completos, QA em HML, relatório e commit das pendências autorizadas.

## Validação visual
Claro/escuro, desktop/mobile; hover/foco, drawer, Escape/retorno de foco, preservação do histórico.

## Testes e build
Frontend 301 aprovados/59 arquivos, backend 644 aprovados/88 pulados, lint 0 erros/45 avisos preexistentes, build aprovado. Diff check aprovado. [Relatório](DELIVERY_FUEL_ALERTS.md).

## Resultado
Implementado e validado em HML pública, quatro combinações de tema/viewport, foco/Escape e filtro preservados. Corrigido desaparecimento do tooltip na rolagem automática do navegador ao focar. Checkpoint autorizado inclui também os diffs anteriores do Analytics.

## Pendências / decisões
Motivo ausente terá mensagem explícita. Flag operacional não equivale aos casos de Analytics V2. Nenhum push ou deploy de produção solicitado.

## Rollback
Reverter apenas o diff desta demanda; não reverter migration 0052 com histórico nem os trabalhos anteriores.

## Correção posterior — 13/10/2026 — Acúmulo de tooltips ao rolar
- Preflight: branch `feature/analytics-evolution-hml`, HEAD `ceac415a706d0ada9d8fe7e0f54f3fb884a315ee`, working tree limpo; dois commits locais à frente do remoto.
- Screenshot do usuário e código confirmam: cada badge mantém seu tooltip; scroll cancela o timer de fechamento e reposiciona a caixa, mantendo caixas anteriores abertas.
- Corrigir scroll para dispensar o resumo e controlar um único badge ativo no histórico. Preservar foco, Escape e drawer. Substitui a decisão anterior de acompanhar scroll.
- Arquivos: badge/testes, FuelSuppliesPage/testes, status/relatório e evidências. Baseline: 301 testes frontend, lint 0 erros/45 avisos, build aprovado.
- Concluído: 15 testes focados, 304 testes frontend/59 arquivos, lint 0 erros/45 avisos preexistentes, build e diff check aprovados. Bundle público `index-D7olhyya.js`; sessão real em claro/escuro confirmou scroll fechando caixa com botão visível, foco entre alertas com no máximo um resumo e drawer preservado. [Evidência](evidence/fuel-alerts/scroll-fix-qa.json), [captura](evidence/fuel-alerts/scroll-dismiss-dark.png). Sem backend/banco/produção; commit corretivo autorizado pela continuidade da demanda.
