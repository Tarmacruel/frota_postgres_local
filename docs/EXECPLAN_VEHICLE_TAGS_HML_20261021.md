# ExecPlan — Etiquetas pessoais compartilhadas — 21/10/2026

## Objetivo

Implementar na homologação o plano aprovado: catálogo de etiquetas de cada usuário com vehicles.edit; marcações compartilhadas entre leitores autorizados; aplicação de etiquetas próprias e retirada manual pelo autor ou administrador. Várias marcações coexistem. Gerenciamento em Veículos, consulta em Posses e seletores, filtros e exportação de Veículos. Esta é uma solicitação funcional explícita, não uma alteração de backend para redesign.

## Estado inicial verificado

- Origem: `D:\FROTAS\frota_emprestimos_testes`; branch inicial feature/fotos-devolucao-hml, HEAD 6104f1d. Branch de trabalho feature/vehicle-tags-hml.
- Alterações anteriores preservadas em docs/PHOTOS_PRODUCTION_RELEASE_20261020.md e docs/frontend-evolution/STATUS.md; cópias no backup desta etapa.
- HML: API 6969/PostgreSQL 5441; schema 0053. Produção separada: portas 8000/3000/5432; fingerprints de HEAD/configurações/index preservados para comparação final.
- Baseline anterior: backend 644 aprovados/109 ignorados; frontend 322 aprovados; lint 0 erros/40 avisos. Após a integração inicial, os mesmos 644 testes backend e 322 frontend passaram. Novo build HML aprovado.
- Registro operacional iniciado durante a implementação; os diffs existentes foram preservados.

## Arquivos previstos

Backend: modelos/schema/serviço/rotas vehicle_tag, migration 0054, apresentação em lote nos endpoints e catálogos, filtro EXISTS no repositório e eventos TAG no histórico. Frontend: componentes VehicleTags e CSS, API e utilitário, integração incremental em Veículos/Posses e seletores existentes. Testes dirigidos e documentação desta fase.

## Alterações funcionais proibidas

Não alterar o status do veículo, regras de disponibilidade, posses, confirmações, assinaturas ou termos oficiais ao aplicar etiquetas. Não ampliar o escopo por secretaria ou permissões de cadastro. Não publicar em produção. Não fazer importações de dados de produção ou criar contas administrativas persistentes para testes.

## Passos de implementação

- [x] Conferir origem, permissões, catálogos, paginação e regras de empréstimos.
- [x] Criar branch; gerar dump HML e preservar frontend/fontes/documentação anterior.
- [x] Implementar catálogo pessoal, marcações com retirada lógica, auditoria e consulta por lote.
- [x] Integrar gestão, detalhes, filtro e relatórios à tela de Veículos; consulta em Posses e seletores.
- [x] Atualizar catálogos ao abrir seletores, preservando seleções.
- [x] Acrescentar testes de SQL real em SQLite para propriedade, visibilidade, filtros, rollback e reenvio; nove aprovados.
- [x] Acrescentar testes de interface para criação, erro, arquivo, permissões, justificativa e opções; 18 testes dirigidos aprovados em três arquivos.
- [x] Concluir gates completos após as últimas mudanças.
- [x] Aplicar migration e publicar/reiniciar somente HML.
- [x] Validar dois usuários e administrador na API/PostgreSQL, com rollback dos usuários de teste; validar o fluxo administrativo no navegador com veículo fictício.
- [x] Conferir claro/escuro, celular, filtros, seletores, exportação e integridade de produção.

## Validação visual

Usar o veículo fictício TST0F20 já existente na HML, sem alterar registros operacionais. Conferir catálogo pessoal, marcações de autores diferentes, retirada e detalhes no celular, nomes iguais e múltiplas etiquetas. Manter estilo e densidade atuais; badges distinguem etiquetas do status. Capturas de entrega na pasta outputs desta conversa.

## Testes e build

Backend completo; frontend completo; lint; build HML com configuração explícita. Testes novos devem verificar autorização no backend e na interface, arquivamento sem retirada, histórico preservado e filtro OR sem duplicação de totais. Sonda integrada no PostgreSQL deve comprovar que aplicação/retirada não altera vehicle.updated_at/status ou confirmações. Verificar rollback de transação e idempotência; restrição única parcial protege duplicação concorrente.

## Resultado

Publicado somente em https://testefrota.sirel.com.br/vehicles, em 21/10/2026. Schema HML **0054_vehicle_tags**; produção permanece em 0053, sem tabelas de etiquetas e com código/configuração/index preservados por SHA-256. Nove assets públicos de HML correspondem ao build. Ambos os ambientes responderam aplicação/banco saudáveis; três novas rotas de leitura retornaram 401 sem sessão.

Gates finais: **653 backend aprovados, 109 ignorados e 8 avisos de depreciação**; **332 testes frontend aprovados em 63 arquivos**; lint **0 erros/40 avisos existentes**; build HML e diff-check aprovados. O build mantém o aviso existente de chunk acima de 650 kB.

Teste com API e PostgreSQL real: dois usuários de Produção da mesma secretaria e um administrador, contas apenas em transação externa revertida; catálogo individual, nomes iguais entre usuários, aplicação/retirada, limite por secretaria, filtro OR, etiquetas em Posses/opções, arquivamento/renomeação e snapshots de auditoria conferidos. Todas as contas e marcações desse teste foram revertidas, com contagens e hashes históricos iguais antes/depois. Teste separado com duas conexões simultâneas no veículo fictício produziu uma marcação e um evento, preservando status e updated_at.

Navegador autenticado: três etiquetas pessoais criadas no catálogo do usuário atual; Em manutenção e Em lavagem aplicadas somente ao veículo fictício TST0F20. Retirada e reaplicação funcionaram, com eventos TAG no histórico e status ATIVO preservado. Posses 1589/1590 exibiram as etiquetas atuais; o seletor de veículos também. Filtro de duas etiquetas manteve uma linha. XLSX real baixado e inspecionado: etiquetas, autores e coluna presentes. A ação PDF concluiu sem erro, mas o conteúdo da pré-visualização não foi inspecionado no navegador; a inclusão dos campos/filtros é coberta pela composição dos relatórios e testes. Temas claro/escuro e modais em 390 px conferidos, sem overflow horizontal.

Correções durante QA: histórico TAG recebeu descrição própria, evitando texto de edição cadastral; callbacks de atualização foram estendidos aos formulários e seletores de relatórios/regularização; cor roxa recebeu tokens próprios de claro/escuro. A última alteração foi apenas CSS e recebeu novo build e conferência dos assets publicados. Código permanece local na branch feature/vehicle-tags-hml, sem commit/push.

## Pendências / decisões

Cada usuário só edita seu catálogo. Administrador pode retirar marcações de outro autor com justificativa. Nome/cor atualizam a exibição das marcações; auditoria guarda snapshots. Arquivar impede aplicações novas, preservando as existentes até retirada. Autor sem acesso precisa de intervenção administrativa. Identificadores separam etiquetas iguais de autores distintos. Dados atuais do veículo não podem vazar em posses que o usuário só pode ver historicamente.

## Rollback

Backups em `storage/backups/20261021-vehicle-tags`. Para retorno da aplicação, parar somente a API HML, restaurar fontes/overlay e frontend anteriores, e reiniciar pelo controle HML. Manter a migration aditiva para preservar etiquetas e auditoria; não restaurar ou rebaixar o banco automaticamente. Produção não participa dessa operação.
