# Fase 2 — Modelo de Dados, Integridade e Migrations

## 1. Objetivo

Criar a estrutura persistente do novo domínio, preservando integralmente posses e arquivos existentes. Esta fase implementa modelos, relacionamentos, repositories mínimos e migrations, mas ainda não entrega o fluxo completo de endpoints e interface.

## 2. Pré-condições

- Fases 0 e 1 concluídas.
- Head ou heads do Alembic identificados.
- Backup/restauração local comprovados.
- ADR e matriz RBAC confirmados.

## 3. Estrutura proposta

Os nomes devem seguir o padrão real do projeto após inspeção.

### 3.1 Evolução de `vehicle_possession`

Adicionar, quando ainda inexistentes:

- `public_number`: número público único, estável e não reutilizável;
- `updated_at`;
- campos auxiliares estritamente necessários ao novo fluxo;
- relacionamento com rotas e confirmações.

O número público deve ser gerado no banco. Registros antigos devem ser preenchidos de modo determinístico e seguro antes da aplicação de `NOT NULL` e `UNIQUE`.

Não alterar UUIDs existentes.

### 3.2 `vehicle_possession_trip`

Campos mínimos:

- `id` UUID PK;
- `possession_id` UUID FK `ON DELETE RESTRICT` ou política equivalente que preserve histórico;
- `sequence_number` inteiro positivo;
- `status` texto com check: `EM_ANDAMENTO`, `ENCERRADA`, `CANCELADA`;
- `origin` texto limitado;
- `purpose` texto limitado;
- `departure_at` timestamptz;
- `return_at` timestamptz nullable;
- `start_odometer_km` numeric não negativo;
- `end_odometer_km` numeric nullable e não negativo;
- `observation` texto limitado;
- `created_by_user_id` FK;
- `closed_by_user_id` FK nullable;
- `cancelled_by_user_id` FK nullable;
- `created_at`, `updated_at`, `closed_at`, `cancelled_at`;
- `cancellation_reason` nullable, exigido quando cancelada.

Constraints mínimas:

- `sequence_number > 0`;
- único `(possession_id, sequence_number)`;
- retorno não anterior à saída;
- hodômetro final não inferior ao inicial;
- coerência entre status e campos de fechamento/cancelamento;
- índice parcial único para uma rota `EM_ANDAMENTO` por posse;
- índices para posse, status, saída e autoria.

A unicidade de rota em andamento por posse, combinada à unicidade de posse ativa por veículo, é a barreira de banco contra duas rotas simultâneas do mesmo veículo.

### 3.3 `vehicle_possession_trip_destination`

Campos mínimos:

- `id` UUID PK;
- `trip_id` UUID FK;
- `sequence_number` inteiro positivo;
- `description` texto obrigatório;
- `address_reference` texto opcional;
- `observation` texto opcional;
- `arrived_at` e `departed_at` opcionais;
- `created_by_user_id` FK;
- `created_at`, `updated_at`.

Constraints:

- único `(trip_id, sequence_number)`;
- sequência positiva;
- saída do destino não anterior à chegada;
- textos com limites definidos nos schemas e, quando viável, no banco.

### 3.4 `vehicle_possession_return_confirmation`

Modelo append-only e versionado:

- `id` UUID PK;
- `possession_id` UUID FK;
- `version` inteiro positivo;
- `is_current` boolean;
- `declaration_version` texto curto;
- `declaration_text` texto;
- `canonical_payload_hash` char(64) ou equivalente;
- `confirmed_by_user_id` FK;
- snapshot de nome, e-mail e perfil do confirmador, observada minimização;
- `confirmed_at` timestamptz;
- `request_id` limitado;
- `ip_address` tipo apropriado, preferencialmente `INET`;
- `user_agent` limitado;
- `final_odometer_km` numeric;
- `vehicle_condition_notes` texto;
- `last_trip_id` FK nullable;
- `superseded_at` nullable;
- `superseded_by_confirmation_id` nullable;
- `admin_correction_reason` nullable;
- `created_at`.

Constraints:

- único `(possession_id, version)`;
- índice parcial único para `is_current = true` por posse;
- hash no formato esperado;
- versão positiva;
- confirmação atual não pode estar marcada como substituída;
- correção administrativa deve manter encadeamento histórico.

### 3.5 Preferências de relatório

