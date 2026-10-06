# Regularização da main — 2026-10-06

O usuário autorizou promover a base publicada em produção para `main`, preservando o ambiente e a branch `feature/frontend-evolution-hml` para novos testes. PR: https://github.com/Tarmacruel/frota_postgres_local/pull/61.

O deploy automático permanece desabilitado (`FROTA_DEPLOY_ENABLED=false`). A produção Windows continua usando seu banco, uploads e configurações; a homologação continua separada. Nenhum dado de homologação será copiado para produção.

## Revisão anterior ao merge

- CI passou a gerar configuração efêmera com segredos aleatórios mascarados; corrigida espera de foco no teste de viagens.
- Readiness do exemplo Docker usa o mesmo endereço de bind da aplicação.
- Backup Docker bloqueia publicações concorrentes, suspende escritas enquanto captura banco e anexos e restaura o estado anterior da aplicação inclusive após falha. Testes cobrem sucesso, falhas, aplicação parada e concorrência.
- Bootstrap instala a unidade de montagem com o nome calculado por `systemd-escape`; dependências e documentação usam o nome correto.
- Imagem Docker inclui o brasão exigido pela emissão de documentos; smoke test verifica sua presença.
- Novidade de abastecimento em lote pode ser dispensada mesmo com erro ou demora no reconhecimento. As janelas obrigatórias de senha e CPF preservam suas regras.
- Corrigida codificação das mensagens do serviço de sessão de certificado, sem mudança de contratos ou regras.

O usuário autorizou a exceção temporária da exigência de uma aprovação externa. Os checks obrigatórios e a resolução de conversas permanecem exigidos. A contagem de uma aprovação deve ser restaurada em `finally` imediatamente após a tentativa de merge.

## Evidências

Logs locais em `storage/loan-tests/production-release-20261006/main-review-*`. O CI do PR executa backend, frontend (testes, lint, build), testes de backup e smoke Docker com migrations, readiness, brasão e persistência. A conclusão do merge e a saúde dos dois ambientes serão registradas na evidência local da promoção.
