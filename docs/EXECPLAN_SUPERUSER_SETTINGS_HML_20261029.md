# ExecPlan — Superusuário, escopo por secretaria e parâmetros — HML

## Objetivo
Criar SUPERUSER inicialmente apenas para jonatas@sousa. Administradores continuam administrando sua secretaria e acessando contratos/análises, sem acesso global. Entregar parâmetros de identidade, cores, ícones e formulários com prévia; correção administrativa e inativação/reativação auditadas de registros. Somente homologação.

## Estado inicial verificado
- Branch anterior fix/login-simple-hml-20261029, HEAD dde414d, working tree limpo.
- Branch desta entrega feature/superuser-settings-hml-20261029.
- Frontend: baseline registrado da entrega anterior: 654 testes/88 arquivos, lint 0 erros/39 avisos, build aprovado; entrada HML index-RpX_Zbx1.js.
- HML API6969, PostgreSQL5441, schema0062_items_network_merge. Produção main0cd053c/API8000/PG5432 intocável.
- Atualização06h de29/10 concluída; não repetir restauração.
- Autorização funcional explícita do usuário abrange backend, permissões, modelos e parâmetros; não é apenas redesign.

## Arquivos previstos
Backend: política de papéis/escopo, serviços com verificações legadas, usuários, parâmetros, administração de registros, migrations aditivas, refresh HML e testes. Frontend: AuthContext, roles, navegação, identidade oficial, parâmetros, usuários, formulários compartilhados e testes. Scripts exclusivos de HML para validação, backup, bootstrap e publicação.

## Alterações funcionais proibidas
Não escrever/restaurar produção; não promover outros usuários inicialmente; não expor senhas/chaves; não reescrever documentos assinados; não apagar extratos para corrigir consumo; não transformar uma permissão de Administrador em acesso global; não presumir secretaria ausente como escopo global. Alterações de parâmetros não executam código/SQL fornecido pelo usuário.

## Passos de implementação
- [x] Mapear papéis e pontos de escopo. Confirmado: ADMIN tem atalhos globais dispersos; helpers centrais restringem apenas PRODUCAO.
- [x] Esclarecer “excluir campos”: usuário confirmou limpar/excluir dados, personalizar formulários e inativar registros para visibilidade exclusiva SUPERUSER. Exemplos: posse, empréstimo, condutor, sinistro e multa.
- [x] Separar administração de escopo global no backend; verificar usuários, auditoria, relatórios, análises, empréstimos, assinaturas e contratos compartilhados. ADMIN/PRODUCAO/PADRAO permanecem na própria secretaria; POSTO permanece limitado aos postos vinculados. Nenhum perfil sem secretaria recebe escopo global por ausência de vínculo.
- [x] Criar parâmetros versionados, catálogo de campos/ícones e identidade pública sem segredos.
- [x] Criar administração auditada de registros: consultar, corrigir campos permitidos, inativar/reativar e excluir quando a integridade permitir; conservar lançamentos financeiros/documentais e validações de identidade.
- [x] Interface de parâmetros com prévia local e conferência das mudanças; gestão de campos e registros; visibilidade de papel/secretaria nos usuários. Permissões em tela única; tabela ampla no desktop e controles por módulo no celular.
- [x] Testes unitários e PostgreSQL isolado, gates frontend, QA desktop/mobile claro/escuro.
- [x] Backup, migration HML, bootstrap exato de jonatas@sousa, publicação e verificação; integrar rotina06h sem escrita em produção.

## Direção visual
Tese: área institucional de configuração sóbria, densa e legível, com edição à esquerda e prévia real à direita. Conteúdo: identidade, aparência/navegação, formulários e administração; uma ação principal por área. Interação: prévia instantânea sem salvar, transição curta entre áreas, revisão explícita das alterações com foco e mensagens de correção. Reutilizar temas, GuidedForm e ícones existentes, sem cartões decorativos nem novo framework.

## Validação visual
Desktop e390/360px, temas claro/escuro, teclado, alteração local sem efeito global antes de salvar, contraste de cores, editor preservado após erro409, formulário obrigatório protegido e registro inativado reconhecível pelo superusuário.

## Testes e build
Resultados: backend 767 aprovados/214 condicionais ignorados na execução completa; PostgreSQL 104 aprovados na conferência final, incluindo escopo/KPIs, revisões, último superusuário, campos atômicos/auditados, valores e quantidades estornados/restabelecidos, fatura cancelada, inativação de usuário e overlay06h. Os dois últimos casos verificam preservação dos parâmetros quando a origem também tem a tabela de configuração, com ou sem uma linha publicada. Integração HTTP de empréstimos: 18 aprovados; migration/roundtrip isolado: 3 aprovados. Frontend: 661 aprovados, mais 2 novos cenários de conferência/impedimento da inativação; lint zero erros e39 avisos preexistentes; build aprovado.

