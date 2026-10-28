# ExecPlan — Empréstimos com progressão guiada — 28/10/2026

## Objetivo
Refinar o painel de empréstimos com progresso operacional verificável, próxima etapa explícita, resumo de entrega/devolução e leitura progressiva das observações. Somente frontend HML.

## Estado inicial verificado
- Fonte b19623e, árvore limpa, branch feature/loan-guided-progress-hml-20261028.
- Baseline final anterior: 579 testes/84 arquivos, lint 0 erros/39 avisos anteriores, build HML aprovado.
- AGENTS/IMPLEMENT/PLANS/STATUS e orientações visuais do repositório/skill frontend consultados; referências alvo já inspecionadas nesta conversa. Screenshot do usuário confirma o painel publicado.
- LoanStatus, eventos e campos existentes bastam. Documentos continuam com consulta lazy; assinatura não é parte da conclusão operacional.
- Backup privado: storage/backups/20261028-loan-guided-progress, build/configurações/bundle e fingerprints somente leitura. Rotina 06h já concluída hoje; não repetir restauração.

## Arquivos previstos
VehicleLoanInspector, novo resumo guiado e helper visual da jornada, CSS local e regressões. Não alterar a listagem ou os formulários de ações/documentos.

## Alterações funcionais proibidas
Sem backend/schema/API/payloads/permissões/regras de negócio/env. Sem marcar etapas manualmente como concluídas, inferir assinatura ou aceites passados, alterar o texto registrado ou gerar pontuações artificiais. Sem operação de negócio de QA ou publicação/reinício produtivo.

## Passos de implementação
1. [x] Inventário, branch e backup.
2. [x] Jornada baseada em estado/eventos reais, com tratamento de cancelamento, rejeição e regularização.
3. [x] Resumo organizado, marcos navegáveis e textos/lotações expansíveis; manter pendências e ações.
4. [x] Testes de progresso/estados/consultas/teclado/permissões, suíte frontend, lint e build.
5. [x] Publicação só frontend HML, QA desktop/mobile/claro/escuro, integridade e documentação.

## Validação visual
Tese: acompanhamento operacional claro e institucional, com marcos conquistados e uma próxima etapa, mantendo o foco na ação atual. Conteúdo: contexto existente no topo, progresso e próximo responsável, dois blocos de entrega/devolução, finalidade/condições e lotações por expansão. Interação: marcos levam aos detalhes sem executar ações; expansão nativa e rolagem orientada com respeito a movimento reduzido. Sem hero, mosaico decorativo ou novos tokens. Abas e rodapé permanecem fora da rolagem.

## Testes e build
Estados DRAFT/AWAITING_RECEIPT/ACTIVE/AWAITING_RETURN_RECEIPT/RETURNED e interrompidos; regularização não sugere aceite retroativo. Progresso não comprova assinaturas. Dados e textos completos acessíveis; navegação dos marcos não chama onAction; documentos continuam lazy e preservam seleção. Manter erro/contexto/versão, formulários aninhados, filtros/foco/posição. Executar test/lint/build e QA de conteúdo longo, desktop/mobile, temas e teclado, sem salvar/assinar/aceitar.

## Resultado
Concluído somente no frontend HML. Fonte 9769af0, publicada em 28/10/2026 às 09:36:13, entrada /assets/index-DCvH-SE2.js. Sem reinício, migration, alteração de configuração ou gravação de negócio.

595 testes/84 arquivos aprovados; lint sem erros, com os mesmos 39 avisos anteriores; build de homologação aprovado. Regressões cobrem estados operacionais, interrupções, regularização, documentos independentes, navegação sem executar ações, expansão baseada no corte real e reabertura das pendências.

QA autenticada em desktop 1600×900 e mobile 390×843/360×800, temas claro e escuro. Empréstimo ativo mostra 2/4 e a recebedora responsável pela próxima etapa; devolvido mostra 4/4, com documentos independentes; cancelado não apresenta etapas futuras como pendentes. Conferidos marcos com foco/rolagem, expansão dos textos sem perda de conteúdo, lotações, conferência operacional recolhida/aberta, abas por teclado, consulta de documentos e retorno de foco à lista/disparador. Sem overflow horizontal; abas e rodapé permanecem visíveis. Console sem erros/avisos. Emulação removida, tema claro restaurado e guia temporária fechada; a navegação posterior do usuário na guia original foi preservada.

Verificação final: nove assets válidos; 75 tabelas e 38 tabelas de negócio/documentos idênticas ao baseline; backend e configurações preservados. APIs HML/produção prontas, sem reinício (PIDs 13752/2512); produção limpa em 31543d4. Rotina 06h já saudável, sem restauração extra.

Evidências privadas em storage/backups/20261028-loan-guided-progress: loan-before.png, loan-progress-desktop-light.png, loan-progress-desktop-dark-active.png, loan-progress-mobile-light-returned.png e loan-progress-mobile-dark-active.png; logs de test/lint/build, publication.json e final-verification.json. Capturas mobile finais refeitas após abertura direta para evitar imagem intermediária do compositor durante a mudança de tamanho.

## Pendências / decisões
- Proposta, entrega, uso e devolução são marcos operacionais; regularização tem percurso próprio de registro, sem proposta/aceite retroativos.
- Textos mantêm o conteúdo original, com prévia visual e expansão para leitura integral.
- Sem novas chamadas API para calcular progresso ou contar documentos.

## Rollback
Copiar assets do frontend-before e substituir index atomicamente. Fonte b19623e no bundle; sem banco/configuração/reinício.
