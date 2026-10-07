# Ajustes operacionais — 07/10/2026

Solicitação expressa para publicar primeiro em produção e depois manter a homologação funcionalmente alinhada.

## Alterações

- Admin e Produção com permissão de edição de Cadastros podem excluir departamentos e lotações do seu escopo. Exclusão de órgãos mantém a permissão anterior. Departamentos com lotações exigem remoção destas primeiro; vínculos históricos continuam protegidos por integridade referencial. Exclusões permanecem auditadas.
- O contador de empréstimos pendentes considera somente entregas destinadas à secretaria do usuário e devoluções destinadas à secretaria de origem. Administradores sem secretaria vinculada não recebem notificações globais. A consulta de empréstimos mantém seu escopo anterior.
- Aba de empréstimos aceita digitalização do termo impresso em PDF, JPG ou PNG (até 10 MB), guarda o arquivo em storage privado e registra hash, autor e auditoria. Usuários com permissão de edição podem anexar; participantes com permissão de consulta podem baixar. O anexo não altera os termos ou assinaturas digitais.

## Verificações

- Migration `0051_vehicle_loan_printed_terms` aplicada no PostgreSQL isolado de homologação após `0050_vehicle_prime_card`.
- Backend: 514 testes aprovados e 86 ignorados nas condições locais; testes adicionais de papéis e anexos aprovados.
- Frontend: teste direcionado do componente de termos aprovado; suíte completa em execução na preparação da release.
- Lint sem erros, com os mesmos 46 avisos do baseline de produção; build aprovado.

## Publicação

Backup em `D:\FROTAS\frota_certificado_homologacao\storage\backups\operational-adjustments`. Após a publicação, confirmar revisão Alembic, saúde pública e arquivo do frontend servido. Sincronizar os arquivos funcionais com `D:\FROTAS\frota_emprestimos_testes` sem copiar as alterações de Análises para produção.
