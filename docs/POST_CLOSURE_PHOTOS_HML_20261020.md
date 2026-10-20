# Fotos em posses já encerradas — homologação

Publicado em 20/10/2026 em https://testefrota.sirel.com.br/posses.

## Como usar

1. Abra **Posses → Encerradas**.
2. No menu **…** da posse, selecione **Adicionar fotos**.
3. Selecione as imagens, confira as miniaturas e clique em **Salvar fotos**.
4. Consulte os anexos em **… → Ver fotos**.

A ação respeita as permissões atuais de edição dos operadores. Está disponível também para posses antigas sem confirmação de devolução e sem fotos anteriores. Aceita até 10 imagens por envio, nos formatos JPG, PNG ou WebP, com até 8 MB cada e 32 MB no total. Reenvios da mesma imagem adicional não geram duplicação.

## Preservação do encerramento

As imagens recebem a identificação **Foto adicionada após o encerramento**, com a data de envio. O sistema guarda o usuário responsável, hash do arquivo e evento de auditoria. A referência à confirmação vigente serve como contexto; a operação não altera a declaração, versão, hash, quilometragem ou data do encerramento. Anexos posteriores ficam fora do conteúdo de assinatura e da contagem de evidências do termo oficial, preservando os documentos anteriores.

## Validação

- Backend: **644 testes aprovados**, 109 ignorados, 8 avisos de depreciação.
- Interface: **322 testes aprovados** em 62 arquivos.
- Lint: **0 erros**, 40 avisos existentes. Build aprovado, com aviso de tamanho de bundle.
- Teste autenticado na posse fictícia **1589**, placa **TST0F20**: foto adicional salva; total passou de 1 para 2. Reenvio da mesma imagem não aumentou o total.
- Comparação direta no banco: encerramento, revisão, `updated_at`, confirmações e hash canônico permaneceram idênticos. Arquivo gravado corresponde ao SHA-256 registrado.
- Tema claro, escuro e largura de celular de 390 px conferidos; formulário sem transbordamento horizontal. Console sem erros na conferência final.
- Produção: código, configurações e index preservados; aplicação e banco saudáveis. Assets públicos da homologação conferidos por SHA-256.

## Manutenção

Código ativo em `D:\FROTAS\02-HOMOLOGACAO\codigo` (atalho para `D:\FROTAS\frota_emprestimos_testes`). A nova ação usa `POST /api/possession/{id}/post-closure-photos`, mantendo o encerramento separado. Não exigiu nova migration; o schema continua em `0053_possession_return_photos`.

Backup específico em `D:\FROTAS\frota_emprestimos_testes\storage\backups\20261020-fotos-pos-encerramento`: dump anterior, frontend anterior e fontes de referência. A comparação antes/depois está em `before.json` e `integration-after.json`. Não restaurar o banco completo para desfazer apenas a interface: o dump antecede o teste de envio.

As mudanças permanecem locais na branch `feature/fotos-devolucao-hml`, sem commit, push ou publicação em produção.
