# Fase 10 — persistência e workflow em homologação

Data: 13/10/2026. Branch `feature/analytics-evolution-hml`; HEAD inicial/final `82f3415fc358e3f5152a9ee4d0fad53594d264e5`. Autorização expressa: “autorizada a persistencia da fase 10”. [Plano de execução](EXECPLAN_PHASE_10_PART_2.md); desenho aprovado em [parte 1](EXECPLAN_PHASE_10_PART_1.md).

## Entrega

- Migration **`0052_analytics_alert_workflow`**, após `0051`, aplicada exclusivamente ao PostgreSQL isolado HML `127.0.0.1:5441/frota_emprestimos_testes`, pelo runner que valida diretório, cluster e credenciais. Criou `analytics_alert_cases`, `analytics_alert_events` e `analytics_alert_requests` vazias, sem backfill. [Sonda após migration](evidence/phase-10/after-migration.json).
- Casos dos cinco tipos aprovados `fuel-v2.1`, severidade determinística (hodômetro HIGH; demais MEDIUM), estados NEW/IN_REVIEW/RESOLVED/IGNORED e justificativas conforme a máquina aprovada. Sem classificação de fraude, culpa ou consumo efetivo.
- Reconciliação exclusivamente explícita por administrador com `analytics:view/edit` e `fuel_supplies:view`. GET não gera casos; nenhum agendamento ou atualização de flag operacional foi incluído.
- Fingerprint SHA-256 por abastecimento/regra, sem período/estado/versão de regra na identidade. Unicidade no banco, locks estáveis de fonte → caso e transações asseguram convergência concorrente. Reavaliações positivas acrescentam histórico e preservam a decisão humana; ausência de detecção não resolve casos. Reabertura de fechado/ignorado exige decisão humana justificada.
- Primeira evidência preservada; avaliação mais recente e histórico paginado incluem regra, observado, referência, amostra, limitações, versão e recorte/histórico utilizados. Não se guarda recibo, CPF, contato ou payload operacional bruto.
- Caso, evento, auditoria existente e chave idempotente gravados no mesmo commit. Falha da auditoria reverte tudo. Histórico protegido por trigger e revogação de UPDATE/DELETE do papel de aplicação. A única exceção do trigger é manutenção da FK, removendo o ID de um usuário excluído e conservando seu rótulo.
- Aba Alertas apresenta fila/filtros, reconciliação, investigação e tratamento no drawer/pilha existentes. Placa, marca/modelo e data do abastecimento distinguem ocorrências; veículos/condutores e registros usam detalhes/API de domínio existentes. V1 e sua exportação permanecem acessíveis sob demanda em “Consultar insights anteriores (V1)”.

## Contratos e autorização

Rotas sob `/api/analytics/v2`:

| Método | Rota | Contrato |
|---|---|---|
| GET | `/alerts` | Datas civis V2, organização, veículo/tipo, estado, severidade, regra, offset/limit≤100; padrão casos abertos. Datas filtram o abastecimento, não geram avaliação. |
| GET | `/alerts/{id}` | Detalhe autorizado, evidência original/atual, estados permitidos, `ETag` com versão. |
| GET | `/alerts/{id}/events` | Histórico filtrado antes de contagem/paginação; ordem estável. |
| POST | `/alerts/reconcile` | Corpo fechado com filtros V2; `Idempotency-Key` obrigatória; recibo de conferidos/detectados/criados/reavaliados/pulados. |
| PATCH | `/alerts/{id}/status` | Apenas status/justificativa; `Idempotency-Key` e `If-Match: "versão"`; retorna recibo mínimo `{id,status,version}` e ETag. |

O recibo mínimo da transição é um ajuste deliberado ao desenho: o cliente busca novamente o caso após sucesso, evitando repetir evidência antiga de uma resposta cacheada quando o escopo muda. Mesma chave/pedido não aplica outra transação; payload/header de versão diferentes com a mesma chave recebem 409. Versão obsoleta/transição inválida: 409; cabeçalho ausente: 428; enum/filtro/justificativa inválido: 422; permissão geral/fonte ausente: 403; ID fora do escopo: 404. Respostas de sucesso privadas, sem armazenamento. Mutações continuam sujeitas ao CSRF existente, sem exceção nova.

