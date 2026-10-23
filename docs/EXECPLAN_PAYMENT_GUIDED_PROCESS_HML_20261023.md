# ExecPlan — Processos de pagamento com dados das operações — HML

## Objetivo
Criar processos com dados já registrados de abastecimentos/manutenções, por seleção explícita das operações, e refinar o formulário e o painel de detalhes. Somente homologação.

## Estado inicial verificado
- Branch `feature/contracts-balances-hml-20261022`, HEAD `9c99f63`, working tree limpo.
- Baseline anterior: frontend 448 testes/73 arquivos, lint 0 erros/39 avisos anteriores, build HML aprovado.
- APIs existentes de operações sem conciliação, criação/edição e conciliação disponíveis. Criação e conciliação são duas transações; tratar falha parcial sem recriar o processo.
- API de operações não retorna secretaria por ID nem detalhe do serviço: enriquecer somente operações selecionadas, consultando a origem pelo ID exato. Sem aproximação de nomes.

## Direção visual e interação
- Tese visual: superfície institucional sóbria, linhas leves, tipografia hierárquica e um único destaque azul para a próxima ação.
- Conteúdo: origem e seleção dos serviços; resumo dos dados reaproveitados; dados fiscais faltantes; financeiro e observações em revelação progressiva. Painel com valor/etapa próximos à identidade e abas compactas.
- Interação: seleção atualiza a prévia do processo, detalhes adicionais abrem sob demanda e painel entra lateralmente com movimento breve; respeitar movimento reduzido.

## Arquivos previstos
- `frontend/src/components/payments/PaymentProcessDialog.jsx`, utilitário de preparação e respectivos testes.
- `frontend/src/pages/PaymentProcessesPage.jsx`, navegação de origem em `ContractBalancesPage.jsx`/`ContractCommitmentsBrowser.jsx`.
- CSS exclusivo do fluxo financeiro, documentação de status e guia.

## Alterações funcionais proibidas
Não alterar backend, schema, endpoints, permissões, regras de saldo, etapas ou classificação de contratos. Não inferir NF/emissão/vencimento/pagamento nem confirmar saldo. Não salvar operações financeiras reais durante a conferência visual. Pagamento continua separado de consumo; conciliação usa API existente, com justificativa explícita para diferença.

## Passos de implementação
1. [x] Inspecionar fontes, APIs existentes, fluxo e estado publicado.
2. [x] Guardar índice/fonte e fingerprints somente leitura.
3. [x] Implementar contexto contratual, seleção explícita de operações, pré-preenchimento sem sobrescrever edição manual e recuperação de conciliação pendente.
4. [x] Refinar modal/drawer com foco, teclado, temas e apresentação mobile.
5. [x] Executar testes/lint/build e publicar somente frontend HML.
6. [x] Conferir visualmente e registrar resultado; commit local ao finalizar a documentação.

## Validação visual
Desktop e celular 390/360px; claro/escuro; navegação por teclado, fechamento/retorno de foco; sem overflow. Fluxos a partir de serviço e botão Novo processo, dados ausentes e processo histórico. Sem submeter faturas reais.

## Testes e build
Testar centavos, contexto de contrato/empresa, seleção entre páginas, competência/secretaria somente quando unívocas, preservação de campos manuais, troca de contexto, acesso negado e falha parcial sem duplicar criação. Rodar suite completa, lint e build HML. Verificar assets públicos, APIs saudáveis, banco/configurações/produção preservados.

## Resultado
Publicado exclusivamente no frontend HML. Novo processo em duas etapas, seleção de serviços sem conciliação entre páginas, filtros por placa/mês e conferência dos selecionados. Link Criar processo em Serviços realizados já transporta contrato e ID da operação; caminho para fatura existente preservado. Dados reaproveitados: empresa contratada (distinta do executante), tipo, valor exato em centavos, competência quando unívoca, secretaria por ID da origem e referências com serviço/combustível/litros disponíveis. Número administrativo/NF/fatura/emissão/vencimento permanecem para preenchimento quando ausentes. Campos editados manualmente são preservados ao alterar a seleção.

