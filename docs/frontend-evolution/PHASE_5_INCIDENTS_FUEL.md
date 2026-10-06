# Fase 5 — abastecimentos, ordens, sinistros e multas

Entrega em 01/10/2026, exclusivamente em `D:\FROTAS\frota_emprestimos_testes`, branch `feature/frontend-evolution-hml`, a partir de `d34be2d`.

## Resultado

Abastecimentos, Histórico de abastecimentos, Ordens abertas, Sinistros e Multas adotam a fundação visual das fases anteriores. Cabeçalhos, filtros, tabelas, miniaturas e estados ganharam a mesma hierarquia dos módulos operacionais. Ações frequentes permanecem visíveis; comandos de apoio foram agrupados somente quando continuaram acessíveis no `ActionMenu`.

O commit funcional é `f14da97 feat(ui): evolui operacoes da fase 5`.

## Contratos preservados

- Abastecimentos mantém criação individual e em lote, guia, atualização, filtros, PDF/XLSX, comprovante, link público, download, prorrogação/reabertura de prazo e cancelamento.
- Histórico mantém filtros, paginação, comprovante, alertas de consumo e retificação condicionada à permissão e ao vínculo com a ordem.
- Ordens abertas mantém prazo absoluto e relativo, mapa, comprovante, painel de assinatura e confirmação. “Confirmar abastecimento” permanece como ação primária visível.
- Sinistros mantém criação, edição, filtros, paginação, PDF/XLSX e consulta de anexos conforme as mesmas permissões.
- Multas mantém criação, edição, filtros, paginação e PDF/XLSX. O vencimento agora aparece junto da data da infração para facilitar a leitura.

Nenhuma API, cliente HTTP, utilitário de documento, payload, permissão, backend, migration ou configuração foi alterada.

## Quality gates

| Comando | Resultado |
| --- | --- |
| Teste direto de `FuelSuppliesPage` | 6/6 aprovados |
| `npm run test` | 179 aprovados e 16 falhas intermitentes preexistentes em 5 suítes |
| `npm run test -- --pool=forks` | 195/195 aprovados em 38 arquivos |
| `npm run lint` | 0 erros e 46 avisos preexistentes |
| `npm run build` | aprovado, 1008 módulos transformados |

O teste direto foi atualizado para abrir a reabertura de prazo pelo menu contextual e continua validando o modal, o novo prazo obrigatório e a justificativa auditável. O runner padrão repetiu exatamente a contagem de falhas registrada na Fase 4; a execução isolada por processos aprovou toda a suíte.

## Validação visual

As quatro rotas reais foram inspecionadas em 1366×768 nos temas claro e escuro. O Histórico foi verificado dentro de `/abastecimentos`. As oito capturas locais estão em `docs/frontend-evolution/evidence/phase-5/` e permanecem fora do Git conforme a política do projeto.

As 11 alterações externas encontradas em `frontend/public/vehicle-thumbnails/` antes da fase continuam no working tree e não integram o commit funcional nem a documentação.

## Rollback

Reverter `f14da97` e o commit documental da fase. Não há mudança de dados, dependência ou backend a desfazer.
