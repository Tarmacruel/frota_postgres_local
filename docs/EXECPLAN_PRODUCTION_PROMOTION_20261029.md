# ExecPlan — Publicar a homologação e o superusuário — 29/10/2026

## Objetivo
Por ordem expressa do usuário, publicar todas as alterações HML em produção e promover exclusivamente a conta existente `jonatas@sousa` a SUPERUSER. Preservar dados oficiais, configurações próprias, anexos, documentos e rotina das 06h.

## Estado inicial verificado
- Produção main `0cd053c`, limpa, API8000/PID5804, PostgreSQL5432/frota_db, schema0062.
- HML `b8992b3`, limpa, API6969/PID2096, PostgreSQL5441, schema0063. Produção atual é ancestral da HML; dependências não mudaram.
- Nova branch `release/hml-promotion-20261029`. Diff de211 arquivos: formulários guiados, comprovantes com foto, superusuário/escopo ADMIN, parâmetros/campos e inativação auditada, revisão funcional/visual e recuperação de sessão.
- Últimos gates:687 frontend,767 backend/214 integrações condicionais puladas,104 PostgreSQL; lint sem erros/39 avisos existentes. Candidato de produção terá build próprio e revalidação.
- Windows não elevado; watchdog/API de produção são elevados. Preparar tudo antes de solicitar UAC, se necessário.
- Artefatos privados: `D:/FROTAS/frota_certificado_homologacao/storage/backups/20261029-hml-promotion`.

## Arquivos previstos
Somente fontes HML já validadas e documentação desta promoção. Frontend compilado com configurações de produção. Scripts de release, configurações, dumps, uploads e logs ficam privados/ignorados.

## Alterações funcionais proibidas
Não copiar banco ou registros/configurações de teste para produção; não confirmar saldos/quantidades ou executar pagamentos/assinaturas para QA. Não reiniciar HML, PostgreSQL, Cloudflare ou agentes de assinatura. Não alterar segredos/flags de produção. Não conceder SUPERUSER a outra conta. Não fazer downgrade destrutivo nem restaurar automaticamente banco oficial.

## Passos de implementação
- [x] Inventariar ambientes, diferenças, autorização e ancestralidade.
- [x] Backup consistente de banco/fontes/build/configurações/anexos; exportar candidato limpo.
- [ ] Ensaiar0062→0063 e promoção exata do usuário em cópia descartável, comparando todos os dados anteriores e somente os deltas autorizados.
- [ ] Gates, build production e CI/PR; conferir árvore aprovada.
- [ ] Pausar somente watchdog/API produtivos, backup final, fast-forward, migration, promoção auditada, readiness e frontend.
- [ ] Validar perfis/permissões, endpoints/arquivos públicos, UI e preservação dos ambientes; documentar e encerrar.

## Validação visual
Produção sem gravações de teste: parâmetros, acesso superusuário, formulários, desktop/mobile e temas. Preservar guias e rascunhos do usuário. Operações com efeitos de saldo e inativação são exercitadas somente nas bases descartáveis.

## Testes e build
Reutilizar evidências cuja árvore seja idêntica e revalidar candidato/CI. Backend padrão,687 frontend, lint, build production e104 testes PostgreSQL. Ensaio de migration/role e sondagem oficial com transações obrigatoriamente read-only. Esperado:77 tabelas, histórico anterior intacto, somente `jonatas@sousa` SUPERUSER.

## Resultado
Em preparação.

30/10: ensaio inicial preservou todos os dados e promoveu somente a conta autorizada na cópia, mas a consulta paginada de auditoria encontrou colisão de nomes entre a nova AuditLog.organization_id e o id projetado da secretaria do ator. Corrigido somente o alias interno, mantendo formato/escopo da resposta; adicionada regressão PostgreSQL para paginação, contagens globais, indicador e secretaria. Repetir gates/ensaio antes de ativar. Rotina HML das06h concluiu com integridade/configurações preservadas; API HML agora PID13212. Produção continua0cd053c/PID5804 sem alteração.

## Pendências / decisões
Parâmetros próprios e banco HML não serão copiados. A identidade inicial produtiva continua baseada nos valores oficiais existentes. O usuário poderá editar parâmetros em produção depois da promoção. Backup fresco será capturado novamente com a API parada para preservar as últimas gravações.

## Rollback
Restaurar fonte/build anterior, reverter somente a promoção exata se necessário para compatibilidade do código antigo e registrar essa reversão na auditoria. Manter tabelas/colunas aditivas e dados novos. Reiniciar somente API8000 e reativar watchdog em finally. Dump é reserva de recuperação assistida; nenhum restore automático sobre produção.
