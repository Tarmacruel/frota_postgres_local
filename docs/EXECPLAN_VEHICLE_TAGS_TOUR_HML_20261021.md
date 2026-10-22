# ExecPlan — Tour de primeiro acesso das etiquetas

## Objetivo
Apresentar automaticamente as etiquetas uma vez por usuário, com consulta compartilhada, catálogo pessoal, aplicação, filtro, retirada e opção de rever. Publicar somente em HML.

## Estado inicial verificado
- Branch feature/vehicle-tags-hml, HEAD 6104f1d467a3d0e712d75218bfd0a863fcac6ee5.
- Working tree contém a implementação de etiquetas e documentação anterior, preservadas.
- Baseline: backend 653 aprovados/109 ignorados; frontend 332 aprovados; lint 0 erros/40 avisos; build HML aprovado.
- Acknowledgements por usuário e GuidedTour já existem. Nenhuma migration necessária.

## Arquivos previstos
Layout, GuidedTour, VehicleTagsGuide (novo), featureGuides API/testes, endpoints auth, constante do serviço, testes e documentação.

## Alterações funcionais proibidas
Produção, status, permissões de gestão, assinaturas, dados dos veículos e marcações. O tour é demonstrativo e não executa ações de negócio.

## Passos de implementação
- [x] Preservar fontes/build anteriores e dump em storage/backups/20261021-vehicle-tags-tour.
- [x] Reutilizar acknowledgement com chave vehicle-tags-v1, vinculado ao usuário autenticado.
- [x] Tour automático global após outros diálogos, conteúdo conforme permissão; rever pela barra superior.
- [x] Encerramento/pulo/Escape persistido no servidor, erro recuperável, sem depender de localStorage.
- [x] Testar, publicar e conferir HML.

## Validação visual
Conferidos claro, escuro e 390 px; sete passos completos, reabertura, destaque de etiquetas/catálogo e recarga sem reapresentação. Layout mobile sem overflow horizontal; diálogo e todos os botões dentro da viewport. Console sem erros. O tour centraliza quando o alvo não está na tela e não depende de etiquetas/veículos cadastrados. Testes cobrem foco/teclado do GuidedTour e espera por outros diálogos.

## Testes e build
Backend: 655 aprovados/109 ignorados/8 avisos. Frontend: 341 aprovados em 64 arquivos. Lint: 0 erros/40 avisos preexistentes. Build HML aprovado, com aviso já existente de chunk maior que 650 kB. Diff-check aprovado.

Integração real PostgreSQL/API com dois leitores fictícios, tudo revertido: persistência entre requisições, isolamento por usuário, idempotência, identidade do payload ignorada e exigências de CPF/senha preservadas. Chave e timestamp persistidos para o usuário da sessão durante QA de navegador. Nove assets públicos idênticos ao build, GET/POST do tour retornam 401 sem sessão. Readiness dos dois ambientes saudável; fingerprints Git/configuração/index e schema de produção preservados.

## Resultado
Publicado somente em https://testefrota.sirel.com.br. Sete passos para editores e seis para leitores; conteúdo explicativo, sem ação de negócio. Conclusão/pulo registrados na conta; reabertura na barra superior; consulta indisponível não bloqueia trabalho; erro ao salvar oferece nova tentativa ou continuidade sem salvar.

O mecanismo existente foi ampliado com autoStart/onFinish/onDismiss, mantendo os tours anteriores. O aviso de abastecimento e diálogos existentes têm precedência. Produção continua na migration 0053; HML continua na 0054, sem migration nova. Fontes locais sem commit/push.

Evidências: integration.json/publication.json/gates.json e logs no backup; imagens e entrega em outputs da conversa. A etiqueta atual do veículo fictício TST0F20 mudou por uso externo desde a etapa anterior; esta etapa apenas consultou essas marcações, sem restabelecer o estado antigo de duas etiquetas.

## Pendências / decisões
Apresentação no primeiro acesso autenticado após liberação, sem redirecionar quem já está em outra tela. Pular conta como visualizado; botão permanente permite rever. Demais tours/diálogos têm precedência. Sem autorização para produção nesta solicitação.

## Rollback
Restaurar somente arquivos desta etapa e build anterior a partir de storage/backups/20261021-vehicle-tags-tour. A tabela existente de acknowledgements permanece; não há alteração de schema.
