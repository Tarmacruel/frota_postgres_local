# ExecPlan — Excluir etiquetas do catálogo

## Objetivo
Adicionar Excluir em Minhas etiquetas, somente HML. Apenas autor com vehicles.edit; confirmação explícita; bloquear se houver marcação ativa em qualquer veículo; manter histórico e auditoria.

## Estado inicial verificado
- feature/vehicle-tags-hml, HEAD 6104f1d467a3d0e712d75218bfd0a863fcac6ee5.
- Etapas de etiquetas, tour e 12 cores no working tree sem commit; preservar.
- Baseline anterior: backend 667 aprovados/109 ignorados; frontend 344 aprovados; lint 0 erros/40 avisos, build aprovado.
- HML schema 0054; produção 0053. FK de marcação impede remoção física da definição.

## Arquivos previstos
Model/schema migration 0055, VehicleTagService/rotas, API JS, catálogo e testes, tour/documentação.

## Alterações funcionais proibidas
Produção, retirada automática de marcações, remoção de histórico, permissões de outros autores, assinaturas ou status de veículos.

## Passos de implementação
- [x] Backup de fontes/build/banco/fingerprints.
- [x] Exclusão lógica com deleted_at; índice único entre definições não excluídas para permitir reutilizar nome.
- [x] Endpoint pessoal autenticado, bloqueio de marcações ativas, locks compatíveis com aplicação e auditoria atômica/idempotente.
- [x] Botão Excluir, confirmação, erro contextual e bloqueio de reenvio; arquivamento preservado.
- [x] Testes, migração HML, publicação, validação visual/API e isolamento de produção.

## Validação visual
Claro/escuro/390 px. Confirmação e cancelamento em etiquetas existentes sem efetivar exclusão. Escritas de QA somente em transação revertida com usuários fictícios.

## Testes e build
Backend 672 aprovados/109 ignorados/8 avisos anteriores; frontend 347 aprovados em 64 arquivos. Direcionados: backend 26 e interface/tour 22 aprovados. Lint 0 erros/40 avisos anteriores. Build HML e git diff --check aprovados. Ajuste final de CSS validado por novo build e navegador.

Migração 0055 aplicada com comparação dos dados anteriores das tabelas de etiquetas, marcações, veículos, posses, confirmações e reconhecimentos do tour: conteúdo preservado. Integração API/PostgreSQL real em transação revertida validou exclusão, repetição idempotente, nome reutilizado com novo ID, ocultação, não reativação, bloqueio 409 para etiqueta aplicada/arquivada, histórico retirado preservado, permissões 403/404 e auditoria única. Fingerprint integral antes/depois idêntico. Teste automatizado também cobre rollback se auditoria falhar.

QA autenticado: quatro botões Excluir; confirmação explícita com foco inicial em Cancelar, cancelamento mantém catálogo, claro/escuro/390 px sem overflow horizontal e console sem erros. Não houve exclusão efetiva das etiquetas existentes na sessão do usuário. Capturas em outputs/tag-delete-hml-{claro,escuro,mobile}.png no workspace da tarefa. Nove assets públicos conferidos por SHA-256; DELETE anônimo retorna 401. Readiness dos dois ambientes saudável; HEAD/árvore/configuração/index/schema de produção preservados.

## Resultado
Publicado somente em https://testefrota.sirel.com.br, em Veículos → Minhas etiquetas → Excluir. Backup e resultados em storage/backups/20261021-tag-delete. A API HML, encontrada parada, foi restabelecida pelo script de manutenção. Schema HML 0055_vehicle_tag_delete; produção permanece 0053_possession_return_photos. Código local na branch feature/vehicle-tags-hml, sem commit/push, preservando as alterações anteriores.

## Pendências / decisões
Exclusão retira do catálogo, mantém definição/vínculos antigos para histórico e registra TAG_DELETE. Nome liberado para nova definição. Etiqueta aplicada bloqueia exclusão mesmo fora do escopo atual do autor; orientar apoio administrativo se necessário. Administrador não exclui catálogo de outro autor. Arquivar continua reversível pelo próprio usuário; exclusão não oferece reativação na interface.

## Rollback
Backup storage/backups/20261021-tag-delete. Antes de qualquer exclusão efetiva, downgrade/restauração das fontes são possíveis; se já houve exclusões/reutilização de nomes, manter backend compatível e reconciliar registros antes de downgrade para evitar exibir excluídas ou violar unicidade. Nenhuma exclusão física de histórico.
