# Cartão Prime no cadastro do veículo — 07/10/2026

Demanda funcional autorizada diretamente para produção, independente da evolução visual e das alterações de Análises em homologação.

- Campo opcional `prime_card_number`, armazenado como texto de até 16 caracteres, sem preencher veículos existentes.
- Cadastro e edição: máscara `0000 0000 0000 0000`, teclado numérico e limite de 16 dígitos. Quando informado, o backend exige exatamente 16 dígitos ASCII; aceita espaços da máscara e preserva zeros iniciais.
- Omissão em uma atualização preserva o número; `null` ou texto vazio remove. Alterações seguem a justificativa e a auditoria existentes.
- Sem mudança de permissões, fluxos de abastecimento, assinatura ou exportação.

## Arquivos

Model, schemas e serviço de veículos; migration `0050_vehicle_prime_card`; `VehiclesPage.jsx`; utilitário `primeCard.js`; testes de frontend/backend e atualização do veículo fictício em `test_secretaria_links.py`.

## Validação

- Baseline do checkout HML: 251 testes de frontend; lint sem erros, 45 avisos.
- Release isolada a partir de `origin/main` (`738ebb7`): 233 testes de frontend e 495 de backend aprovados; 86 testes de backend ignorados por condições do ambiente.
- Lint da release: sem erros, 46 avisos existentes; build de produção aprovado.
- Migration aplicada com sucesso no PostgreSQL isolado de homologação, de `0049_justification_suggestions` para `0050_vehicle_prime_card`.
- Conferência visual do formulário claro/escuro em preview isolado: `output/playwright/prime-card-light.png` e `prime-card-dark.png` no checkout de testes.
- Backup de produção: `storage/backups/prime-card-release/frota-backup-20261007-085232.zip`, SHA-256 verificado contra o arquivo acompanhante.

## Publicação

Runtime identificado pelas tarefas e logs ativos: `D:\FROTAS\frota_certificado_homologacao`, porta 8000, monitorado por `FROTA Watchdog Local`. O deploy Docker automático está desativado. Publicar somente o commit isolado desta demanda, executar migration aditiva e reiniciar o backend pelo watchdog. Confirmar readiness público, OpenAPI e bundle servido após a publicação. Não reverter a migration em rollback de aplicação.
