# ExecPlan — Contratos e saldos: operação diária — homologação

## Objetivo
Implementar o plano aprovado: quatro áreas, quatro KPIs, tabela compacta, inspeção lateral com quatro abas, pendências acionáveis e ida/retorno dos pedidos nos módulos operacionais. Preservar as regras financeiras e publicar somente em HML.

## Estado inicial verificado
- Branch `feature/contracts-balances-hml-20261022`, HEAD `3dd42d9`, working tree limpo.
- React18/Vite, APIs existentes de contratos, elegibilidade, reservas, extrato, serviços, faturas e conciliação; schema HML0059. Nenhum backend será alterado.
- Baseline imediatamente anterior: 409 testes frontend/71 arquivos, lint 0 erros/39 avisos preexistentes, build HML aprovado.
- Tela autenticada coincide com o código: overview/contracts duplicados, dez KPIs e primeiro contrato aberto automaticamente. Contrato e retorno ainda não são mantidos integralmente nos módulos.
- AGENTS, documentos da evolução visual, IMPLEMENT, PLANS e skill de frontend consultados; direção institucional e referências existentes preservadas.

## Direção visual e interação
- Tese visual: espaço operacional denso e legível, quatro indicadores compactos, tabela de contratos e detalhe progressivo em painel lateral.
- Conteúdo: saldos e pendências primeiro; configurações, preços, histórico e ferramentas financeiras somente quando solicitados. Sem cabeçalhos duplicados.
- Interação: seleção de contrato abre painel com cabeçalho fixo; realce curto nos filtros e abas; entrada/saída contida do painel com movimento reduzido. No celular, painel inteiro e alvos de toque preservados.

## Arquivos previstos
Workspace/painel de contratos, componente de consulta de faturas, contexto de retorno, formulários/hook de reserva, consultas de movimentos, modo embutido de pagamentos, CSS compartilhado, testes de integração frontend, este plano e STATUS.

## Alterações funcionais proibidas
Sem backend, migrations, configuração, automações, restauração ou produção. Não recalcular saldos no cliente nem confirmar abertura automaticamente. Manter reservas, consumo real, exclusividade por posto, preços versionados, conciliação sem dupla despesa, permissões e exportações/documentos/assinaturas.

## Passos
- [x] Backup frontend/fonte e verificações de isolamento.
- [x] Lista unificada, indicadores, pendências, painel e configuração progressiva.
- [x] Navegação de pedidos com contrato/postos/oficinas e retorno interno validado.
- [x] Faturas enxutas, serviços sem conciliação e contexto dos filtros.
- [x] Testes direcionados e completos, lint/build e diff-check.
- [x] Publicação HML, assets/saúde/dados e QA desktop/mobile/claro/escuro.
- [x] Evidências, documentação final e commit local da entrega.

## Validação visual
Lista vazia e contratos incompletos/aptos/bloqueados, abrir/fechar e abas, foco/Escape, preço e prestadores, links antigos. Pedidos nos dois módulos com cancelamento e retorno, filtros/posição da lista e saldo reconsultado. Desktop1366/original, mobile390/360, claro/escuro. Não emitir pedidos nem salvar configurações reais durante QA.

## Testes e build
Testes significativos de URL interna/retorno, escopo contratual, seleção de postos/oficinas, erro sem perda do formulário, busca de300ms, carregamento sob demanda, KPIs globais, atalhos legados e conciliação. Executar suíte frontend, lint e build HML privado antes da publicação. Reaproveitar testes financeiros existentes; nenhuma regra de backend muda.

## Resultado
Concluído e publicado exclusivamente em https://testefrota.sirel.com.br/processos-pagamento em23/10/2026.

Implementados em código os quatro destinos, KPIs e filtros, tabela sem seleção automática, painel reutilizando Modal/preços/extrato/reservas, faturas sob demanda e elegibilidade do servidor. Consulta de contratos usa300ms na busca; catálogo somente quando necessário. Navegação usa `contract_tab`/`return_to` interno, preserva filtros de consultas na URL e posição na sessão. Contexto de emissão limita postos/oficinas; erros conservam os campos. Operação geral de abastecimentos mantém acesso ao lote fora do contexto de um contrato. Nenhum payload financeiro ou regra de servidor alterado.

Pagamento e conciliação invalidam o cache do acompanhamento; contrato e modalidade financeira são sincronizados sem remontagem integral. Se um contrato regularizado deixar o filtro de pendências, o painel consulta sua elegibilidade no servidor por número/ID e conserva a ação de pedido, sem calcular regras financeiras no cliente.

