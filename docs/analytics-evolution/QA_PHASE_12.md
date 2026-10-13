# Fase 12 — QA de Analytics em homologação

Data: 12/10/2026; complemento em 13/10/2026. Branch: `feature/analytics-evolution-hml`. HEAD inicial: `82f3415fc358e3f5152a9ee4d0fad53594d264e5`.

## Resultado atual — revisão completa de 13/10/2026

O [relatório de revisão](REVIEW_2026_10_13.md) complementa e atualiza os resultados históricos abaixo. Inconsistências reproduzidas de cronologia, filtros/ranking, paginação/origem, detalhe sem atividade, requests V1, erros de exportação e campos omitidos foram corrigidas. Backend **608 aprovados/88 pulados**, frontend **285 aprovados/57 arquivos**, lint **0 erros/45 avisos preexistentes**, build e diff check aprovados.

Além dos 48 casos com fixtures, a sessão pública ficou autenticada durante a conclusão e permitiu validar **48 combinações reais** de oito abas, claro/escuro e 1366/1920/390 px, sem overflow ou erro de console/mensagem de falha. Bundle público confirmado: `index-BA6yp1-c.js`. Filtros, pilha/posse, anomalia com regra/amostra e identidade do veículo foram confirmados; PDF/XLSX executivos realmente baixados. [Registro público](evidence/phase-12/review-20261013/public-browser.json), [downloads](evidence/phase-12/review-20261013/public-downloads.json). Isto resolve a pendência de sessão/bundle público descrita no relatório original abaixo.

Sonda read-only atual: zero escrita, sete verificações entre visões aprovadas, oito serviços com 1–5 statements e segunda amostra de 0,5–82,2 ms. Doze exports válidos; todas as páginas PDF com texto dentro dos limites, inspeção de páginas representativas. [Resultados](evidence/phase-12/review-20261013/readonly-qa.json). API isolada HML reiniciada e saudável, autorização 401 sem sessão preservada.

Pronto para revisão/checkpoint em HML. Persistência da Fase 10 continua não autorizada; não declarar o pacote completo pronto para produção sem decidir sua inclusão/implementação e revisar o checkpoint. Não houve commit/push/produção. Limites restantes: amostra pequena sem carga concorrente, navegador público com perfil administrador, sem certificação WCAG/leitor de tela nem revisão manual de todas as páginas PDF. Lista completa dos arquivos no relatório final; os registros originais abaixo permanecem como histórico.

## Relatório original de 12/10/2026 e primeiro complemento

## Preflight e escopo

O [preflight](evidence/phase-12/preflight.txt) registra branch, HEAD e `git status` anteriores à edição. O working tree já continha alterações não commitadas das Fases 10 (somente plano) e 11 (Relatórios V2). Foram preservadas. Os documentos mestre, status, runbook, especificação visual e fase 12 foram lidos antes da edição. Nenhum arquivo de produção, deploy, migration ou dado operacional foi alterado.

## Checklist e evidências

| Área | Resultado | Evidência e limite |
|---|---|---|
| Regressão backend e escopo | 601 testes aprovados, 88 pulados | `ANALYTICS_V2_READONLY_TESTS=1` ativou sondas SQL PostgreSQL com fixtures em CTE, transação somente leitura. Testes cobrem permissões `analytics:view` e de módulos, org fixa/histórica, filtros, datas e registros de origem. Não houve teste de carga concorrente. |
| Regressão frontend | 279 testes aprovados em 57 arquivos | Cobrem navegação, estados parciais/vazios, foco/drawer, descarte de respostas antigas, recorte e exportações; há teste novo do erro JSON recebido como Blob. Lint 0 erros/45 avisos preexistentes; build aprovado. |
| API em execução | 401 sem autenticação | `127.0.0.1:6969/api/analytics/v2/summary` exigiu sessão. A API isolada HML foi reiniciada após a correção do PDF; saúde app/banco `ok`, `/api/analytics/v2/export` sem sessão retornou 401 e HTML local 200 serviu o bundle `index-BkSe6bog.js` gerado após a correção frontend. Não houve chamada à produção. |
| Tempo e SQL | 0,5–aprox. 60 ms na segunda execução dos oito serviços | [Sonda reproduzível](evidence/phase-12/readonly-qa.py) e [resultado](evidence/phase-12/readonly-qa.json), janela 11/09–10/10/2026. Foram 1–5 statements por serviço; dois samples sequenciais, portanto isto não é p95, ensaio de concorrência nem projeção para volume de produção. |
| Tamanho de payload | máximo 120.322 bytes | JSON serializado de Condutores; Utilização 107.813 bytes. Valores são aproximações do corpo JSON, sem headers/compressão HTTP. Não há evidência de payload excessivo nesta base; monitorar crescimento. |
| Índices | inventário registrado | Índices de veículo, condutor, responsabilidade e datas relevantes constam no JSON da sonda. Nenhum índice novo foi aplicado; revisar planos reais se o volume crescer. |
| Exportação | 6 perfis × PDF/XLSX gerados | 12 respostas status 200, identificadores de formato PDF/ZIP válidos, PDFs parseados por `pdfinfo` (1–9 páginas), em read-only. Testes automatizados verificam cabeçalho privado, separação de sinistro estimado, parâmetros fechados e neutralização de fórmulas em XLSX. Páginas representativas de Visão Geral e Condutores foram renderizadas; [primeira página](evidence/phase-12/executive-pdf-page1.png) e [última página](evidence/phase-12/executive-pdf-last.png) da Visão Geral foram inspecionadas após os reparos. |
| Requests rápidos | implementado/testado | Recursos V2 usam `AbortController` e ignoram resposta antiga; teste de troca de filtro e testes do drawer cobrem o comportamento. |
| Acessibilidade e responsividade | cobertura automatizada/parcial | Testes de teclado, Escape, retorno de foco, nomes acessíveis e mensagens `alert`/`status`; CSS tem breakpoints para drawer, abas, gráficos e formulário. Inspeção visual autenticada em 1920, 1366 e mobile, claro/escuro, segue pendente. |
| Migrations | nenhuma Analytics nas fases 1–12 | Banco e código apontam para `0051_vehicle_loan_printed_terms`. Upgrade/downgrade de Analytics não se aplica; downgrade do schema geral alteraria HML e não foi executado. Fase 10 permanece apenas plano, sem migration. |
| Integridade do working tree | `git diff --check` aprovado | Nenhum commit/push/deploy nesta fase. |

