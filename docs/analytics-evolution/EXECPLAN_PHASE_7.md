# ExecPlan — Fase 7 — Manutenção

## Objetivo

Entregar em homologação custo registrado, custo/km, quantidade, duração média, intervenções abertas, ranking e repetição quantitativa por veículo, com histórico verificável no drawer.

## Estado inicial verificado

- Branch `feature/analytics-evolution-hml`; HEAD `288656a647046ce987d67f5777175b3607026c3d`.
- `git status --short --branch` antes da edição: árvore limpa, branch um commit à frente de `origin/feature/analytics-evolution-hml`.
- Baseline: backend 576 aprovados/94 pulados; PostgreSQL somente leitura 11 aprovados; frontend 267 aprovados/54 arquivos; lint 0 erros/45 avisos existentes; build aprovado.
- Plano mestre, status, instruções de implementação, fase e especificação visual lidos. A fase está no pacote de origem porque o caminho `phases/` não existe na raiz.

## Arquivos previstos

- Serviço, rota e testes V2 de manutenção; cliente V2.
- Componente de Manutenção, testes, integração na página Analytics, drawer compartilhado e CSS pontual.
- Este plano e `11_STATUS.md`.

## Alterações funcionais proibidas

Sem mudança em produção, modelos, migrations, cadastro/edição de manutenção, permissões, escopo, rotas existentes, exportação ou outras fases. Não inferir preventiva/corretiva, causa da repetição, pagamento ou disponibilidade histórica.

## Passos de implementação

1. Consultar manutenção cuja data de início pertence aos dias civis encerrados filtrados, com escopo organizacional histórico V2 e tipo/veículo.
2. Agregar custo, contagem, abertas (`end_date IS NULL` no estado atual) e duração apenas de registros encerrados com intervalo válido; explicitar amostra e exclusões.
3. Calcular custo/km com custo apenas dos veículos com posses válidas no recorte e denominador dessas posses, identificando cobertura parcial.
4. Exibir ranking por veículo e quantidade de veículos com pelo menos duas intervenções iniciadas no recorte; chamar isso repetição quantitativa, sem inferir recorrência da mesma falha.
5. Abrir listas paginadas de registros por métrica e veículo; usar o GET de domínio para o registro individual e manter filtros/explicação na pilha.

## Validação visual

Inspecionar homologação autenticada em tema claro/escuro, desktop/celular, drill-down métrica → histórico → registro, Voltar/Escape e ausência de overflow. Salvar capturas.

## Testes e build

Testes de cálculo, escopo, autorização, SQL PostgreSQL somente leitura e interface; `npm run test`, `npm run lint`, `npm run build`, backend pytest, `git diff --check`.

## Resultado

Implementada somente em `feature/analytics-evolution-hml`. A API V2 usa uma consulta agrupada de intervenções e a fonte V2 de posses válidas; listas são paginadas e exigem `maintenance:view` além de `analytics:view`. A tela mostra custo, custo/km, quantidade, duração, abertas, repetição quantitativa e ranking. O drawer preserva filtros e fórmula e abre o GET de domínio de manutenção. Nenhum modelo, migration, classificação por texto ou fluxo de edição foi alterado.

Verificação: backend completo 579 aprovados/95 pulados; 10 testes focados com PostgreSQL HML somente leitura; frontend 270 aprovados/55 arquivos; lint 0 erros/45 avisos preexistentes; build e `git diff --check` aprovados. API HML local e pública responderam 200 com os mesmos dados; todos os cinco subconjuntos do histórico responderam 200. Chromium autenticado: métrica → histórico → registro, Voltar, claro/escuro desktop e escuro celular 390 px sem overflow horizontal, console final 0 erros/0 avisos. Capturas em `output/playwright/analytics-phase-7/01-maintenance-light-desktop.png` a `05-maintenance-dark-mobile-full.png`.

## Pendências / decisões

O modelo tem datas, custo e veículo, mas não classificação estruturada preventiva/corretiva. A fase foi implementada somente com os campos existentes; não houve necessidade de migration. “Aberta” é o estado atual dos registros iniciados no recorte, não uma reconstrução histórica. A duração é o intervalo cadastrado e não comprova indisponibilidade operacional. Validação funcional/visual pelo responsável permanece pendente.

## Rollback

Reverter o commit específico da Fase 7 na branch de homologação, preservando o checkpoint das Fases 4–6.