### Gates finais
- Frontend completo: **429 aprovados/72 arquivos**, execução final em129,78s. Novo conjunto de operação diária:19 aprovados; conjunto direcionado anterior:43 aprovados/5 arquivos.
- Lint: **0 erros/39 avisos preexistentes**. Build HML e `git diff --check` aprovados. Aviso de tamanho de chunk já existente preservado.
- Publicação pelo `scripts/publish-homologation-frontend.ps1`, com configuração HML validada, build candidato e troca do índice. Sem migration, restauração ou reinício de API. Nove assets públicos idênticos ao build porSHA-256; configurações, backend e processo daAPI preservados; readiness HML/produção saudável.

### QA autenticado e correções visuais
Conferidos lista sem seleção automática, cobertura global3/6, saldo desconhecido como—, filtros de pendências/resultado vazio e quatro KPIs. Contrato incompleto manteve pedido bloqueado e atalhos de configuração; preços/edição/exclusão permaneceram acessíveis na configuração. Painel carregou abas sob demanda; fechar/Escape devolveu foco à lista.

Abastecimento de fixture abriu com posto exclusivo e contrato preenchidos, cálculo de30L×6,10=183 e disponível após pedido817; nenhum pedido foi emitido. Retorno preservou busca/painel e reconsultou saldo. Manutenção abriu contrato fixo e apenas sua oficina, com retorno equivalente. Serviços sem conciliação exibiram seleção explícita de fatura; consulta de faturas ficou limitada ao contrato. Filtros adicionais e importação permaneceram acessíveis em ferramentas financeiras, sem executar importações/conciliações reais. Falha sem perda de campos, acessos de consulta, descarte de respostas atrasadas e retorno inválido foram cobertos nos testes.

Desktop1366×768 e2268×1045; celular390/360; claro/escuro. Grade financeira corrigida para não aumentar a largura da página, incluindo ferramentas expandidas; filtros visíveis em três colunas no desktop e uma no celular. Painel recebeu alinhamento ao início para remover espaço artificial; composição monetária mobile usa linhas com valor integral. Formulário contextual, título longo, foco e retorno conferidos; console final sem erros. Guia devolvida à rota base, tema claro, lateral expandida e override de viewport removido.

### Dados durante a validação
A primeira publicação comprovou igualdade das68 tabelas com o baseline. Durante a QA, o ambiente ativo recebeu uma edição versionada de preço e uma manutenção emitida/iniciada/concluída, registradas em cinco eventos de auditoria às12:33–12:35. Essa atividade simultânea foi preservada, sem tentar restaurar a cópia inicial. Comparação posterior:61 tabelas idênticas; nas outras, registros originais preservados e acréscimos auditados. Nos preços, a única mudança dos registros anteriores foi o encerramento da vigência pela nova versão, conferido porhash da composição anterior. As68 tabelas permaneceram idênticas ao ponto revisado na verificação final. A QA desta entrega não emitiu pedidos nem salvou configurações de negócio.

### Arquivos e evidências
Workspace: `ContractBalancesPage`; painel `ContractInspector`, consulta `ContractInvoicesPanel`, banner `ContractReturnBanner`, contexto `contractNavigation`/`useContractFilters`; formulários/hooks dos dois módulos; consultas de extrato/serviços; modo embutido de `PaymentProcessesPage`/`ProcessReconciliation`; CSS e testes correspondentes. Nenhum arquivo de backend, migration, configuração, deploy de produção ou agendamento alterado.

Evidências privadas em `storage/backups/20261023-contract-daily-ux`: logs finais de testes/lint/build/publicação, `publication-verification.json` (primeira publicação), `final-publication-verification.json`, revisão de fingerprints/atividade e capturas `desktop-list-light.png`, `desktop-list-dark.png`, `desktop-drawer-light.png`, `mobile-list-light.png`, `mobile-list-dark.png`, `mobile-drawer-dark.png`, `mobile-finance-light.png` e `mobile-order-light.png`. Fonte e índice anteriores preservados; assets anteriores continuam disponíveis para reversão.

## Pendências / decisões
O usuário escolheu operação diária, painel lateral e criação nos módulos com retorno. A elegibilidade do servidor continua sendo autoridade; a configuração aparece como pendência, sem inferência de cadastros nem confirmação automática de valores.

## Rollback
Fonte e índice anterior em `storage/backups/20261023-contract-daily-ux`. Reversão imediata pode repor `frontend-index-before.html` como `frontend/dist/index.html`, pois os assets anteriores foram mantidos. Para reconstrução, usar a fonte em `source-before.zip` ou reverter somente o commit frontend desta entrega e republicar pelo script HML existente. Nenhuma reversão exige reinício de API ou restauração de banco; preservar a atividade de testes registrada após o baseline.
