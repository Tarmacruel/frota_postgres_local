# Fase 4 — Frontend Operacional de Posses e Rotas

## 1. Objetivo

Entregar a interface operacional que permita manter uma posse ativa com múltiplas rotas, adicionar destinos durante o deslocamento e registrar o retorno sem encerrar a posse.

A interface deve ser mobile first, acessível e coerente com os perfis autorizados, sem duplicar regras de autorização do backend.

## 2. Pré-condições

- Backend da Fase 3 estabilizado e documentado.
- Contratos de API conhecidos.
- Estados de erro `401`, `403`, `404`, `409` e `422` padronizados.
- Componentes e estilos atuais inventariados.

## 3. Estratégia de componentes

`PossessionPage.jsx` já concentra múltiplas responsabilidades. Antes de adicionar o novo fluxo, extrair componentes apenas onde necessário, preservando comportamento atual.

Sugestão de decomposição, ajustável ao código real:

- `PossessionToolbar`;
- `PossessionTable` ou `PossessionCardList`;
- `PossessionActions`;
- `PossessionForm`;
- `InitialTripFields`;
- `TripTimeline`;
- `TripCreateModal`;
- `TripAddDestinationModal`;
- `TripEndModal`;
- `TripCancelModal`;
- hooks `usePossessions` e `usePossessionTrips`, se compatíveis com o padrão existente.

Não promover reescrita global do frontend.

## 4. Nova posse com rota inicial opcional

Adicionar seção recolhível:

**Rota inicial — opcional**

Campos:

- origem;
- finalidade;
- data/hora de saída;
- hodômetro inicial da rota;
- observação;
- lista dinâmica de destinos.

Destinos devem permitir:

- adicionar;
- remover antes do envio;
- reordenar antes do envio;
- informar descrição obrigatória;
- informar endereço/referência e observação opcionais.

A submissão deve enviar posse, evidências, documento e rota inicial no contrato definido pela Fase 3.

Em conflito de posse ativa:

- apresentar resumo da posse atual;
- explicar que a substituição encerrará a responsabilidade anterior;
- exigir confirmação explícita;
- exigir justificativa;
- não repetir automaticamente a requisição sem ação consciente do usuário.

## 5. Painel de rotas

Adicionar ação **Rotas** em cada posse.

O painel deve exibir timeline ou cartões ordenados com:

- número da rota;
- status textual;
- origem;
- finalidade;
- saída;
- retorno;
- destinos em ordem;
- hodômetro inicial/final;
- quilômetros;
- observações;
- autoria operacional quando autorizada.

Para registros legados sem rotas, exibir mensagem clara sem fabricar dados.

## 6. Ações por estado

### Posse ativa sem rota em andamento

- `Iniciar rota`;
- `Encerrar posse`.

### Posse ativa com rota em andamento

- `Adicionar destino`;
- `Registrar retorno da rota`;
- `Cancelar rota`, conforme perfil;
- `Encerrar posse` desabilitado com explicação.

### Posse encerrada

- consultar timeline;
- consultar termo;
- sem ações operacionais.

Os textos “Registrar retorno da rota” e “Encerrar posse” devem permanecer visual e semanticamente distintos.

## 7. Modais e formulários

### Iniciar rota

- preencher origem padrão somente se houver dado confiável;
- exigir finalidade, saída, hodômetro e ao menos um destino quando essa for a regra validada;
- apresentar erros por campo;
- impedir múltiplos envios.

### Adicionar destino

- informar que o destino será incluído na rota em andamento;
- permitir vários destinos em uma operação se o backend suportar;
- não permitir edição de destinos antigos por perfil operacional.

### Registrar retorno

- exigir retorno e hodômetro final;
- mostrar resumo da rota;
- informar explicitamente: “Esta ação encerra apenas a rota. A posse continuará ativa.”

### Cancelar rota

- confirmação de ação crítica;
- justificativa obrigatória;
- texto sobre preservação do histórico.

## 8. Autorização no frontend