PRODUCAO só trata com edição explícita de Analytics e fonte autorizada, no escopo atual. Sem secretaria resulta em fila vazia/404. Fonte ausente é preservada como evidência para ADMIN; fica invisível para usuário restrito. Snapshot não concede acesso: também se verifica a identidade atual de veículo/condutor da fonte, ocultando snapshots incompatíveis até nova reconciliação autorizada.

Avaliações globais/de outra secretaria ficam ocultas para PRODUCAO, inclusive amostra/referência. Detalhe pode mostrar avaliação anterior compatível, identificando seu recorte. Evidência original nunca é reescrita. Timeline/total são filtrados por contexto compatível; transição autorizada sem evidência compatível registra evento com evidência vazia, sem copiar referência global. Replay revalida permissões e fonte/escopo antes de retornar o recibo armazenado. Nenhuma permissão foi concedida em massa pela migration.

## Validação e defeitos de QA corrigidos

| Verificação | Resultado |
|---|---|
| Backend completo | **644 aprovados / 88 pulados**, 7 avisos de depreciação preexistentes. |
| PostgreSQL do workflow | 11 testes em schemas descartáveis no cluster HML; upgrade/downgrade vazio, concorrência, deduplicação, replay, rollback, escopo/evidência e imutabilidade. Guard SQL impede DML fora das tabelas de QA de casos/eventos/requests/auditoria. Todos os schemas foram removidos. |
| Frontend completo | **295 aprovados em 58 arquivos**. |
| Regressão focada após QA | **41 aprovados**: Modal, alertas, drawer e dashboard. |
| Modal após ajuste final do ref | **3 aprovados**; QA de navegador confirmou foco preso/restaurado na versão final. |
| Lint | **0 erros / 45 avisos preexistentes**. |
| Build | Aprovado; `index-D0qAPC_i.js`, 754,42 KB / 178,02 KB gzip. Aviso de chunk >650 KB preexistente. |
| Diff check | Sem erros de whitespace; normalização LF/CRLF segue a configuração existente. |

As sondas do workflow escrevem apenas em schemas novos `analytics_alert_qa_<UUID>`, com tabelas de auditoria próprias; fontes operacionais são lidas/lockadas, nunca alteradas. Downgrade foi exercitado somente nesse schema descartável, nunca na HML com casos. Testes de contratos verificam campos extras, paginação, enums, cabeçalhos e permissão de fonte.

QA visual encontrou e corrigiu:

1. Select de estado ultrapassava a largura do celular. Controles usam os tokens já existentes e grade de uma coluna em largura pequena.
2. Dois casos do mesmo veículo precisavam da data do abastecimento para serem distinguíveis na fila.
3. Summary no final do histórico não participava do ciclo de foco do Modal. O componente reutilizado passou a incluir summaries visíveis e excluir controles de details fechado; recupera foco quando o controle ativo desaparece.
4. Após tratar um caso, recarregar a fila removia o acionador original. O drawer agora tem destino alternativo de foco na central de casos, usado somente se o acionador não existir mais.

[QA com fixtures anonimadas](evidence/phase-10/browser-qa.json): seis combinações de tema/tela (1366×900, 1920×1080, 390×844), zero overflow/erro JavaScript; registro → voltar, motivo obrigatório, original/histórico preservados, foco preso e retorno de foco aprovados. Todas as APIs foram interceptadas; resolução/ignore demonstrativos ocorreram só no navegador de teste, não na base HML.

Capturas inspecionadas: [fila desktop clara](evidence/phase-10/queue-1366-light.png), [fila mobile escura](evidence/phase-10/queue-390-dark.png), [drawer mobile](evidence/phase-10/drawer-mobile-dark.png), [tratamento demonstrativo](evidence/phase-10/treated-fixture-mobile-dark.png), [evidência original](evidence/phase-10/original-fixture-mobile-dark.png). Listas usam captura completa; drawers usam viewport para não alterar a geometria do modal durante a captura.

## Homologação pública e dados após QA

Na sessão administrativa real de `testefrota.sirel.com.br`:

