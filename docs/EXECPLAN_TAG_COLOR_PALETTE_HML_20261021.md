# ExecPlan — Paleta de 12 cores e prévia de etiquetas

## Objetivo
Aplicar em HML a paleta com prévia aprovada, com as seis cores existentes e Laranja, Turquesa, Rosa, Ciano, Índigo e Marrom. Preservar catálogo, edição, arquivamento, permissões e tour.

## Estado inicial verificado
- feature/vehicle-tags-hml, HEAD 6104f1d467a3d0e712d75218bfd0a863fcac6ee5.
- Working tree contém as etapas de etiquetas e tour sem commit; preservar todas.
- Gates anteriores: backend 655 aprovados/109 ignorados, frontend 341 aprovados, lint 0 erros/40 avisos; build HML aprovado.
- Schema HML 0054_vehicle_tags: cor é varchar(20), sem enum/check. Backend aceita seis valores por Literal; ampliar para doze é parte funcional expressamente autorizada pelo usuário.

## Arquivos previstos
VehicleTags.jsx/CSS/testes, utils/vehicleTags.js, schema vehicle_tag.py e testes. Documentação da etapa.

## Alterações funcionais proibidas
Produção, permissões, status, assinatura, migrações, exclusão ou alteração de etiquetas existentes durante QA.

## Passos de implementação
- [x] Preservar fontes, build, dump e fingerprints de produção.
- [x] Implementar paleta com seleção acessível e prévia em criação/edição.
- [x] Ampliar cores na API e apresentação compartilhada.
- [x] Testar persistência/leitura das 12 cores e rejeição de valores arbitrários.
- [x] Publicar e validar HML.

## Validação visual
Conferidos claro/escuro e 390 px, 6 colunas no desktop/3 no celular, sem overflow horizontal. Cabeçalho fixo no modal, conteúdo rolável, fundo sólido e largura de 680 px. Campo de edição reabriu a cor Roxo já salva; setas alteraram Turquesa para Rosa com prévia imediata; Cancelar preservou o catálogo. As mudanças locais foram descartadas, sem salvar demonstrações na conta.

Textos das 12 etiquetas têm contraste mínimo calculado de 5,74:1 nos dois temas (contrast.json). Navegador sem erros no console. Imagens em outputs/paleta-12-hml-{claro,escuro,mobile}.jpg.

## Testes e build
Backend completo: 667 aprovados/109 ignorados/8 avisos; frontend completo: 344 aprovados em 64 arquivos. Direcionados após ajuste do modal: 19 aprovados. Lint final: 0 erros/40 avisos anteriores; build HML e diff-check aprovados. Aviso anterior de chunk maior que 650 kB permanece.

API/PostgreSQL real: criar/aplicar/editar as 12 cores, ler catálogo, veículos, posses, filtros e seletores; hexadecimal arbitrário rejeitado com 422. Usuário fictício, marcações e auditoria revertidos na transação externa; fingerprint das tabelas anterior/posterior idêntico. Nenhuma migration. Nove assets públicos conferidos por SHA-256, readiness dos dois ambientes saudável, arquivos/configuração/index/HEAD/schema de produção preservados por fingerprints.

## Resultado
Publicado somente em https://testefrota.sirel.com.br/vehicles. Minhas etiquetas usa a paleta de 12 cores e painel de prévia; catálogo e edição/arquivamento permanecem. Token de cor único para prévia, catálogo, badges, filtros, posses e seletores. Exportações continuam com nomes e autoria das etiquetas. API aceita novos identificadores orange/teal/pink/cyan/indigo/brown e mantém os seis anteriores. Não houve alteração de permissões, status, assinaturas ou dados de negócio existentes.

Fontes na branch local feature/vehicle-tags-hml, sem commit/push. Backup contém source-before.zip, frontend-before, hml-before.dump, candidate-source-overlay.zip, preflight.json, integration.json, publication.json, contrast.json, gates.json e logs.

## Pendências / decisões
Usar cores fixas para manter legibilidade e consistência. Seleção por radios nativos com nomes e indicador visual. Atualização da prévia local não grava até Salvar etiqueta.

## Rollback
Backup storage/backups/20261021-tag-color-palette: restaurar somente fontes desta etapa e build anterior; nenhuma alteração estrutural no banco. Se novas cores já tiverem sido usadas, manter a leitura das doze cores no backend e seus estilos até reconciliar os dados, para não tornar registros ilegíveis.
