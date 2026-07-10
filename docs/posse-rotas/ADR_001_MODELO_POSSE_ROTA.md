# ADR 001 — Separação entre Posse, Rota, Destino e Devolução

- **Status:** aprovado para implementação
- **Escopo:** módulo de posse de veículos
- **Branch de trabalho:** `feat/posse-rotas-relatorios-devolucao`
- **Base:** `módulo-analytics`

## 1. Contexto

O fluxo atual utiliza o registro de posse para representar tanto a responsabilidade continuada do condutor quanto cada saída e retorno do veículo. Na prática, isso força a abertura e o encerramento de várias posses no mesmo dia, gera termos repetidos e dificulta a identificação das rotas executadas durante um único período de responsabilidade.

Também existe necessidade de:

- incluir destinos adicionais enquanto o veículo já está em deslocamento;
- registrar retornos sem encerrar a responsabilidade do condutor;
- produzir um único termo da posse, posteriormente complementado pela devolução;
- gerar relatórios com colunas selecionáveis;
- ampliar auditoria, proteção de rotas e minimização de dados.

## 2. Decisão

### 2.1 Posse

A posse continuará representada pela entidade existente `VehiclePossession`.

A posse define:

- o veículo;
- o condutor responsável;
- o período de responsabilidade;
- hodômetro inicial e final da posse;
- evidências e documento assinado da entrega inicial;
- observações gerais;
- confirmação final de devolução.

Somente uma posse poderá permanecer ativa para cada veículo.

### 2.2 Rota

Será criada entidade própria para cada saída operacional durante uma posse:

`VehiclePossessionTrip`

A rota possuirá:

- vínculo obrigatório com a posse;
- número sequencial dentro da posse;
- status `EM_ANDAMENTO`, `ENCERRADA` ou `CANCELADA`;
- origem;
- finalidade;
- saída e retorno;
- hodômetros inicial e final;
- observações;
- usuários responsáveis pela criação, encerramento e cancelamento;
- timestamps de controle.

Somente uma rota poderá ficar `EM_ANDAMENTO` em cada posse. Como já existe somente uma posse ativa por veículo, essa restrição também impede duas rotas simultâneas para o mesmo veículo.

### 2.3 Destino

Será criada entidade normalizada:

`VehiclePossessionTripDestination`

Cada destino terá ordem própria dentro da rota, descrição, endereço/referência opcional, observação e dados de autoria. Destinos poderão ser adicionados apenas enquanto a rota estiver em andamento.

Não será utilizada string concatenada ou JSON como armazenamento primário da lista de destinos.

### 2.4 Confirmação da devolução

A devolução será registrada em entidade versionada e append-only:

`VehiclePossessionReturnConfirmation`

A confirmação armazenará:

- versão;
- texto e versão da declaração;
- hash SHA-256 de payload canônico;
- usuário autenticado e perfil;
- data/hora;
- IP;
- User-Agent;
- request/correlation ID;
- hodômetro final;
- observações sobre as condições do veículo;
- referência da última rota;
- indicação de registro atual e eventual substituição administrativa.

A confirmação representa declaração autenticada na sessão do sistema. Não será denominada assinatura digital, assinatura eletrônica qualificada ou assinatura ICP-Brasil.

Correções administrativas não apagarão a confirmação anterior. Uma nova versão será criada e a anterior será marcada como substituída.

### 2.5 Termo único

O sistema utilizará um único documento:

**Termo de Posse e Responsabilidade do Veículo**

O documento será gerado a partir dos dados persistidos e conterá:

- entrega inicial;
- identificação da posse;
- veículo e condutor;
- rotas e destinos;
- situação atual;
- devolução, quando confirmada;
- identificador verificável;
- versão e data de geração.

Não será gerado termo separado de devolução.

### 2.6 Relatórios

A definição de colunas será centralizada no backend e exposta ao frontend por metadados autorizados. PDF e XLSX usarão a mesma registry de colunas e a mesma validação de filtros.

A geração oficial será preferencialmente realizada no backend para:

