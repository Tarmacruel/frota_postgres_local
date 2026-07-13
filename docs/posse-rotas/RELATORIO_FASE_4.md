# Relatório da Fase 4 — frontend de posses e rotas

Data: **2026-07-13**. Branch: `feat/posse-rotas-relatorios-devolucao`. Base da árvore de trabalho: `4295b98030c1da80db7649e40c9c67a3b3eb360c`.

## Resultado

A tela de posses passou a consumir exclusivamente os contratos da Fase 3 para criar e acompanhar rotas. A criação de posse aceita uma rota inicial opcional na mesma operação multipart; um conflito de posse ativa é exibido ao operador e somente pode ser repetido com confirmação consciente e justificativa. Fotos, localização capturada e documentos já selecionados permanecem no estado do formulário durante essa repetição.

O painel de rotas usa uma linha do tempo cronológica, permite iniciar rota, acrescentar destinos ordenados, registrar retorno e cancelar com justificativa. “Registrar retorno da rota” encerra somente a rota e é apresentado separadamente de “Encerrar posse”. Antes de oferecer o encerramento da posse, a página consulta o backend com `status=EM_ANDAMENTO`; com rota aberta, o botão fica desabilitado e as ações operacionais são oferecidas. O `409 POSSESSION_HAS_OPEN_TRIP` continua tratado como barreira autoritativa caso o estado mude entre a consulta e a mutação.

Nenhum endpoint, schema, migration ou fluxo da Fase 5 foi criado ou alterado.

## Componentes e arquivos

### Criados

- `frontend/src/components/InitialTripFields.jsx`: rota inicial opcional no formulário de posse;
- `frontend/src/components/PossessionTripsModal.jsx`: workspace paginado de rotas e suas mutações;
- `frontend/src/components/TripDestinationEditor.jsx`: editor de destinos com inclusão, remoção e reordenação por botões;
- `frontend/src/components/TripTimeline.jsx`: leitura cronológica e estado textual das rotas;
- `frontend/src/utils/httpError.js`: leitura uniforme de status, código e erros 422;
- `frontend/src/utils/tripDestination.js`: criação de drafts e serialização do contrato de destino;
- testes de `Modal`, `PossessionForm`, `PossessionTripsModal`, `TripDestinationEditor`, `TripTimeline` e `PossessionPage`.

### Alterados

- `frontend/src/api/possession.js`: métodos para os seis endpoints aninhados da Fase 3;
- `frontend/src/components/Modal.jsx`: foco inicial, contenção de Tab, Escape, retorno de foco e bloqueio de fechamento durante envio;
- `frontend/src/components/PossessionForm.jsx`: rota inicial e repetição explícita do conflito `ACTIVE_POSSESSION_EXISTS`;
- `frontend/src/pages/PossessionPage.jsx`: estado de rota por posse, ações por estado e retificação limitada a `ADMIN`;
- `frontend/src/pages/AuditPage.jsx`: filtros dos eventos e da entidade `POSSESSION_TRIP` implantados na Fase 3;
- `frontend/src/styles.css`: composição mobile first, timeline, estados críticos e distinção visual das ações;
- `frontend/src/test/setup.js` e `frontend/vite.config.js`: limpeza de DOM e execução determinística no pool `vmThreads`, com um worker no volume de rede.

## Contratos consumidos

| Operação | Chamada usada pelo frontend |
|---|---|
| Criar posse e rota inicial opcional | `POST /api/possession`, multipart com `initial_trip_json` |
| Substituir posse ativa | mesma chamada com `replace_active=true` e `replacement_reason` após `409 ACTIVE_POSSESSION_EXISTS` |
| Listar/timeline | `GET /api/possession/{possession_id}/trips?page&limit&status` |
| Iniciar rota | `POST /api/possession/{possession_id}/trips` |
| Adicionar destinos | `POST /api/possession/{possession_id}/trips/{trip_id}/destinations` |
| Registrar retorno | `PUT /api/possession/{possession_id}/trips/{trip_id}/end` |
| Cancelar rota | `PUT /api/possession/{possession_id}/trips/{trip_id}/cancel` |

Não foi criado campo de resumo de rota na posse. Para impedir uma inferência local incorreta, a página consulta o filtro oficial `EM_ANDAMENTO` para cada posse ativa visível. IDs de rota sempre são enviados sob o `possession_id` da linha selecionada.

## Fluxo por estado

| Estado | Interface e ações |
|---|---|
| Nova posse sem rota | formulário anterior preservado; rota inicial permanece desmarcada e opcional |
| Nova posse com rota | seção expandida exige origem, finalidade, saída e hodômetro; destinos são opcionais e ordenáveis |
| Conflito de posse ativa | resumo da posse atual, checkbox não marcado e justificativa de 8 a 1.000 caracteres; a primeira tentativa não encerra nada |
| Posse ativa sem rota aberta | “Iniciar rota” e “Encerrar posse” disponíveis conforme permissão |
| Posse ativa com rota aberta | “Adicionar destino”, “Registrar retorno” e “Cancelar rota”; “Encerrar posse bloqueado” desabilitado |
| Rota encerrada | retorno, hodômetros e quilômetros em estado textual; nenhuma mutação da rota encerrada |
| Rota cancelada | justificativa visível aos perfis autorizados; destinos e histórico preservados |
| Posse encerrada | timeline somente leitura; nenhuma nova rota |
| Registro legado sem rotas | estado vazio explícito; nenhuma rota artificial é criada |

## Comportamento por perfil