Pré-validação consulta novamente as operações antes da criação e bloqueia dados retificados ou conciliados por outra fatura. Salvar e conciliar utiliza as APIs existentes; divergência de valor exige justificativa e confirmação explícita do ajuste. Falha parcial conserva o ID criado e congela os dados para repetir somente a conciliação ou abrir o processo salvo. Falha de conexão/servidor sem resposta da criação impede repetição cega e orienta conferir a fila. Nenhum pagamento é executado automaticamente.

Modal com cabeçalho/rodapé estáveis, documento fiscal legível e dados complementares progressivos. Drawer usa Modal compartilhado (foco/Escape/scroll e edição aninhada), identidade/valor/vencimento próximos e abas compactas, sem distribuição vertical artificial. Referências detalháveis, campos financeiros/datas/notas e permissões preservados, inclusive exclusão independente da edição. Valores desconhecidos aparecem como—; KPIs monetários desta página não dividem o número entre linhas.

Gates: suíte completa 473 testes/75 arquivos; direcionados 54/5 e 19/2 após ajustes de QA; lint 0 erros/39 avisos anteriores; build HML e diff-check aprovados. Suíte completa final repetida para incluir a correção de secretaria e a navegação entre etapas; resultado final registrado no log tests-full-final.log. Aviso de bundle já existente preservado. Nove assets públicos conferidos por SHA-256;68 tabelas, configurações e processo da API idênticos à captura inicial; APIs HML/produção saudáveis. Sem backend/migration/agendamento/restauração/reinício ou publicação em produção.

QA autenticado: atalho por ID de uma manutenção, seleção/preenchimento de R$1.200, competência10/2026 e secretaria responsável correta; ida/volta manteve NF digitada de teste, depois removida; fonte combustível sem operações pendentes exibiu estado vazio e opção manual. Edição de processo histórico preservou dados fiscais, campos financeiros e unidade. Desktop1365/2035px e mobile390/360/327px, claro/escuro, tela inteira mobile, ausência de overflow e teclado/Escape conferidos. Criação/conciliação/falhas exercitadas com APIs mockadas nos testes; nenhuma fatura ou movimentação real foi gravada no navegador. Console sem erros. Capturas no diretório de backup. Tema claro e viewport original restaurados; guia exclusiva de QA encerrada, sem recarregar a guia do usuário.

## Pendências / decisões
- NF, vencimento e número do processo dependem do documento/registro administrativo e serão solicitados, sem gerar números fictícios.
- Salvar com operações selecionadas cria em Montagem e concilia explicitamente. Falha na conciliação mantém o ID salvo e oferece tentar novamente ou abrir o processo pendente.
- Serviços sem controle contratual/históricos permanecem acessíveis pelo cadastro manual e conciliação já existente.
- QA corrigiu o uso indevido da secretaria do administrador como preferência imutável: a origem exata é prioritária até edição manual do campo. Teste cobre administrador de outra secretaria.
- QA corrigiu o clique Continuar: como React reutilizava a posição de um botão que se tornava submit, cancelar seu evento evita tentativa prematura de envio/validação. Foco e rolagem retornam ao início da nova etapa; teste verifica o evento cancelado.
- CSS específico prevalece sobre o bottom sheet genérico no celular, evitando padding duplo e garantindo tela inteira. Respeita safe area e movimento reduzido.
- A rotina06h permanece intacta; esta evolução não requer migrations. Catálogos e dados exclusivos de testes continuam sujeitos à cópia diária já configurada.

## Rollback
Backup em `storage/backups/20261023-payment-guided-process`; reverter arquivos desta fase ou índice anterior (assets anteriores preservados pelo publicador). Nenhum restore, migration ou reinício de API nesta entrega.
