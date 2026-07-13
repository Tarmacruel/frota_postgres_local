# Relatório da Fase 3 — backend de posses e rotas

Data: **2026-07-13**. Branch: `feat/posse-rotas-relatorios-devolucao`. Commit funcional: `2f93d77`.

## Resultado

A Fase 3 implementou serviços, repositories, schemas e endpoints para operar posses, rotas e destinos. A criação de posse continua aceitando o contrato multipart anterior quando não existe posse ativa e pode receber uma rota inicial opcional na mesma transação. Uma posse ativa nunca mais é encerrada silenciosamente: a API devolve conflito por padrão e somente permite substituição explícita, justificada, bloqueada e auditada.

Não foi criada ou alterada migration. O head do código continua `0039_possession_trips`; o banco fonte continua deliberadamente em `0038_require_user_cpf` e não foi migrado. Os testes PostgreSQL foram executados em `frota_phase2_clean_20260711_01`, já em `0039`.

Nenhum endpoint, service ou repository de hard delete foi criado. O método legado `end_active_for_vehicle`, que encerrava posses em massa, foi removido do repository.

## Endpoints e contratos

| Método e rota | Autorização | Contrato |
|---|---|---|
| `POST /api/possession` | `require_writer` + permissão `possession.create` | Multipart existente; novos campos opcionais `initial_trip_json`, `replace_active` e `replacement_reason` |
| `GET /api/possession/{possession_id}/trips` | permissão `possession.view` | Paginação `page/limit` e filtro opcional `status`; retorna `TripListResponse` |
| `POST /api/possession/{possession_id}/trips` | `require_writer` + `possession.create` | `TripCreate`; cria rota em posse ativa sem rota aberta; responde `201` |
| `GET /api/possession/{possession_id}/trips/{trip_id}` | `possession.view` | Busca obrigatoriamente pelas duas chaves do path |
| `POST /api/possession/{possession_id}/trips/{trip_id}/destinations` | `require_writer` + `possession.edit` | Lote de 1 a 50 `TripDestinationCreate` |
| `PUT /api/possession/{possession_id}/trips/{trip_id}/end` | `require_writer` + `possession.edit` | Exige retorno timezone-aware e hodômetro final decimal |
| `PUT /api/possession/{possession_id}/trips/{trip_id}/cancel` | `require_writer` + `possession.edit` | Exige justificativa entre 8 e 1.000 caracteres |
| `PUT /api/possession/{possession_id}/end` | `require_writer` + `possession.edit` | Contrato legado preservado; agora responde `409 POSSESSION_HAS_OPEN_TRIP` quando necessário |
| `PUT /api/possession/{possession_id}` | `require_admin` + `possession.edit` | Retificação administrativa; não pode encerrar posse com rota aberta ou criar período incompatível com as rotas |

Os schemas críticos rejeitam campos extras, normalizam textos, limitam listas e tamanhos, exigem datas com fuso e usam `Decimal` com uma casa para hodômetros de rota.

### Conflitos previsíveis

- `ACTIVE_POSSESSION_EXISTS`: existe posse ativa e a substituição não foi confirmada;
- `REPLACEMENT_REASON_REQUIRED`: confirmação sem justificativa válida;
- `ACTIVE_POSSESSION_HAS_OPEN_TRIP`: a posse anterior possui rota aberta;
- `OPEN_TRIP_EXISTS`: tentativa de abrir segunda rota na mesma posse;
- `POSSESSION_ALREADY_ENDED`: tentativa de criar rota em posse encerrada;
- `TRIP_ODOMETER_DIVERGENCE`: hodômetro inicial diverge do último valor conhecido;
- `TRIP_NOT_OPEN`: mutação em rota encerrada ou cancelada;
- `POSSESSION_HAS_OPEN_TRIP`: tentativa de encerrar posse por qualquer contrato enquanto há rota aberta.

Violações de constraint são traduzidas em respostas `409` seguras, sem nome de constraint ou SQL.

## Transações e locks

O service controla toda unidade de trabalho. Repositories fazem somente consultas, `add`, `flush` e `refresh`; não fazem `commit`, `rollback` ou delete.

Ordem de serialização utilizada:

```mermaid
flowchart LR
    V[Veículo FOR UPDATE] --> P[Posse ativa FOR UPDATE]
    P --> T[Rota FOR UPDATE]
    T --> D[Próxima sequência de destino]
```

- criação/substituição de posse bloqueia primeiro o veículo e depois relê a posse ativa com `FOR UPDATE`; isso também serializa duas criações quando ainda não existe posse;
- criação de rota e alocação de `sequence_number` bloqueiam a posse;
- destino, encerramento e cancelamento bloqueiam posse e rota;
- toda busca de rota aninhada usa `possession_id` e `trip_id`, inclusive com lock;
- o índice parcial único de rota aberta e o índice parcial de posse ativa continuam como última barreira;
- criação de posse, rota inicial, destinos, auditorias e anexos usam um único commit;
- qualquer erro executa rollback e remove arquivos escritos durante a tentativa.

O teste de rollback forçou falha no segundo destino depois do primeiro `flush`: posse, rota, destino e auditoria permaneceram com contagem zero. Outro teste forçou falha de auditoria depois da gravação de documento e confirmou remoção do arquivo e rollback da posse.

## Regras implantadas

