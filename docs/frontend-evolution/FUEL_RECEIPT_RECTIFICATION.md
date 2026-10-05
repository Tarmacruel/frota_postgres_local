# Retificação do comprovante de abastecimento

Entrega funcional solicitada em 05/10/2026, na branch `feature/frontend-evolution-hml`. Não inicia uma nova fase do redesign. Alterações anteriores das Fases 6/7 preservadas.

## Comportamento

- O formulário **Retificar confirmação de abastecimento** permite anexar um novo comprovante, inclusive sem modificar os demais dados.
- Sem novo arquivo, o comprovante atual permanece. Há consulta ao documento atual e opção para desistir da substituição antes de salvar.
- PDF, JPG, PNG e WEBP, até 8 MB; arquivo vazio, tipo não permitido e excesso de tamanho são rejeitados. Justificativa continua obrigatória.
- Dados e documento são enviados na mesma requisição. O `PATCH /api/fuel-supplies/{id}` mantém o JSON anterior e também aceita multipart com `payload` JSON e `receipt` opcional.
- O novo arquivo recebe um caminho exclusivo. O anterior não é sobrescrito nem excluído. O evento existente `ORDER_CONFIRM_RECTIFIED` registra justificativa e metadados anteriores/novos do comprovante; o download existente passa a servir o documento corrigido.
- Falhas ao armazenar, auditar ou confirmar a transação executam rollback e removem apenas o novo arquivo. Cálculo de consumo permanece condicionado à alteração de data, odômetro ou litros.
- Permissão de edição, restrição a ADMIN/PRODUCAO, visibilidade do registro e vínculo obrigatório com ordem preservados. Nenhum modelo, migration, configuração de produção ou fluxo de assinatura foi alterado.

## Arquivos desta entrega

- `backend/app/api/routes/fuel_supplies.py`: leitura JSON/multipart e documentação OpenAPI.
- `backend/app/services/fuel_supply_service.py`: troca auditável e tratamento de falhas.
- `backend/tests/test_fuel_supply_adjustments.py`: regressões de serviço, arquivo, auditoria, permissões e rollback.
- `backend/tests/test_fuel_supply_rectify_api.py`: contrato HTTP, compatibilidade e validação.
- `frontend/src/components/FuelSupplyRectifyForm.jsx` e `.test.jsx`: seleção opcional, validação, desistência, envio e regressões.
- `frontend/src/pages/FuelSuppliesPage.jsx`: descrição do modal.
- `frontend/src/styles.css`: seis linhas com `min-width: 0` restritas ao formulário para evitar overflow do seletor de arquivo no celular.
- Este relatório e o apontamento em `STATUS.md`.

## Validação

| Verificação | Resultado |
| --- | --- |
| Backend: `pytest tests/test_fuel_supply_adjustments.py tests/test_fuel_supply_rectify_api.py -q` | 26 aprovados; 1 aviso de depreciação da constante HTTP 413 já utilizada |
| Frontend, baseline `npm run test` | 179 aprovados / 20 falhas em 40 arquivos |
| Frontend, `npm run test` após implementação | 206 aprovados / 2 falhas em 41 arquivos |
| Frontend, suíte completa `npm run test -- --pool=forks` | 208/208 aprovados |
| Runner padrão, suítes do formulário, página, Layout e criação de lote após ajuste responsivo | 27/27 aprovados |
| `npm run lint`, antes/depois | 0 erros / 46 avisos, sem aumento |
| `npm run build`, versão final | Aprovado |
| `git diff --check` | Aprovado |

O runner padrão permanece instável, conforme histórico da Fase 7. As duas falhas finais foram no contador de empréstimos de `Layout` e no formulário de criação de ordens em lote, arquivos não alterados por esta entrega; ambas já haviam ocorrido na execução intermediária documentada da Fase 7. As quatro suítes dirigidas passaram juntas no runner padrão. A suíte completa com forks passou. Não se declara o gate padrão integralmente aprovado.

Logs em `storage/loan-tests/fuel-receipt-rectification/` (`baseline-*`, `final-*`, `backend-tests.log`).

## Evidências visuais e limites

Playwright/Edge com build local em modo homologação, dados fictícios e respostas de API simuladas no navegador. Conferidos desktop 1366×900 e celular 390×844, ambos em claro/escuro: modal sem overflow horizontal, acesso ao arquivo atual, seleção do novo arquivo, bloqueio de arquivo inválido, alcance do botão Salvar e envio multipart com sucesso simulado. A API e o armazenamento foram validados separadamente pelas suítes de backend, com sessões/repositórios de teste; não foi executada gravação em um PostgreSQL de HML nesta entrega.

- [Desktop claro](../../output/playwright/fuel-receipt-rectification/1366-light.png)
- [Desktop escuro](../../output/playwright/fuel-receipt-rectification/1366-dark.png)
- [Celular claro](../../output/playwright/fuel-receipt-rectification/390-light.png)
- [Celular escuro](../../output/playwright/fuel-receipt-rectification/390-dark.png)
- [Resultado da conferência](../../output/playwright/fuel-receipt-rectification/validation.log)

## Publicação em homologação — 05/10/2026

Após a instrução do usuário para continuar, a alteração foi ativada em **https://testefrota.sirel.com.br/abastecimentos**. O runtime efetivo desta cópia é `127.0.0.1:6969`, com PostgreSQL próprio na porta 5441; os scripts antigos de homologação 3010/8010 pertencem a outra cópia e não foram utilizados para publicar.

O frontend compilado já era servido pelo runtime. A API antiga foi identificada pelo PID registrado, caminho do executável, comando e processo filho responsável pela porta 6969. Somente a API de testes foi reiniciada, pelo fluxo `scripts/loan-tests.ps1`; o PostgreSQL permaneceu em execução, sem migrations.

Validação pelo domínio público: página HTTP 200, aplicação e banco saudáveis, OpenAPI anunciando JSON e multipart no PATCH de retificação, e hashes SHA-256 dos nove assets JS/CSS iguais aos arquivos locais do build validado. Evidência em `storage/loan-tests/fuel-receipt-rectification/publication.json`.

Entrega versionada em commit próprio, separado do redesign, conforme autorização posterior do usuário. As evidências com dados fictícios também foram versionadas. Publicada apenas em homologação, sem alteração de produção. Nenhum abastecimento real foi retificado; a verificação pós-publicação foi de disponibilidade e versão, sem gravação funcional em dados existentes.
