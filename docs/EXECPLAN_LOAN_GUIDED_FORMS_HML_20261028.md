# ExecPlan — Formulários e orientação de empréstimos — 28/10/2026

## Objetivo
Organizar proposta, regularização e ações por etapas e assuntos, com progresso de preenchimento verificável, revisão e mensagens que expliquem como resolver impedimentos. Somente frontend HML.

## Estado inicial verificado
- HEAD fc2c36b, branch anterior fix/possession-handoff-guidance-hml-20261028, árvore limpa. A correção temporal de posses do outro agente está preservada.
- Nova branch feature/loan-guided-forms-hml-20261028. Baseline frontend: 595 testes/84 arquivos, lint zero erros/39 avisos anteriores e build HML aprovado na fase anterior; backend posterior não alterou frontend.
- AGENTS/IMPLEMENT/PLANS, documentação visual e skill frontend consultados; referências visuais da fase e telas atuais conferidas. A UI publicada corresponde aos formulários locais antigos, enquanto o inspector já tem progressão operacional.
- Backup privado em storage/backups/20261028-loan-guided-forms: build, bundle, configurações e fingerprints somente leitura. Não executar refresh nem reiniciar a API nesta entrega de frontend.

## Arquivos previstos
VehicleLoanForms, VehicleLoanRegularization, componentes locais de passos/feedback, orientação de erros, VehicleLoansPage/Inspector/Documents e CSS local; testes correspondentes. Modificar somente o necessário para organizar os formulários e explicitar caminhos de solução.

## Alterações funcionais proibidas
Sem backend/schema/migrations/endpoints/payloads/autenticação/permissões/regras operacionais. Não liberar cruzamentos temporais, autoaceite, transições com pendências ou regularização sem prévia atual. Não criar assinaturas retroativas nem salvar dados de QA. Não alterar produção, tarefa 06h ou credenciais. Valores opcionais do rascunho continuam opcionais.

## Passos de implementação
1. [x] Inventário, escopo, branch e backup.
2. [x] Shell local com progresso e seções claras; proposta e regularização com revisão e rascunho preservado.
3. [x] Ações e orientações de impedimentos no detalhe, listas e documentos, respeitando as permissões existentes.
4. [x] Regressões de preenchimento/progresso/correção/erros/prévia/versão/teclado, suíte frontend, lint e build.
5. [x] Publicação exclusiva frontend HML, QA desktop/mobile/claro/escuro, integridade, documentação e reversão.

## Validação visual
Tese: formulário operacional calmo, com uma etapa por assunto e a próxima ação sempre visível. Conteúdo: cabeçalho e passos compactos, preenchimento em colunas no desktop, contexto/ajudas junto ao campo, resumo antes da confirmação; no celular, tela inteira e coluna única. Interação: progresso por dados válidos, navegação de passos sem perda de rascunho, foco na correção e transições curtas com respeito a movimento reduzido. Sem cards decorativos, pontuação artificial ou novos tokens.

## Testes e build
Preservar envio somente por ação explícita, payload e validações anteriores, odômetro zero, seletores pesquisáveis, limpeza de dependências, justificativa do administrador, datas locais, prévia invalidada por edição, revisão obrigatória e envio único. Mensagens devem conservar o detalhe do servidor e apontar solução aplicável; ações de correção não executam negócio. Conferir pendências, autoaceite, versão, rede/servidor, catálogo e documentos sem perda de conteúdo. Validar desktop e mobile 390/360, temas e teclado; executar frontend test/lint/build.

## Resultado
Gates aprovados: 621 testes/86 arquivos (611/85 na primeira publicação e dez regressões adicionais), lint zero erros/39 avisos anteriores, build HML aprovado. As propostas usam Destino/Entrega/Conferência; regularizações usam Destino/Datas/Documento/Conferência, mantendo payload, prévia e confirmação explícita. Ações usam o mesmo shell e mostram a representação e o efeito. O progresso mede campos válidos e, na regularização, a revisão dos efeitos; não comprova aceite operacional ou assinatura.

Orientações preservam a mensagem/referência do servidor, traduzem validações de campos conhecidos e distinguem pendência, consulta ausente, versão, datas, odômetro, representação, arquivos e resultado incerto. Atalhos de consulta respeitam canView e abrem outra guia para manter o preenchimento. O recarregamento de uma versão conflitante continua fechando a edição, agora com aviso explícito; não há reaplicação automática sobre uma versão nova.

