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

Publicado em **20/10/2026, às 20:09:32 (America/Sao_Paulo)** em https://frota.sirel.com.br. Commit funcional `6104f1d467a3d0e712d75218bfd0a863fcac6ee5`, integrado pelo [PR #70](https://github.com/Tarmacruel/frota_postgres_local/pull/70), merge `1398835e4b2de380ae0923555c40920e8504825a`. Os checks `backend-tests`, `frontend-tests` e `container-smoke` passaram. A árvore do merge corresponde exatamente ao candidato testado e ao build preparado com configuração de produção.

A ativação durou aproximadamente 17 segundos, com reinício apenas da API e aplicação da migration 0053. O watchdog foi reabilitado. PostgreSQL, frontend, Cloudflare e HML foram preservados. Produção permaneceu na `main`, com working tree limpo e configurações anteriores iguais por SHA-256.

Antes de iniciar a nova API, compararam-se todos os campos anteriores à migration: **1.995 posses, 8 fotos, 1.507 confirmações, 15 documentos digitais e 12 assinaturas** permaneceram idênticos. As fotos anteriores receberam etapa `unspecified`, sem substituir arquivos ou reescrever confirmações. Nenhum dado fictício de HML foi transferido.

Prontidão pública de produção e HML: aplicação e banco `ok`. Nove assets JS/CSS publicados conferidos por SHA-256. Sonda com banco em modo somente leitura validou as listagens de 131 posses ativas e 1.864 encerradas, serialização e leitura de foto histórica. Foto e novo POST retornaram 401 sem autenticação.

A sessão administrativa pública confirmou a ação **Adicionar fotos** em posse encerrada e o campo **Fotos da devolução (opcional)** no encerramento. Os formulários foram cancelados; nenhuma posse real foi encerrada nem recebeu foto de teste em produção. Console sem erros na conferência final. O envio completo e a deduplicação foram validados previamente em HML.

Evidências operacionais: `preflight.json`, dumps anterior/final, `historical-before.json`, `migration-verification.json`, `gates.json`, `pr-checks.json`, `activation.json`, `publication.json`, scripts de ativação/backup/verificação e logs na pasta de backup indicada acima. Deploy automático permanece desabilitado.
