# Status — evolução do frontend Frota PMTF

**Branch:** feature/frontend-evolution-hml
**HEAD inicial da Fase 2:** 1880e58
**Data:** 30/09/2026
**Fase atual:** Fase 2 concluída. Fase 3 ainda não autorizada.

## Entrega

Shell global evoluído: sidebar institucional escura nos dois temas, estado ativo azul, topbar compacta, busca e ações agrupadas, identidade do usuário, superfícies separadas e drawer responsivo. Todos os itens, permissões, notificações, busca, tema, usuário e navegação móvel foram preservados. Nenhuma página de negócio, backend ou produção foi alterada.

## Validação

| Comando | Fase 1 | Baseline Fase 0 |
| --- | --- | --- |
| npm run test | 175 aprovados, 16 falhas | 174 aprovados, mesmas 16 falhas |
| npm run test -- --pool=forks | 191 aprovados | 190 aprovados |
| npm run lint | 0 erros, 46 avisos | 0 erros, 46 avisos |
| npm run build | Aprovado | Aprovado |

Oito testes diretos do Layout aprovados, incluindo o novo contrato do shell. Inspeção real em 1366×768, 1024×768 e 768×1024, com claro/escuro, drawer e persistência do tema. [Relatório da Fase 2](PHASE_2_SHELL.md) e [ExecPlan](EXECPLAN.md).

## Fases

- [x] Fase 0 — baseline e segurança
- [x] Fase 1 — fundação visual e componentes base
- [x] Fase 2 — shell global
- [ ] Fase 3 — dashboard
- [ ] Fase 4 — módulos operacionais centrais
- [ ] Fase 5 — abastecimento, ordens, sinistros e multas
- [ ] Fase 6 — gestão e administração
- [ ] Fase 7 — QA, responsividade e acabamento

## Pendências

Runner padrão com as mesmas 16 falhas do [baseline](BASELINE_PHASE_0.md), sem alteração de configuração para ocultá-las. Permanecem 46 avisos antigos de lint e boards alvo 01/02 duplicados. O dashboard continua com seu conteúdo e estrutura atuais; sua evolução pertence à Fase 3.

**Parar e aguardar autorização da Fase 3.**
