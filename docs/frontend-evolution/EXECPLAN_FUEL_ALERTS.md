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
