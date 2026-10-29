# Status — evolução do frontend Frota PMTF

## 22/10/2026 — Evolução dos KPIs em homologação

Demanda funcional autorizada: 79 indicadores SQL em 13 módulos, seleção e remoção acessíveis, URLs filtradas, totais completos antes da paginação e composição contextual de custos/combustível. Início, condutores, cadastros e importações integrados; experiência mobile com faixa deslizável. Frontend **382 aprovados/67 arquivos**, lint **0 erros/39 avisos anteriores**; backend **688 aprovados/109 ignorados**. SQL/API somente leitura verificaram filtros, paginação e escopo vazio/positivo; browser claro/escuro/390px, composição e exportações cobertas. Sem migration ou publicação em produção. [Entrega, cobertura, evidências e reversão](../INTERACTIVE_KPIS_HML_20261022.md).

## 20/10/2026 — Fotos no encerramento da posse

Demanda funcional autorizada pelo usuário, aplicada somente à homologação. Campo opcional com seleção múltipla, prévia/remoção, envio atômico, identificação das evidências e migration aditiva 0053. Backend 637 aprovados/109 ignorados; frontend 320 aprovados/62 arquivos; lint 0 erros/40 avisos preexistentes; build HML aprovado. Teste integrado com dados fictícios, integridade do arquivo, acesso protegido e QA claro/escuro/móvel concluídos. Produção preservada. [Entrega e manutenção](../RETURN_PHOTOS_HML_20261020.md).


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

## Fotos no encerramento e anexos posteriores — 20/10/2026

Solicitação funcional autorizada e publicada somente na homologação. O encerramento aceita fotos opcionais na mesma transação da confirmação (migration 0053). Nova ação **Adicionar fotos** em posses já encerradas permite anexar imagens sem retificar: etapa `post_return`, usuário e hash registrados, evento próprio de auditoria, prevenção de duplicação por conteúdo e preservação do conteúdo de assinatura/termo anterior.

Backend: **644 aprovados/109 ignorados/8 avisos**; frontend: **322/322 em 62 arquivos**; lint **0 erros/40 avisos**; build e `git diff --check` aprovados. QA autenticado na posse fictícia 1589: foto adicional salva, reenvio deduplicado, encerramento/revisão/updated_at/confirmações/hash idênticos antes e depois, arquivo conferido por SHA-256 e um evento de auditoria. Claro/escuro e formulário em 390 px conferidos, sem overflow horizontal e console sem erros. Código/configuração/index de produção preservados, readiness dos dois ambientes saudável, assets públicos de HML iguais ao build.

Código em `D:\FROTAS\02-HOMOLOGACAO\codigo`; organização local documentada em `D:\FROTAS\LEIA-ME-AMBIENTES.md`, com atalhos que preservam os caminhos dos processos. Cloudflared atualizado para 2026.10.2 na etapa anterior. [Entrega e backup dos anexos posteriores](../POST_CLOSURE_PHOTOS_HML_20261020.md); [fotos durante o encerramento](../RETURN_PHOTOS_HML_20261020.md).

### Publicação das fotos em produção — 20/10/2026

