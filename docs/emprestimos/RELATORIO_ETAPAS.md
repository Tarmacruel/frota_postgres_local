# Relatório de entrega — empréstimos entre secretarias

## Contexto de desenvolvimento

Pasta de trabalho: `D:\FROTAS\frota_emprestimos_testes`. Branch de evolução criada em 30/09/2026: `feature/emprestimos-testes-evolucao`, a partir de `feature/emprestimos-secretarias`. O primeiro commit consolida as fases e melhorias descritas neste relatório; novas evoluções devem ser registradas nesta branch. Configurações privadas, banco, uploads, capturas de testes e pacotes externos não integram esse registro.

Correção visual de 30/09/2026: a declaração dos modais de encerramento e retificação de posse usa cores do tema, eliminando o fundo branco com texto claro no modo escuro. Build concluído e conferência visual dos temas claro e escuro pelo túnel, sem alterar posses.

## Fase 01 — concluída e entregue

Revisão em 28/09/2026: a cópia independente, o banco restaurado, as migrations e as regras internas previstas foram entregues. A revisão final complementou o preenchimento da origem também para veículos novos, pela lotação escolhida no cadastro, com teste integrado de criação e empréstimo. Não há pendência bloqueante desta fase.

| Entrega | Evidência |
|---|---|
| Ambiente isolado | `D:\FROTAS\frota_emprestimos_testes`, branch `feature/emprestimos-secretarias`, PostgreSQL próprio em 5441 |
| Acesso local e por túnel | `localhost:6969` e `https://testefrota.sirel.com.br`, saúde HTTP 200 |
| Cópia da base e arquivos | 47 tabelas com contagens conferidas; 262 referências válidas; 264 arquivos com hashes iguais aos da origem |
| Secretaria de origem | 284 veículos preenchidos pela lotação ativa; nenhum pendente nesta cópia |
| Fundação dos empréstimos | Migration 0044, modelos, vínculos opcionais, eventos imutáveis e restrição de empréstimo simultâneo |
| Regras centrais | Consulta, operação, gestão cadastral e atribuição temporal separadas e testadas |
| Operação do ambiente | Comandos de início, parada e status verificados; login e CSRF validados também pelo túnel |
| Testes | 7 específicos; regressão backend com 385 aprovados e 22 skips condicionais; 21 frontend aprovados com pool forks |
| Produção | Preservada; saúde HTTP 200 |

Limites deliberados: a fase 01 não inclui a nova API, as telas, os termos, a integração dos módulos nem a regularização retroativa. Esses itens pertencem às fases seguintes, não são pendências da fase 01.

## Fase 02 — concluída e entregue no ambiente de testes

Autorizada pelo usuário após revisão da fase 01 e implementada na cópia de testes.

- API `/api/vehicle-loans`: consulta paginada, detalhe, contexto de pendências, eventos, criação/edição de rascunhos, envio, aceite, rejeição, cancelamento e devolução.
- Aceite de entrega e devolução por usuários diferentes dos solicitantes. Administradores precisam indicar a secretaria representada e justificar a atuação.
- Versão obrigatória nas mutações: propostas alteradas e requisições repetidas são recusadas com conflito, sem duplicar movimentos.
- Mudança de lotação somente no aceite; origem preservada. Rejeição/cancelamento de devolução mantém a responsabilidade na recebedora.
- Bloqueio por posses, rotas e ordens abertas, revalidado no aceite. Odômetros e lotações também são revalidados.
- Eventos imutáveis e auditoria central. Bloqueio por veículo coordena aceites, posses, ordens e alterações cadastrais de lotação.
- Migration `0045_loan_workflow` aplicada apenas ao PostgreSQL de testes.
- 24 testes específicos aprovados: 17 cenários HTTP/PostgreSQL da API, 3 de migration e 4 da política da fase 01. Incluem concorrência real, rollback, permissões, rejeições, cancelamentos, origem de veículos novos e o ciclo completo.
- Execução final de toda a suíte backend com os testes PostgreSQL de empréstimos habilitados: **405 aprovados e 19 skips condicionais** de outras integrações; nenhum erro.
- Pelo túnel: login, API de empréstimos e consultas existentes com HTTP 200; acesso sem sessão à nova API retorna 401. Produção permanece HTTP 200.

Os testes de mutação ocorreram em bancos descartáveis; nenhum empréstimo fictício foi criado na base restaurada de trabalho. Contrato e exemplos: [FASE_02_API.md](FASE_02_API.md).

## Fase 03 — concluída no ambiente de testes

Atribuição temporal e consulta compartilhada integradas aos módulos operacionais, documentos existentes, busca e relatórios. Origem e operadora são exibidas na lista de veículos; a devolução preserva a responsabilidade anterior e limita o histórico acessível pela antiga recebedora. O cadastro fica sob gestão da origem.

Detalhes, regras de legado e verificação: [FASE_03_INTEGRACAO.md](FASE_03_INTEGRACAO.md).

## Fase 04 — concluída no ambiente de testes