## Defeito corrigido nesta fase

1. No exportador V2, uma resposta JSON de erro com `responseType: blob` exibia apenas a mensagem técnica do Axios. O formulário agora lê a mensagem do backend quando o Blob é JSON, inclusive o 403 de permissão, e conserva o recorte. Um teste reproduz o caso. A autorização do endpoint não foi alterada.
2. O PDF V2 mostrava razões e variações com dezenas de casas, chaves técnicas/inglesas e critérios espremidos na coluna de valor; o título da última seção ficava isolado no fim da página. A saída agora limita apenas a apresentação numérica a duas casas, traduz rótulos conhecidos, põe critérios na coluna de contexto e mantém título com tabela. Os cálculos e dados de origem continuam iguais. A primeira e a última página foram renderizadas novamente e inspecionadas.

## Limitações e prontidão

- A sessão Edge de `testefrota.sirel.com.br` estava expirada na tela de login durante esta execução. Não foram gerados screenshots finais autenticados nem validados visualmente 1920/1366/mobile e claro/escuro após a Fase 11/12. Os screenshots anteriores das Fases 1–9 não substituem essa validação.
- A publicação pública do bundle atual não foi confirmada. O working tree das Fases 10/11/12 permanece não commitado; a Fase 10 tem apenas desenho e aguarda autorização para persistência/mutações.
- A base HML medida tem 286 veículos, 305 condutores, 204 abastecimentos, 3 manutenções, 1.583 posses, 2 multas e 1 sinistro. A amostra é pequena para concluir desempenho sob a escala e concorrência de produção.
- A inspeção visual de PDFs cobriu páginas representativas; não houve revisão manual de cada página dos seis perfis, nem prova de legibilidade sob todos os tamanhos de impressão.
- O bundle principal medido no build tem 736,54 KB antes de gzip (173,59 KB gzip), acima do aviso de 650 KB do Vite. Não se alterou a divisão de código nesta fase, pois a amostra HML não mostrou gargalo de rede e isto exigiria mudança estrutural fora da correção pontual.

**Recomendação:** ainda não promover Analytics à produção. Finalizar a decisão/implementação da Fase 10 se ela fizer parte do pacote de promoção; autenticar e revisar visualmente as oito visões em desktop/mobile e claro/escuro, incluindo exportação; validar o bundle publicado em HML; então revisar e commitar as alterações e repetir os gates sobre o commit candidato. Nenhuma ação de produção foi executada.

## Complemento de QA — identificação nos alertas (13/10/2026)

O screenshot recebido mostrou mensagens V1 com `PERUA_SW` no lugar da identidade do veículo. O [preflight](evidence/phase-12/alert-preflight-2026-10-13.txt) confirmou a mesma branch, HEAD e alterações abertas. O texto do cartão vem de `AnalyticsService.insights`, que usava apenas o tipo do snapshot; `vehicles` possui placa, marca e modelo preenchidos. Uma consulta em transação HML somente leitura encontrou 48.401 snapshots de veículo ligados ao cadastro e nenhum com esses três campos vazios.

Após o filtro organizacional existente, `insights` busca em **uma consulta** placa, marca e modelo somente dos IDs resultantes e produz mensagens como `Veículo ABC1D23 · Fiat Uno`. O cartão e o PDF V1 recebem a mensagem; o XLSX V1 conserva suas colunas anteriores, que não incluem diagnóstico. Não houve mudança de rota, schema, permissão ou fórmula. O texto também distingue litros abastecidos de consumo efetivo e identifica a referência de custo como configurada por tipo, sem alegar pesquisa de mercado. A contagem de alertas em `overview` não ganhou consulta adicional.

Teste focado: **12 aprovados**; backend completo com sondas PostgreSQL read-only: **602 aprovados/88 pulados**; frontend completo **279 aprovados/57 arquivos**; lint **0 erros/45 avisos preexistentes**; build aprovado. A API isolada HML foi reiniciada, saúde app/banco `ok`, rota `/api/analytics/insights` sem sessão respondeu 401 e `git diff --check` passou. A sessão pública HML continuou indisponível para screenshot autenticado; a prontidão para promoção permanece **não**.
