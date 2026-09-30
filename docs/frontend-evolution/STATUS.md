# Status — evolução do frontend Frota PMTF

**Branch:** feature/frontend-evolution-hml
**HEAD inicial da Fase 1:** a71c9c0
**Data:** 30/09/2026
**Fase atual:** Fase 1 concluída. Fase 2 ainda não autorizada.

## Entrega

Fundação aditiva: tokens claro/escuro, frontend-evolution.css, seis componentes base e 11 miniaturas SVG. Importação após styles.css e styles-light.css. Nenhuma página reorganizada ou convertida. Raios menores preservados conforme preferência anterior do usuário. Produção e backend não alterados.

## Validação

| Comando | Fase 1 | Baseline Fase 0 |
| --- | --- | --- |
| npm run test | 174 aprovados, 16 falhas | 149 aprovados, mesmas 16 falhas |
| npm run test -- --pool=forks | 190 aprovados | 165 aprovados |
| npm run lint | 0 erros, 46 avisos | 0 erros, 46 avisos |
| npm run build | Aprovado | Aprovado |

25 testes novos aprovados. Cinco capturas de páginas existentes idênticas ao baseline; Veículos claro com diferença de 0,0396%, restrita ao ícone superior lateral. Componentes conferidos isoladamente em claro/escuro e tablet. [Relatório](PHASE_1_FOUNDATION.md) e [ExecPlan](EXECPLAN.md).

## Fases

- [x] Fase 0 — baseline e segurança
- [x] Fase 1 — fundação visual e componentes base
- [ ] Fase 2 — shell global
- [ ] Fase 3 — dashboard
- [ ] Fase 4 — módulos operacionais centrais
- [ ] Fase 5 — abastecimento, ordens, sinistros e multas
- [ ] Fase 6 — gestão e administração
- [ ] Fase 7 — QA, responsividade e acabamento

## Pendências

Runner padrão com as mesmas 16 falhas do [baseline](BASELINE_PHASE_0.md), sem alteração de configuração para ocultá-las. Permanecem 46 avisos antigos de lint e boards alvo 01/02 duplicados. Adoção dos componentes fica para as próximas fases.

**Parar e aguardar autorização da Fase 2.**