Não criar nesta fase, salvo se o baseline demonstrar que o projeto já possui tabela genérica de preferências. A migration de preferência poderá ser criada na Fase 6 para evitar antecipação desnecessária.

## 4. Relacionamentos e exclusões

- Não usar cascade de exclusão que remova histórico administrativo.
- Não disponibilizar métodos de delete nos repositories do novo domínio.
- FKs de usuários podem usar `SET NULL` apenas se snapshots necessários permanecerem preservados; confirmar política atual.
- Rotas e confirmações devem sobreviver à inativação do usuário.
- Destinos não devem ser removidos fisicamente após persistência; eventual correção futura deve ser auditável.

## 5. Estratégia de migration

1. Executar `alembic heads` e confirmar o `down_revision` real.
2. Criar migration sem editar migrations já aplicadas.
3. Criar sequência/coluna pública nullable.
4. Preencher registros legados.
5. Aplicar índices/constraints apenas após saneamento.
6. Criar tabelas novas.
7. Executar upgrade em banco vazio.
8. Executar upgrade em cópia de banco existente.
9. Verificar contagens antes/depois.
10. Verificar arquivos e referências existentes.
11. Avaliar downgrade técnico sem prometer rollback destrutivo em produção.

Não usar `alembic stamp` para mascarar inconsistência.

## 6. Repositories mínimos

Criar apenas operações necessárias para testes e futura Fase 3:

- buscar rota por ID e posse;
- buscar rota em andamento com lock opcional;
- obter próximo número sequencial de forma concorrente segura;
- listar rotas por posse com destinos;
- criar rota e destino;
- buscar confirmação atual;
- obter próxima versão de confirmação com lock.

Evitar N+1 usando `selectinload`/`joinedload` conforme cardinalidade.

## 7. Testes obrigatórios

- migration em banco limpo;
- migration sobre fixture representando banco anterior;
- registros legados recebem número público único;
- duas rotas em andamento na mesma posse são rejeitadas pelo banco;
- sequência duplicada é rejeitada;
- retorno anterior à saída é rejeitado;
- hodômetro final inferior é rejeitado;
- duas confirmações atuais são rejeitadas;
- histórico não é apagado por cascata;
- relacionamentos carregam sem N+1 evidente;
- concorrência na obtenção da sequência é tratada.

## 8. Critérios de aceitação

- schema novo criado sem perda de legado;
- constraints representam invariantes do ADR;
- migration é reproduzível;
- contagens antes/depois permanecem coerentes;
- nenhuma API pública de rotas foi exposta ainda;
- rollback operacional está descrito como restauração de backup quando downgrade puder causar perda.

## 9. Prompt para o Codex

```text
Implemente exclusivamente a Fase 2 descrita em:

docs/posse-rotas/02_MODELO_DE_DADOS_E_MIGRACOES.md

Branch obrigatória: feat/posse-rotas-relatorios-devolucao

Leia os resultados das Fases 0 e 1, o ADR e a matriz RBAC/LGPD. Antes de gerar
migration, execute alembic heads/current/history e confirme o head real. Não
presuma o down_revision e não edite migrations já aplicadas.

Implemente:
- número público estável da posse;
- VehiclePossessionTrip;
- VehiclePossessionTripDestination;
- VehiclePossessionReturnConfirmation versionada e append-only;
- relacionamentos, constraints, índices e índices parciais;
- repositories mínimos para a próxima fase;
- testes de integridade, migration e concorrência.

Regras obrigatórias:
- preservar todos os dados legados;
- não resetar, recriar, truncar ou apagar banco;
- não criar hard delete;
- não criar cascade que elimine histórico;
- usar timestamptz/UTC;
- usar decimal apropriado para novos hodômetros;
- uma rota em andamento por posse;
- uma confirmação atual por posse;
- sequências únicas por posse/rota;
- correções futuras devem preservar versões anteriores.

Aplique a migration primeiro em banco limpo e depois em cópia controlada do banco
existente. Compare contagens, constraints e registros antes/depois. Não use stamp
para esconder divergências.

Não implemente endpoints ou interface nesta fase.

Atualize CHECKLIST_EXECUCAO somente com evidências. No relatório final, apresente:
- diagrama do novo schema;
- migration e down_revision;
- SQL/constraints relevantes;
- comandos executados;
- resultados de upgrade;
- contagens antes/depois;
- limitações do downgrade;
- riscos para a Fase 3.

Não avance para a Fase 3.
```