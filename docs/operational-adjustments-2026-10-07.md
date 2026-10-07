# Ajustes operacionais — 07/10/2026

Solicitação expressa para publicar primeiro em produção e depois manter a homologação funcionalmente alinhada.

## Alterações

- Admin e Produção com permissão de edição de Cadastros podem excluir departamentos e lotações do seu escopo. Exclusão de órgãos mantém a permissão anterior. Departamentos com lotações exigem remoção destas primeiro; vínculos históricos continuam protegidos por integridade referencial. Exclusões permanecem auditadas.
- O contador de empréstimos pendentes considera somente entregas destinadas à secretaria do usuário e devoluções destinadas à secretaria de origem. Administradores sem secretaria vinculada não recebem notificações globais. A consulta de empréstimos mantém seu escopo anterior.
- Aba de empréstimos aceita digitalização do termo impresso em PDF, JPG ou PNG (até 10 MB), guarda o arquivo em storage privado e registra hash, autor e auditoria. Usuários com permissão de edição podem anexar; participantes com permissão de consulta podem baixar. O anexo não altera os termos ou assinaturas digitais.

## Verificações

- Migration `0051_vehicle_loan_printed_terms` aplicada no PostgreSQL isolado de homologação após `0050_vehicle_prime_card`.
- Backend: 514 testes aprovados e 86 ignorados na release isolada. Na homologação, 559 aprovados e 91 ignorados. Testes HTTP reais em PostgreSQL descartável confirmaram upload/download, isolamento por secretaria nas notificações e exclusão de lotações/departamentos. A checagem encontrou uma ausência preexistente de validação da secretaria ao excluir lotação; a correção foi publicada nos dois ambientes e os três testes direcionados passaram.
- Frontend: 234 testes aprovados na release isolada e 256 na homologação.
- Lint sem erros, com os mesmos 46 avisos do baseline de produção; build aprovado.

## Publicação

Backup `D:\FROTAS\frota_certificado_homologacao\storage\backups\operational-adjustments\frota-backup-20261007-144413.zip`, SHA-256 `B45D5193BF600E0A5B3646EEAB323D1C215B24162C09A639BC1D020B8AA3BB70` verificado. Produção publicada em `2e40f1b` e corrigida em `ddebe8b`, backend reiniciado e saúde pública HTTP 200. Revisão Alembic `0051_vehicle_loan_printed_terms` e tabela confirmadas em produção. Homologação sincronizada nos arquivos funcionais, migration aplicada no banco isolado, runtime reiniciado e saúde pública HTTP 200; alterações de Análises foram preservadas.
