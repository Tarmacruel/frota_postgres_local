# Relatório da Fase 5 — termo único e devolução

Data: 2026-07-13  
Branch: `feat/posse-rotas-relatorios-devolucao`  
Base observada: `4295b98030c1da80db7649e40c9c67a3b3eb360c`

## Declaração efetiva

Versão: `1.0`

> Declaro que o veículo identificado nesta posse foi devolvido à Frota Municipal na data e hora informadas, com o hodômetro e as condições registrados neste sistema. Confirmo que revisei as informações apresentadas e estou ciente de que esta declaração ficará vinculada ao meu usuário e à sessão autenticada para fins de responsabilidade e auditoria.

O backend persiste versão e texto exatos. A interface recebe ambos de `GET /api/possession/{id}/return-context`; o checkbox nasce desmarcado. A confirmação é descrita como declaração autenticada pela sessão, nunca como assinatura digital, qualificada ou ICP-Brasil.

## Contratos implantados

| Método e rota | Autorização | Resultado |
|---|---|---|
| `GET /api/possession/{id}/return-context` | permissão `possession.view` | contexto mínimo, declaração e confirmação atual |
| `PUT /api/possession/{id}/end` | `ADMIN/PRODUCAO`, `possession.edit`, CSRF | confirmação v1 e encerramento no mesmo commit |
| `GET /api/possession/{id}/return-confirmations` | `ADMIN` | histórico append-only |
| `POST /api/possession/{id}/return-confirmations/corrections` | `ADMIN`, `possession.edit`, CSRF | nova versão e supersessão lógica da anterior |
| `GET /api/possession/{id}/term?disposition=inline` | `possession.view` | PDF integral para `ADMIN/PRODUCAO`, mascarado para `PADRAO` |
| `GET /api/possession/{id}/term?disposition=attachment` | `ADMIN/PRODUCAO` | download integral protegido |

Novas posses não recebem códigos públicos de termo. O encerramento não aceita anexo separado de devolução. Anexos, códigos e confirmações antigas continuam consultáveis como legado e os endpoints públicos existentes só encontram registros que já possuem código legado.

## Transação e versionamento

O encerramento bloqueia a posse, consulta a rota aberta com lock, valida data/hodômetro, verifica confirmação atual, cria a confirmação, atualiza `end_date/end_odometer_km`, registra `POSSESSION_RETURN_CONFIRMATION` e `POSSESSION_END` e confirma uma vez. Qualquer exceção executa rollback.

Na correção administrativa, a posse e a confirmação corrente são bloqueadas. Um UUID da sucessora é reservado; a versão anterior recebe apenas os três campos permitidos pelo trigger append-only (`is_current`, `superseded_at`, `superseded_by_confirmation_id`) e a nova linha guarda conteúdo/hash/justificativa próprios. Nenhuma linha é apagada.

## Payload canônico

Serialização: JSON UTF-8, chaves ordenadas, separadores compactos, `allow_nan=false`, timestamps UTC RFC 3339 com microssegundos e hodômetro como string decimal com uma casa. Estrutura:

```json
{
  "schema_version": "possession-return-confirmation.v1",
  "confirmation_version": 1,
  "possession_id": "<uuid>",
  "possession_public_number": 123,
  "vehicle_id": "<uuid>",
  "driver": {"id": "<uuid-ou-null>", "name_snapshot": "<snapshot>"},
  "confirmed_by_user_id": "<uuid>",
  "declaration_version": "1.0",
  "declaration_text": "<texto integral>",
  "confirmed_at": "2026-07-13T15:30:00.000000Z",
  "returned_at": "2026-07-13T15:25:00.000000Z",
  "final_odometer_km": "105.0",
  "vehicle_condition_notes": "Sem ressalvas",
  "last_trip_id": "<uuid-ou-null>",
  "request_id": "<request-id>"
}
```

Correções acrescentam `correction_of_hash`. O SHA-256 hexadecimal é calculado somente no backend e não representa assinatura digital.

## PDF e proteção

O ReportLab 5.0.0 gera o PDF em memória a partir do grafo persistido de posse, veículo, condutor, rotas, destinos e confirmações. O documento inclui identificação, status, entrega, rotas/destinos ordenados, devolução ou aviso de legado, versão, UUID, geração UTC, hash quando existente e rodapé paginado. A amostra sem dados reais está em `AMOSTRA_ESTRUTURAL_TERMO_FASE_5.md`.

Headers: `Cache-Control: private, no-store, no-cache, max-age=0, must-revalidate`, `Pragma: no-cache`, `Expires: 0` e `X-Content-Type-Options: nosniff`. Auditorias `TERM_PREVIEW`/`TERM_DOWNLOAD` contêm resultado, perfil de mascaramento, versão e request context; nunca o binário.

## Validações executadas

- `python -m pytest tests/test_phase5_possession_return.py -q`: **14 passed**;
- `python -m pytest -q`: **118 passed, 17 skipped** na repetição final;
- frontend no volume `Z:`: Vitest iniciou, mas o controlador encerrou antes da coleta e deixou worker órfão;
- mesma árvore copiada para `C:\Temp` com `npm ci`, após extensão explícita dos matchers: **11 arquivos, 22 testes aprovados**; a cópia temporária foi removida;
- `npm run lint`: **0 erros e 45 warnings preexistentes**;
- `npm run build`: concluído na repetição final com **974 módulos em 7,88 s**;
- `alembic heads/current`: `0039_possession_trips`; nenhuma migration ou alteração de schema;
- `git diff --check`: sem erro de whitespace.

## Riscos para a Fase 6

1. O relatório configurável não deve reutilizar o PDF oficial como motor genérico nem reintroduzir PDF oficial no navegador.
2. `PADRAO` deve continuar sem contato, localização, metadados técnicos ou download integral; a registry de colunas precisa aplicar o mesmo teto no backend.
3. Hash, nome do declarante e histórico de correções exigem classificação explícita antes de aparecerem em exportações.
4. O Vitest continua instável diretamente no volume de rede; a execução local controlada é evidência válida, mas o runner no `Z:` deve ser estabilizado para CI/repetibilidade.
5. Substituição explícita de posse ativa permanece um encerramento operacional excepcional sem confirmação de devolução; a Fase 6 não deve mascarar esse estado como devolução confirmada.

Nenhum endpoint, registry ou exportação da Fase 6 foi implementado.
