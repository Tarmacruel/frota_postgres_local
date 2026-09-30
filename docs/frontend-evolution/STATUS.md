# Status — evolução do frontend Frota PMTF

**Branch:** `feature/frontend-evolution-hml`  
**HEAD inicial:** `06d44c1c4da59db94467006436fc47d4f469dc82`  
**Fase atual:** Fase 0 concluída com baseline de teste padrão reprovado e documentado; aguardando autorização  
**Data:** 30/09/2026

## Baseline

- `npm run test`: exit 1; 149 aprovados, 16 falhas; 35 arquivos.
- `npm run test -- --pool=forks`: exit 0; 165 aprovados; 35 arquivos.
- `npm run lint`: exit 0; nenhum erro, 46 avisos.
- `npm run build`: exit 0; concluído.
- [Diagnóstico, divergências, evidências e comandos](BASELINE_PHASE_0.md).

## Fases

- [x] Fase 0 — baseline e segurança, com ressalvas registradas
- [ ] Fase 1 — fundação visual e componentes base
- [ ] Fase 2 — shell global
- [ ] Fase 3 — dashboard
- [ ] Fase 4 — módulos operacionais centrais
- [ ] Fase 5 — abastecimento, ordens, sinistros e multas
- [ ] Fase 6 — gestão e administração
- [ ] Fase 7 — QA, responsividade e acabamento

## Última entrega

Branch exclusiva da evolução visual, comparação com snapshot/remoto, seis capturas de baseline claro/escuro e [ExecPlan](EXECPLAN.md). Empréstimos foi localizado e deve ser preservado integralmente. VS Code confirmado na pasta de testes. Não houve redesign nem edição de código da aplicação.

## Arquivos alterados

Somente documentação/contexto: AGENTS, `.agent/`, documentos desta iniciativa, inventário do snapshot e referências fornecidas. Capturas novas e logs são locais, ignorados pelo Git. ZIP/pasta originais preservados e excluídos localmente do status; nenhuma exclusão física.

## Validações executadas

Git branch/HEAD/status, `ls-remote`, comparação de 138 arquivos frente ao snapshot, quatro comandos frontend acima, validador do ambiente e seis capturas em 1366×768. `git diff 06d44c1 -- frontend backend` vazio. Nenhum fluxo mutante executado pelo navegador.

## Decisões

Partir do HEAD atual de empréstimos, não do snapshot antigo. Preservar `styles-light.css`, padrões de abastecimento, retificação unificada, permissões e contador de empréstimos. Não aplicar configurações de porta/assinatura do exemplo do pacote. Fase 1 será aditiva e sem adoção dos novos componentes em páginas.

## Pendências

Teste padrão vermelho; divergência de raios frente à preferência anterior do usuário; boards 01/02 duplicados. Ver ExecPlan para tratamento proposto. Não ampliar escopo para corrigir avisos antigos nesta fase.

## Próxima ação autorizada

Nenhuma implementação autorizada. **Parar e aguardar autorização do usuário para Fase 1.**
