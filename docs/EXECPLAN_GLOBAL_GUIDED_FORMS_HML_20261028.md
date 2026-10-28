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
- [x] Testes completos, lint, build, QA desktop/mobile claro/escuro/teclado e inventário final sem formulários operacionais esquecidos.
- [x] Backup/reversão de frontend, publicar apenas HML e registrar evidências.

## Validação visual
Conferir ao menos uma jornada de cada família, passos/voltar, obrigatório inválido, erro de API com texto original, formulários aninhados, preservação de anexos/valores e acesso por teclado. Desktop e390/360px, claro/escuro; sem overflow e com ação acessível. Não enviar cadastros ou operações reais na QA de navegador.

## Testes e build
Testes de componentes compartilhados cobrem progresso real, etapa inválida, navegação, submit único, preservação, campos condicionais e seletor customizado. Regressões das famílias preservam payloads e bloqueios. Suíte frontend completa, lint e build homologation; sem alteração backend que exija novos testes de regra financeira.

## Resultado
Concluído somente na homologação. Base compartilhada adotada em 55 formulários, incluindo revisão das permissões, e alinhamento dos campos internos do processo de pagamento já guiado. Componentes de preenchimento em 12 controles/grupos compartilhados. Formulários extensos usam etapas por assunto; os curtos permanecem em uma tela. Obrigatórios têm asterisco vermelho, progresso baseado em validade e pendências com foco no campo. Campos opcionais, dados, anexos, mensagens e ações de recuperação existentes são preservados.

Gates finais: 643 testes aprovados em 87 arquivos, zero falhas, lint zero erros/39 avisos anteriores e build homologation aprovado. Após um refinamento visual dos rótulos, a única expectativa de teste ajustada passou a verificar o texto completo do label, mantendo a mesma afirmação do obrigatório. A suíte completa foi novamente aprovada; não houve redução dos critérios de validação.

Regressões específicas cobrem persistência de arquivo/rascunho após erro, identidade de fragmentos condicionais (sem controles duplicados), seleção nativa sem restauração do valor anterior, zero, precisão monetária, requisitos condicionais, foco e envio apenas na última etapa. Testes de integração passam a navegar pelas etapas antes de afirmar os mesmos payloads e bloqueios. Fixtures inválidas para os schemas anteriores são completadas para exercitar a rejeição de servidor pretendida. Lint permanece0 erros/39 avisos anteriores.

Backup privado de dist, configurações, fonte-base e comparação read-only das75 tabelas em storage/backups/20261028-global-guided-forms. Publicador exige gates verdes, confere produção/configurações/backend preservados e troca somente assets/index HML, com reversão de index preparada.

Fonte final publicada 66a8fb7 em feature/guided-forms-global-hml-20261028, às 17:55:19 de 28/10/2026. Entrada index-B2K1JZAJ.js e nove assets conferidos localmente. A navegação HTTPS autenticada carregou essa mesma entrada; a sonda HTTP independente foi recusada com 403, sem tentativa de contornar a proteção. API HML 6969/PID21432, produção 8000/PID5804 e PostgreSQL 5441/5432 mantiveram os processos anteriores. Backend, scripts, schemas e configurações não mudaram nesta fase. Produção limpa em 0cd053c; rotina das 06h preservada, sem nova restauração.

QA no navegador: veículos e condutores; nova posse; ordem individual e lote de abastecimento; pedido de manutenção; sinistro; cadastro de contrato e alteração contratual; usuários e revisão de permissões; postos, cadastros, importação e etiquetas; assistentes existentes de empréstimos e pagamentos. Conferidos avançar/voltar com preenchimento preservado, obrigatórios e seletores dependentes, mínimo de dois veículos no lote, CNH opcional no cadastro, menus e painéis aninhados. Encerramentos, retificações, anexos e demais variantes também foram exercitados pela suíte de regressão, sem enviar operações reais no navegador.

Desktop 1280×900, mobile 390×843 e 360×800, claro/escuro: sem overflow horizontal, campos com largura disponível e ações acessíveis no rodapé. Asterisco permanece junto ao rótulo, inclusive nos labels em grid; rodapés sem divisões herdadas redundantes. Tab, Escape, retorno de foco e mensagens vermelhas conferidos; console final sem erros. Tema claro/viewport padrão restaurados e guia temporária fechada; guias e navegação do usuário preservadas. Capturas privadas vehicle-desktop-light.png, vehicle-mobile-light.png, vehicle-mobile-dark.png e contract-amendment-mobile.png.

Comparação final: 71/75 tabelas idênticas à referência inicial. Uso concorrente registrado na auditoria explica duas edições de um condutor e uma nova posse; a rotina preexistente de consulta expirou uma ordem vencida. As diferenças estão registradas em verification.json/concurrent-activity.json, sem sobrescrever a referência nem restaurar dados. Tabelas de contratos, saldos, quantidades, faturas e pagamentos preservadas. Nenhum cadastro, pedido, pagamento, assinatura ou alteração de permissão foi submetido pela QA.

## Pendências / decisões
Sem trabalho de implementação pendente nesta entrega. Busca, filtros e autenticação permanecem compactos. Progresso de preenchimento não é execução financeira nem assinatura. A nova padronização global não foi publicada em produção; a promoção anterior foi concluída antes desta fase, conforme a sequência solicitada.

## Rollback
Backup local de dist e referência de fonte0cd053c. Publicação de assets antes da troca atômica do index; conservar assets anteriores e script de reversão. Nenhuma restauração de banco ou modificação de configurações.