- garantir consistência;
- impedir manipulação de colunas restritas no navegador;
- auditar preview e exportação;
- aplicar mascaramento e autorização de modo uniforme.

## 3. Invariantes de domínio

1. Uma posse ativa por veículo.
2. Uma rota em andamento por posse.
3. Rota pertence obrigatoriamente à posse indicada na URL.
4. Posse encerrada não recebe nova rota.
5. Rota encerrada ou cancelada não recebe destino.
6. Retorno não pode ser anterior à saída.
7. Hodômetro final não pode ser inferior ao inicial.
8. Posse não pode ser encerrada com rota em andamento.
9. Nova posse sobre posse ativa exige confirmação e justificativa explícitas.
10. Operações compostas são atômicas e transacionais.
11. Não existe hard delete para registros administrativos do domínio.
12. Correções retroativas são exclusivas de `ADMIN` e geram `before/after`.

## 4. Decisões de implementação

### 4.1 Status no banco

Preferir coluna textual com `CheckConstraint` em vez de enum nativo do PostgreSQL, salvo se a inspeção do projeto demonstrar padrão consolidado diferente. Isso reduz complexidade de migrations para alteração futura de estados.

### 4.2 Hodômetros

Novos campos de hodômetro devem utilizar tipo numérico decimal apropriado, evitando erro de precisão de ponto flutuante. A compatibilidade com campos legados será preservada; qualquer conversão de tipo exige migration específica e ensaio sobre cópia do banco.

### 4.3 Concorrência

Serviços de criação e encerramento devem usar transação e bloqueio de linha quando necessário. Constraints e índices são a última barreira contra condições de corrida, não apenas validações em Python.

### 4.4 Identificador público

A posse deverá possuir número público estável e não sensível, diferente do UUID interno. O mecanismo deverá ser gerado no banco, único e não reutilizável. Registros legados serão preenchidos por migration segura.

### 4.5 Dados legados

Posses antigas sem rotas continuarão válidas e serão exibidas como registros legados. Não criar rotas artificiais sem evidência documental.

### 4.6 Auditoria

O `AuditService` existente será ampliado por um contexto de requisição. O registro deve conter autoria, ação, entidade, justificativa, request ID, origem técnica e alterações relevantes, sem incluir tokens, cookies, binários ou dados pessoais integrais desnecessários.

## 5. Alternativas rejeitadas

### 5.1 Adicionar apenas campo “destino” na posse

Rejeitada porque não permite múltiplas rotas, ordem de destinos, adições durante o deslocamento nem métricas por viagem.

### 5.2 Encerrar e reabrir posse em cada retorno

Rejeitada porque confunde responsabilidade com deslocamento, multiplica termos e aumenta trabalho operacional.

### 5.3 Armazenar destinos em JSON

Rejeitada como modelo primário porque dificulta integridade referencial, ordenação, auditoria individual, filtros e relatórios.

### 5.4 Gerar termo de devolução separado

Rejeitada por redundância operacional e documental. A devolução deve integrar o termo único da posse.

### 5.5 Gerar relatório exclusivamente no frontend

Rejeitada para o documento oficial porque dificulta autorização por coluna, auditoria uniforme, proteção contra manipulação e consistência entre formatos.

## 6. Consequências

### Positivas

- redução de termos e anexos repetitivos;
- histórico operacional mais fiel;
- relatórios por posse e por rota;
- menor risco de inconsistência entre saídas e devoluções;
- melhor auditabilidade;
- maior aderência à minimização de dados.

### Custos e riscos

- novas tabelas e migrations;
- necessidade de refatorar `PossessionPage` e componentes relacionados;
- necessidade de testes de concorrência e IDOR;
- introdução de geração oficial de documentos no backend;
- cuidado especial com compatibilidade de dados e arquivos existentes.

## 7. Condição de revisão deste ADR

Este ADR somente poderá ser alterado mediante documento substitutivo, com justificativa, impacto em migrations, segurança, LGPD, relatórios e compatibilidade com registros existentes.