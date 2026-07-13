# Plano de rollback

## Gatilhos

- healthcheck local ou público não retorna 200 após duas tentativas;
- login ou módulos não relacionados deixam de renderizar;
- `alembic current` não é `0040_report_preferences`;
- aumento sustentado de 5xx, erro de autenticação/CSRF ou perda de acesso a dados legados;
- contagens críticas divergem do registro pré-implantação;
- CSP bloqueia assets necessários ou há exposição pública indevida.

## Retorno da aplicação

1. Registrar horário, request IDs e logs; não apagar evidências.
2. Parar os processos de frontend/backend nas portas 3000/8000 sem interromper PostgreSQL ou Cloudflared.
3. Voltar o checkout operacional ao SHA anterior registrado, preservando a branch e sem `reset --hard`.
4. Reinstalar dependências da versão anterior, reconstruir frontend e iniciar os scripts de produção.
5. Validar health/login/módulos e comunicar o estado.

O schema `0040` adiciona apenas a tabela de preferências. A versão anterior da aplicação não a utiliza, portanto o primeiro rollback é somente da aplicação; não executar downgrade como reflexo automático.

## Restauração do banco

Usar restauração somente se houver corrupção/perda comprovada ou migration incompleta e após interromper escritas:

1. preservar banco, logs e arquivos pós-incidente para análise;
2. verificar o SHA-256 do backup `storage/backups/frota-backup-20260713-145744.zip`;
3. restaurar primeiro em banco descartável e conferir contagens/revision;
4. criar banco de substituição controlado, nunca truncar ou sobrescrever silenciosamente o atual;
5. apontar `DATABASE_URL` para o banco restaurado, validar e somente então reabrir o serviço;
6. reconciliar arquivos criados após o backup por inventário/auditoria: preservar em quarentena, não apagar em massa.

O downgrade `0040 -> 0039` remove a tabela de preferência e pode descartar preferências criadas após o rollout. Por isso ele não é o rollback operacional padrão.

## Validação pós-rollback

- branch/SHA e processos corretos;
- `GET /api/health` e `/login` locais/públicos;
- login, listagem de veículos e módulos não relacionados;
- leitura de posses e documentos legados;
- contagens de usuários, veículos, posses, rotas, confirmações e auditoria;
- ausência de erro 5xx nos logs por pelo menos 15 minutos.

Toda comunicação deve indicar janela afetada, versão revertida, dados potencialmente criados após o backup e próximo passo. Segredos, conteúdo integral de relatórios e dados pessoais não entram na mensagem.
