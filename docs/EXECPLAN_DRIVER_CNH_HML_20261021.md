# ExecPlan — Número e regularização da CNH — homologação

## Objetivo
Expor o número da CNH no cadastro/edição do condutor, preservar números existentes e avisar nos seletores operacionais quando faltar número, faltar validade ou estiver vencida. Acesso direto à edição conforme permissão, preservando o formulário de origem.

## Estado inicial verificado
- feature/vehicle-tags-hml, HEAD6104f1d. Alterações anteriores de etiquetas/tour/mobile no working tree; preservar.
- Baseline frontend353 aprovados/65 arquivos, lint0 erros/40 avisos e build HML aprovado; backend672 aprovados/109 ignorados.
- Backend/model/schema/serializer já contêm cnh_numero (string30 opcional), cnh_categoria e cnh_validade. Dados existentes não exigem migration.
- DriverSelect compartilhado por criação/retificação de posses, sinistros, multas e filtros de relatórios. Exigência anterior de matrícula preservada.

## Arquivos previstos
DriversPage, DriverSelect, utilitário de datas/pendências, aviso compartilhado e CSS/testes. Integração real de persistência via API existente em transação revertida.

## Alterações funcionais proibidas
Produção, nova regra de bloqueio de operações, backend/schema, remoção/renumeração de dados, alteração de matrícula/permissões/assinaturas/termos. Não tornar campos legados obrigatórios no banco. Não exibir alertas em filtros de consulta.

## Passos de implementação
- [x] Backup de fonte/build e fingerprints de backend/produção.
- [x] Campo textual com zeros preservados em criar/editar/lista/relatórios.
- [x] Datas por dia de calendário; pendências simultâneas e validade de hoje não vencida.
- [x] Aviso nos seletores de operação, link pessoal à edição em nova aba e atualização ao retornar/manual, sem perda de formulário.
- [x] Rota de edição abre condutor fora da primeira página e respeita permissão/erros.
- [x] Testes, API/PostgreSQL em rollback, QA claro/escuro/mobile, publicação HML e isolamento de produção.

## Validação visual
Cadastro e edição com CNH existente, nova posse com condutor incompleto, link direto e avisos em celular/claro/escuro; sem salvar dados reais de condutores durante QA.

## Testes e build
Suíte completa: **370 testes aprovados em 66 arquivos**. Após um ajuste final de mensagem (consulta não significa regularização), **29 testes direcionados aprovados** nos três arquivos afetados, incluindo o caso novo; há sobreposição com a suíte. Lint0 erros/40 avisos anteriores; build HML e diff-check aprovados. Datas verificadas para hoje/ontem, ano bissexto, inválidas e proximidade de vencimento. Seletores testados com pendências simultâneas, sem bloqueio novo, consulta de relatório sem aviso, permissão sem edição, resposta atrasada, reenvio, falha/repetição e retorno da edição preservando o rascunho mais recente. Rota de edição testada fora da primeira página, sem permissão e com falha recuperável.

API/PostgreSQL reais em transação revertida: criar/ler/editar número com zeros, aparar espaços, salvar/remover validade/número, validar máximo30 caracteres, incluir dados no seletor ativo, manter campos importados e auditoria, rejeitar edição sem permissão. Todos os dados de teste revertidos e fingerprint de drivers/usuários/auditoria/veículos/posses/confirmações idêntico. Contagem de HML antes do teste:305 condutores,61 com número de CNH,4 sem validade. Não houve alteração do backend.

QA autenticado: criação de posse com condutor ativo incompleto mostra aviso e link; cadastro completo selecionado não mostra aviso. Link abriu nova aba em Editar condutor, seção CNH aberta e foco no número; edição cancelada, rascunho da posse preservado, consulta manual confirmada. Um cadastro importado com zero inicial foi aberto e conferido sem salvar. Claro/escuro/390px, sem overflow horizontal no aviso ou modal, console sem erros. Nenhuma posse ou alteração de condutor salva pelo navegador. Capturas outputs/cnh-*.png e registro cnh-browser-qa.json no workspace e no backup.

Nove assets públicos iguais ao build por SHA-256; backend preservado por hashes; schema HML0055 e produção0053 mantidos; HEAD/árvore/configuração/index de produção preservados e ambos ambientes saudáveis.

## Resultado
Publicado somente em **https://testefrota.sirel.com.br**. Campo Número da CNH em Novo/Editar condutor; número incluído na célula CNH e exportações de Condutores. Aviso compartilhado em seleção operacional de condutor, incluindo criação/retificação de posse, sinistro e multa; filtros de relatórios não exibem aviso. Link em nova aba preserva o formulário e abre diretamente a seção de CNH, mesmo fora da página atual. Reconsulta ao retornar da edição e botão Atualizar cadastro, com manutenção do aviso se ainda houver pendências. Sem migration ou alteração de produção.

## Pendências / decisões
Pedido exige exibição de aviso e opção de regularização; aviso informativo sem introduzir bloqueio de operações. Link abre /condutores?editar=<id>&regularizar=cnh em nova aba e preserva o formulário de origem. Atualização ao voltar da edição, com nova tentativa em caso de falha. Usuário sem edição recebe orientação para procurar responsável, sem link de edição.

O campo continua opcional conforme o contrato existente; ausência gera aviso. A validade de hoje é aceita até o fim do dia de calendário do usuário. Não há consulta externa de autenticidade da CNH. O reconhecimento de pendências usa os dados do cadastro. Teste visual de celular feito por viewport emulado, sem aparelho físico. O retorno automático foi coberto por eventos simulados nos testes; o navegador confirmou edição em nova aba, preservação do rascunho e atualização manual.

## Rollback
storage/backups/20261021-driver-cnh, restauração somente dos arquivos desta etapa e build anterior. Backend sem mudanças; nenhuma migration.
