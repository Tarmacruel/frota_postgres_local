# Matriz de endpoints e perfis

Revisão do contrato efetivo em 2026-07-13. Todas as mutações autenticadas passam pelo middleware CSRF. `POSTO` não possui acesso padrão ao módulo.

| Contrato | ADMIN | PRODUCAO | PADRAO | Proteção adicional |
|---|---|---|---|---|
| `GET /api/possession`, `/paginated`, `/active` | integral | escopo autorizado | campos mascarados | `possession.view`, teto do papel e escopo organizacional |
| `POST /api/possession` | sim | sim | não | `require_writer`, `possession.create`, conflito explícito e transação |
| `PUT /api/possession/{id}` | sim | não | não | `require_admin`, justificativa e auditoria |
| `DELETE /api/possession/{id}` | 409 | 409 | não | contrato não mutativo; tentativa administrativa auditada |
| `GET /api/possession/{id}/trips[/{trip_id}]` | integral | integral autorizado | resumo sem localização restrita | recurso sempre vinculado ao pai, contra IDOR |
| `POST .../trips`, `POST .../destinations` | sim | sim | não | writer + permissão e locks/constraints |
| `PUT .../trips/{trip_id}/end` | sim | sim | não | writer, hodômetro/estado e auditoria |
| `PUT .../trips/{trip_id}/cancel` | sim | sim | não | writer e justificativa obrigatória |
| `PUT /api/possession/{id}/end` | sim | sim | não | declaração aceita no backend, confirmação + encerramento atômicos |
| `GET .../return-context` | integral | integral autorizado | mascarado/restrito | serializer por perfil |
| `GET .../return-confirmations` | sim | não | não | `require_admin`; histórico append-only |
| `POST .../return-confirmations/corrections` | sim | não | não | `require_admin`, justificativa e nova versão |
| `GET /api/possession/{id}/term` | sim | sim | versão mascarada | sessão, autorização, auditoria e `no-store` |
| `GET .../photo(s)` | sim | sim | não | validação do pai, storage privado e `no-store` |
| `GET .../document(s)` legados | sim | sim | conforme termo mascarado, nunca foto integral | legado autenticado, path containment |
| `GET /api/possession/reports/metadata` | catálogo integral autorizado | catálogo operacional | catálogo mínimo | registry filtrada no backend |
| `POST .../reports/preview-pdf`, `/export-xlsx` | sim | sim | somente colunas permitidas | rejeita coluna desconhecida/restrita; limites e auditoria |
| `GET/PUT /api/users/me/report-preferences/possession` | próprio | próprio | próprio | somente IDs de colunas/preset/modo; sem PII |
| `GET /api/public/possession-terms/{loan|return}/{code}` | legado | legado | legado | apenas termos históricos conforme ADR 002; não atende termo novo |

## Verificações transversais

- Permissão individual pode restringir, nunca elevar o teto do perfil.
- `PADRAO` não recebe contato, localização, foto integral, exportação operacional ou auditoria administrativa.
- Downloads não são públicos nem aceitam path do cliente.
- O frontend oculta ações incompatíveis para UX, mas uma chamada manual continua bloqueada pelo backend.