Menu e telas de empréstimos entregues: proposta, acompanhamento, aceites, rejeições, cancelamentos, devolução, pendências e histórico. Permissões e conflitos de versão respeitados. Validação completa: 417 testes backend e 144 frontend aprovados; build e lint dos novos módulos concluídos. Acesso pelo túnel verificado.

Instruções e limites: [FASE_04_INTERFACE.md](FASE_04_INTERFACE.md).

## Fase 05 — concluída no ambiente de testes

Fase 05 entregue em testes: emissão automática dos termos de entrega/devolução, PDFs preservados e duas assinaturas eletrônicas internas por senha. Validação: 423 testes backend e 149 frontend aprovados. [Relatório da fase 05](FASE_05_TERMOS_ASSINATURAS.md).

## Fase 06 — concluída no ambiente de testes

Regularização administrativa de empréstimos anteriores, encerrados ou em andamento, restrita a administradores. Prévia obrigatória, datas efetivas, justificativa e referência documental, bloqueio de sobreposição e auditoria. Registros operacionais antigos preservados; não são criados aceites nem assinaturas retroativas. Migration `0047_loan_regularization` aplicada à cópia de testes. Validação: **433 testes backend e 156 frontend aprovados**, build concluído e acesso local/túnel verificado sem regularizar veículos da base de trabalho.

Instruções e limites: [FASE_06_REGULARIZACAO.md](FASE_06_REGULARIZACAO.md).

## Situação e próxima etapa

Ajuste visual global em 29/09/2026: reduzido o arredondamento de botões, campos, painéis, janelas, menus e demais superfícies nos temas claro e escuro. Os estilos passam a usar uma escala comum de cantos de 4, 6, 8 e 10 px, incluindo as regras responsivas e a tela de empréstimos. Build concluído e conferência visual pelo túnel; alteração apenas no frontend de testes.

Melhoria dos formulários em 29/09/2026: os campos de veículo, secretaria e lotação nas propostas, devoluções e regularizações usam o mesmo seletor pesquisável dos demais módulos. Os resultados são filtrados ao digitar; veículos podem ser encontrados por placa, marca ou modelo, quando disponíveis no catálogo. A mudança de secretaria continua limpando a lotação dependente, e as seleções obrigatórias são verificadas antes do envio. Validação: 24 testes dos formulários e da página aprovados, lint e build concluídos. Atualização restrita ao frontend de testes.

Ajuste de 29/09/2026 após a fase 06: corrigido o contrato de `/api/auth/me` para incluir a secretaria do usuário. A interface passa a reconhecer os usuários Produção da recebedora, exibindo recebimento/rejeição no início do detalhe. Não houve ampliação de permissões nem alteração do empréstimo em análise.

O menu Empréstimos agora mostra contador de solicitações para análise: entregas pendentes para a recebedora e devoluções pendentes para a origem. Administradores veem o total geral. Abrir a página não apaga o aviso; somente a resolução da solicitação altera a contagem. Consulta automática a cada 30 segundos, ao voltar à janela e após salvar uma ação; falhas temporárias preservam o último contador conhecido. API `/api/vehicle-loans/pending-summary` aplica as permissões e o escopo da secretaria, sem nova migration.

Regressão após o ajuste: **437 testes backend aprovados, 19 skips condicionais e 161 testes frontend aprovados**; build e lint concluídos. Sessão e contador verificados em localhost e no túnel; PJM3300 permaneceu aguardando recebimento. Produção preservada e saúde HTTP 200.

| Fase | Situação |
|---|---|
| 01 — ambiente e estrutura | Entregue |
| 02 — API de entrega e devolução | Entregue em testes |
| 03 — integração operacional, consultas compartilhadas e relatórios | Entregue em testes |
| 04 — interface de empréstimos | Entregue em testes |
| 05 — termos e assinaturas | Entregue em testes; assinatura interna por senha |
| 06 — regularização retroativa | Entregue em testes |
| 07 — validação integrada e produção | Não iniciada |

A interface, os termos com assinatura interna e a regularização retroativa estão disponíveis no ambiente de testes. Validação integrada final e publicação em produção permanecem na fase 07.

Melhoria de 30/09/2026: [retificação unificada de posses](RETIFICACAO_UNIFICADA_POSSES.md) entregue em homologação. Um único formulário corrige início e devolução, com justificativa, versões imutáveis, confirmação autenticada e preservação dos anexos anteriores. Posses seguintes não impedem correções válidas; conflitos reais continuam verificados. Migration `0048_possession_rectification` aplicada somente em testes. Verificação: 444 testes backend e 162 frontend aprovados; consultas locais e pelo túnel confirmadas, produção preservada.

Agilidade nas ordens de abastecimento em 30/09/2026: novas ordens individuais e em lote abrem com 30 litros previstos, a secretaria vinculada ao usuário (quando disponível no catálogo) e o primeiro posto ativo da lista. Todos os campos continuam editáveis; escolhas manuais e campos apagados são preservados mesmo após atualização dos catálogos. Usuários sem secretaria vinculada mantêm o órgão não informado. Validação: 12 testes dos formulários e da página aprovados, lint sem avisos e build concluído; formulário conferido pelo túnel sem emitir ordens. Alteração apenas no frontend de homologação, sem migration.
