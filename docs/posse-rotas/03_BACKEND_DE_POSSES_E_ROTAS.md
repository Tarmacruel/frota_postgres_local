# Fase 3 — Backend de Posses, Rotas e Destinos

## 1. Objetivo

Implementar as regras de domínio e os endpoints REST para criação e operação de rotas dentro de uma posse, com transações, concorrência segura, autorização, proteção contra IDOR e auditoria completa.

## 2. Pré-condições

- Fases 0 a 2 concluídas.
- Migration aplicada e validada em ambiente de desenvolvimento.
- Infraestrutura de request ID, CSRF e auditoria disponível.
- Constraints do banco confirmadas por testes.

## 3. Regras de domínio

### 3.1 Criação de posse

Manter a possibilidade de criar posse sem rota inicial.

Permitir criação atômica de posse com rota inicial opcional. O payload multipart existente poderá receber um campo JSON estritamente validado, por exemplo `initial_trip_json`, sem aceitar estruturas arbitrárias.

Se a rota inicial ou seus destinos falharem:

- a posse não deve permanecer gravada;
- arquivos criados durante a tentativa devem ser limpos;
- auditoria de sucesso não deve ser registrada;
- a resposta deve ser segura e conter request ID.

### 3.2 Posse ativa existente

O comportamento atual de encerrar silenciosamente a posse ativa deve ser substituído por confirmação explícita.

Quando o veículo já possuir posse ativa:

- retornar conflito com resumo mínimo da posse ativa;
- não encerrar automaticamente por padrão;
- aceitar substituição apenas com flag explícita e justificativa válida;
- bloquear a posse ativa com `SELECT ... FOR UPDATE` ou mecanismo equivalente;
- impedir substituição se houver rota em andamento;
- encerrar a posse anterior com dados coerentes;
- registrar `POSSESSION_REPLACE_ACTIVE` com IDs e justificativa;
- criar a nova posse na mesma transação.

Não permitir que uma condição de corrida produza duas posses ativas.

### 3.3 Criação de rota

Pré-condições:

- posse existe;
- posse está ativa;
- usuário possui `ADMIN` ou `PRODUCAO`;
- não existe rota em andamento;
- saída não antecede o início da posse;
- hodômetro é coerente com o último hodômetro conhecido.

Em divergência de hodômetro:

- não corrigir silenciosamente;
- retornar erro ou exigir justificativa conforme regra definida;
- registrar evento administrativo quando a divergência for autorizada.

### 3.4 Destinos

- aceitar um ou mais destinos na criação da rota;
- permitir adição enquanto `EM_ANDAMENTO`;
- gerar sequência de modo concorrente seguro;
- impedir alteração em rota encerrada/cancelada;
- auditar cada inclusão ou inclusão em lote com dados mínimos;
- validar que `trip_id` pertence ao `possession_id` da URL.

### 3.5 Encerramento de rota

Exigir:

- data/hora de retorno;
- hodômetro final;
- observação opcional;
- rota em andamento;
- retorno não anterior à saída;
- hodômetro final não inferior ao inicial.

Atualizar status, usuário e timestamps na mesma transação. Registrar quilômetros calculados e auditoria `TRIP_END`.

### 3.6 Cancelamento

- exigir justificativa;
- não apagar rota ou destinos;
- restringir conforme matriz RBAC;
- não permitir cancelamento de rota já encerrada sem fluxo administrativo específico;
- registrar `TRIP_CANCEL`.

### 3.7 Encerramento da posse

Nesta fase, manter endpoint compatível, mas bloquear encerramento se existir rota em andamento.

A confirmação autenticada completa será implementada na Fase 5. Até lá, o serviço deverá estar preparado para receber o novo fluxo sem duplicar lógica.

## 4. Endpoints propostos

Ajustar ao padrão real do projeto:

- `GET /api/possession/{possession_id}/trips`
- `POST /api/possession/{possession_id}/trips`
- `GET /api/possession/{possession_id}/trips/{trip_id}`
- `POST /api/possession/{possession_id}/trips/{trip_id}/destinations`
- `PUT /api/possession/{possession_id}/trips/{trip_id}/end`
- `PUT /api/possession/{possession_id}/trips/{trip_id}/cancel`

Listagens devem suportar paginação e filtros quando o volume justificar. Não carregar toda a base para filtrar no frontend.

## 5. Schemas

Criar schemas separados:

- `TripCreate`;
- `TripDestinationCreate`;
- `TripEnd`;
- `TripCancel`;
- `TripAdminUpdate`, se estritamente necessário;
- `TripOut`;
- `TripDestinationOut`;
- respostas paginadas.