## Publicação e conferência final
- Fontes principais 6b8b7a2/cf87ead/0cfc14e/fc9faba; complemento das três anotações em b5225e4. Publicação final às 11:45:58 de 28/10/2026, somente frontend HML, entrada index-B6yz_Ygm.js. Nove assets locais conferidos byte a byte e readiness HML/produção 200. Backend/configurações inalterados e APIs 6969/PID21432 e 8000/PID2512 preservadas; produção limpa em31543d4. Sem migrations, refresh de dados ou reinício.
- Suíte completa: 621 testes/86 arquivos (172,75s); 51 testes direcionados finais/4 arquivos depois do ajuste local do painel portaled. Lint zero erros/39 avisos anteriores, build homologation aprovado. Sem novas dependências.
- Desktop claro: seletor da regularização exibe placa, marca/modelo, propriedade, lotação atual e seis caracteres finais do chassi; busca pelos metadados conferida. Somente IDs autorizados do catálogo original são enriquecidos. Falha nessa consulta mantém a seleção funcional com os dados disponíveis.
- Proposta nova carregou automaticamente 5848km do encerramento de26/10/2026 17h09; edição manual para5850 permaneceu ao voltar entre etapas. Consulta conserva zero válido, não presume leitura ausente e oferece nova tentativa/retomada explícita. Rascunho em edição e regularização histórica não recebem sobrescrita por leitura atual. Permissões existentes governam as consultas auxiliares.
- Obrigatórios têm asterisco vermelho; erros/labels em vermelho e negrito, ligados ao campo por aria-invalid/descrição. Leitura de CSS confirmou #b73a3a no claro e #ff7b7b no escuro, peso600 nas mensagens. Dados opcionais do rascunho seguem opcionais. Campos/datas da regularização permanecem manuais, com token e revisão explícita.
- Mobile escuro390×843 e360×800: modal ocupa toda a tela, sem overflow horizontal; etapas medem58px e rodapé permanece visível. Desktop claro/escuro e progressão/teclado já conferidos na publicação inicial; complementos conferidos na versão final. Console da guia final sem erros. Tema claro e viewport1600×900 restaurados, guias temporárias encerradas e guia atual do usuário preservada sem recarregar seu preenchimento.
- QA somente consulta, preenchimento não salvo e prévia da regularização. Nenhuma criação, retificação, transição, anexo ou assinatura foi executada pela QA. Uso concorrente registrou criação de rascunho, regularização, encerramento/confirmação de posse e termo anexado. Comparação mantém67/75 tabelas iguais, incluindo27 financeiras; oito diferenças operacionais/auditoria são registradas separadamente. Não declarar integridade idêntica de todo o banco: location_history e vehicle_possession tiveram alteração de linhas anteriores durante esse uso. Baseline original foi preservado e nenhum dado restaurado.
- Evidências privadas: storage/backups/20261028-loan-guided-forms/{publication.json,final-verification.json,frontend-tests.log,vehicle-assistance-focused.log,lint.log,build.log}. Capturas finais: vehicle-identification-desktop.png, proposal-odometer-prefill.png, proposal-odometer-and-validation.png e regularization-mobile-red-validation.png. Capturas iniciais complementares: proposal-desktop-delivery.png, regularization-desktop-dark.png e proposal-mobile-light-validation.png. Não usar proposal-desktop-initial.png como resultado final.

## Pendências / decisões
- Anotações adicionais de 28/10: sugerir na proposta nova o odômetro do último encerramento de posse; enriquecer as opções de veículos com marca/modelo, propriedade, lotação atual e final do chassi; marcar campos obrigatórios e erros em vermelho. Reutilizar GET /possession/odometer-suggestion e GET /vehicles/options apenas com canView correspondente, sem ampliar os IDs elegíveis do catálogo de empréstimos. Respostas antigas não podem substituir a seleção atual nem uma leitura digitada. Edição de rascunho e regularização histórica preservam leituras informadas; nenhum valor ausente é presumido como zero.
- O progresso mede preenchimento/revisão; não representa empréstimo aceito ou documentos assinados.
- A prévia de regularização continua fornecida pelo servidor, com token e impedimentos preservados.
- Erros de servidor não serão substituídos por suposições de causa. Orientação local usa códigos/campos conhecidos ou mensagem genérica com um caminho seguro de revisão.

## Rollback
Restaurar assets do frontend-before e substituir index atomicamente; fonte fc2c36b no bundle. Sem restauração de banco, configuração ou reinício de serviços.