| Perfil | Comportamento efetivo |
|---|---|
| `ADMIN` | consulta e mutações operacionais; retificação administrativa; sem hard delete |
| `PRODUCAO` | consulta, cria posse/rota, adiciona destinos, registra retorno, cancela rota e encerra posse sem rota aberta; não recebe botão de retificação administrativa |
| `PADRAO` | timeline somente leitura; sem botões de mutação; origem, destinos, observação e justificativa continuam ocultos quando `operational_details_restricted=true`; a UI também suprime defensivamente uma origem que venha preenchida em resposta marcada como restrita |
| `POSTO` | rota `/posses` continua protegida por `possession.view`; sem essa permissão, não há item de navegação nem renderização da página; o backend permanece como segunda barreira e responde `403` |

Overrides individuais continuam apenas restringindo: os botões dependem das permissões granulares, enquanto o backend aplica o teto de papel da Fase 1.

## Estados de erro, concorrência e acessibilidade

- `401`: mensagem de sessão expirada, limpeza do workspace sensível e recarga do contexto de autenticação;
- `403`: negativa textual sem ação alternativa;
- `409`: motivo do conflito preservado em tela e timeline recarregada do servidor;
- `422`: mensagem global e associação do erro ao campo por `aria-describedby`;
- refs síncronas impedem duplo submit antes mesmo da próxima renderização;
- todos os campos novos têm labels; feedback usa `aria-live`, `role=alert` ou `role=status`;
- o modal move o foco ao primeiro campo, contém Tab, fecha por Escape quando seguro e devolve o foco ao acionador;
- destinos podem ser reordenados por “Mover para cima/baixo”, inclusive por teclado, sem depender de drag-and-drop;
- nenhuma informação de posse/rota foi gravada em `localStorage`; CSRF e request context continuam centralizados no cliente e middleware da Fase 1.

## Descrição verificável dos estados visuais

Não foi capturada imagem de uma sessão autenticada. Os estados abaixo são verificáveis pelos testes de DOM e pelos seletores acessíveis:

1. **Lista com rota aberta:** a linha mostra o número público, “Adicionar destino”, “Registrar retorno”, “Cancelar rota” e o botão desabilitado “Encerrar posse bloqueado”. O teste `PossessionPage.test.jsx` confirma também a consulta `status=EM_ANDAMENTO`.
2. **Timeline:** um eixo vertical numera as rotas; cada item tem status textual “Em andamento”, “Encerrada” ou “Cancelada”, fatos operacionais e destinos ordenados.
3. **Retorno:** o cabeçalho e o botão dizem “Registrar retorno da rota”; uma faixa informa “Esta ação encerra apenas a rota” e que a posse continua ativa.
4. **Conflito de posse:** faixa crítica com número público anterior, checkbox inicialmente desmarcado e justificativa obrigatória; o botão de confirmação permanece desabilitado até os dois requisitos.
5. **Perfil restrito:** aviso “Detalhes operacionais restritos”, sem origem real, destinos ou ações de mutação.

Em telas até 720 px, fatos e campos usam uma coluna, ações têm área mínima de toque e o modal respeita `100dvh`; acima disso, fatos e destinos usam grades progressivas sem alterar a ordem de leitura.

## Testes e validações

| Comando | Resultado real |
|---|---|
| `npx vitest run <testes da Fase 4> --reporter=verbose` | **8 passed** na primeira execução direcionada; depois foram acrescentados os testes da página e do modal |
| primeira tentativa de `npm test -- --reporter=verbose` | falhou antes de executar testes: seis workers paralelos expiraram ao iniciar no volume `Z:` |
| `npm test -- --reporter=verbose` após `fileParallelism=false`, `maxWorkers=1`, `pool=vmThreads` | **8 arquivos e 15 testes aprovados** em 92,19 s; somente dois avisos de futuro do React Router |
| `npm run lint` | exit 0, sem erro; **45 warnings preexistentes** em arquivos não relacionados ou linhas anteriores da página |
| `npm run build` | passou na execução final: Vite 8.1.4, **970 módulos**, 10,56 s |
| `npm audit --audit-level=low` | zero vulnerabilidades |
| `python -m pytest tests -q` sem URLs isoladas | **104 passed, 17 skipped**; os 17 eram testes PostgreSQL condicionais das Fases 2/3 |
| suíte com `PHASE2_TEST_DATABASE_URL` e `PHASE3_TEST_DATABASE_URL` apontando ao banco isolado 0039 | **121 passed**, 22 warnings de `python-jose`, 10,03 s |
| `python -m compileall -q app` | passou |
| `alembic heads` / `alembic current` | ambos `0039_possession_trips (head)` |
| `alembic history --verbose` | passou; `0039` revisa `0038_require_user_cpf` |
| `alembic check` | `No new upgrade operations detected.` |
| `git diff --check` | passou; avisos LF/CRLF do Git no Windows |

## Débitos remanescentes para a Fase 5

1. A tela de termos e os anexos separados de empréstimo/devolução permanecem exatamente como legado; a substituição pelo termo único somente pode ocorrer na Fase 5 e deve preservar consulta histórica.
2. A confirmação de devolução append-only ainda não tem interface, preview ou hash canônico; nada foi antecipado nesta fase.
3. A lista faz uma consulta de rota aberta por posse ativa visível porque a Fase 3 não expõe resumo no contrato da posse. O limite é de dez linhas por página, mas uma otimização futura exige contrato backend explícito, não inferência no frontend.
4. A validação visual foi feita por DOM acessível e descrição verificável; um smoke test com sessão real e viewport móvel deve integrar o rollout posterior.
5. Os 45 warnings globais do ESLint e os avisos de futuro do React Router permanecem como baseline; não foram corrigidos fora do escopo.

Nenhuma atividade da Fase 5 foi iniciada.