- Fila vazia após upgrade comprovou ausência de geração em GET.
- Reconciliação manual de 13/09–12/10/2026 conferiu **39 abastecimentos e criou 5 casos reais**. Não houve registro operacional sintético.
- Um caso foi aberto em **IN_REVIEW** para conferência do workflow, com motivo explícito “Aberto para conferir o workflow em homologacao; sem diagnostico sobre a ocorrencia.” A decisão não resolveu/ignorou uma ocorrência nem atribuiu diagnóstico.
- Nova reconciliação do mesmo período criou **0** casos, reavaliou **5**, preservou o estado e a evidência original. Resultado: **5 casos, 11 eventos, 3 requests, 11 linhas da auditoria**; 4 NEW/1 IN_REVIEW. Abastecimentos continuam 204 e veículos 286. [Sonda somente leitura após QA](evidence/phase-10/after-qa.json).
- Regra/amostra, registro de domínio e retorno ao caso confirmados. Seis combinações reais de tela/tema sem overflow ou mensagens de falha durante a matriz. Filtro “Em análise” retornou um caso e foi preservado ao trocar de aba. Painel V1 permaneceu acessível.
- Houve 401 durante uma checagem intermediária da sessão; depois de recarregar a sessão, a verificação de filtro foi concluída. Bundle público final **`index-D0qAPC_i.js`** confirmado pelo DOM. Tema/viewport restaurados. [Registro resumido](evidence/phase-10/public-qa.json).

## Limitações e próximos passos

Implementação concluída em HML e pronta para revisão do responsável. Mudanças anteriores preservadas; nenhum commit/push, produção ou próxima fase foi executado. O aceite do responsável e checkpoint continuam necessários para promoção futura.

Não houve teste de carga concorrente em volume de produção ou login real de cada perfil restrito; autorização/concorrência foram cobertas pelo PostgreSQL de QA e testes de contrato. Teclado/semântica foram testados, sem certificação WCAG completa/leitor de tela. Limpeza de chaves idempotentes após 30 dias segue como operação futura explícita do plano; não há job automático. Resolver/ignorar/reabrir foram testados em QA isolada e fixtures, sem encerrar artificialmente casos reais. Não foi criado exportador de workflow nem opção visual não suportada.

Rollback de schema HML com histórico exigiria backup e ordem específica, pois downgrade destrói as três tabelas. Reverter código não autoriza remover casos existentes.

## Arquivos desta fase

### Backend

- `backend/alembic/versions/0052_analytics_alert_workflow.py`
- `backend/app/models/analytics_alert.py`
- `backend/app/models/__init__.py`
- `backend/app/schemas/analytics_alert.py`
- `backend/app/services/analytics_alerts.py`
- `backend/app/api/routes/analytics_alerts.py`
- `backend/app/api/routes/analytics_v2.py`
- `backend/tests/test_analytics_alerts.py`
- `backend/tests/test_analytics_alert_routes.py`
- `backend/tests/test_analytics_alerts_postgres.py`

### Frontend

- `frontend/src/api/analyticsV2.js`
- `frontend/src/components/analytics/AnalyticsAlerts.jsx`
- `frontend/src/components/analytics/AnalyticsAlertDetail.jsx`
- `frontend/src/components/analytics/analyticsAlertFormat.js`
- `frontend/src/components/analytics/AnalyticsAlerts.test.jsx`
- `frontend/src/components/analytics/AnalyticsEntityDrawer.jsx`
- `frontend/src/components/Modal.jsx`
- `frontend/src/components/Modal.test.jsx`
- `frontend/src/pages/AdminAnalyticsDashboard.jsx`
- `frontend/src/pages/AdminAnalyticsDashboard.test.jsx`
- `frontend/src/styles/analytics-evolution.css`

### Documentação/evidências

- `docs/analytics-evolution/EXECPLAN_PHASE_10_PART_2.md`
- `docs/analytics-evolution/EXECPLAN_PHASE_10_PART_1.md` — nota de autorização/entrega, proposta histórica preservada.
- `docs/analytics-evolution/DELIVERY_PHASE_10.md`
- `docs/analytics-evolution/11_STATUS.md`
- `docs/analytics-evolution/evidence/phase-10/probe-hml.py`
- `docs/analytics-evolution/evidence/phase-10/browser-fixtures.py`
- `docs/analytics-evolution/evidence/phase-10/browser-setup.js`
- `docs/analytics-evolution/evidence/phase-10/browser-flow.js`
- Evidências `after-migration.json`, `after-qa.json`, `browser-qa.json`, `public-qa.json`, `gates.json`, `runtime.json`, `final-git-status.txt` e cinco PNGs no mesmo diretório.

Os demais diffs da revisão/Fases 11–12 preexistiam e não foram descartados. Inventário completo no status Git final das evidências.
