# Status — evolução do frontend Frota PMTF

## 13/10/2026 — Publicação do Analytics e resumos de Abastecimentos

- Promoção integral de HML `169cde9` para produção autorizada pelo usuário e ativada às 15:43:43; release `df84161`, bundle público `index-CfE8XNxs.js`. [Entrega e evidências](../ANALYTICS_PRODUCTION_RELEASE_20261013.md).
- Frontend 304 aprovados/59 arquivos, lint sem erros/45 avisos preexistentes, build de produção aprovado. HTML/10 assets públicos correspondentes; login sem banner HML. Backend/migration/backup e validação read-only registrados na entrega. Sem importar configuração/dados da HML.
- Resumo único dos alertas e fechamento no scroll incluídos. HML preservada; Docker automático permanece futuro. A inspeção visual autenticada de produção não foi repetida por falta de sessão; QA das telas feito em HML com árvore funcional idêntica.

## 13/10/2026 — Correção de acúmulo de resumos dos alertas

- Scroll fecha a caixa; histórico mantém somente um resumo ativo, inclusive sem mouseleave entre registros. [Entrega e evidências](DELIVERY_FUEL_ALERTS.md#correção-posterior--acúmulo-de-caixas-ao-rolar).
- Preflight: `feature/analytics-evolution-hml`, HEAD `ceac415`, working tree limpo. Frontend **304 aprovados/59 arquivos**, focados **15 aprovados**, lint **0 erros/45 avisos preexistentes**, build/diff check aprovados.
- HML pública `index-D7olhyya.js`, claro/escuro: scroll com botão visível remove caixa; foco entre alertas mantém somente uma; drawer preservado; zero erros JS. Somente frontend, sem produção/push.

## 13/10/2026 — Alertas no histórico de abastecimentos

- Demanda funcional implementada somente em `feature/analytics-evolution-hml`, HEAD inicial `82f3415`. [Entrega e arquivos](DELIVERY_FUEL_ALERTS.md), [preflight](evidence/fuel-alerts/preflight.txt).
- Motivo registrado por hover/foco e drawer ao clicar; sem novos cálculos/API/banco/edição. Regular, comprovantes, retificação, escopo e filtros preservados.
- Frontend 301 aprovados/59 arquivos, backend 644 aprovados/88 pulados, lint 0 erros/45 avisos preexistentes, build/diff check aprovados. HML pública validada em quatro combinações claro/escuro/desktop/mobile; teclado/foco e busca preservados; zero erros JS.
- Commit local autorizado inclui estas alterações e pendências anteriores do Analytics. Inventário na entrega; sem push/produção. O status abaixo preserva a iniciativa visual original.

**Branch:** `feature/frontend-evolution-hml`

**HEAD de partida das Fases 6/7:** `1ec4886`

**Data:** 05/10/2026

**Fase atual:** Fase 7 — QA e acabamento concluídos em homologação, com ressalvas registradas.

**Entrega:** alterações versionadas localmente, incluindo Fases 6/7, demanda funcional posterior e os 11 SVGs autorizados. Sem publicação em produção.

## Versionamento — 05/10/2026

- `ed47ddd` — Fase 6: gestão e administração.
- `4a2c0d0` — Fase 7: QA responsivo, temas e teclado.
- `20b124a` — Retificação auditável do comprovante de abastecimento, testes e evidências com dados fictícios.
- Miniaturas SVG e este STATUS incluídos no commit de consolidação, conforme pedido explícito do usuário.

Os commits preservam as entregas separadas para revisão e rollback. O versionamento não altera o código validado nem realiza publicação ou push. Capturas e logs locais das Fases 6/7 continuam preservados nas exclusões já existentes.

## Resultado de HML

QA visual, responsivo, teclado, claro/escuro e regressão executados. Conferidas 17 rotas e cinco abas de pagamentos em 1366×768, 1600×900, 1920×1080, 1024×768, 768×1024 e 390×844. Matriz principal de 252 combinações sem overflow da página ou alertas de erro de carregamento, seguida de retestes dirigidos das correções finais.

Corrigidos foco da sidebar móvel, busca e painéis de pagamento; acesso por teclado a processos, contratos e lotes; cabeçalhos e filtros esticados; larguras e rolagem de tabelas; grid de Importar/Exportar; contraste de controles/status e alertas de Análises; espaçamento do formulário de pagamento em portal. Não foram adicionadas funcionalidades. A página de pagamentos recebeu ajustes locais por subcomponente, sem refactor integral.

48 cenários de modais, 18 de painéis laterais, seis de menus, abas complementares e busca global conferidos. Cinco XLSX e cinco PDFs gerados pelos fluxos existentes. Auditoria mantém todos os dados técnicos; gráficos mantêm séries, legendas, cores e semântica. Backend, APIs, autenticação, permissões e regras de negócio preservados. Os 11 SVGs preexistentes mantêm os hashes anteriores.

## Quality gates

| Verificação | Resultado final |
| --- | --- |
| `npm run test` | **183 aprovados/16 falhas**, 40 arquivos; runner padrão ainda instável |
| `npm run test -- --pool=forks` | **199/199 aprovados**, 40 arquivos |
| Suítes das duas falhas intermediárias, execução isolada padrão | Baseline 11/11; final 12/12 |
| PossessionTripsModal, execução isolada padrão | Baseline 5/5; final 5/5 |
| Testes dirigidos de teclado/foco | 13/13 aprovados |
| `npm run lint` | **0 erros/46 avisos**, mesmo baseline |
| `npm run build` | **aprovado** |
| `git diff --check` | aprovado |

Baseline padrão: 180 aprovados/15 falhas; reexecução em cópia isolada anterior à Fase 7: 175/20. Execução intermediária: 197/2, com as duas suítes aprovadas isoladamente antes/depois. A última execução reproduziu os mesmos 15 nomes do baseline inicial e uma falha adicional em PossessionTripsModal, arquivo não alterado cujos cinco testes passaram isolados antes/depois. Comparação nominal registrada em `failure-comparison.json`; suíte completa com forks aprovada. Quatro testes de regressão foram adicionados para os defeitos de teclado corrigidos. O gate padrão não está integralmente aprovado.

[Relatório final de HML e evidências](PHASE_7_HML_REPORT.md) · [ExecPlan da Fase 7](EXECPLAN_PHASE_7.md) · [Entrega anterior da Fase 6](PHASE_6_MANAGEMENT.md).

Evidências locais: `output/playwright/phase-7/`. Logs, snapshot anterior e diff exclusivo: `storage/loan-tests/frontend-evolution-phase7/`. [Site de HML](https://testefrota.sirel.com.br/) verificado com HTTP 200 e assets iguais à origem local de testes.

## Fases

- [x] Fase 0 — baseline e segurança
- [x] Fase 1 — fundação visual e componentes base
- [x] Fase 2 — shell global
- [x] Fase 3 — dashboard
- [x] Fase 4 — módulos operacionais centrais
- [x] Fase 5 — abastecimento, ordens, sinistros e multas
- [x] Fase 6 — gestão e administração
- [x] Fase 7 — QA, responsividade e acabamento em HML

## Pendências e limites

- Instabilidade do runner padrão e 46 avisos antigos de lint.
- PDF legado de Auditoria com colunas estreitas e paginação excessiva; gerador e conteúdo preservados, pendência separada do redesign.
- Fluxos de escrita, confirmação e assinatura não concluídos no navegador; entradas/formulários e testes existentes conferidos, sem operações de negócio em nome do usuário.
- Matriz visual no Edge com perfil de testes; sem certificação integral de acessibilidade ou validação completa em outros motores/perfis.
- Pendência anterior dos boards 01/02 duplicados mantida. Os SVGs externos foram incluídos no versionamento por autorização explícita.

**Parado após a Fase 7, conforme solicitado. Não publicar em produção nem iniciar nova fase.**

## Demanda funcional posterior — 05/10/2026

Implementada a retificação opcional do comprovante de abastecimento, a pedido do usuário, sem iniciar outra fase visual. Arquivo anterior preservado, troca auditável na mesma requisição dos dados e permissões existentes mantidas. Backend: 26 testes aprovados. Frontend: 208/208 com forks; runner padrão 206/208, com as duas suítes envolvidas aprovadas em execução dirigida (27/27 junto às suítes da alteração); lint sem erros e com os mesmos 46 avisos; build aprovado. QA local com dados fictícios em claro/escuro e desktop/celular.

Publicada em **https://testefrota.sirel.com.br/abastecimentos** após o usuário instruir a continuação. Reiniciada apenas a API do runtime isolado 6969; PostgreSQL 5441 preservado. Pelo domínio público: HTTP 200, aplicação/banco saudáveis, contrato JSON/multipart ativo e nove assets com hashes iguais ao build validado. Evidência: `storage/loan-tests/fuel-receipt-rectification/publication.json`. Sem publicação em produção ou retificação de abastecimentos reais.

[Relatório, arquivos, baseline, limites e screenshots](FUEL_RECEIPT_RECTIFICATION.md).


## Demanda funcional — justificativas assistidas — 05/10/2026

Implementada e validada em homologação local isolada, com catálogo de 22 finalidades e histórico pessoal sincronizado pela conta. Justificativas, permissões e auditoria preservadas; cancelamento de ordem agora utiliza modal com motivo opcional. Migration aditiva 0049, sem importação de histórico antigo.

Frontend: **226/226 aprovados no comando padrão**, lint 0 erros/46 avisos preexistentes e build aprovado. A instabilidade do vmThreads foi investigada com 13 suítes isoladas e execução completa em forks; o runner padrão agora usa forks. Backend: 169 aprovados/9 ignorados na suíte ampla e 17 aprovados na verificação dirigida final. QA com duas contas fictícias, Chrome/Edge, claro/escuro e celular.

**Entrega encerrada para validação. Não publicada no endereço público de homologação nem em produção.** Banco de trabalho e runtime 6969 preservados; testes usaram bancos descartáveis e build isolado. Nenhuma nova fase do redesign foi iniciada.

[Relatório, arquivos, testes, screenshots e limites](ASSISTED_JUSTIFICATIONS.md) · [ExecPlan próprio](EXECPLAN_REASON_SUGGESTIONS.md).

### Publicação das justificativas assistidas — 06/10/2026

Após autorização expressa, commit `7fcbc6b` publicado em **https://testefrota.sirel.com.br**. Backup prévio do banco e frontend; migration 0049 aplicada somente no banco de homologação da porta 5441; reiniciada somente a API local 6969. Verificados saúde da aplicação/banco, permissões da conta da API, endpoints novos no OpenAPI, exigência de sessão (401 sem autenticação) e correspondência SHA-256 dos 17 assets JS/CSS no domínio público. Histórico de sugestões inicialmente vazio. Nenhuma operação de negócio em dados existentes e nenhuma alteração em produção.

Evidência: `storage/loan-tests/assisted-justifications/publication.json`. Detalhes e reversão no [relatório atualizado](ASSISTED_JUSTIFICATIONS.md).

## Correção de miniaturas por tipo — 06/10/2026

Corrigida a ausência de `vehicle_type` nas respostas de leitura que fazia várias telas usarem o SVG genérico. Campo autorizado pelo usuário, sem mudança de banco, permissões ou operações. Empréstimos agora lê o tipo do registro, sem depender do catálogo; Perua/SW possui SVG próprio. Tipos existentes e layouts preservados.

Publicada em **https://testefrota.sirel.com.br**: backend 143 testes aprovados; frontend 227 aprovados; lint 0 erros/46 avisos preexistentes; build aprovado. QA com os 11 tipos, temas claro/escuro e celular. API/banco saudáveis e 25 arquivos JS/CSS/SVG verificados no domínio público. Sem migration ou alteração de produção.

[ExecPlan, arquivos, evidências e limites](EXECPLAN_VEHICLE_THUMBNAILS.md).

**Ajuste posterior solicitado em 06/10/2026:** Perua/SW voltou a usar a miniatura anterior (`suv.svg`); o novo `wagon.svg` foi removido do código-fonte. Publicado em homologação, com 227 testes aprovados, lint sem erros (46 avisos anteriores), build aprovado e arquivos publicados conferidos. A correspondência pelo tipo cadastrado continua ativa em todas as listagens. Produção inalterada.

## Promoção integral para produção — 06/10/2026

Após autorização expressa do usuário, todas as alterações desde a base `12150b1` da homologação isolada foram publicadas em **https://frota.sirel.com.br**, versão `503dc86`. Seis migrations aplicadas (0044–0049), com backups, ensaio em cópia restaurada e preservação das contagens existentes. Configurações próprias da produção mantidas; nenhum dado de homologação importado.

Backend completo: 547 aprovados/19 ignorados; frontend final: 227 aprovados; lint sem erros/46 avisos anteriores; build específico de produção aprovado. Saúde, autenticação, headers e 24 arquivos publicados conferidos. `main` permanece inalterada, reservada para a próxima etapa.

[Plano, resultados, backups e evidências da publicação](../PRODUCTION_RELEASE_20261006.md).

## Paginação e carregamento — Fase 1 — 19/10/2026

Implementação local preparada **somente na branch de homologação** `feature/analytics-evolution-hml` (HEAD inicial e atual `c66376f63349c620b15bffd416fd6523cf49d5da`; working tree limpo antes da fase). Sem publicação em HML público ou produção e sem avanço para a Fase 2.

- `Pagination` compartilhado: cinco páginas próximas, primeira/última, reticências e controles Anterior/Próxima.
- Veículos e Posses: listagens de 10 registros por chamada aos endpoints paginados, com busca/filtros, totais e foco resolvidos no servidor. Endpoints antigos preservados. Adicionados catálogos leves de veículos e lotações para os filtros/formulários.
- Veículos: PDF/XLSX coleta todas as páginas do filtro apenas quando a exportação é solicitada. Posses mantém o gerador integral de relatórios do servidor.
- Gates: frontend 308/308 testes (baseline 304/304), lint 0 erros/44 avisos (baseline 0/45), build aprovado; backend 625 aprovados/109 ignorados/7 avisos; `git diff --check` aprovado.
- QA visual local com dados fictícios: Veículos 31 registros e Posses 128; conferidas páginas inicial, intermediária e final, 10 linhas visíveis, ambas as telas em claro/escuro, desktop 1920×1080 e largura 390×844. Capturas em `output/playwright/phase1/` (ignoradas pelo Git).

**Pendente para concluir a validação de HML:** comparação de tempo/bytes antes/depois na mesma base real; sessão de perfil com escopo restrito; PDF/XLSX real; conferência da diferença entre secretaria por lotação atual na tabela de Posses e responsabilidade histórica no relatório configurável. O teste local confirma a paginação, mas não substitui a medição na base de homologação. [ExecPlan, arquivos, resultados e limites](EXECPLAN_PAGINATION_PHASE_1.md). Aguardando validação da Fase 1 e autorização antes da Fase 2.

### Correção da ativação em HML e Fase 2 — 19/10/2026

O estado acima descreve a entrega local anterior. Depois, a Fase 1 foi ativada no endereço público de homologação. A API de testes ainda executava a versão antiga e respondeu 404 em `/api/vehicles/options`; a tela de Posses ficou em branco ao receber uma resposta paginada sem `summary`. Reiniciada somente a API isolada da porta 6969 e adicionado fallback de compatibilidade no frontend de Posses e Veículos. A rota passou a responder 401 sem sessão, e Posses autenticada abriu 127 registros ativos em páginas de 10, inclusive a página 2. O usuário comunicou a falha e autorizou explicitamente a correção e a Fase 2. Produção inalterada.

**Fase 2 ativada somente em HML:** Manutenções, histórico de Abastecimentos e suas Ordens, e Ordens abertas consultam a página solicitada com 10 registros e total do servidor. Busca e filtros foram adicionados aos endpoints existentes sem retirar contratos antigos. Contadores de ordens abertas e alertas consultam totais próprios com `limit=1`; PDF/XLSX reúne todas as páginas filtradas somente quando solicitado. Sinistros e Multas passaram a usar o catálogo leve de veículos, que agora inclui RENAVAM e indicador de placa provisória. Condutores e Empréstimos já consumiam paginação do servidor.

- Branch `feature/analytics-evolution-hml`, HEAD `c66376f63349c620b15bffd416fd6523cf49d5da`; alterações das Fases 1 e 2 ainda não commitadas. Nenhuma migration, alteração de produção ou de arquivos de deploy.
- Backend completo: 625 aprovados/109 ignorados; frontend completo: 312/312 (60 arquivos); lint frontend: 0 erros/43 avisos (baseline anterior 44); build de HML aprovado. Testes dirigidos finais de Manutenções e Abastecimentos: 14/14.
- HML autenticada: Manutenções mostrou 3 registros e a busca por serviço reduziu a uma linha; Ordens abertas mostrou estado vazio válido. Abastecimentos mostrou 204 registros no histórico e 115 alertas; primeira/intermediária/última página do histórico: 10/10/4 linhas; última página das ordens: 9 linhas na página 49. Busca por número de ordem funcionou. Sinistros e Multas abriram após a troca do catálogo.
- Temas claro e escuro, desktop e 390×844 conferidos nas telas alteradas; capturas locais em `output/playwright/phase2/`. Console sem novos erros desde a ativação da Fase 2; os erros de `active` vistos antes eram da versão antiga.
- Limites: não foi possível medir tempo/bytes antes e depois na mesma base nem usar uma conta com escopo restrito. Manutenções tem apenas 3 registros nesta base, então página 2 e exportação de mais de 100 registros foram validadas por testes automatizados. PDF/XLSX não foi gerado no navegador; os testes verificam a coleta integral sob demanda. O catálogo de infrações de Multas continua no escopo da Fase 3.

[ExecPlan e arquivos da Fase 2](EXECPLAN_PAGINATION_PHASE_2.md). **Parar antes da Fase 3; requer validação e autorização separadas.**

## Paginação e carregamento — Fase 3 — 19/10/2026

Fase 3 autorizada pelo usuário, implementada e ativada **somente na HML** `https://testefrota.sirel.com.br`. Branch `feature/analytics-evolution-hml`, HEAD `c66376f63349c620b15bffd416fd6523cf49d5da`; as alterações das três fases permanecem não commitadas no mesmo working tree. Produção, deploy de produção, banco, migrations e regras de negócio inalterados.

- Usuários, Auditoria, Postos, infrações CTB, contratos e lotes de importação ganharam endpoints paginados aditivos com filtros e totais no servidor. Os contratos também têm opções leves para formulários e filtros. As respostas antigas continuam disponíveis.
- Cadastros carrega infrações só ao abrir a aba. Postos e os formulários de Multas/Importar-Exportar buscam usuários, veículos e infrações sob demanda, inclusive além do lote inicial. Importar/Exportar pagina lotes e linhas. Nove páginas que só usam secretarias consultam o catálogo de órgãos sem a hierarquia completa. A hierarquia de Cadastros permanece integral (21 órgãos, 42 departamentos, 56 lotações) para preservar formulários, seleção e ações em lote.
- Dashboard busca apenas resumos/páginas mínimas. Pagamentos usa opções leves e tabela de contratos paginada. Análises continuou carregando os indicadores. PDF/XLSX das listagens alteradas coleta todas as páginas filtradas somente ao exportar; testes cobrem esse comportamento em Usuários e Auditoria. Uma regra de quebra de texto evita que e-mails longos alarguem cartões de tabela no celular.
- QA autenticado da HML: Usuários 47 registros em cinco páginas, última com sete; filtro por perfil Posto retornou um registro e busca sem correspondência mostrou estado vazio. Auditoria 7.498 eventos em 375 páginas de 20, última com 18; DELETE retornou 58 e DELETE + VEHICLE retornou 18. Catálogo de infrações 433 itens em 37 páginas, última com um; código 7820 encontrado na busca, no formulário de Multas e no ajuste de importação. Postos mostrou um registro e busca remota de usuário; contratos dois registros e busca por número; lote de importação de 530 linhas mostrou 11 páginas e busca remota de veículo. Temas claro/escuro, desktop e 390×844 conferidos. Console sem erros na validação final.
- Gates: frontend **316/316 testes em 61 arquivos** (baseline da Fase 2: 312/312 em 60), lint **0 erros/40 avisos** (baseline 43), build aprovado; backend **625 aprovados/109 ignorados/7 avisos**, igual ao baseline; `git diff --check` aprovado. HML pública e API/banco responderam HTTP 200, e CSS/JS públicos correspondem ao build atual.
- Capturas locais ignoradas pelo Git em `output/playwright/phase3/`: Auditoria, Usuários, Cadastros/infrações, Postos, Contratos, Importar/Exportar e Análises em desktop, além de Usuários em 390×844. [ExecPlan completo da Fase 3](EXECPLAN_PAGINATION_PHASE_3.md).

Limites: não existe medição de tempo/bytes anterior à fase na mesma base para calcular ganho; não havia conta com escopo restrito disponível; PDF/XLSX foram verificados por testes de coleta integral, sem abrir arquivos reais no navegador. Falhas de requisição foram verificadas com respostas simuladas, preservando a API pública da HML. Nenhuma operação de escrita de negócio foi executada no navegador. **Parar após a Fase 3; fase seguinte somente com validação e autorização.**

### Conferência para testes finais dos usuários — 19/10/2026

- Build local e publicação: os nove assets JS/CSS referenciados pelo HTML público têm SHA-256 idêntico ao build local. O HTML público contém a injeção de monitoramento do Cloudflare, por isso seu hash integral difere. `/api/health/ready` respondeu HTTP 200 com aplicação e banco `ok`. Doze endpoints paginados/auxiliares responderam 401 sem sessão, como esperado.
- Sessão administrativa autenticada: Início exibiu indicadores; Veículos mostrou 286 registros em 29 páginas (10 na primeira, seis na última); Posses mostrou 127 em 13 páginas, com ações PDF/XLSX habilitadas; Manutenções mostrou três; Abastecimentos mostrou 204 históricos e 115 alertas; Ordens abertas exibiu estado vazio válido. Cadastros abriu 37 páginas de infrações; Postos mostrou um ativo; Contratos mostrou dois; Importar/Exportar sete lotes; Usuários 47 em cinco páginas; Auditoria 7.498 em 375. Nenhuma dessas telas ficou em branco ou apresentou erro no console.
- Usuários: a pré-visualização de PDF abriu nova guia e o XLSX confirmou início da exportação; console sem erros. A política de segurança do navegador bloqueou a inspeção da guia `blob:` do PDF, então não se afirma verificação visual do conteúdo. Os testes automatizados de coleta integral do filtro seguem aprovados.
- **Conclusão:** ambiente pronto para os testes funcionais dos usuários da homologação. Ainda devem ser conferidos por usuários com perfil restrito o escopo das listagens e, nos arquivos gerados, a abrangência integral de PDF/XLSX. Não há medida anterior de tempo/bytes na mesma base para calcular ganho percentual. Nenhum dado de negócio foi alterado nesta conferência; produção permanece inalterada.

### Correção do PDF de todas as posses — 19/10/2026

O usuário encontrou HTTP 422 ao pré-visualizar as 1.583 posses da aba “Todas”: o gerador tinha limite de 1.500 linhas. O limite do PDF foi ampliado para 5.000, igual ao XLSX, e a tela passou a mostrar a mensagem real da API junto dos botões quando uma geração falha. Mudanças apenas em homologação, sem banco, migration ou produção.

Validação autenticada: a tela exibiu 1.583 registros, concluiu a geração e abriu nova guia do PDF; a auditoria registrou `REPORT_PREVIEW` com `record_count=1583`, `outcome=SUCCESS`, em 3.941 ms. Backend 626 aprovados/109 ignorados; frontend 317/317; lint 0 erros/40 avisos; build e `git diff --check` aprovados. Bundle público conferido por SHA-256. O limite operacional de 5.000 permanece e a mensagem específica fica visível se for ultrapassado. [Detalhes no ExecPlan da Fase 3](EXECPLAN_PAGINATION_PHASE_3.md).

## Publicação da paginação em produção — 20/10/2026

Após autorização expressa do usuário, as três fases e a correção do PDF foram commitadas em `818193c` e integradas à `main` pelo [PR #68](https://github.com/Tarmacruel/frota_postgres_local/pull/68), merge `dfc5236`, com os três checks obrigatórios aprovados. Publicação concluída em **https://frota.sirel.com.br**, às 14:15:16, em janela de aproximadamente 12 segundos. Backups do banco, configurações, anexos, build e Git preservados. Nenhuma migration ou importação de dados de HML; configurações de produção preservadas por SHA-256.

Gates locais: frontend 317/317; backend 626 aprovados/109 ignorados; lint 0 erros/40 avisos; build de produção aprovado. Dez listagens, catálogos, filtros/foco e 13 escopos de Produção conferidos com conexão somente leitura. PDF/XLSX gerados em memória com todas as 1.983 posses. Na sessão pública autenticada, a paginação compacta carregou e o PDF de “Todas” confirmou abertura em nova guia. Readiness público e de origem `ok`, dez assets publicados conferidos por SHA-256, rotas protegidas 401 sem sessão e docs 404.

A HML também foi restabelecida pelo script `loan-tests.ps1 -Action start`; **https://testefrota.sirel.com.br** e sua origem responderam HTTP 200 com aplicação/banco saudáveis. Deploy automático permanece desabilitado. [ExecPlan, evidências e rollback](../PAGINATION_PRODUCTION_RELEASE_20261020.md).
