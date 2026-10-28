# ExecPlan — Formulários guiados em todo o sistema — HML —28/10/2026

## Objetivo
Aplicar a identidade aprovada nos empréstimos a todos os formulários de cadastro, edição e ações. Etapas por assunto em formulários extensos; formulário compacto nos curtos. Progresso depende de dados válidos, obrigatórios vermelhos e erros explicam o que revisar e como retomar sem perder preenchimento. Somente homologação; produção já recebeu exclusivamente as melhorias anteriores.

## Estado inicial verificado
- Branch feature/guided-forms-global-hml-20261028, base origin/main0cd053c, limpa antes desta documentação.
- Frontend React18/Vite/Vitest, dependências atuais mantidas. Baseline629 testes/86 arquivos; lint0 erros/39 avisos; build HML anterior aprovado.
- Produção0cd053c/API8000 PID5804. HML API6969 PID21432; frontend index-Cl_6b_nt.js. Nenhuma nova publicação produtiva nesta fase.

## Arquivos previstos
Componente compartilhado GuidedForm, seções e feedback; estilos centralizados; formulários nas famílias abaixo, componentes de seleção/validação e testes de fluxos afetados.

## Alterações funcionais proibidas
Backend/schema/API/payloads/permissões/autenticação/regras financeiras preservados. Sem confirmação automática, geração de pagamentos, assinatura, duplicação de submissões ou reinício de API. Campos opcionais continuam opcionais; filtros/busca não viram assistentes de cadastro. Sem novos pacotes. Rascunhos, anexos, versões/prévia/idempotência atuais preservados.

## Passos de implementação
- [x] Produção anterior publicada e validada antes de iniciar esta fase.
- [x] Inventário e fundação reutilizável: progresso, navegação, feedback acionável, obrigatórios e foco.
- [x] Cadastros: veículos, condutores, secretarias/departamentos/lotações, postos e usuários.
- [x] Operação: posses/retornos/retificações/fotos/rotas, abastecimento individual/lote/confirmação/cancelamento/prazo, manutenção, sinistros/multas.
- [x] Contratos e pagamentos: configuração, itens, abertura, preços/aditivos, conciliação, fornecedor/contrato/processos, importação.
- [x] Complementos: etiquetas, matrícula, catálogo de infrações, anexos/documentos/assinatura e conta. Preservar assistentes recentes de empréstimos e pagamentos, alinhando os campos e feedback necessários.
- [ ] Testes completos, lint, build, QA desktop/mobile claro/escuro/teclado e inventário final sem formulários operacionais esquecidos.
- [ ] Backup/reversão de frontend, publicar apenas HML e registrar evidências.

## Validação visual
Conferir ao menos uma jornada de cada família, passos/voltar, obrigatório inválido, erro de API com texto original, formulários aninhados, preservação de anexos/valores e acesso por teclado. Desktop e390/360px, claro/escuro; sem overflow e com ação acessível. Não enviar cadastros ou operações reais na QA de navegador.

## Testes e build
Testes de componentes compartilhados cobrem progresso real, etapa inválida, navegação, submit único, preservação, campos condicionais e seletor customizado. Regressões das famílias preservam payloads e bloqueios. Suíte frontend completa, lint e build homologation; sem alteração backend que exija novos testes de regra financeira.

## Resultado
Em validação. Base compartilhada adotada em55 formulários, além da revisão das permissões e alinhamento dos campos internos do processo de pagamento já guiado. Componentes de preenchimento em12 controles/grupos compartilhados. Gates completos aprovados:642 testes/87 arquivos, lint0 erros/39 avisos anteriores e build homologation. Publicação e QA visual a seguir, sem envio de operações de teste.

Regressões específicas cobrem persistência de arquivo/rascunho após erro, identidade de fragmentos condicionais (sem controles duplicados), seleção nativa sem restauração do valor anterior, zero, precisão monetária, requisitos condicionais, foco e envio apenas na última etapa. Testes de integração passam a navegar pelas etapas antes de afirmar os mesmos payloads e bloqueios. Fixtures inválidas para os schemas anteriores são completadas para exercitar a rejeição de servidor pretendida. Lint permanece0 erros/39 avisos anteriores.

Backup privado de dist, configurações, fonte-base e comparação read-only das75 tabelas em storage/backups/20261028-global-guided-forms. Publicador exige gates verdes, confere produção/configurações/backend preservados e troca somente assets/index HML, com reversão de index preparada.

## Pendências / decisões
Busca, filtros e autenticação permanecem compactos. Progresso de preenchimento não é execução financeira nem assinatura. Alterações por famílias serão validadas sequencialmente, dentro da autorização expressa para aplicar a todas.

## Rollback
Backup local de dist e referência de fonte0cd053c. Publicação de assets antes da troca atômica do index; conservar assets anteriores e script de reversão. Nenhuma restauração de banco ou modificação de configurações.