Aplicar:

- limites de tamanho;
- normalização de texto;
- datas timezone-aware;
- UUIDs tipados;
- números não negativos;
- rejeição de campos extras em payloads críticos, quando compatível com o padrão do projeto.

## 6. Transações e concorrência

- Service controla a unidade de trabalho.
- Repository não realiza `commit` autônomo.
- Bloquear posse/rota antes de validar estado que será alterado.
- Tratar `IntegrityError` como conflito previsível.
- Não devolver detalhes internos da constraint ao cliente.
- Arquivos e banco devem possuir compensação em caso de falha.
- Usar constraints como última linha de defesa.

## 7. Auditoria

Eventos mínimos:

- `POSSESSION_CREATE`;
- `POSSESSION_REPLACE_ACTIVE`;
- `TRIP_CREATE`;
- `TRIP_DESTINATION_ADD`;
- `TRIP_END`;
- `TRIP_CANCEL`.

Cada evento deverá conter request context, entidade, ator, IDs relacionados, justificativa e mudanças relevantes. Não registrar documento integral, contato integral, coordenadas integrais ou payload bruto.

## 8. Proteção contra IDOR

Toda operação aninhada deve buscar o recurso com ambas as chaves:

- `possession_id`;
- `trip_id`.

Não buscar apenas por `trip_id` e confiar no path. Para recurso existente em outra posse, usar resposta consistente que não revele indevidamente sua existência.

## 9. Testes obrigatórios

- posse sem rota;
- posse com rota inicial e múltiplos destinos;
- rollback integral quando destino falha;
- conflito de posse ativa sem confirmação;
- substituição confirmada e auditada;
- bloqueio de substituição com rota aberta;
- criação de rota em posse encerrada;
- duas rotas simultâneas;
- concorrência em criação de rota;
- inclusão concorrente de destinos;
- destino em rota encerrada;
- encerramento válido;
- retorno/data/hodômetro inválidos;
- cancelamento sem justificativa;
- encerramento de posse com rota aberta;
- 401, 403 e CSRF;
- IDOR entre posses;
- auditoria e request ID;
- rollback de arquivos na criação composta.

## 10. Critérios de aceitação

- API permite múltiplas rotas sequenciais na mesma posse;
- apenas uma rota fica em andamento;
- novos destinos podem ser adicionados;
- retorno encerra somente a rota;
- serviço não encerra posse silenciosamente;
- transações e constraints resistem a concorrência;
- permissões e IDOR estão cobertos por testes;
- frontend antigo não é quebrado sem estratégia de compatibilidade documentada.

## 11. Prompt para o Codex

```text
Implemente exclusivamente a Fase 3 descrita em:

docs/posse-rotas/03_BACKEND_DE_POSSES_E_ROTAS.md

Branch obrigatória: feat/posse-rotas-relatorios-devolucao

Leia todas as fases anteriores, ADR, matriz RBAC/LGPD e migrations efetivamente
criadas. Não altere o schema fora de migration adicional justificada.

Implemente services, repositories, schemas e endpoints para:
- criação de posse sem rota;
- criação atômica de posse com rota inicial opcional;
- conflito e substituição explícita de posse ativa;
- criação de rota;
- inclusão de destinos;
- encerramento de rota;
- cancelamento sem exclusão;
- bloqueio do encerramento da posse quando houver rota em andamento.

Requisitos críticos:
- backend é fonte de verdade da autorização;
- todas as mutações usam CSRF e request context da Fase 1;
- ADMIN/PRODUCAO usam require_writer; ações administrativas usam require_admin;
- buscar trip sempre vinculado ao possession_id para impedir IDOR;
- usar transações, row locks e constraints;
- repository não deve fazer commits isolados;
- não encerrar posse ativa silenciosamente;
- justificar e auditar substituição;
- limpar arquivos quando operação composta falhar;
- não implementar hard delete;
- não expor dados restritos a perfis sem autorização.

Mantenha compatibilidade controlada com o endpoint existente. Caso seja necessária
mudança de contrato, documente-a e forneça tratamento temporário claro, sem manter
duas regras de negócio contraditórias.

Crie testes de domínio, API, concorrência, CSRF, RBAC, IDOR, rollback e auditoria.
Execute pytest, migration check e demais comandos do baseline.

Atualize CHECKLIST_EXECUCAO apenas com evidências reais. No relatório final, liste:
- endpoints e contratos;
- arquivos alterados;
- transações/locks usados;
- eventos de auditoria;
- testes e resultados;
- compatibilidade com frontend atual;
- riscos para a Fase 4.

Não avance para a Fase 4.
```