- obter permissões do `AuthContext` ou camada equivalente;
- não renderizar ação indisponível;
- ainda tratar `403` do backend;
- não confiar em `role` enviado por formulário;
- limpar estado sensível ao fechar modal ou perder sessão;
- redirecionar ou solicitar login em `401` conforme padrão existente.

## 9. Acessibilidade

Aplicar:

- labels e `id` associados;
- foco inicial controlado em modal;
- retorno do foco ao elemento acionador;
- fechamento por `Escape` quando seguro;
- foco contido no modal;
- `aria-live` para sucesso/erro;
- mensagens vinculadas por `aria-describedby`;
- status com texto, não apenas cor;
- ordem de tabulação lógica;
- botões com nomes acessíveis;
- alternativa para drag-and-drop: botões “mover para cima/baixo”.

## 10. Estado, cache e concorrência

- recarregar posse/rotas após mutação;
- tratar `409` indicando alteração concorrente;
- não manter resposta antiga como fonte de verdade após erro;
- cancelar ou ignorar respostas de requests obsoletos;
- evitar atualização de componente desmontado;
- não persistir dados pessoais no localStorage.

## 11. Testes obrigatórios

Configurar Vitest e React Testing Library somente se ainda não existirem e sem quebrar o build.

Testar:

- abertura da nova posse;
- rota inicial opcional;
- inclusão/remoção/reordenação acessível de destinos;
- conflito de posse ativa;
- abertura da timeline;
- início de rota;
- adição de destino;
- encerramento da rota;
- mensagem de que a posse continua ativa;
- bloqueio visual do encerramento com rota aberta;
- cancelamento com justificativa;
- estados 401/403/409/422;
- restrições por perfil;
- foco e teclado nos modais;
- build de produção.

## 12. Critérios de aceitação

- usuário consegue registrar múltiplas rotas na mesma posse;
- usuário entende a diferença entre retorno e devolução;
- destino pode ser incluído em rota em andamento;
- interface não oferece ação proibida ao perfil;
- backend continua sendo a fonte de verdade;
- fluxo funciona em desktop e celular;
- regressões do módulo atual estão cobertas.

## 13. Prompt para o Codex

```text
Implemente exclusivamente a Fase 4 descrita em:

docs/posse-rotas/04_FRONTEND_DE_POSSES_E_ROTAS.md

Branch obrigatória: feat/posse-rotas-relatorios-devolucao

Leia contratos e testes da Fase 3. Não invente endpoint ou campo. Caso o contrato
esteja inconsistente, pare e documente o bloqueio em vez de contornar no frontend.

Implemente uma interface mobile first para:
- rota inicial opcional na criação da posse;
- conflito explícito de posse ativa com confirmação e justificativa;
- painel/timeline de rotas;
- iniciar rota;
- adicionar destinos durante a rota;
- registrar retorno sem encerrar a posse;
- cancelar rota com justificativa;
- bloquear encerramento da posse quando houver rota aberta.

Refatore PossessionPage apenas o necessário, extraindo componentes coesos. Não
reescreva o sistema nem altere identidade visual sem necessidade.

Requisitos obrigatórios:
- diferenciar claramente “Registrar retorno da rota” de “Encerrar posse”;
- backend permanece fonte de verdade;
- tratar 401, 403, 409 e 422;
- impedir duplo submit;
- não armazenar dados pessoais em localStorage;
- usar labels, foco controlado, aria-live, teclado e status textual;
- oferecer botões de reordenação acessíveis, sem depender apenas de drag-and-drop;
- preservar evidências e documento existentes da posse.

Crie testes com as ferramentas existentes. Se não houver infraestrutura frontend,
configure Vitest/React Testing Library de forma mínima e documentada. Execute testes,
build e validações do baseline.

Atualize CHECKLIST_EXECUCAO apenas com evidências. Entregue:
- componentes criados/alterados;
- fluxo por estado da posse/rota;
- comportamento por perfil;
- testes e resultados;
- screenshots ou descrição verificável dos estados;
- débitos remanescentes para a Fase 5.

Não avance para a Fase 5.
```