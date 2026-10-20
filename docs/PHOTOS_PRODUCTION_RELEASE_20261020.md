# Publicação de fotos em Posses — 20/10/2026

## Autorização e escopo

O usuário solicitou expressamente aplicar em produção as alterações validadas na homologação: fotos opcionais durante o encerramento e ação independente para adicionar fotos a posses já encerradas. A autorização permite a publicação prevista pelo AGENTS.md. Não transferir dados, fotos fictícias ou configurações da homologação.

## Plano de ativação

- Registrar o código validado, abrir PR e aguardar os checks obrigatórios, preservando as proteções da main.
- Gerar dump consistente, preservar anexos/configurações/build/Git de produção e validar o build com configuração própria de produção.
- Suspender temporariamente o watchdog, parar somente a API de produção e gerar um dump final antes da migration.
- Avançar o código por fast-forward, aplicar a migration aditiva `0053_possession_return_photos`, iniciar a API e publicar o índice do frontend preparado.
- Conferir prontidão, arquivos publicados, controles de autenticação, integridade histórica e interface autenticada. Não encerrar posses reais nem anexar imagens fictícias em produção.

## Validação anterior em homologação

Backend: 644 aprovados/109 ignorados/8 avisos. Frontend: 322 aprovados em 62 arquivos. Lint: 0 erros/40 avisos existentes. Build e diff-check aprovados. Teste autenticado na posse fictícia 1589 confirmou upload adicional, deduplicação e preservação integral do encerramento, revisão, updated_at e hash canônico. Claro/escuro e 390 px conferidos. Detalhes em [anexos posteriores](POST_CLOSURE_PHOTOS_HML_20261020.md) e [fotos na devolução](RETURN_PHOTOS_HML_20261020.md).

## Backup e rollback

Artefatos operacionais em `D:\FROTAS\05-BACKUPS\producao\20261020-fotos-posses` (origem `D:\FROTAS\frota_certificado_homologacao\storage\backups\20261020-fotos-posses`). Configurações privadas e dumps não devem ser versionados.

A migration acrescenta apenas colunas, duas chaves estrangeiras e um índice. Fotos anteriores recebem etapa `unspecified`; confirmações e dados existentes permanecem intactos. Em falha de aplicação, restaurar código/build anteriores e reiniciar a API, mantendo o schema aditivo. Não fazer downgrade ou restauração automática do banco, para preservar novas operações e evidências.

## Resultado

Publicação em preparação; atualizar com o resultado efetivamente verificado.