QA em banco descartável na porta6971, sem dados reais: prévia antes da publicação, salvamento versionado, campo adicional, permissões sem etapas ocupando toda a largura, inativação e reativação de veículo fictício; desktop e390px, claro/escuro. Corrigidos rótulos móveis duplicados e rodapé de publicação sobreposto pela navegação inferior.

Restauração do backup HML e migration0062→0063 ensaiadas em banco descartável, inclusive bootstrap único do usuário autorizado. Nenhuma restauração de produção repetida. O overlay normaliza somente papel/timestamp comprovados e audita a promoção; outros dados continuam sujeitos ao fingerprint. Diferenças antigas de nomes de índices/constraints em três tabelas foram explicitamente delimitadas no teste de migration; não há diferença nas novas tabelas/colunas.

## Resultado
Publicado somente em homologação em29/10/2026 às13:58:22(Brasília), depois de o usuário solicitar a reabertura e autorizar a elevação do Windows. Fonte da aplicação1abfe29 na branch feature/superuser-settings-hml-20261029, migration0063_superuser_settings, entrada index-DPwbNbDI.js. API6969/PID2096 saudável. Confirmados no banco ativo exatamente um SUPERUSER e correspondência exclusiva ao login jonatas@sousa; permissões integrais calculadas pelo servidor mesmo com flags antigas, consulta do ADMIN restrita à própria secretaria e consulta garantida de contratos/análises.

O banco foi copiado novamente para backup com a API parada antes da migration. Estado privado de publicação complete, frontend servido com o mesmo SHA256 do candidato validado, rotas privadas exigindo autenticação. Controle da rotina06h passou a usar o script versionado; preflight da entrada autorizada aprovado e grafo confirmado produção0062→HML0063 com uma migration. Tarefa Windows Ready, último resultado0 e próxima execução30/10 às06h. Nenhuma restauração extra de produção; configurações, frontend, Git e API8000/PID5804 da produção preservados.

A sessão do navegador HML havia expirado na conferência posterior à publicação; a área autenticada foi validada anteriormente no banco descartável com o mesmo candidato. A publicação foi conferida pela aplicação ativa com conexão somente leitura, permissões, autenticação obrigatória e identidade do bundle, sem emitir credenciais artificiais ou alterar dados reais de teste. Atualizar a página e entrar novamente carrega o novo perfil. Evidências em storage/backups/20261029-superuser-settings/deployment-verification.json, release/state.json e capturas.

Conferência adicional de upload: dois casos aprovados (normalização JPEG→PNG sem publicar a configuração; imagem inválida rejeitada sem arquivo). Conferência visual do ADMIN: recebeu somente seu veículo e sua conta, com Contratos e saldos/Análises acessíveis e sem Parâmetros. Console sem erros; guia e servidor descartáveis encerrados, viewport restaurado.

## Pendências / decisões
- A orientação inicial de inativação somente visual foi substituída pela nova instrução do usuário: existe conferência guiada. Entregas/posses/manutenções ativas impedem a conclusão e oferecem acesso ao encerramento/devolução/cancelamento. Reservas são liberadas uma única vez, pedidos cancelados e documentos da ordem superados. Consumo financeiro e quantitativo é estornado com lançamentos vinculados; reativar restabelece o consumo com nova conferência, sem recriar entregas nem pedidos cancelados. Fatura conciliada exige cancelamento explícito e desvinculação antes do estorno do serviço.
- Campos de identidade e integridade mantêm validações do servidor. A personalização visual não vira migração destrutiva de schema.
- Configuração/identidade HML e bootstrap são preservados explicitamente pela cópia06h, com normalização e validação somente dos deltas comprovados, inclusive quando a origem já tem parâmetros próprios. Dados operacionais de teste continuam com a política de reinício já aceita.

## Rollback
Backup integral HML e frontend anterior conservados em storage/backups/20261029-superuser-settings/release. O roteiro publish_superuser.py rollback restaura o snapshot em banco isolado antes da troca, preserva o banco substituído, restaura código/frontend/entrada06h e verifica a API. Migrations aditivas; não executar downgrade destrutivo de histórico administrativo. A publicação não requer nova execução do lançador já concluído.
