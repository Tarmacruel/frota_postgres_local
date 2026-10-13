# ExecPlan — Fase 10, parte 1 — desenho de alertas e workflow

**Atualização de 13/10/2026:** o usuário autorizou expressamente a persistência. O desenho abaixo foi implementado somente em HML na [parte 2](EXECPLAN_PHASE_10_PART_2.md), com migration `0052` aplicada e QA registrada na [entrega](DELIVERY_PHASE_10.md). Os trechos “aguarda autorização/não implementado” abaixo descrevem a proposta histórica, anterior à autorização, e foram preservados.

## Objetivo e limite desta entrega

Definir, para aprovação, a persistência, os contratos, as permissões, a identidade dos casos e a máquina de estados. Este documento **não é uma migration**. Nenhuma tabela, modelo, endpoint, mutação, tarefa de reconciliação ou tela foi criada ou executada nesta parte.

## Estado inicial verificado

- Diretório: `D:\FROTAS\frota_emprestimos_testes`.
- Branch: `feature/analytics-evolution-hml`.
- HEAD antes de editar: `82f3415fc358e3f5152a9ee4d0fad53594d264e5`.
- `git status --short --branch` antes de editar: `## feature/analytics-evolution-hml...origin/feature/analytics-evolution-hml`, sem arquivos modificados.
- Alembic no repositório: uma head, `0051_vehicle_loan_printed_terms`. Não foi consultado nem alterado o schema em execução.
- Foram lidos `AGENTS.md`, plano mestre e status de Analytics, `.agent/IMPLEMENT.md`, a Fase 10 e a especificação visual. O plano mestre e o arquivo da fase estão no pacote local `FROTA_SIREL_ANALYTICS_EVOLUTION_PACKAGE/`, pois não existem nesses caminhos na raiz; o pacote não foi alterado.

## Contrato atual e decisões derivadas do código

- A aba `/analytics?view=alerts` apresenta `GET /api/analytics/insights` (V1) por `SmartInsightsList`. Esses insights são calculados para o recorte solicitado, não são casos persistidos e conservam sua própria fórmula/janela. A V1 usa snapshots e inclui rótulos de TCO/referência de mercado e score de condutor; não há ocorrência de domínio estável para deduplicar essas três métricas como casos sem redesenhar suas regras.
- `GET /api/analytics/v2/attention` usa flags operacionais `fuel_supplies.is_consumption_anomaly`; a resposta declara expressamente que não há atendimento/resolução. Não converter essa contagem automaticamente em casos.
- `GET /api/analytics/v2/fuel` calcula cinco tipos de anomalia `fuel-v2.1` (`capacity`, `odometer`, `close`, `consumption`, `price`) e retorna `supply_id`, `vehicle_id`, instante, observado, referência, tamanho da amostra, regra, limitação e, quando aplicável, `previous_supply_id`. As comparações dependem do período anterior equivalente **e do escopo escolhido**. Uma consulta GET não grava flags nem casos.
- `analytics:view` protege Analytics V2. Eventos individuais de combustível exigem também `fuel_supplies:view`. `PRODUCAO` recebe seu escopo de `organization_id`; se não houver secretaria, o escopo é vazio. `responsible_to` usa organização explícita do registro ou atribuição histórica não ambígua. `UserPermission` possui ações `view/create/edit/delete` e `ADMIN` recebe `analytics:edit` por padrão; `PRODUCAO` não recebe.
- `audit_logs` e `AuditService.record` já existem. A trilha específica abaixo conserva evidência e transições mesmo se uma consulta ou contagem mudar.

## Migration proposta — **aguarda autorização**

Criar **uma** revisão Alembic após confirmar novamente a head de HML no momento da implementação (hoje, `0051_vehicle_loan_printed_terms`). A revisão adicionaria três tabelas vazias, sem backfill, mudança em tabela operacional ou efeito na V1:

### `analytics_alert_cases`

