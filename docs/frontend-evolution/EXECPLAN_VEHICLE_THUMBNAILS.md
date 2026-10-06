# ExecPlan — Miniaturas pelo tipo cadastrado

## Objetivo

Exibir o SVG correspondente ao tipo cadastrado do veículo em todas as listagens que já usam miniaturas. O usuário confirmou que deseja o tipo, não marca/modelo, e autorizou acrescentar `vehicle_type` às respostas de leitura necessárias em 06/10/2026.

## Estado inicial verificado

- Branch `feature/frontend-evolution-hml`, HEAD `049c665`, working tree limpo.
- Várias telas passam `record.vehicle_type`, ausente no contrato da API; empréstimos também tenta ler um tipo ausente no catálogo.
- Perua/SW utiliza indevidamente o SVG de SUV.
- Baseline novo em `storage/loan-tests/vehicle-thumbnails/baseline-*.log`.

## Arquivos previstos

Schemas/serializadores de leitura de posses, abastecimentos, ordens, sinistros, multas, manutenção e empréstimos; componente de miniatura; páginas de manutenção/empréstimos; SVG Perua/SW; testes e status.

## Alterações funcionais proibidas

Não alterar banco, migrations, permissões, payloads de escrita, auditoria, PDFs, regras de negócio ou produção. Não inferir tipo por marca/modelo. Não buscar cadastros adicionais por linha de tabela.

## Passos de implementação

- [x] Investigar ausência do tipo e confirmar escopo/autorização.
- [x] Incluir o tipo cadastrado nos metadados de leitura existentes.
- [x] Consumir metadados diretamente e separar o SVG Perua/SW.
- [x] Executar testes e inspeção visual claro/escuro/celular.
- [x] Registrar arquivos, evidências e limites.

## Validação visual

Contact sheet existente consultado. Usar dados fictícios em preview isolado para conferir correspondência entre tipos, SVGs e labels, preservando tamanho/layout das miniaturas.

## Testes e build

Regressão de metadados de leitura e escopo; frontend `npm run test`, `npm run lint`, `npm run build` em diretório isolado. Comparar baseline.

## Resultado

Concluído e publicado em https://testefrota.sirel.com.br em 06/10/2026, como ajuste da entrega em homologação. A API envia o tipo do veículo vinculado, não um tipo inferido. Nenhuma consulta extra por linha: os serializadores reutilizam a relação carregada; empréstimos inclui o tipo na consulta em lote que já obtinha as placas.

Abrangência: cadastro de veículos (já correto), posses, ordens abertas, ordens/histórico de abastecimentos, sinistros, multas, manutenção e empréstimos (lista/detalhe). Ícones de navegação representam módulos, não veículos individuais, e foram preservados.

| Verificação | Resultado |
| --- | --- |
| Baseline frontend | 226 testes aprovados, lint 0 erros/46 avisos, build aprovado |
| Frontend final | 227 testes aprovados, lint 0 erros/46 avisos, build aprovado |
| Backend final | 143 testes aprovados, 3 avisos de depreciação preexistentes |
| Visual | 11 tipos e SVGs carregados em empréstimos com catálogo vazio; claro/escuro e celular |
| Publicação | API/banco saudáveis; 7 contratos de leitura com `vehicle_type`; 25 arquivos JS/CSS/SVG com hashes iguais ao build validado na origem e domínio público |

Testes novos: 72 combinações entre seis serializadores e os 11 tipos/ausência de veículo, preservação do campo nos schemas, empréstimo real com tipo cadastrado e escopo 404 para outra secretaria, renderização de lista/detalhe sem catálogo. O QA visual utiliza respostas fictícias no navegador; não foram alterados registros reais.

Arquivos: schemas `claim.py`, `fine.py`, `fuel_supply.py`, `maintenance.py`, `possession.py`, `vehicle_loan.py`; respectivos serviços de leitura, incluindo `fuel_supply_order_service.py` e `vehicle_loan_presentation.py`; `VehicleThumbnail.jsx`, páginas de manutenção/empréstimos, `wagon.svg`, testes `test_vehicle_thumbnail_metadata.py`, `test_vehicle_loan_api.py`, `VehicleLoansPage.test.jsx`, `frontendEvolutionComponents.test.jsx` e documentação.

Evidências visuais: [claro](../../output/playwright/vehicle-thumbnails/loans-light.png), [escuro](../../output/playwright/vehicle-thumbnails/loans-dark.png), [celular escuro](../../output/playwright/vehicle-thumbnails/loans-mobile-dark.png). Logs de baseline/final, script de QA e `publication.json` em `storage/loan-tests/vehicle-thumbnails/`.

Publicação: backup do frontend anterior em `before-publication-dist/`, cópia do build validado e reinício somente da API de testes 6969. PostgreSQL 5441 permaneceu em execução, sem migration ou alteração de registros. Produção inalterada. Não houve nova fase do redesign.

## Pendências / decisões

Campo de leitura autorizado expressamente. Para registros cujo veículo realmente não esteja disponível, manter fallback honesto sem inventar uma categoria.

## Rollback

Reverter somente os arquivos desta correção. Sem migração ou alteração de dados.
