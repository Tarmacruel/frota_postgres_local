# ExecPlan — Detalhes do empréstimo em painel modal — 27/10/2026

## Objetivo
Trocar o detalhe inline abaixo da lista por painel lateral no computador e tela inteira no celular. Abas Resumo, Documentos e assinaturas e Histórico, pendências visíveis e próxima ação no rodapé. Somente HML; preservar fluxos e permissões atuais.

## Estado inicial verificado
- Fonte cd9353c, árvore limpa; nova branch feature/loan-detail-inspector-hml-20261027.
- Baseline: 551 testes frontend/83 arquivos, lint zero erros/39 avisos anteriores, build HML aprovado. Backend ativo 6969; produção 8000 somente em leitura. Nenhum reinício de API necessário.
- Regras AGENTS/IMPLEMENT/PLANS e skill frontend lidos. MasterPlan/RepoContext/VisualSpec já lidos nesta conversa, sem alterações desde a leitura; status atualizado conferido. Contact sheet alvo já inspecionado; screenshot do usuário é a evidência funcional desta tela.
- Detalhes carregam registro/contexto/histórico com validação de versão. Operações usam LoanActionForm/LoanProposalForm; documentos e anexos têm seus próprios componentes. Não duplicar esses fluxos.
- Backup privado de build/configurações/bundle: storage/backups/20261027-loan-inspector.

## Arquivos previstos
VehicleLoansPage, novo componente de detalhe, CSS local, helper visual de status e testes; documentação. Reutilizar Modal, ActionMenu, VehicleLoanDocuments e formulários existentes.

## Alterações funcionais proibidas
Sem backend, schema, payloads, permissões, regras de aceite, cancelamento, representação, assinatura, PDF ou escrita de negócio de QA. Sem publicação produtiva. Cancelar/rejeitar continuam abrindo o formulário de confirmação/justificativa existente.

## Passos de implementação
1. [x] Inventariar detalhe, ações, documentos, rotas e permissões; branch e backup.
2. [x] Extrair painel modal responsivo com abas, pendências e rodapé.
3. [x] Integrar URL id, preservação de filtros/página/posição, foco e formulários aninhados.
4. [x] Regressões, suíte frontend, lint e build HML candidato.
5. [x] Publicar só frontend HML, conferir desktop/mobile/claro/escuro e integridade; documentar e enviar branch.

## Validação visual
Tese: consulta focada, com a lista preservada ao fundo, hierarquia enxuta e uma ação principal. Conteúdo: identificação/status, origem→destino, alerta compacto de pendências, abas e conteúdo rolável, rodapé fixo. Interação: abertura lateral curta, estados de foco/aba e retorno ao disparador; respeitar redução de movimento, sem animação ornamental. Abas/rodapé não encolhem nem desaparecem ao consultar conteúdo longo. No celular, uma coluna e controles de toque.

## Testes e build
Cobrir link direto, abrir/fechar/voltar sem apagar KPI/busca/página, permissões de origem/recebedora/leitura, todos os estados de ação, bloqueios/versão/contexto indisponível, menu e formulários existentes, abas e carregamento de documentos apenas ao visitar. Navegação por teclado, Escape e retorno de foco; aba de documentos preserva seleção ao alternar. Executar test/lint/build. QA read-only, sem aceitar/cancelar empréstimo, emitir documento, enviar anexo ou assinar.

## Resultado
Painel e integração implementados; documentos são montados na primeira visita e preservados entre abas. Busca, situação, KPI, parâmetros extras, página e posição da lista são mantidos ao fechar ou voltar. Foco fica no painel durante o carregamento e retorna ao disparador ou à lista; Escape fecha primeiro o formulário aninhado. Nenhuma regra de negócio alterada.

Suíte final: 569 testes frontend/84 arquivos; lint zero erros/39 avisos anteriores; build HML candidato aprovado. Publicado em 27/10/2026 às 17:10:02 (Brasília), fonte 363477e, apenas frontend HML. Entrada index-DW7V4PP8.js observada na guia original e na guia de QA; nove assets servidos conferidos. Nenhum reinício da API.

QA autenticada: desktop 1600×900 e viewport padrão, mobile 390×843/360×800, claro/escuro, sem overflow horizontal. Abas de 46 px e rodapé preservados ao rolar Resumo e Documentos. Histórico e anexo impresso existentes acessíveis. Edição abre o formulário original sobre o painel; Escape fecha só o formulário e retorna ao menu. Busca/situação/foco preservados; na lista longa mobile, posição 1505 px mantida ao fechar e ao voltar no navegador. Não foram enviados formulários, arquivos ou assinaturas, nem executados aceites, rejeições ou cancelamentos.

Console sem erros. Emulação removida, tema claro restaurado e guia original no mesmo empréstimo solicitado, com o novo painel aberto; guia de QA encerrada. Capturas privadas: loan-inline-before.png, loan-desktop-light.png, loan-desktop-dark.png, loan-mobile-light.png e loan-mobile-dark.png no diretório de backup.

Verificação final: 75 tabelas idênticas, incluindo 38 tabelas de negócio/documentos protegidas; configurações/backend preservados. API HML PID21064 e produção PID2512 inalterados; produção limpa no HEAD31543d4 e pronta. Rotina06h resultado0 em27/10, próxima28/10/2026 06h, sem execução adicional. Backup e reversão prontos no diretório privado, sem dados sensíveis no repositório.

## Pendências / decisões
- Manter id da URL e demais parâmetros ao selecionar/fechar. Não transformar filtros locais em novos filtros de API.
- Uma ação handoff no rodapé; demais operações no menu, com a mesma habilitação anterior.
- Histórico continua obtido na consulta original; documentos são montados ao visitar e preservados ao alternar abas.
- Tarefa das 06h preservada, sem cópia extra.

## Rollback
Restaurar frontend-before com assets antes da troca atômica do index. Sem banco/configuração/reinício. Fonte anterior cd9353c disponível no bundle.
