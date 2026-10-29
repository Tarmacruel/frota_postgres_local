# ExecPlan — Comprovante de abastecimento com foto — homologação

## Objetivo
Na confirmação de abastecimento, oferecer anexar arquivo, tirar foto em celular compatível, prévia/ampliação, troca e remoção antes de confirmar. Preservar o comprovante obrigatório, PDF/JPG/PNG/WEBP e limite8MB.

## Estado inicial verificado
- Branch feature/fuel-receipt-picker-hml-20261029, base fae6e5d, limpa antes desta fase.
- Baseline645 testes/87 arquivos, lint0erros/39avisos anteriores, build HML aprovado.
- Produção0cd053c, API8000/PID5804; HML6969/PID5344 após rotina06h. PostgreSQL5441/PID15100 e5432/PID5764.
- Campo atual é input file obrigatório sem prévia/remoção. Câmera já usa input capture=environment no módulo de posses; reutilizar esse comportamento, sem solicitar câmera automaticamente.

## Arquivos previstos
ReceiptAttachmentField.jsx/CSS/testes, FuelSupplyOrderConfirmForm.jsx/testes, este plano e STATUS.md.

## Alterações funcionais proibidas
Sem backend/schema/configuração/endpoints/payloads/permissões/regras de saldo. Um comprovante por confirmação; remover limpa somente a seleção local. Não excluir documentos salvos nem confirmar abastecimentos na QA. Somente HML.

## Passos de implementação
- [x] Componente acessível com arquivo/câmera, prévia e remoção; URLs locais liberadas ao trocar/remover.
- [x] Integrar à confirmação preservando FormData e progresso/obrigatório ao escolher por qualquer origem.
- [ ] Testes de arquivo/foto/remover/substituir/erros, suíte completa, lint e build.
- [ ] Backup/reversão, publicar só frontend HML e conferir desktop/mobile/temas sem confirmar operação.
- [ ] Integridade e documentação final.

## Validação visual
Não tocar no formulário aberto do usuário. Guia isolada: anexo fictício local, remover/reanexar, câmera por seletor sem capturar imagem real, obrigatoriedade e prévia ampliada. Desktop/celular claro/escuro, foco/teclado, sem overflow. Nenhuma submissão real.

## Testes e build
Verificar retorno ao estado pendente e bloqueio sem arquivo, envio do arquivo atual escolhido (inclusive câmera), preservação do rascunho após erro e limpeza de blob URLs. Executar test/lint/build homologation conforme AGENTS.md.

## Resultado
Componente implementado somente na confirmação selecionada. Botões de anexar/trocar, câmera com capture=environment e remover; foto ampliável em modal, PDF identificado por nome e tipo. A seleção é local, cancelamento do seletor preserva o arquivo atual e remover devolve o foco à ação de anexar. Arquivos fora do formato/limite ou vazios recebem mensagem; controles ficam desabilitados durante o envio.

O obrigatório é acompanhado pelo arquivo selecionado de qualquer uma das duas entradas, sem duplicar o contador. Em teste, manteve6 obrigatórios:5/6 sem arquivo,6/6 com foto da câmera e5/6 ao remover. Remover bloqueia a confirmação; reanexar PDF envia somente esse novo arquivo. O campo receipt e os demais dados do FormData permanecem iguais aos da API existente.

14 testes direcionados aprovados (nove novos), incluindo remoção/reseleção, substituição, câmera, cancelamento do seletor, limites, arquivo vazio, URLs de prévia, bloqueio ao salvar e preservação após erro. Lint0erros/39avisos anteriores e build candidato aprovados. Suíte completa e QA/publicação a seguir.

Backup do frontend anterior, proteção de configurações e referência read-only das75 tabelas preparados em storage/backups/20261029-fuel-receipt-picker. Fixtures PNG/JPG fictícias nessa pasta, sem documento real. Publicador exige654 testes aprovados e troca somente assets/index HML; reversão preparada para index-CexbYAw6.js.

## Pendências / decisões
Usar a câmera nativa do celular via capture quando disponível; no desktop o navegador pode oferecer o seletor de imagens. Arquivo só será enviado pela confirmação já existente.

## Rollback
Backup do frontend atual, assets antes de index atômico, reversão só de arquivos estáticos; nenhuma restauração de banco ou reinício.