- posse pode ser criada sem rota;
- rota inicial e destinos opcionais são atômicos com a posse;
- substituição explícita exige justificativa e é impedida por rota aberta;
- saída não pode anteceder o início da posse;
- hodômetro inicial deve coincidir com o último valor conhecido; divergência não é corrigida silenciosamente;
- apenas uma rota pode permanecer em andamento;
- destinos são adicionados somente a rota em andamento;
- retorno não antecede saída e hodômetro final não é inferior ao inicial;
- cancelamento preserva rota e destinos;
- encerramento da posse, inclusive por edição administrativa, é bloqueado por rota aberta;
- retificação administrativa não pode definir período que exclua rotas existentes.

## Autorização, CSRF, IDOR e exposição

- `require_writer` limita mutações a `ADMIN` e `PRODUCAO`;
- a permissão granular continua aplicada em conjunto e pode restringir, nunca ampliar, o teto do papel;
- edição retroativa usa `require_admin`;
- middleware da Fase 1 protege todas as mutações autenticadas com CSRF e `Origin/Referer`;
- `AuditService` incorpora automaticamente o `RequestAuditContext` da Fase 1;
- `PADRAO` pode consultar rotas, mas recebe origem substituída, observação/motivo omitidos e lista de destinos vazia; hodômetros e quilômetros resumidos permanecem disponíveis;
- `POSTO` recebe `403` por padrão;
- rota existente sob outra posse devolve `404`, sem confirmar sua existência.

## Eventos de auditoria

- `POSSESSION_CREATE`;
- `POSSESSION_REPLACE_ACTIVE`;
- `TRIP_CREATE`;
- `TRIP_DESTINATION_ADD`;
- `TRIP_END`;
- `TRIP_CANCEL`.

Os eventos registram IDs, números sequenciais, justificativas exigidas, datas e hodômetros relevantes. Não registram descrição/endereço de destino, coordenadas, payload bruto ou binários. Documento e contato herdados da criação são sanitizados centralmente pela Fase 1.

## Arquivos funcionais criados/alterados

- Criados: `backend/app/schemas/possession_trip.py`, `backend/app/services/possession_trip_service.py` e `backend/tests/test_phase3_possession_routes.py`.
- Alterados: `backend/app/api/deps.py`, `backend/app/api/routes/possession.py`, `backend/app/repositories/possession_repository.py`, `backend/app/repositories/possession_trip_repository.py`, `backend/app/schemas/possession.py`, `backend/app/services/possession_service.py` e `backend/tests/test_possession_terms.py`.
- Nenhum arquivo em `backend/alembic` ou `frontend/src` foi alterado.

## Testes e resultados reais

| Comando | Resultado |
|---|---|
| `PHASE3_TEST_DATABASE_URL=<clean-0039> python -m pytest tests/test_phase3_possession_routes.py -q` | **15 passed** em 5,48 s na execução final direcionada |
| `PHASE2_TEST_DATABASE_URL=<clean-0039> PHASE3_TEST_DATABASE_URL=<clean-0039> python -m pytest tests -q` | **121 passed** em 11,86 s |
| `python -m compileall -q app` | Passou |
| `npm run build` | Passou: Vite 6.4.2, 1.071 módulos, 1 min 48 s; warning conhecido do chunk principal de 659,02 kB |
| `alembic heads` | `0039_possession_trips (head)` |
| `alembic current` no banco fonte | `0038_require_user_cpf` |
| `alembic current` no banco isolado | `0039_possession_trips (head)` |
| `alembic history --verbose` | Passou; grafo íntegro até 0039 |
| `alembic check` no banco isolado | Falhou pelos diffs preexistentes de JSON/índices/FKs de outros módulos já registrados na Fase 2; nenhuma entidade ou migration da Fase 3 apareceu |
| `git diff --check` | Passou; somente avisos LF/CRLF do Git no Windows |

Warnings não bloqueantes: configuração futura de loop do `pytest-asyncio`, uso interno de `datetime.utcnow()` pela dependência `python-jose` e chunk Vite acima de 650 kB.

## Compatibilidade com o frontend atual

- criação sem posse ativa mantém os campos e a resposta esperados; `public_number` foi apenas acrescentado ao JSON;
- os três campos multipart novos são opcionais;
- o frontend atual ainda não envia confirmação/justificativa de substituição: quando houver posse ativa, receberá `409 ACTIVE_POSSESSION_EXISTS` em vez do encerramento silencioso anterior;
- o cliente atual exibe a mensagem de erro genérica com request ID, mas a experiência de confirmação e os componentes de rota pertencem exclusivamente à Fase 4;
- as novas rotas não são consumidas pelo frontend atual;
- o build de produção passou sem alteração em `frontend/src`;
- a tela de auditoria lista os novos eventos em “TODAS”, mas seus filtros fixos ainda não oferecem esses nomes; ajuste pertence à Fase 4.

## Riscos e pré-condições para a Fase 4

1. Aplicar `0039_possession_trips` antes de publicar este backend; o banco fonte ainda está em 0038 e não possui `public_number` nem tabelas de rota.
2. Implementar no frontend o conflito `ACTIVE_POSSESSION_EXISTS`, a confirmação explícita e a justificativa; não contornar o `409`.
3. Atualizar a interface para consumir respostas paginadas de rota e respeitar `operational_details_restricted`.
4. Não usar o frontend para inferir autorização; botões devem acompanhar o backend, mas o backend permanece autoritativo.
5. Adicionar os novos eventos ao filtro visual de auditoria sem ampliar acesso a `PRODUCAO` ou `PADRAO`.
6. O projeto continua sem testes frontend, lint ou typecheck; apenas o build é executável.
7. O ruído preexistente do `alembic check` continua pendente e não deve gerar migration automática misturada à Fase 4.
8. O banco isolado contém registros sintéticos dos testes e deve continuar restrito até descarte operacional autorizado.

Nenhuma atividade da Fase 4 foi iniciada.