| Coluna | Tipo/constraint propostos | Uso |
|---|---|---|
| `id` | UUID PK, `gen_random_uuid()` | Identificador estável do caso |
| `fingerprint` | CHAR(64) NOT NULL UNIQUE | Deduplicação transacional |
| `fingerprint_version` | SMALLINT NOT NULL, `= 1` inicialmente | Versão do algoritmo de identidade |
| `source_type` | VARCHAR(40) NOT NULL | Inicialmente `fuel_supply` |
| `source_id` | UUID NOT NULL | ID do abastecimento; vínculo lógico, sem FK destrutiva |
| `rule_key` | VARCHAR(40) NOT NULL | Um dos cinco tipos `fuel-v2.1` |
| `rule_version` | VARCHAR(40) NOT NULL | Versão que gerou a evidência mais recente; histórico guarda cada versão |
| `vehicle_id` | UUID NULL | Entidade contextual no instante da detecção |
| `driver_id` | UUID NULL | Só se houver `driver_id` explícito na fonte; nunca inferido |
| `organization_id` | UUID NULL | Secretaria responsável resolvida na fonte ou NULL se não atribuível sem ambiguidade |
| `severity` | VARCHAR(12) NOT NULL, CHECK `LOW/MEDIUM/HIGH` | Triagem explicável, sem diagnóstico de fraude |
| `status` | VARCHAR(12) NOT NULL, CHECK `NEW/IN_REVIEW/RESOLVED/IGNORED` | Estado vigente |
| `first_detected_at`, `last_detected_at` | TIMESTAMPTZ NOT NULL | Primeira e última detecção confirmada |
| `last_evaluated_at` | TIMESTAMPTZ NOT NULL | Última reavaliação **positiva** que encontrou este caso |
| `evaluation_count` | INTEGER NOT NULL DEFAULT 1, CHECK `>= 1` | Número de avaliações positivas |
| `latest_evidence` | JSONB NOT NULL | Exibição rápida; cópia da última evidência, sem segredo/PII desnecessário |
| `created_at`, `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | Operação e ordenação |
| `version` | INTEGER NOT NULL DEFAULT 1, CHECK `>= 1` | Concorrência otimista para transições |

Índices propostos: único em `fingerprint`; `(organization_id, status, last_detected_at DESC, id)` para fila com escopo; `(source_type, source_id)` para investigação; `(vehicle_id, last_detected_at DESC)` e `(driver_id, last_detected_at DESC)` apenas se os planos de consulta justificarem. Não incluir `status` na unicidade: resolver/ignorar e reavaliar não cria outro caso da mesma origem e regra. `source_id` é vínculo lógico para não mudar o comportamento de exclusão da fonte; a evidência e o histórico sobrevivem se o registro de origem ficar indisponível. `organization_id`, `vehicle_id` e `driver_id` são contexto de detecção, não concessão de acesso.

### `analytics_alert_events`

| Coluna | Tipo/constraint propostos | Uso |
|---|---|---|
| `id` | UUID PK | Evento imutável |
| `case_id` | UUID NOT NULL FK para `analytics_alert_cases.id`, `ON DELETE RESTRICT` | Caso |
| `event_type` | VARCHAR(24) NOT NULL, CHECK `DETECTED/REEVALUATED/STATUS_CHANGED` | Tipo |
| `from_status`, `to_status` | VARCHAR(12) NULL, mesmos valores da máquina | Transição ou NULL em detecção sem transição |
| `actor_user_id` | UUID NULL FK para `users.id`, `ON DELETE SET NULL` | Ator humano; nulo para reconciliação sistêmica |
| `actor_label` | VARCHAR(150) NOT NULL | Identidade legível preservada na auditoria |
| `reason` | TEXT NULL | Justificativa limitada/normalizada no contrato |
| `rule_version` | VARCHAR(40) NOT NULL | Regra avaliada |
| `evidence` | JSONB NOT NULL | Snapshot daquela detecção/reavaliação, inclusive regra e amostra |
| `evaluation_context` | JSONB NOT NULL | Recorte civil/fuso, filtros efetivos e limites do histórico |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | Linha do tempo |

Índice `(case_id, created_at DESC, id)` e restrições de forma por `event_type` (detecção/reavaliação com evidência; `STATUS_CHANGED` com `from_status`/`to_status`; `IGNORED` com razão não vazia). O serviço grava caso, evento específico e `audit_logs` da mutação no **mesmo commit**. Aplicação usa permissões do banco para impedir UPDATE/DELETE de eventos, além de nunca expor endpoints de edição/remoção do histórico. Não armazenar recibo, documento, CPF nem payload bruto da fonte no JSON.

### `analytics_alert_requests`

| Coluna | Tipo/constraint propostos | Uso |
|---|---|---|
| `id` | UUID PK | Solicitação |
| `actor_user_id` | UUID NOT NULL FK para `users.id`, `ON DELETE RESTRICT` | Dono da chave idempotente |
| `operation` | VARCHAR(24) NOT NULL, CHECK `RECONCILE/STATUS_CHANGE` | Espaço da chave |
| `idempotency_key` | VARCHAR(80) NOT NULL | Chave fornecida pelo cliente, sem dados pessoais |
| `request_hash` | CHAR(64) NOT NULL | SHA-256 do método, rota e corpo canônico após validação |
| `response_json` | JSONB NOT NULL | Resultado mínimo necessário para repetir a resposta |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | Retenção |

UNIQUE `(actor_user_id, operation, idempotency_key)` e índice de limpeza por `created_at`; retenção proposta de 30 dias, com limpeza posterior explícita, sem eliminar os eventos do caso. A criação da solicitação, do caso/evento e da resposta idempotente ocorre na mesma transação. `downgrade` removeria as três tabelas; por destruir histórico, exigiria backup e autorização operacional própria, não faria parte do rollout normal.

Antes de codificar, conferir suporte a `gen_random_uuid`, limites/tipos SQL efetivos e head Alembic em HML. A migration não cria permissões automáticas nem casos retroativos.

## Identidade, deduplicação e reavaliação

O gerador inicial proposto considera **somente os cinco tipos de anomalia `fuel-v2.1` com `fuel_supply.id` estável**. Insights V1 e flags operacionais permanecem visíveis com seus nomes atuais; seu eventual ingresso no workflow requer identidade, evidência e regra próprios, aprovados separadamente. Não persistir alertas de custo variável por período como se fossem ocorrências de um registro.

1. Canonicalizar `source_type='fuel_supply'`, UUID em minúsculas com hífens e `rule_key` do enum fechado. Rejeitar tipos ou chaves desconhecidos.
2. Calcular `SHA-256` do UTF-8 `analytics-alert:1|fuel_supply|<source_uuid>|<rule_key>`; o hash não inclui data do filtro, secretaria solicitada, severidade, valor observado, status nem `rule_version`. Assim, o mesmo abastecimento/regra é um caso único entre recortes e versões. Guardar `fingerprint_version` para migração futura controlada.
3. Criar via `INSERT ... ON CONFLICT (fingerprint) DO UPDATE` na mesma transação, validando a fonte e a organização efetiva no servidor. Contenção concorrente converge para um caso; nunca confiar em fingerprint, evidência, secretaria ou severidade enviados pelo cliente.
4. Na primeira detecção, guardar evidência **original** em `DETECTED`, estado `NEW` e contexto exato do recorte. Em nova detecção positiva, acrescentar `REEVALUATED`, atualizar apenas última evidência/tempos/contador; preservar o primeiro evento e a decisão humana.
5. Caso `RESOLVED` ou `IGNORED` permaneça nesse estado após reavaliação positiva; exibir “reapareceu após decisão” e oferecer reabertura humana `→ IN_REVIEW`. Não reabrir silenciosamente. Uma avaliação negativa, ausência de dados ou mudança no período **não** resolve, ignora nem apaga o caso.

A regra de preço/consumo depende de amostra e recorte anteriores equivalentes. Por isso, `POST /reconcile` recebe os mesmos filtros civis V2, registra filtros efetivos, histórico usado, `rule_version`, observado, referência, amostra, regra, limitação, fonte e registro anterior em cada evento. Reconciliar recortes diferentes pode produzir evidências diferentes do mesmo caso; a fila mostra a última avaliação com acesso permitido e a linha do tempo mostra todas. Não haverá reconciliação implícita em GET. Uma futura rotina agendada exigiria decisão explícita sobre janela canônica/versão da regra; não está incluída aqui.

Se a secretaria responsável não puder ser resolvida sem ambiguidade, o caso fica com `organization_id=NULL`, acessível somente ao administrador habilitado; não atribuir à secretaria do filtro ou ao operador atual. Na implementação, a leitura e a mutação por usuário `PRODUCAO` também revalidariam a visibilidade da **fonte** por `responsible_to` e a secretaria do usuário, inclusive após mudanças na atribuição histórica. Os snapshots não dispensam essa verificação. Fonte ausente/restrita torna o caso invisível para escopo restrito; administrador vê a evidência preservada com indicação de link indisponível.

## Máquina de estados proposta

| Origem | Destino | Quem/condição | Razão |
|---|---|---|---|
| criação | `NEW` | Reconciliação autorizada | Evento `DETECTED` |
| `NEW` | `IN_REVIEW` | Operador autorizado | Opcional |
| `NEW`, `IN_REVIEW` | `RESOLVED` | Operador autorizado | Obrigatória: ação/verificação realizada |
| `NEW`, `IN_REVIEW` | `IGNORED` | Operador autorizado | **Obrigatória**; não remove evidência |
| `RESOLVED`, `IGNORED` | `IN_REVIEW` | Operador autorizado | Obrigatória: motivo da reabertura |

Sem `DELETE` de casos/eventos; sem transição direta `RESOLVED ↔ IGNORED`; sem `PATCH` que altere regra, evidência, fonte ou severidade manualmente. Reavaliação positiva não muda status. Uma transição idêntica retorna conflito, não cria evento. Ações repetidas com a mesma `Idempotency-Key` devolvem o resultado já aplicado, sem outro evento; chave diferente com `If-Match` antigo recebe 409. Cada transição incrementa `version` e registra ator, instante, motivo e estados anterior/novo.

## Contratos HTTP propostos (não implementados)

Prefixo novo `/api/analytics/v2/alerts`; V1 e as rotas V2 atuais seguem iguais. JSON em `snake_case`, timestamps UTC ISO 8601. Todas as respostas privadas `Cache-Control: private, no-store`. Validar `extra=forbid`, enums, UUIDs, limites de paginação e tamanho de justificativa. Não aceitar campos de evidência no corpo de mutação.

| Método/rota | Entrada | Saída |
|---|---|---|
| `GET /alerts` | `status`, `severity`, `rule_key`, `date_from`, `date_to`, `organization`, `vehicle_id`, `offset`, `limit≤100` | `items`, `total`, `offset`, `limit`, filtros efetivos e cobertura; padrão: casos abertos `NEW/IN_REVIEW` ordenados por `last_detected_at DESC,id` |
| `GET /alerts/{id}` | UUID | Caso, primeira/última evidência, fonte/veículo/condutor clicáveis conforme permissão, regra, fórmula, amostra, limitações e estados permitidos |
| `GET /alerts/{id}/events` | `offset`, `limit≤100` | Histórico paginado em ordem estável; motivo e ator conforme autorização |
| `POST /alerts/reconcile` | Filtros V2 civis (`date_from`, `date_to`, `organization`, `vehicle_type`, `vehicle_id`) + `Idempotency-Key`; sem evidência arbitrária | `200` com `evaluated`, `detected`, `created`, `revisited`, `skipped`, recorte efetivo e versão da regra; mesma chave/mesmo pedido reaproveita resultado |
| `PATCH /alerts/{id}/status` | `{ "status": "IN_REVIEW|RESOLVED|IGNORED", "reason": "..." }`, `If-Match: "<version>"` e `Idempotency-Key` | `200` com caso atualizado, nova versão e `ETag: "<version>"` |

Para `GET /alerts`, datas filtram **instante de detecção da fonte** em dias civis `America/Bahia`; não comandam nova avaliação. No detalhe, `source_id`, `vehicle_id` e `driver_id` são IDs, não autorização para abrir a API de domínio: o drawer deve consultar os GETs existentes e obedecer às permissões de cada módulo. A lista pode mostrar resumo de caso a quem possui leitura de Analytics, mas evidência de abastecimento e link do registro requerem também `fuel_supplies:view`. Para evitar vazamento por contagem, a paginação e o total são calculados **após** filtros de escopo e permissão. Se não houver `fuel_supplies:view`, os casos de combustível não entram no conjunto listado.

Erros: 401 sem sessão, 403 sem permissão geral, 404 para ID inexistente ou fora do escopo (sem distinguir), 409 para versão/transição conflitante ou reutilização da chave com payload diferente, 422 para filtro/estado/justificativa inválido, 428 se faltar `If-Match` na transição. Sem `Idempotency-Key` em mutações, responder 428. As três tabelas propostas compõem uma só migration sujeita à aprovação.

## Permissões propostas para aprovação

| Operação | Controle |
|---|---|
| Listar/abrir casos e histórico | `analytics:view` **e** leitura do módulo da fonte; aplicar `analytics_organization_scope` e visibilidade histórica da fonte em cada consulta |
| Reconciliar | `analytics:view` **e** `analytics:edit` **e** `fuel_supplies:view`; inicialmente só `ADMIN`, para não permitir que usuários restritos definam recortes de geração globais; não conceder permissão em massa pela migration |
| Mudar status | `analytics:view` **e** `analytics:edit` **e** leitura da fonte; `ADMIN` ou `PRODUCAO` com `analytics:edit` explícita; sempre revalidar secretaria e fonte |
| Ver registro operacional | Permissão do módulo e endpoint de domínio existente; sem duplicar edição no drawer |

O backend atual não impõe teto de papel a `analytics:edit`, então a restrição adicional de papel acima deve ser implementada e testada como decisão **nova e explícita**, sem modificar a semântica das demais permissões. `POSTO` e `PADRAO` não ganham mutação por padrão. `ADMIN` com `analytics:edit` revogada não pode reconciliar ou tratar. Falta de secretaria em `PRODUCAO` resulta em conjunto vazio/404 para caso específico.

## Severidade e evidência

Severidade inicial é classificação de **prioridade de conferência**, não conclusão sobre irregularidade. Proposta determinística versionada: `HIGH` para hodômetro regressivo; `MEDIUM` para capacidade, abastecimentos próximos, consumo e preço fora do histórico; `LOW` reservado para futuras regras aprovadas. Nenhuma decisão humana ou valor calculado reclassifica silenciosamente um caso; toda mudança de política exigiria `rule_version`/evento de reavaliação. No detalhe, exibir “Como foi calculado?” com regra textual, observado, referência, amostra, período/fuso, fonte, registro anterior quando existir e limitação, preservando o primeiro snapshot e a linha do tempo. Não afirmar fraude, pagamento, preço de mercado ou consumo real.

## Execução proposta após nova ordem

1. Confirmar novamente branch HML, HEAD, status, head Alembic e schema do HML. Conferir custo de índices e retenção de chaves. Criar migration e modelos, sem backfill automático.
2. Implementar gerador compartilhando `detect_anomalies` sem alterar as respostas V1/V2; resolver organização efetiva por fonte/histórico e persistir caso/eventos sob transação. Garantir `ON CONFLICT`, idempotência e auditoria atômica.
3. Adicionar schemas/serviço/repositório/rotas com controles de permissão no servidor e testes de isolamento de secretaria, permissão de fonte, concorrência, deduplicação, reabertura, justificativa, falha de origem e evidência original.
4. Só então substituir a aba Alertas pelo workflow V2, preservando acesso identificável ao painel anterior, filtros, pilha do drawer e temas claro/escuro conforme `02_VISUAL_SPEC.md`; não retirar exportação V1 ou alterar rotas atuais.
5. Aplicar migration **somente na HML após autorização expressa**, verificar upgrade/consulta/rollback em ambiente de teste apropriado, executar backend e `npm run test`, `npm run lint`, `npm run build` se frontend alterado, testar UI clara/escura e documentar evidências/status. Produção permanece fora de escopo.

## Validação desta parte, pendências e rollback

Esta parte é apenas documentação. Validação: coerência com código local, head Alembic somente leitura, testes focados existentes e `git diff --check`. Não há captura visual nova porque nenhuma tela mudou. Rollback desta parte: reverter somente este documento e a atualização do status, sem impacto em dados ou API.

**Decisões que exigem sua autorização antes da segunda parte:** (1) três tabelas propostas, incluindo idempotência; (2) workflow iniciado apenas por `fuel-v2.1`, mantendo V1/flags separados; (3) reconciliação manual por administrador, sem rotina agendada; (4) matriz de permissões acima; (5) estados/transições e justificativas; (6) política de severidade. Nenhuma migration será criada ou aplicada até nova ordem.

## Revisão de 13/10/2026 — isolamento de evidências e replay

Esclarecimentos do desenho, ainda não implementado:

- A autorização da fonte do caso não autoriza automaticamente todas as amostras usadas por uma avaliação global. Cada evento deve registrar o escopo efetivo da avaliação. Usuário restrito só recebe evidências calculadas integralmente dentro de seu escopo; uma avaliação global ou de outra secretaria fica oculta, inclusive valores de referência e tamanho da amostra. O evento original é preservado, nunca reescrito para torná-lo visível. Se não houver avaliação compatível, exibir apenas o caso autorizado com evidência indisponível ou produzir nova avaliação autorizada por reconciliação explícita. A política exata de apresentação precisa ser fechada na implementação autorizada.
- Antes de repetir `response_json` de uma chave idempotente, revalidar as permissões e o escopo atuais do ator e das fontes envolvidas. Uma chave conhecida não permite acessar resultado depois da revogação de permissão ou troca de secretaria. A transação original não deve ser repetida; responder 403/404 sem devolver o corpo armazenado quando a autorização deixou de existir.
- `detect_anomalies` deve ordenar registros cronologicamente antes de formar referências, independentemente da ordenação da consulta por veículo. Essa correção já foi aplicada à regra somente leitura existente na revisão geral; nenhuma tabela ou mutação de workflow foi criada.
