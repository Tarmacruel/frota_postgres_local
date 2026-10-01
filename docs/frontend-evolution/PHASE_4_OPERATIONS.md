# Fase 4 — módulos operacionais centrais

Entrega em 01/10/2026, exclusivamente em `D:\FROTAS\frota_emprestimos_testes`, branch `feature/frontend-evolution-hml`, a partir de `ce86bb0`.

## Resultado

As cinco telas operacionais adotam a fundação visual criada nas fases anteriores: `PageHeader`, filtros compactos e consistentes, `VehicleThumbnail`, `StatusChip` e `ActionMenu`. Tabelas receberam cabeçalhos mais claros, identidade visual do registro e distribuição previsível entre ações primárias e ações de apoio. Nenhuma API, cliente HTTP, rota, payload, permissão, migration ou configuração de ambiente foi alterada.

| Ordem | Tela | Subcommit | Validação direta |
| --- | --- | --- | --- |
| 1 | Veículos | `59f4ecf` | lint do arquivo, build e inspeção no navegador |
| 2 | Posses | `8d3bed1` | 12/12 testes, lint, build e inspeção no navegador |
| 3 | Condutores | `273b9ec` | 2/2 testes, lint, build e inspeção no navegador |
| 4 | Manutenções | `8e0c495` | 2/2 testes, lint, build e inspeção no navegador |
| 5 | Empréstimos | `5dfae38` | 8/8 testes, lint, build e inspeção no navegador |

## Contratos preservados

- Veículos mantém filtros, PDF/XLSX, histórico, edição e exclusão sob as mesmas permissões.
- Posses mantém termos, retificação unificada, fotos, destinos, rotas, retorno, encerramento e todos os estados condicionais. Retorno e encerramento continuam expostos como ações primárias quando aplicáveis; ações de apoio foram agrupadas no menu.
- Condutores mantém consulta, criação, edição e inativação sob as mesmas regras.
- Manutenções mantém as fontes de dados, criação, edição e exclusão. O teste novo cobre chamadas existentes, permissões e ações.
- Empréstimos usa o fluxo real documentado na Fase 0. Recebimento, rejeição, solicitação/confirmação de devolução, regularização, documentos, assinaturas, eventos e alertas permaneceram inalterados; apenas a edição da proposta foi agrupada no menu de apoio.

## Quality gates

| Comando | Resultado |
| --- | --- |
| `npm run test` | 179 aprovados e 16 falhas intermitentes preexistentes em 5 suítes |
| `npm run test -- --pool=forks` | 195/195 aprovados em 38 arquivos |
| `npm run lint` | 0 erros e 46 avisos preexistentes |
| `npm run build` | aprovado, 1008 módulos transformados |

O runner padrão voltou a apresentar o problema de concorrência registrado nas fases anteriores. A execução isolada por processos aprovou toda a suíte, inclusive os 24 testes diretos das quatro páginas com cobertura dedicada nesta fase. Veículos não possuía teste direto; foi validado por lint, build e navegação real.

## Validação visual

As cinco telas foram inspecionadas no tema escuro em 1366×768. Veículos, Posses e Empréstimos também foram recapturados no tema claro após os gates finais, cobrindo a tabela mais densa, as ações condicionais mais sensíveis e o fluxo novo. As evidências locais estão em `docs/frontend-evolution/evidence/phase-4/` e permanecem fora do Git conforme a política do projeto.

As 11 alterações externas encontradas em `frontend/public/vehicle-thumbnails/` antes da fase foram preservadas no working tree e não integram nenhum dos subcommits acima.

## Rollback

Cada tela pode ser revertida pelo próprio subcommit, na ordem inversa. Não há mudança de dados, dependência ou backend a desfazer.
