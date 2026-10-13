# ExecPlan — Fase 8 — Utilização

## Objetivo

Entregar em HML medidas descritivas de posses, hodômetro e situação cadastral, com origem verificável e sem denominar o resultado “taxa de utilização”.

## Estado inicial verificado

- Branch `feature/analytics-evolution-hml`; HEAD `e81185e24ca561c4de15a7e4199c8d6947efffc0`.
- `git status --short --branch` antes da edição: árvore limpa e sincronizada com `origin/feature/analytics-evolution-hml`.
- Baseline da Fase 7: backend 579 aprovados/95 pulados; PostgreSQL focado 10 aprovados; frontend 270 aprovados/55 arquivos; lint 0 erros/45 avisos existentes; build aprovado.
- Plano mestre e fase lidos no pacote de origem porque `docs/analytics-evolution/00_MASTER_PLAN.md` e `phases/analytics-evolution/08_FASE_8_UTILIZACAO.md` não estão na raiz. Instruções, status, especificação visual, contexto frontend e contact sheets lidos.

## Arquivos previstos

- Serviço/rota/testes V2 de utilização, cliente API.
- Componente de Utilização/testes, integração na página Analytics, drawer compartilhado e eventual CSS pontual.
- Este plano e `11_STATUS.md`.

## Alterações funcionais proibidas

Sem produção, modelo, migration, edição de posse/manutenção, regras persistidas, V1, rotas existentes, autenticação, permissões ou exportação. Não inferir condução, disponibilidade histórica, horas em operação ou taxa de utilização.

## Passos de implementação

1. Definir universo do cadastro atual com tipo e lotação operadora atual; aplicar escopo organizacional V2 para os eventos históricos de posse.
2. Contar inícios/fins observáveis no recorte; medir duração apenas em posses encerradas inteiramente no período com intervalo válido e sem sobreposição; usar km de posses encerradas válidas já definido na V2.
3. Identificar última abertura/encerramento de posse observável até o fim do recorte e veículos sem evento de abertura/encerramento no período, sem alegar ausência de deslocamento real.
4. Mostrar ranking alto/baixo somente entre veículos com km válido; situação cadastral atual e manutenção sem fim registrado em blocos distintos, sem inferir disponibilidade operacional.
5. Agrupar por secretaria operadora atual, com metodologia explícita; abrir veículos e listas paginadas de posses no drawer, preservando filtros e explicação.

## Validação visual

Inspecionar HML autenticada em claro/escuro desktop e celular, ranking → histórico de posse, Voltar/Escape, estados vazios, overflow e console. Salvar capturas.

## Testes e build

Testes focados de SQL/cálculo/escopo/permissão e PostgreSQL somente leitura; suíte backend; `npm run test`, `npm run lint`, `npm run build`, `git diff --check`.

## Resultado

Implementada somente em `feature/analytics-evolution-hml`; commit funcional `0ce9df0`. A API V2 de Utilização cruza o cadastro atual com eventos de posse e o hodômetro inicial/final das posses encerradas válidas. A interface apresenta km por posse válida, quantidades e duração registrada, último evento conhecido, veículos sem evento no recorte, situação cadastral atual, manutenção sem fim, rankings e agrupamento por secretaria. O drawer abre listas paginadas de posses e o registro de origem, com filtros e regra de cálculo preservados. Sem modelo, migration, edição, dados imputados ou rótulo de taxa de utilização.

Verificação: backend completo 582 aprovados/96 pulados; 11 testes focados com PostgreSQL HML somente leitura; frontend completo 273 aprovados/56 arquivos; lint 0 erros/45 avisos preexistentes; build e `git diff --check` aprovados. API HML local e pública responderam 200 com os mesmos totais (286 veículos, 478 posses válidas, 418.507,3 km no recorte 09/09–08/10/2026) e os mesmos hashes dos 9 assets da página. Escopo de secretaria conferido na API (91 veículos; 36 eventos; amostra somente nesse cadastro). Chromium autenticado: métrica → posses → registro, Voltar/Fechar, claro/escuro desktop e escuro celular 390 px sem overflow horizontal, console final 0 erros/0 avisos. Capturas em `output/playwright/analytics-phase-8/01-utilization-light-desktop.png` a `05-utilization-dark-mobile-full.png`.

## Pendências / decisões

Sem denominador robusto de horas ou dias disponíveis para taxa de utilização. Posse é vínculo registrado, não medição de movimento contínuo; status e manutenção em aberto são estado atual, não histórico de disponibilidade. Validação funcional/visual pelo responsável permanece pendente.

## Rollback

Reverter apenas o commit específico da Fase 8 na branch de homologação.
