# Status — evolução do frontend Frota PMTF

**Branch:** feature/frontend-evolution-hml

**HEAD inicial da Fase 3:** 6d5dab9

**Data:** 30/09/2026

**Fase atual:** Fase 3 concluída. Fase 4 ainda não autorizada.

## Entrega

Dashboard evoluído com saudação compacta, quatro KPIs semânticos, ações rápidas, pendências em destaque, leitura do dia e atalhos de perfil. As três fontes de dados, seus parâmetros, cálculos, permissões e rotas foram preservados. Nenhuma chamada adicional, página de negócio, backend ou produção foi alterada.

## Validação

| Comando | Fase 3 | Baseline Fase 2 |
| --- | --- | --- |
| Teste direto do dashboard (`--pool=forks`) | 2 aprovados | Não existia |
| `npm run test` | 178 aprovados, 15 falhas preexistentes/intermitentes | 175 aprovados, 16 falhas preexistentes |
| `npm run test -- --pool=forks` | 193 aprovados | 191 aprovados |
| `npm run lint` | 0 erros, 46 avisos | 0 erros, 46 avisos |
| `npm run build` | Aprovado | Aprovado |

Inspeção real em 1366×768 nos temas claro e escuro. As capturas confirmam KPIs em uma faixa, ações compactas, pendências prioritárias, leitura diária lateral e contraste equivalente. [Relatório da Fase 3](PHASE_3_DASHBOARD.md) e [ExecPlan](EXECPLAN.md).

## Fases

- [x] Fase 0 — baseline e segurança
- [x] Fase 1 — fundação visual e componentes base
- [x] Fase 2 — shell global
- [x] Fase 3 — dashboard
- [ ] Fase 4 — módulos operacionais centrais
- [ ] Fase 5 — abastecimento, ordens, sinistros e multas
- [ ] Fase 6 — gestão e administração
- [ ] Fase 7 — QA, responsividade e acabamento

## Pendências

O runner padrão mantém falhas intermitentes em quatro suítes preexistentes; o pool `forks` aprova os 193 testes. Permanecem 46 avisos antigos de lint e boards alvo 01/02 duplicados. Veículos, posses, condutores, manutenções e empréstimos continuam com a estrutura atual; sua evolução pertence à Fase 4.

**Parar e aguardar autorização da Fase 4.**