Aplicada às **20:09:32**, após autorização expressa, pelo [PR #70](https://github.com/Tarmacruel/frota_postgres_local/pull/70), commit funcional `6104f1d`, merge `1398835`. Três checks obrigatórios aprovados; build com flags próprias de produção; migration 0053 aplicada. Ativação em aproximadamente 17 segundos, watchdog reabilitado e configurações preservadas. Comparação integral comprovou a preservação dos campos anteriores das 1.995 posses, 8 fotos, 1.507 confirmações, 15 documentos digitais e 12 assinaturas. Assets públicos idênticos ao build; prontidão dos dois ambientes saudável; nova rota e fotos protegidas retornam 401 sem sessão. Formulários de fotos no encerramento e em posse encerrada conferidos e cancelados em produção, sem escrita de dados de negócio; console sem erros. Backups e evidências em `D:\FROTAS\05-BACKUPS\producao\20261020-fotos-posses`. [Registro completo e rollback](../PHOTOS_PRODUCTION_RELEASE_20261020.md).

## Etiquetas pessoais com comunicação compartilhada — 21/10/2026

Plano solicitado, refinado e autorizado pelo usuário, implementado e publicado **somente na homologação**. Catálogo próprio por usuário com vehicles.edit; marcações compartilhadas, várias por veículo, retirada lógica pelo autor/administrador e justificativa administrativa quando o autor é outro. Gestão em Veículos, filtros OR por ID, apresentação atual em Posses e seletores, exportação de Veículos e eventos próprios no histórico/auditoria. Status e operações preservados. Schema HML 0054_vehicle_tags; produção continua em 0053, sem alterações.

Gates: **653 backend aprovados/109 ignorados/8 avisos**, **332 frontend aprovados em 63 arquivos**, lint **0 erros/40 avisos**, build e diff-check aprovados. API/PostgreSQL testados com dois usuários de Produção e administrador em transação revertida; concorrência real de dois envios gerou uma marcação e um evento. Navegador conferiu catálogo, aplicação/retirada, histórico, filtro de duas etiquetas, Posses e seletor; XLSX real inspecionado. Claro/escuro e modais em 390 px conferidos. Produção preservada por fingerprints; readiness dos dois ambientes saudável, nove assets públicos de HML idênticos ao build. Limite: conteúdo da pré-visualização PDF não inspecionado no navegador.

Branch local feature/vehicle-tags-hml, sem commit/push. As alterações anteriores de documentação da publicação de fotos foram preservadas. Demonstração em TST0F20, somente dados fictícios; três etiquetas no catálogo do usuário atual e duas aplicadas ao veículo. Backup em `storage/backups/20261021-vehicle-tags`, com dump, fonte/base e frontend anteriores, resultados de integração/concorrência/publicação. [ExecPlan, decisões e rollback](../EXECPLAN_VEHICLE_TAGS_HML_20261021.md).

## Tour de primeiro acesso das etiquetas — 21/10/2026

Publicado somente em homologação. Tour automático global com reconhecimento por conta no servidor (vehicle-tags-v1), sete passos para editores e seis para leitores, espera por diálogos anteriores e botão permanente para rever. Explica avisos visuais, autoria, catálogo, aplicação, filtros, retirada manual e arquivamento. Encerrar/pular/Escape salva o reconhecimento; falhas têm nova tentativa e opção de continuar sem salvar. Não altera veículos/etiquetas nem exige nova migration.

Backend 655 aprovados/109 ignorados/8 avisos; frontend 341 aprovados em 64 arquivos; lint 0 erros/40 avisos; build e diff-check aprovados. PostgreSQL real/API conferiram persistência, idempotência e isolamento entre leitores em transação revertida. Navegador validou apresentação automática, conclusão, recarga, reabertura, claro/escuro e 390 px; console sem erros. Assets HML conferidos, dois ambientes saudáveis e produção preservada por fingerprints. Backup `storage/backups/20261021-vehicle-tags-tour`. [ExecPlan e rollback](../EXECPLAN_VEHICLE_TAGS_TOUR_HML_20261021.md).

## Paleta de 12 cores com prévia — 21/10/2026

Esboço escolhido pelo usuário e aplicado somente em homologação. Paleta acessível com radios nativos, nomes, seleção visual e prévia de nome/cor sem gravação até Salvar. Novas cores: Laranja, Turquesa, Rosa, Ciano, Índigo e Marrom. Estilos compartilhados nos badges, filtros, posses e seletores; janela de catálogo com fundo sólido, cabeçalho fixo, largura menor e rolagem do conteúdo. Catálogo/edição/arquivamento/tour preservados. API ampliada para 12 valores; varchar existente suficiente, sem migration.

Backend 667 aprovados/109 ignorados/8 avisos, frontend 344 aprovados em 64 arquivos; direcionados finais 19 aprovados; lint 0 erros/40 avisos anteriores; build e diff-check aprovados. Integração real criou/aplicou/leu/editou as 12 cores e rejeitou valor arbitrário, tudo revertido e fingerprints de negócio idênticos. Claro/escuro/390 px, teclado e edição/cancelamento conferidos; contraste de texto mínimo 5,74:1 e console sem erros. Nove assets públicos conferidos; produção preservada e ambos ambientes saudáveis. Backup `storage/backups/20261021-tag-color-palette`. [ExecPlan e rollback](../EXECPLAN_TAG_COLOR_PALETTE_HML_20261021.md).

## Exclusão de etiquetas do catálogo — 21/10/2026

Publicado somente em homologação: Excluir em cada linha de Minhas etiquetas, confirmação com foco inicial em Cancelar, bloqueio de reenvio e erro contextual. Apenas autor com vehicles.edit pode excluir. Exclusão lógica preserva histórico e auditoria, bloqueia qualquer marcação ativa, oculta a definição e permite reutilizar o nome com novo ID. Arquivamento permanece disponível. Migration 0055_vehicle_tag_delete aplicada sem alteração dos dados anteriores; tour atualizado na descrição do catálogo.

Backend 672 aprovados/109 ignorados/8 avisos anteriores; frontend 347 aprovados em 64 arquivos; lint 0 erros/40 avisos anteriores; build e diff-check aprovados. API/PostgreSQL real validou permissões, idempotência, histórico, bloqueio em uso e nome reutilizado em transação revertida, com fingerprint de negócio idêntico. Navegador conferiu confirmação/cancelamento em claro/escuro/390 px, sem excluir etiquetas existentes, sem overflow horizontal ou erros de console. Nove assets públicos iguais ao build, DELETE anônimo 401, dois ambientes saudáveis e produção preservada por fingerprints. Backup `storage/backups/20261021-tag-delete`. [ExecPlan e rollback](../EXECPLAN_TAG_DELETE_HML_20261021.md).

## Experiência mobile — 21/10/2026

Publicada somente em homologação. Barra superior em uma linha, busca por ícone, ações da conta nas iniciais e Menu inferior com todos os módulos permitidos. Opções e Filtros progressivos mantêm valores e componentes montados. Nove listas operacionais usam as mesmas células/handlers com resumo e detalhes expansíveis no celular; desktop mantém tabela completa. Ações em painel inferior, modais com cabeçalho fixo e conteúdo rolável, formulários em uma coluna, controles de toque e campos sem zoom automático. Dashboard com atalhos em lista, tour das etiquetas atualizado e paginação mobile compacta. Sem backend, migration, dependência ou produção alterados.

Frontend **353 aprovados/65 arquivos**; lint **0 erros/40 avisos anteriores**; build/diff-check aprovados. QA claro/escuro, 360/390 px, tablet 820 e desktop1366; busca, filtros, detalhes, menu, etiquetas e formulários conferidos sem gravação de dados de negócio; console sem erros. Nove assets públicos idênticos ao build, backend preservado, dois ambientes saudáveis e fingerprints de produção iguais ao preflight. Backup `storage/backups/20261021-mobile-experience`. Limite: QA de tamanho em navegador, sem aparelho físico/teclado virtual nativo. [ExecPlan, cobertura e rollback](../EXECPLAN_MOBILE_EXPERIENCE_HML_20261021.md).

## Número e regularização da CNH — 21/10/2026

Publicado somente em homologação. Número da CNH em criar/editar/lista/exportações de Condutores, preservando números importados e zeros. Aviso no seletor operacional para número ausente, validade ausente e vencimento, com pendências simultâneas e acesso à edição em nova aba conforme permissão. Rascunho da operação preservado; reconsulta ao voltar/manual, sem remover aviso se persistir pendência. Filtros de relatórios não exibem o aviso. Datas por dia de calendário corrigem o deslocamento de fuso; validade de hoje aceita. Matrícula e regras anteriores preservadas. Backend/schema sem alterações.

Suíte completa **370 aprovados/66 arquivos**, direcionados finais **29 aprovados** após ajuste de mensagem e um caso novo; lint **0 erros/40 avisos anteriores**; build/diff-check aprovados. API/PostgreSQL validaram persistência, zeros, nulos, campos antigos, auditoria e permissão em rollback, com fingerprint de negócio idêntico. HML tinha61 números já informados. QA claro/escuro/390px, aviso na posse, link direto/foco em CNH, rascunho e número existente conferidos sem salvar cadastros reais; console sem erros. Nove assets públicos idênticos ao build e produção preservada. Backup `storage/backups/20261021-driver-cnh`. [ExecPlan, cobertura e rollback](../EXECPLAN_DRIVER_CNH_HML_20261021.md).

## Publicação em produção — 22/10/2026

Após autorização expressa, etiquetas, tour, paleta de 12 cores, exclusão protegida, experiência mobile e CNH foram publicados pelo PR #71. O PR #72 corrigiu o topo mobile na ausência da faixa de homologação, com validação nos dois ambientes. Backend 672 aprovados/109 ignorados; frontend 371 aprovados/66 arquivos; lint 0 erros/40 avisos anteriores. Builds de produção com configuração própria e três checks obrigatórios aprovados em ambos os PRs. Schema 0055, todas as 57 tabelas existentes preservadas durante migração; nenhum dado de homologação transferido. Nove assets finais, index, readiness dos dois ambientes, fotos históricas, proteção anônima e probes somente leitura conferidos. Tour, paleta, mobile claro/escuro e fluxo de aviso/edição da CNH verificados sem salvar dados de negócio. Backup privado `storage/backups/20261022-etiquetas-mobile-cnh`; watchdog Ready. [Relatório final e rollback](../PRODUCTION_FEATURES_RELEASE_20261022.md).

## Correção urgente dos indicadores de CNH — 22/10/2026

KPIs agregados no banco sobre todos os condutores da busca/status/secretaria, sem depender da página ou reduzir outros KPIs ao clicar em uma categoria. Filtro CNH validado na API; vencidas, até 30/60 dias cumulativos e não informadas (número ou validade ausentes). Botões acessíveis com seleção, remoção de filtro, reset de página e resultados; erro/carregamento sem totais falsos e descarte de respostas atrasadas. PDF/XLSX preservam exportação da página e identificam filtro de CNH. Alerta de vencimento próximo agora coexiste com número ausente. Sem migration nem alteração de permissões ou catálogo compartilhado.

Gates locais: backend 681 aprovados/109 ignorados, frontend 375 aprovados/66 arquivos, lint 0 erros/39 avisos anteriores, build HML concluído; PostgreSQL real com SQL independente em transação somente leitura conferiu totais, filtros combinados e paginação. Publicação em produção autorizada expressamente; evidências finais e rollback em `storage/backups/20261022-driver-kpis` na produção. [ExecPlan](../EXECPLAN_DRIVER_KPI_PRODUCTION_20261022.md).

## Contratos e saldos — 22/10/2026

Plano funcional integral autorizado e publicado exclusivamente na homologação. Menu/rota preservam o acesso financeiro anterior e acrescentam cinco áreas: visão geral, contratos, pedidos/movimentações, prestadores e faturas. Reservas transacionais em abastecimentos/manutenções, preços versionados por rede, abertura conferida, extrato imutável, retificações por diferença e conciliação sem descontar novamente. Dez KPIs globais clicáveis, PDF/XLSX de composições, claro/escuro e mobile 360/390 px. Backend/schema alterados por autorização funcional específica, além do escopo de redesign.

Backend completo 698 aprovados; PostgreSQL real descartável 14 aprovados; frontend completo 389 aprovados/68 arquivos, direcionados finais 7; lint 0 erros/39 avisos anteriores e build aprovado. UI autenticada comprovou reserva de R$ 500, custo real R$ 470, saldo R$ 9.530 e fatura conciliada sem novo desconto. Fixtures removidas pela cópia final da produção. Rotina diária 06h migra primeiro no staging; falha simulada preservou HML ativa e duas execuções completas passaram com schemas diferentes. Nove assets públicos e saúde dos dois ambientes conferidos; produção preservada. Contratos reais aguardam configuração, sem abertura automática. [ExecPlan, evidências e rollback](../EXECPLAN_CONTRACT_BALANCES_HML_20261022.md), [guia operacional](../CONTRACT_BALANCES_HOMOLOGATION.md).

## Combustível realizado na confirmação — 22/10/2026

Correção funcional solicitada e publicada somente na homologação: ordem pode solicitar gasolina comum e ser confirmada com etanol ou gasolina aditivada, junto dos litros e do total reais. Removido bloqueio indevido da API; pedido/preço reservado permanecem preservados e a auditoria registra solicitado/realizado. O saldo usa apenas o total do comprovante, com liberação de sobra ou divergência conforme as regras existentes. Formulário distingue pedido original e combustível efetivo; aviso de troca compacto, rótulos acessíveis e criação identificada como Combustível solicitado.

Backend **698 aprovados/127 ignorados**, PostgreSQL descartável **18 aprovados**, frontend **394 aprovados em 69 arquivos**, lint **0 erros/39 avisos anteriores**, build HML aprovado. Testes via API comprovaram substituição sem preço cadastrado para o substituto, volumes diferentes, consumo menor/maior, bloqueio após gasto acima do saldo e repetição sem nova baixa. QA em 1366×768 e 390px, claro/escuro, sem salvar ordens reais; comprovante continua obrigatório. Comparação das 68 tabelas e configurações sem diferenças; nove assets públicos idênticos ao build e APIs saudáveis. Rotina06h preservada, sem restore nesta publicação. [ExecPlan, capturas e reversão](../EXECPLAN_FUEL_SUBSTITUTION_HML_20261022.md).

## Edição e exclusão de preços — 23/10/2026 — publicada em homologação

Implementados em código HML: edição por nova versão, exclusão lógica, auditoria, proteção das reservas, tratamento de vigências/agendamentos e ações com confirmação/histórico na interface. Backend **698 aprovados/134 ignorados**, PostgreSQL descartável **25 aprovados**, frontend **402 aprovados em 70 arquivos**; lint **0 erros/39 avisos anteriores**, build HML aprovado. Snapshot de schema0055 migrado para0058 em staging descartável, com59 tabelas originais preservadas. Backup integral HML realizado; migration0058 aditiva aplicada com67 tabelas de negócio originais preservadas, sem restaurar dados do usuário.

**Ativação concluída em23/10.** O bloqueio de UAC de22/10 foi resolvido sem nova elevação: a rotina06h já reiniciara a API6969 com schema0058 (execução `20261023-060003-c4ad45`). Rotas PATCH/DELETE ativas conferidas e frontend publicado pelo script exclusivo HML. Nenhuma restauração adicional: preços/vínculos/aberturas de testes foram reiniciados somente pela cópia diária autorizada. Antes/depois da publicação:68 tabelas idênticas, configurações preservadas, nove assets públicos iguais ao build e duas APIs saudáveis. Produção não publicada nem reiniciada.

QA autenticado em catálogo fictício TESTE-HML-PRECOS-20261023, contrato suspenso e sem saldo aberto: nova versão6,1000→6,1250, cancelamento sem gravação, exclusão confirmada, histórico com valor original e Excluído, exatamente uma auditoria por ação. Todas as linhas originais das68 tabelas preservadas, nenhuma reserva/movimentação criada. Desktop/mobile390/360, claro/escuro, teclado e ausência de overflow/erros de console conferidos; viewport e tema restaurados. Fixture identificada como teste até a próxima cópia06h. Código no commit `b0dbe4c`; documentação final em commit subsequente. Evidências em `storage/backups/20261022-fuel-price-management/finalization-20261023`. [ExecPlan, capturas e reversão](../EXECPLAN_FUEL_PRICES_HML_20261022.md).

## Contrato exclusivo por posto — 23/10/2026 — publicada em homologação

Cada posto possui no máximo um vínculo contratual ativo, individual ou de rede credenciada. Migration0059 cria índice parcial único sem alterar vínculos existentes; criação/reativação bloqueiam o posto transacionalmente e rejeitam conflito com409. Catálogo mostra contrato ativo, desabilitando seleção de posto ocupado. Ordem de abastecimento identifica contrato e executante automaticamente pelo posto; troca de posto/quantidade descarta estado e prévia anteriores. Manutenção mantém seus seletores. Sem transferência de saldos/reservas ou inferência de vínculos por nome.

Backend698 aprovados/139 ignorados, PostgreSQL descartável30, frontend409/71arquivos, lint0erros/39avisos anteriores e build HML aprovado. Staging confirmou preservação das67 tabelas de negócio; duplicidade simulada fez a migration falhar sem alteração dos dados/schema. Rotina06h reconhece0055→0059 sem alteração do agendamento. Backup e ativação somente HML, controlador reiniciado sob a mesma identidade S4U; tarefa temporária removida. Nove assets públicos conferidos, APIs saudáveis e produção preservada.

QA desktop/mobile390/360, claro/escuro, seleção individual/rede e bloqueio de posto ocupado comprovados, sem emitir pedidos ou gerar consumo. Duas fixtures identificadas como TESTE HML, com saldo fictício1000,00 cada, permitem testar a prévia até a cópia diária seguinte. Todas as linhas originais das68 tabelas preservadas. Guia separada de QA encerrada; viewport/tema restaurados e rascunho original intacto. Evidências em `storage/backups/20261023-station-contract`. [ExecPlan e rollback](../EXECPLAN_STATION_CONTRACT_HML_20261023.md).

## Identidade da navegação — 23/10/2026 — publicada em homologação

Comentários do usuário atendidos no menu lateral:17 pictogramas próprios em SVG, traço uniforme e preenchimento secundário; identidade correspondente também no cabeçalho desktop e atalhos mobile. Estados de seleção/hover discretos, foco visível, marca e conta refinadas, lista sem distribuição irregular dos grupos, lateral248px/compacto80px e altura limitada à janela considerando a faixa HML. Drawer mantém alvos48px e ganhou botão interno de fechar. Rotas, nomes, permissões, contadores e fluxos preservados; sem backend, dependências ou mudança de dados.

Frontend409 aprovados/71arquivos, Layout13, lint0erros/39avisos anteriores e build HML aprovado. Publicação só frontend;68 tabelas e configurações idênticas, backend/PID preservados, nove assets públicos conferidos e APIs saudáveis. QA de17 desenhos distintos, Veículos/Cadastros, desktop1366 e2268, compacto, tablet820, mobile390/360, claro/escuro, foco/Escape e scroll do drawer; console sem erros. Rota inicial, tema claro e preferência expandida restaurados. Backup/capturas em `storage/backups/20261023-navigation`. [ExecPlan, direção e rollback](../EXECPLAN_NAVIGATION_HML_20261023.md).

## KPIs compactos e contraste — 23/10/2026 — publicada em homologação

Nove telas anotadas atendidas por ajuste incremental no IndicatorBar: mínimo de 110→66px no desktop e 104→68px no celular, com alturas de 82px para rótulos em duas linhas. Removida a linha “Ver registros”/“Ver composição”; seleção mantém check/contorno e aria-pressed. Condutores conserva suas dimensões e ganhou cores semânticas mais contrastantes. Paleta central claro/escuro de total neutro, informação azul, sucesso verde, pendência âmbar e alerta vermelho. Moeda usa 18px no celular para preservar o valor completo em uma linha nos casos conferidos. Filtros, totais globais, unidades e demais ações preservados.

Frontend **409 aprovados/71 arquivos**; direcionados finais **13 aprovados**; lint **0 erros/39 avisos anteriores**; build HML e diff-check aprovados. QA das nove telas, desktop 2268/1366, mobile 390/360, claro/escuro, clique/limpeza de filtros, valores monetários, teclado/foco e seleção além da cor; console sem erros. Contraste mínimo calculado de 4,95:1 no claro e 6,29:1 no escuro. Publicação somente frontend HML; 68 tabelas e configurações idênticas, backend/PID preservados, nove assets públicos iguais ao build e duas APIs saudáveis. Sem alteração de produção. Guia devolvida a Ordens abertas, tema claro e viewport original. Evidências em `storage/backups/20261023-compact-kpis`. [ExecPlan, capturas e rollback](../EXECPLAN_COMPACT_KPIS_HML_20261023.md).

## Contratos e saldos: operação diária — 23/10/2026 — publicada em homologação

Plano aprovado implementado em quatro áreas: Contratos, Pedidos e movimentações, Faturas e pagamentos e Prestadores. Quatro KPIs globais, filtros de atenção compactos, tabela com cobertura do saldo e valores desconhecidos como—; nenhuma seleção automática. Painel lateral com Resumo/Movimentações/Faturas/Configuração, tela inteira mobile, nova ação de pedido e configuração progressiva. Busca300ms, catálogo/detalhes sob demanda, consultas mantidas entre abas e elegibilidade novamente consultada quando o contrato sai do filtro de pendências.

Pedidos são emitidos nos módulos existentes com contrato/postos/oficinas limitados ao contexto e retorno interno validado. Retorno restaura busca, filtros, painel e posição; saldo é consultado novamente. Formulários preservam campos em falhas. Serviços ganharam Sem conciliação e escolha explícita de fatura. Financeiro embutido expõe busca/etapa/contrato, com filtros adicionais e ferramentas acessíveis; pagamentos/conciliações invalidam o acompanhamento anterior. Cálculos financeiros, permissões, documentos, assinaturas, exportações e rota preservados; sem backend/migration/agendamento.

Frontend **429 aprovados/72 arquivos**, direcionado novo19; lint **0 erros/39 avisos anteriores**, build HML e diff-check aprovados. QA autenticado nos dois fluxos sem emitir pedidos; incompletos/aptos, lista vazia, quatro abas, conciliação explícita, ferramentas/importação, teclado/foco, desktop2268/1366 e mobile390/360 claro/escuro, sem overflow e console sem erros. Publicação somente frontend, nove assets conferidos porSHA-256, configurações/backend/PID preservados e duas APIs saudáveis. A primeira publicação preservou68 tabelas; posterior atividade simultânea de preço/manutenção foi revisada e preservada, com68 tabelas estáveis no ponto final conferido. Sem publicação em produção ou restauração de dados.

Guia deixada na lista base, tema claro, lateral expandida e override de viewport removido. Backup de fonte/índice e capturas em `storage/backups/20261023-contract-daily-ux`. [ExecPlan, evidências e reversão](../EXECPLAN_CONTRACT_DAILY_UX_HML_20261023.md), [guia operacional](../CONTRACT_BALANCES_HOMOLOGATION.md).

## Manutenções em listagem única — 23/10/2026 — publicada em homologação

Removida a dupla exibição de pedidos e serviços na página operacional. Uma tabela/um conjunto de KPIs/uma paginação reúne autorizações sem execução, registros canônicos iniciados/concluídos e cancelados sem serviço. Pedidos com `maintenance_record_id` aparecem somente pelo registro correspondente. Iniciar/concluir/cancelar continuam nas linhas; contrato/oficina/orçamento são consultados porFK em diálogo. Concluídas financeiras usam Retificar, respeitando a regra existente que impede exclusão. Painel de pedidos no contexto de Contratos e saldos preservado, com diálogo de ações compartilhado.

Histórico continua paginado no servidor; fila sem execução é carregada por lotes100 e reutilizada por escopo/período. Composição lê até duas páginas adjacentes de serviços para formar uma página única; custo e demais agregados permanecem do servidor, somando à contagem apenas a fila completa aplicável. Busca por placa/secretaria, foco direto, modo legado, PDF/XLSX e permissões preservados, sem backend/migration/configuração ou escrita de dados de negócio.

Frontend **448 aprovados/73 arquivos**, direcionados finais **49/4**; lint **0 erros/39 avisos anteriores**, build e diff-check aprovados. QA autenticado: cinco manutenções sem repetição, uma tabela/grupoKPI, filtros globais, detalhes/retificação sem salvar, desktop1366/original e mobile390/360 claro/escuro, sem overflow/erros de console. PDF gerado/guia aberta; conteúdoBlob não inspecionado por bloqueio de protocolo do navegador. Nove assets públicos conferidos,68 tabelas/configurações idênticas, backend/PID preservados e duas APIs saudáveis. Publicação exclusiva do frontend HML; backup, capturas e rollback em `storage/backups/20261023-maintenance-single-list`. [ExecPlan e evidências](../EXECPLAN_MAINTENANCE_SINGLE_LIST_HML_20261023.md).

## Processos de pagamento assistidos e painel refinado — 23/10/2026 — publicada em homologação

Formulário em duas etapas reaproveita serviços sem conciliação: contrato, empresa contratada (separada do executante), tipo, total em centavos, competência unívoca, secretaria por ID exato e referências com os dados disponíveis da origem. Link Criar processo em Serviços realizados transporta contexto/operação; Novo processo permite selecionar operações de várias páginas, ou cadastro manual histórico. Dados administrativos/fiscais ausentes continuam para preenchimento. Revisar a seleção preserva campos manuais. Servidor é consultado novamente antes de criar; diferença exige justificativa e confirmação do ajuste. Falha parcial mantém o processo criado para repetir só a conciliação; conexão/erro de servidor sem confirmação interrompe repetição cega. Consumo e pagamento seguem separados.

Modal legível com informações complementares progressivas e rodapé fixo; drawer com valor/etapa/vencimento juntos, abas compactas e foco compartilhado com edição aninhada. Tela inteira no celular, sem padding duplo; claro/escuro, teclado, dados históricos, permissões independentes e exportações preservados. KPIs monetários desta página deixam de quebrar os números.

Suíte completa final **473 aprovados/75 arquivos**, direcionados **54/5** e finais de formulário **19/2**; lint **0 erros/39 avisos anteriores**, build HML e diff-check aprovados. QA desktop1365/2035 e mobile390/360/327, ausência de overflow e console sem erros; nenhuma fatura/movimentação gravada. Fonte combustível sem operações pendentes conferida por estado vazio, e pré-preenchimento/integração de combustível e manutenção exercitados pelos testes com APIs mockadas. Nove assets públicos conferidos,68 tabelas/configurações/backend/PID preservados e duas APIs saudáveis. Publicação só frontend HML, sem migration/agendamento/restore/reinício/produção. Tema/viewport restaurados e guia de QA encerrada. [ExecPlan, capturas e reversão](../EXECPLAN_PAYMENT_GUIDED_PROCESS_HML_20261023.md); backup em `storage/backups/20261023-payment-guided-process`.
## Guias do contrato visíveis no extrato — 23/10/2026 — publicada em homologação

Corrigida a compressão das guias Resumo/Movimentações/Faturas/Configuração quando o extrato carregava uma lista maior. Linhas do corpo rolável usam tamanho intrínseco, e a navegação mantém mínimo44px; não depende mais do volume de registros. Medição real:1,25px antes e43,98px depois no mesmo extrato. Alternância por reservas/serviços, acesso a faturas/configuração/resumo, retorno ao extrato, rolagem até o fim e teclado conferidos. Desktop1600×900 e mobile390/360, claro/escuro, sem overflow do corpo ou erros de console.

473 testes/75 arquivos, lint0 erros/39 avisos anteriores, build HML e diff-check aprovados. Nove assets públicos conferidos e68 tabelas/configurações/backend/PID preservados; APIs saudáveis. Ajuste somente CSS, publicado apenas no frontend HML; sem gravação financeira ou mudança de produção. Capturas, backup e reversão em `storage/backups/20261023-contract-tabs`. [ExecPlan e evidências](../EXECPLAN_CONTRACT_TABS_HML_20261023.md).

## Correção funcional da criação de processos — 23/10/2026 — publicada em homologação

Erro12f0e248-0cd9-4bfe-b487-63d256753d2e identificado no backend: MissingGreenlet ao acessar referências não inicializadas após flush de novo processo. Checklist apresentava a mesma falha, inclusive na importação. Coleções inicializadas antes da persistência nas duas entradas, sem migration/payload/regra financeira nova. Teste real também identificou FOR UPDATE aplicado aos outer joins de relações opcionais ao editar/excluir: lock agora se limita à linha do processo, mantendo lock do contrato, escopo e impedimento de apagar conciliados. Texto de resultado incerto passou a cobrir tanto HTTP500 quanto conexão, mantendo proteção contra repetição cega.

Regressões reproduziram ambas as falhas em PostgreSQL real antes da correção. Suíte isolada34 aprovados (banco descartável5441), cobrindo POST manual/combustível/manutenção, três serviços, referências, checklist, leitura/edição/exclusão, importação repetida e conciliação repetida sem desconto duplicado. Backend padrão698 aprovados/143 pulados; controle financeiro novo habilitado na fixture real e desabilitado nos fakes legados. Frontend474 aprovados/75 arquivos, direcionado14, lint0 erros/39 avisos anteriores, build HML e diff-check aprovados.

Frontend publicado e somente API HML reiniciada pelo gerenciador validado. Tentativa de tarefa temporária negada sem criação; reinício por elevação Windows concluído. Nove assets públicos,68 tabelas, configurações, tarefa06h e PID de produção preservados; duas APIs saudáveis. Processo1234 não havia sido salvo e três operações permaneciam sem conciliação. Após login do usuário, rascunho integral recuperado na guia original, todos os campos idênticos, total8700 e botão habilitado, sem enviar. Sem novo redesign: layout/temas e validação visual anterior preservados. Backup, regressões e captura em `storage/backups/20261023-payment-create-fix`. [ExecPlan e reversão](../EXECPLAN_PAYMENT_CREATE_FIX_HML_20261023.md).

## Abas do processo visíveis com conteúdo longo — 23/10/2026 — publicada em homologação

Corrigida a compressão de Resumo/Financeiro/Checklist/Histórico no drawer do processo. A linha automática da grade reduzia a faixa de abas a1,136px no Financeiro; flex-shrink não a protegia como item de grid. Corpo agora preserva a altura intrínseca das linhas e navegação tem mínimo44px, aplicando a mesma correção incremental do inspetor de contrato. Medições após publicação43,98px no desktop/45,23px mobile, inclusive com12 itens de checklist rolados até o fim e referências expandidas.

474 testes/75 arquivos, lint0 erros/39 avisos anteriores, build HML e diff-check aprovados. QA desktop1600/2035 e mobile390/360, claro/escuro, quatro guias, teclado/fechamento, navegação fixa durante rolagem, ausência de overflow horizontal e de erros no console. Nenhuma ação financeira ou gravação; somente CSS, sem backend/reinício/migration. Nove assets públicos conferidos e68 tabelas/configurações/PID preservados; APIs saudáveis e produção sem alteração. Tema e viewport restaurados, guia de QA encerrada e guia original devolvida ao Financeiro com as quatro abas visíveis. Backup, capturas e geometria em `storage/backups/20261023-payment-tabs`. [ExecPlan e reversão](../EXECPLAN_PAYMENT_TABS_HML_20261023.md).

## Atualizações da homologação promovidas à produção — 26/10/2026

Publicação expressamente autorizada pelo usuário, concluída pelas PRs75 e76. Produção em main263ebee, schema0059; KPIs globais interativos/compactos, identidade do menu, Contratos e saldos integrado às operações, troca do combustível efetivo, preços versionados com edição/exclusão, posto exclusivo por contrato, manutenção em lista única e processo de pagamento assistido com correções de criação/abas. Aviso da cópia diária restrito à homologação por marcador centralizado de ambiente e dois testes de regressão.

Backup final consistente de banco, anexos, código, build e configurações antes da migração. As59 tabelas originais preservaram todas as colunas e linhas na ativação; oito novas tabelas vazias e novos vínculos nulos. Nenhum dado de testes importado, abertura de saldo presumida ou gravação financeira de QA em produção. Somente CONTRACT_BALANCE_ENABLED=true alterado na configuração. Uma pausa da API8000 entre09:32:10 e09:32:32; segundo ajuste só do frontend, preservando PID. PostgreSQL/Cloudflare/HML não reiniciados por esta publicação.

Gates:698 backend/143 pulados,476 frontend/75 arquivos,34 testes PostgreSQL real, lint0 erros/39 avisos anteriores, builds e três checks CI aprovados em cada PR. Ensaio0055→0059 em cópia descartável preservou o histórico e validou20 endpoints/13 filtros; produção consultada estritamente em leitura em19 endpoints/12 filtros. Conferência final de nove assets públicos por hash, configurações, proteção anônima e saúde dos dois ambientes aprovada. QA de lista/painéis/abas/dados históricos em desktop claro e mobile390 escuro, sem overflow ou erros de console; tema/viewport restaurados e guia oficial deixada em Contratos e saldos.

Dois contratos existentes continuam com configuração pendente: vigência, rede/preços e saldo inicial conferido pelo gestor antes de novos pedidos. Não existe contrato de manutenção cadastrado; não houve reclassificação automática. Rotina diária06h permanece exclusivamente HML, habilitada e compatível com0059→0059, sem nova restauração hoje. Evidências, capturas e rollback em D:/FROTAS/frota_certificado_homologacao/storage/backups/20261026-contracts-kpis. [ExecPlan e resultado](../EXECPLAN_CONTRACTS_PRODUCTION_20261026.md).

## Itens e aditivos integrados a quantidades —26/10/2026 — somente homologação

Catálogo permanente por contrato, vínculo explícito de preços/executantes, abertura quantitativa obrigatória com distribuição de reservas herdadas sem novo débito financeiro. Combustível/ARLA e serviços/peças reservam quantidades e dinheiro, convertem pelo realizado, liberam diferenças e preservam retificações/estornos. Falta de configuração e divergências impedem novos pedidos. Instrumentos combinam prazo, preços e acréscimos em editor amplo com prévia, tipos explícitos, limite acumulado25% por adjudicação, PDF opcional e fotografia imutável para demonstrativo/PDF/XLSX.

706 backend,52 PostgreSQL real descartável,486 frontend/78 arquivos, nove direcionados finais, lint0 erros/39 avisos anteriores e build HML. Ensaios de migrations e falha da rotina06h preservaram banco ativo; head HML0062_items_network_merge.67 tabelas antigas preservadas na ativação e74 na extensão de compatibilidade. Apenas a flag quantitativa foi acrescentada à configuração; API6969 reiniciada. Nenhuma escrita/publicação em produção nem importação dos documentos em contratos reais.

QA com dois contratos, posto, fornecedor e veículo fictícios: abertura na interface, ARLA/prazo/quantidade combinados, anexo recuperado por hash, emissão e cancelamento30L+2L/R$201,90 e manutenção450→270 com reservas zeradas. Claro/escuro, desktop/mobile, foco/Escape e ausência de overflow; contexto original restaurado. Configurações de teste continuam reiniciadas às06h. NETWORK_VALUE é entrega operacional paralela: schema compatível e proteção contra uso indevido do fluxo de preço fixo enquanto sua integração HML está pendente. [ExecPlan](../EXECPLAN_CONTRACT_ITEMS_HML_20261026.md) · [Guia e reversão](../CONTRACT_ITEMS_HOMOLOGATION_20261026.md). Evidências privadas em storage/backups/20261026-contract-items.

## Produção conciliada com homologação — 27/10/2026 — somente HML

As entregas produtivas PR78 (BRL/correção auditável de saldo), PR79 (rede por valor real sem reserva) e PR80 (justificativas rápidas ao vincular ordens) foram incorporadas. A árvore produtiva 31543d4 era idêntica a origin/main a216fa4; a branch HML agora inclui essa linha inteira como ancestral. Merge 86fe9ae e refinamento de texto d537298, em branch isolada feature/hml-production-sync-20261027, sem merge em main nem deploy produtivo.

Mantidos catálogo, quantidades, ARLA, linhas de manutenção, abertura conferida, aditivos por item e demonstrativos da HML. Rede por valor não exige preço unitário ou abertura quantitativa e não reserva; registra o realizado na confirmação. A modalidade original da ordem governa expiração/reabertura e execução mesmo após alterar o cadastro. Catálogo quantitativo já aberto pode acompanhar volumes reais sem reserva. Campos monetários próprios dos itens também usam BRL, preservando seis casas nos preços.

708 backend, 69 PostgreSQL real descartável, 511 frontend/81 arquivos, 38 regressões finais após ajuste apenas de texto; lint 0 erros/39 avisos anteriores e build HML aprovados. Publicação às 08:01:17 com dump consistente e fingerprints das 75 tabelas preservados; sem migration/restauração/configuração nova. Stop inicial recusado por falta de visibilidade dos campos do processo elevado, e publicação executada pelo mesmo gerenciador após autorização administrativa do Windows. Só API 6969 reiniciada; refinamento posterior só frontend.

QA autenticada em desktop e celular 390×843, claro/escuro, sem overflow, abas com altura preservada, Prime sem preço/reserva, prévia de correção BRL e editor por item. Nenhuma gravação de negócio pela QA: 27 tabelas financeiras/operacionais idênticas antes/depois. Nove assets servidos conferidos, entrada final index-CZSQvIae.js observada no navegador público, console sem erros. Home, tema e viewport originais restaurados, guia temporária fechada. Produção mantém fonte limpa, HEAD e PID anteriores, API pronta; tarefa das 06h saudável e sem execução adicional.

[Guia da conciliação](../PRODUCTION_HML_RECONCILIATION_20261027.md) · [ExecPlan](../EXECPLAN_PRODUCTION_SYNC_HML_20261027.md). Evidências privadas e reversão em storage/backups/20261027-production-sync. O bloqueio temporário NETWORK_VALUE registrado na entrega anterior está resolvido. A rotina das 06h sincroniza dados; futuras mudanças de código produtivo continuam exigindo integração auditada para preservar as funcionalidades próprias da HML.

## Abastecimentos em áreas e cabeçalhos compactos — 27/10/2026 — somente HML

Ordens e Histórico passam a ocupar áreas selecionáveis na mesma rota, com uma única listagem visível e carregamento apenas da área consultada. Busca, filtros e paginação são preservados ao alternar. Links antigos de veículo/indicador abrem o histórico; contexto de contrato e atalhos de criação continuam válidos. Sem permissão de ordens, mantém-se somente a consulta histórica. Filtros adicionais recolhíveis exibem contagem correta e KPIs continuam globais/interativos. Emissão em lote, guia, atualização, postos e exportação seguem acessíveis em ações próprias, com texto Exportar para evitar dois menus indistintos.

Descrições introdutórias retiradas dos cabeçalhos das páginas; instruções de formulários, avisos e regras permanecem. Cabeçalhos compartilhados mais compactos e alinhados com suas ações. Desktop1600×900: Abastecimentos89,90→43,22 px, tabela166,76 px mais acima; Sinistros89,90→39,24 px. Nenhum preenchimento artificial abaixo de listas curtas. QA de alternância/página/busca, filtros, exportação por teclado/foco, lote e temas claro/escuro. Mobile390×844 e360×801 sem overflow, alvos de44 px; tema, rota e viewport originais restaurados.

517 testes/81 arquivos, 41 direcionados após refinamento do acionador de exportação, lint0 erros/39 avisos anteriores e build HML aprovados. Commits f53a825/8528f76, branch isolada feature/fuel-workspace-compact-headers-hml-20261027. Publicação só frontend, sem reinício. Nove assets servidos conferidos e75 tabelas/configurações/backend/PIDs preservados; produção intacta e rotina06h saudável. Backup e capturas privados em storage/backups/20261027-operation-workspaces. [ExecPlan, medições e reversão](../EXECPLAN_OPERATION_WORKSPACES_HML_20261027.md).

## Ordens abertas em Abastecimentos — 27/10/2026 — somente HML

Ordens abertas integra a navegação local com Ordens e Histórico; o menu lateral fica com uma única entrada Abastecimentos. A rota anterior redireciona para a nova área, preservando foco de assinatura, indicador e demais parâmetros. Reutiliza a página operacional existente: confirmação, vínculo contratual, combustível efetivo, comprovantes, assinatura e prazos. Consulta e página permanecem ao alternar; somente a área ativa faz requisições, e diálogos deixam de estar ativos fora dela.

As permissões anteriores continuam por área. Perfil somente ordens não consulta histórico, listagem geral ou catálogos; criação mantém a exigência anterior de acesso a Abastecimentos e permissão de emitir. Não houve mudança de API, schema, cálculo, configurações ou banco. No celular, as três áreas cabem juntas; utilitários continuam no menu de ações, com PDF/XLSX na área Ordens.

Suíte completa com 528 testes/82 arquivos; após refinamento de limpeza do aviso entre áreas, 67 direcionados/5 arquivos, lint zero erros/39 avisos anteriores e build HML aprovados. QA autenticada em desktop e mobile 390×844/360×801, claro/escuro, sem overflow: endereço antigo, pesquisa, página 2, filtros, atualização, menus e diálogos conferidos sem salvar/emitir/assinar. Sessão renovada pelo usuário durante a QA; console sem erros depois do login, contexto original restaurado e guia temporária fechada.

Fonte b54dea2 em feature/open-orders-fuel-tab-hml-20261027; publicada apenas no frontend HML às 09:59:02. Nove assets conferidos; 75 tabelas, 27 tabelas de negócio, backend, configurações e PIDs preservados. Produção limpa em 31543d4 e rotina 06h saudável. Backup, capturas e reversão em storage/backups/20261027-open-orders-tab. [ExecPlan e evidências](../EXECPLAN_OPEN_ORDERS_FUEL_TAB_HML_20261027.md).

## Preço original e abertura de itens orientada — 27/10/2026 — somente HML

Cadastro de item pede somente o preço original; a referência interna inicial recebe o mesmo valor e referências anteriores são preservadas. Reajustes seguem pelo aditivo. Na abertura, o contexto fornecido pelo servidor indica os itens ativos sem preço vigente antes da confirmação. Mensagem em linguagem operacional explica qual oficina/posto e preço faltam; a ação abre a configuração auxiliar, com item e fornecedor único selecionados e valor sugerido para revisão. Salvar/cancelar mantém o rascunho de quantidades, documento, histórico, justificativa e distribuição de reservas; nenhum vínculo ou abertura é confirmado automaticamente.

Falha de verificação bloqueia uso de contexto antigo; rejeição por preço que deixou de valer reconsulta as pendências e preserva o formulário. Versões futuras/históricas não liberam a abertura. APIs, validações financeiras, permissões e schema preservados.

540 testes/82 arquivos, 42 direcionados finais/4 arquivos, lint zero erros/39 avisos anteriores e build HML aprovados. QA autenticada em desktop/mobile 390×843 e 360×800, claro/escuro, sem overflow horizontal; retorno por Escape com foco/restante/documento preservados. Nenhuma gravação de negócio na QA. Guia original permanece no contrato e abertura informados, vazia como antes, tema claro; emulação removida e guia temporária fechada. Console sem erros.

Fonte 0f83f8f, branch isolada feature/contract-item-setup-clarity-hml-20261027. Publicação somente frontend às 11:44:18: nove assets conferidos, 75 tabelas e 27 tabelas de negócio idênticas; configurações/backend/PIDs mantidos. Produção limpa em 31543d4 e rotina 06h saudável. Backup, capturas e reversão em storage/backups/20261027-contract-item-setup. [ExecPlan e resultado](../EXECPLAN_CONTRACT_ITEM_SETUP_HML_20261027.md).

## Complemento de itens originais após abertura — 27/10/2026 — somente HML

Configuração → Itens e quantidades mantém Adicionar item original depois da abertura. Cadastro para itens previstos e omitidos reúne original, restante conferido, acréscimos históricos explícitos, executantes/preços e documento/justificativa. Complemento tem evento quantitativo próprio e auditoria; não gera aditivo nem altera saldo em reais, reservas, consumos, preços antigos ou abertura anterior. Preço vigente de combustível é vinculado pela versão exata; rede por valor não exige preço fixo no catálogo opcional já aberto.

API específica preserva as rotas anteriores bloqueadas após abertura. Bloqueio do contrato/transação, validações de número/código/produto, chave idempotente e rollback impedem duplicação ou inclusão parcial. Mesmo acesso financeiro existente; escopo de operações permanece por secretaria. Complemento invalida prévia antiga de aditivo, preservando demonstrativos confirmados. Sem migration.

719 backend/198 pulados, 551 frontend/83 arquivos, 50 direcionados finais e 89 PostgreSQL real descartável; lint zero erros/39 avisos anteriores e build HML aprovados. QA desktop/mobile 390×843/360×800, claro/escuro, teclado/foco, sugestão de preço e cancelamento; sem overflow horizontal e sem envio do rascunho de teste. Sessão renovada pelo usuário e guia original retornada ao contrato solicitado; tema claro, viewport padrão e guia temporária encerrados. Console sem erros.

Publicação HML às 12:33:33, fonte 50a74c5 em feature/original-item-complements-hml-20261027. Backup consistente e 75 tabelas preservadas na ativação; somente API 6969 reiniciada, configurações/schema intactos e nove assets conferidos. Uma inclusão real registrada durante a conferência acrescentou apenas item/preço/evento original; comparação preservou todos os registros anteriores das 27 tabelas de negócio e todos os lançamentos financeiros. Produção limpa em 31543d4/PID 2512; rotina 06h saudável, sem cópia extra. Backup/capturas/reversão: storage/backups/20261027-original-items-complement. [ExecPlan](../EXECPLAN_ORIGINAL_ITEM_COMPLEMENTS_HML_20261027.md) · [Guia](../ORIGINAL_ITEM_COMPLEMENTS_HML_20261027.md).


## Detalhes de empréstimo em painel modal — 27/10/2026 — somente HML

Detalhe anteriormente inline passa a painel lateral no desktop e tela inteira no celular. Identificação/origem/recebedora, aviso compacto de pendências, abas Resumo/Documentos/Histórico e próxima ação no rodapé permanecem acessíveis enquanto o conteúdo rola. Editar, rejeitar e cancelar continuam no menu de ações, pelos formulários existentes e com as mesmas permissões, bloqueios e validação de versão. Documentos só carregam na primeira visita e permanecem montados ao alternar, preservando seleção; termos, anexos e assinaturas mantidos.

A rota id e os demais parâmetros continuam válidos. Lista permanece montada, preservando filtros/página/posição. Fechar e Voltar devolvem foco ao disparador ou à lista no acesso direto. Foco não se perde ao terminar a consulta; navegação por teclado nas abas e Escape dos formulários aninhados conferidos. Sem alteração de API, schema, payloads, autorização ou regras de negócio.

569 testes/84 arquivos, lint zero erros/39 avisos anteriores e build HML aprovados. QA autenticada em desktop1600×900 e viewport padrão, mobile390×843/360×800, claro/escuro; abas/rodapé estáveis, sem overflow horizontal. Posição1505px preservada ao fechar/voltar na lista mobile. Consulta de documentos/histórico e abertura/fechamento da edição sem salvar, anexar ou assinar. Console sem erros; emulação removida, tema claro e guia original no mesmo empréstimo, guia temporária fechada.

Fonte363477e na branch isolada feature/loan-detail-inspector-hml-20261027, publicada às17:10:02 somente no frontend HML, sem reinício. Nove assets conferidos,75 tabelas e configurações/backend/PIDs preservados; produção limpa em31543d4. Rotina06h saudável, sem cópia extra. Backup, capturas e reversão privados em storage/backups/20261027-loan-inspector. [ExecPlan e evidências](../EXECPLAN_LOAN_INSPECTOR_HML_20261027.md).


## Filtros comuns de Abastecimentos — 27/10/2026 — somente HML

Ordens, Ordens abertas e Histórico usam o mesmo componente de filtros pesquisáveis de veículo, secretaria e posto. Veículo é contexto compartilhado pela URL e permanece ao alternar. Demais buscas/filtros mantêm seus estados por área: situação/período de emissão nas ordens, prazos/KPIs e confirmação nas abertas, alertas de consumo no histórico. Nas abertas, acrescentados posto e Limpar filtros, com o mesmo toolbar compacto. Catálogos autorizados atualizam sob demanda; perfis sem acesso mantêm a busca textual, sem novas permissões ou chamadas a catálogos restritos.

Corrigida a divergência entre seleção local e vehicle_id antigo da URL: limpar remove o UUID preservando a área e os demais parâmetros; Voltar/Avançar atualizam seleção e consulta. Trocar veículo volta à página1; APIs de consulta, KPIs globais e relatórios completos recebem o mesmo filtro. Veículo fora do catálogo continua identificado pelo contexto, sem presumir seu vínculo. Sem alteração de API/backend/schema/env/regras financeiras.

579 testes/84 arquivos,50 direcionados/6 arquivos, lint zero erros/39 avisos anteriores e build HML aprovados. QA desktop1366×767/1600×900 e viewport padrão, mobile390×843/360×800, claro/escuro; sem overflow horizontal e controles mobile acima de44px. TNU5A11 conferido com10 ordens,1 aberta e9 históricos; combinação de posto nas abertas resultou0 sem alterar o filtro específico do histórico. Limpar/Voltar, seletor na entrada direta e console conferidos. Sessão renovada pelo usuário; guia original preservada em sua navegação, tema claro e emulação removida, guia temporária encerrada. Sem gravações de negócio na QA.

Fontea47e2f5 em feature/fuel-workspace-filters-hml-20261027, publicada às17:48:34 só no frontend, sem reinício. Nove assets,75 tabelas/configurações/backend/PIDs preservados. Produção limpa em31543d4; rotina06h saudável, sem cópia extra. Backup, capturas e reversão privados:storage/backups/20261027-fuel-workspace-filters. [ExecPlan e evidências](../EXECPLAN_FUEL_WORKSPACE_FILTERS_HML_20261027.md).

## Progressão guiada dos empréstimos — 28/10/2026 — somente HML

Resumo do painel apresenta marcos operacionais Proposta/Entrega/Uso/Devolução, etapa atual e próximo responsável. Os marcos levam aos detalhes, sem executar operações. Cancelamentos/rejeições interrompem o percurso; regularizações preservam a ressalva de ausência de aceites retroativos. A conclusão operacional não presume assinaturas: documentos continuam em consulta separada e lazy.

Entrega e devolução agrupam datas, odômetros e prazo. Motivo/condições mantêm o texto original com prévia de duas linhas e expansão somente quando há corte real, reavaliada ao mudar a largura. Lotações ficam em área expansível. Conferência operacional sem pendências fica recolhida; bloqueios permanecem destacados e abertos, com o atalho capaz de reabri-los. Ações, formulários, permissões, documentos, assinaturas, abas/rodapé fixos, filtros e retorno de foco preservados. Sem alteração de backend/API/schema/regras/env.

595 testes/84 arquivos; lint zero erros/39 avisos anteriores e build HML aprovados. QA autenticada desktop 1600×900 e mobile 390×843/360×800, claro/escuro, empréstimos ativos/devolvidos/cancelados, expansão, documentos e teclado; sem overflow horizontal ou erros no console. Sem gravações de negócio na QA. Tema claro e viewport padrão restaurados; guia temporária fechada e navegação atual do usuário preservada.

Fonte 9769af0 na branch isolada feature/loan-guided-progress-hml-20261028, publicada às 09:36:13 somente no frontend, sem reinício. Nove assets, 75 tabelas (38 de negócio/documentos), backend/configurações/PIDs preservados. Produção limpa em 31543d4; rotina 06h saudável, sem cópia extra. Backup, capturas e reversão privados em storage/backups/20261028-loan-guided-progress. [ExecPlan e evidências](../EXECPLAN_LOAN_GUIDED_PROGRESS_HML_20261028.md).

## Formulários guiados e identificação dos veículos — 28/10/2026 — somente HML

Proposta em três etapas e regularização em quatro, com progresso por preenchimento válido, revisão, foco na correção e navegação sem perder conteúdo. Ações e documentos recebem orientação de impedimentos, preservando a mensagem do servidor e oferecendo caminhos autorizados para consultar/corrigir. Prévia/token, versões, papéis, assinaturas e confirmação explícita mantidos. Rascunhos continuam aceitando odômetro e condições opcionais antes do envio.

Complemento solicitado nas anotações: proposta nova consulta o último encerramento de posse para sugerir o odômetro, preserva valores digitados e ignora respostas antigas após troca do veículo. Mantém a leitura da edição e da regularização histórica. Seletor mostra marca/modelo, propriedade, lotação atual e final do chassi, sem ampliar os veículos autorizados. Obrigatórios usam asterisco vermelho; erros e labels inválidos usam vermelho e mensagem em negrito. Consultas auxiliares dependem das permissões existentes; ausência/falha mantém preenchimento manual e orientação.

621 testes/86 arquivos; 51 direcionados finais/4 arquivos, lint zero erros/39 avisos anteriores e build HML aprovados. Desktop claro/escuro, mobile390×843/360×800, teclado, progresso, preservação de valores, referência automática e erros conferidos. Sem overflow horizontal, rodapé fixo e etapas de58px no celular; console final sem erros. Nenhum registro foi salvo pela QA; tema claro/viewport padrão restaurados e navegação atual do usuário preservada.

Fonte final b5225e4 na branch feature/loan-guided-forms-hml-20261028, frontend publicado às11:45:58, entrada index-B6yz_Ygm.js e nove assets conferidos. Backend/schema/env e APIs6969/PID21432 e8000/PID2512 preservados; produção limpa31543d4. Banco em uso concorrente:67/75 tabelas idênticas, incluindo27 financeiras; diferenças em empréstimos/posses/lotação/termos/auditoria registradas separadamente, com baseline preservado e sem restauração. Backup/capturas/reversão privados em storage/backups/20261028-loan-guided-forms. [ExecPlan e evidências](../EXECPLAN_LOAN_GUIDED_FORMS_HML_20261028.md).


## Orientação de conflito temporal de posse — 28/10/2026 — somente HML

Coordenada com o agente da UI de empréstimos e baseada em c29fadb. Nova branch fix/possession-handoff-guidance-hml-20261028, implementação 9141ec3. Backend mantém a barreira de responsabilidade e informa os horários efetivos de entrega/devolução na mensagem 409. O caso TOB7D75 começa às14h16 e cruza devoluções/entrega até16h45min44s; as17h da imagem são previsão. Início real ainda depende da conferência com Ana; nenhum histórico ou posse alterado.

35 testes backend +13 frontend aprovados; três falhas antigas reproduzidas no baseline e documentadas. Publicada somente API HML com reinício validado;75 tabelas/configurações/frontend inalterados. Entrada index-DCvH-SE2.js preservada; produção limpa31543d4/PID2512 e PostgreSQL5441 preservados. [Diagnóstico, validação e reversão](../CASE_POSSESSION_HANDOFF_HML_20261028.md).

## Lotação sugerida e linha clicável nos empréstimos — 28/10/2026 — somente HML

Regularização sugere a lotação atual do veículo pelo allocation_id exato, apenas quando está no catálogo autorizado e pertence à origem. Consulta atrasada respeita o veículo atual e a escolha manual; alterar a origem limpa a seleção histórica. Ajuda curta pede conferir a lotação da época. Sem inferência por nome, confirmação automática ou alteração de payload/permissões.

Clicar em uma célula da linha abre o painel de detalhes; botão e entrada por teclado permanecem. Cliques nos controles não duplicam a abertura, e selecionar texto não dispara navegação. Fechamento preserva filtros, query, posição e foco no botão de consulta. Realce discreto de hover/foco e cursor pointer; sem alterar a semântica da tabela.

629 testes/86 arquivos, oito regressões adicionadas e 57 direcionados finais/4 arquivos aprovados; lint zero erros/39 avisos anteriores e build homologation aprovado. QA no veículo GTN8C43, edição manual da lotação, clique na célula do empréstimo cancelado TML4E34, retorno à lista e Enter. Desktop claro, formulário mobile claro390×843 e painel mobile escuro390×843/360×800, sem overflow e com rodapés visíveis. Console sem erros. Nenhum registro salvo na QA; tema/viewport restaurados e guia atual preservada.

Fonte final bf8f794 na branch fix/loan-origin-location-row-open-hml-20261028, publicada às 13:56:26 só no frontend, entrada index-Cl_6b_nt.js e nove assets conferidos. 75 tabelas, backend/schema/configurações/PIDs preservados; produção limpa31543d4/PID2512. Backup/capturas/reversão privados em storage/backups/20261028-loan-location-row-open. [ExecPlan e evidências](../EXECPLAN_LOAN_LOCATION_ROW_OPEN_HML_20261028.md).

## Promoção de HML e formulários globais — 28/10/2026

As melhorias anteriores foram promovidas primeiro à produção pela PR81, merge 0cd053c, às14:37:16. Migração aditiva, backup/reversão e validação produtiva concluídos sem copiar dados HML ou confirmar saldos/quantidades. [Publicação e validação](../EXECPLAN_PRODUCTION_PROMOTION_20261028.md).

Depois da promoção, a nova identidade foi aplicada somente na homologação: 55 formulários de cadastro, edição e ações, com etapas por assunto nos extensos e uma tela nos curtos. Progresso por preenchimento válido, obrigatórios vermelhos, links de correção com foco, mensagem original do servidor e dados/anexos preservados. Assistentes recentes de empréstimos/pagamentos mantidos; revisão explícita de permissões sem alteração de regras. Busca/filtros continuam compactos. Backend, APIs, payloads, permissões, schemas e cálculos financeiros preservados.

643 testes/87 arquivos aprovados, lint zero erros/39 avisos anteriores, build homologation. QA por famílias, desktop1280×900 e mobile390×843/360×800, claro/escuro, Tab/Escape/retorno de foco e console sem erros. Sem overflow lateral; ações acessíveis e labels obrigatórios na mesma linha. Nenhum cadastro/pedido/pagamento/assinatura/permissão submetido pela QA. Tema/viewport restaurados e guias do usuário preservadas.

Fonte66a8fb7 na branch feature/guided-forms-global-hml-20261028, publicada às17:55:19 só no frontend, entrada index-B2K1JZAJ.js e nove assets locais conferidos; entrada confirmada na navegação HTTPS. APIs6969/PID21432 e8000/PID5804 preservadas, produção limpa0cd053c, rotina06h intacta. 71/75 tabelas idênticas; diferenças de uso concorrente em condutor/posse/auditoria e expiração automática de uma ordem documentadas sem restaurar dados. Contratos, saldos, quantidades, faturas e pagamentos preservados. Backup/capturas/reversão privados em storage/backups/20261028-global-guided-forms. [ExecPlan e evidências](../EXECPLAN_GLOBAL_GUIDED_FORMS_HML_20261028.md).

## Correção do alerta e primeira tecla — 28/10/2026 — somente HML

Reproduzidas as duas falhas informadas: SVG sem classe media546px; a inspeção de progresso em microtask durante capture podia restaurar o valor anterior antes de onChange. Inspeção agora agendada para o próximo frame após propagação, coalescida, com função atualizada e cancelamento ao desmontar; atualização do campo continua imediata. Classe app-icon explícita nos alertas local/servidor e check de etapa, com18px/12px. Sem mudança em AppIcon global, handlers, payloads ou regras.

Dois novos testes reproduziram as falhas antes da correção;16 direcionados e645 completos/87 arquivos aprovados, lint zero erros/39 avisos anteriores e build HML. QA real com teclas isoladas, limpar/reiniciar, Marca/Modelo, seletor SUV, avançar/voltar e Nome do condutor. Desktop1280×900, mobile390×843 claro/360×800 escuro, alertas compactos, sem overflow, rodapé acessível e console sem erros. Nenhum cadastro salvo; tema/viewport restaurados e guias do usuário preservadas.

Fonte115a6d7 na branch fix/guided-form-input-alert-hml-20261028, publicada às23:35:48 só no frontend, entrada index-CexbYAw6.js e nove assets conferidos.75/75 tabelas idênticas após QA; configurações, backend, APIs6969/PID21432 e8000/PID5804, PostgreSQL e rotina06h intactos. Produção limpa0cd053c. Backup/reversão/capturas em storage/backups/20261028-guided-form-input-alert. [ExecPlan e evidências](../EXECPLAN_GUIDED_FORM_INPUT_ALERT_HML_20261028.md).
