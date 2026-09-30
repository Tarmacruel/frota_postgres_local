# Fase 04 — interface de empréstimos

Entregue em 29/09/2026 exclusivamente na cópia `D:\FROTAS\frota_emprestimos_testes`, branch `feature/emprestimos-secretarias`.

## Acesso e operação

- Local: http://localhost:6969/emprestimos
- Túnel: https://testefrota.sirel.com.br/emprestimos
- Usar as credenciais já disponibilizadas para o ambiente de testes. O menu **Empréstimos**, em Operacional, respeita a permissão `vehicle_loans`.
- Iniciar: `powershell -NoProfile -File scripts/loan-tests.ps1 start`.
- Consultar: `powershell -NoProfile -File scripts/loan-tests.ps1 status`.
- Parar: `powershell -NoProfile -File scripts/loan-tests.ps1 stop`.

Execute os comandos na pasta da cópia de testes. Os processos e o PostgreSQL próprios continuam isolados.

## Entrega

Lista paginada com busca por placa, filtro de situação e participação da secretaria. Novo empréstimo permite escolher veículo de origem, secretaria recebedora e lotação, registrar motivo, odômetro, condições e prazo opcional; o padrão é indeterminado. Salvar cria um rascunho, que pode ser revisado antes do envio.

O detalhe oferece edição, envio, aceite, rejeição, cancelamento, solicitação de devolução e aceite/rejeição/cancelamento da devolução, conforme situação e permissão. Exibe as secretarias, lotações, datas, condições, odômetros, pendências e histórico auditável, além de links filtrados para posses e abastecimentos. Registros encerrados permanecem consultáveis.

Aceites exigem usuário diferente do solicitante. Administradores veem a secretaria representada e precisam justificar as ações. Pendências operacionais bloqueiam as transferências e são revalidadas no servidor. Conflitos de versão preservam os dados digitados e exigem recarregar e revisar; cliques repetidos não enviam mutações duplicadas. Falhas de consulta não habilitam ações sem contexto. Respostas antigas são ignoradas ao mudar de detalhe.

O catálogo `/api/vehicle-loans/catalog` fornece opções permitidas sem exigir acesso ao cadastro administrativo de secretarias. Os retornos da API incluem nomes de secretarias/lotação, placa e nome do autor dos eventos. Filtros de placa e participação são aplicados no servidor. Não há migration nova nesta fase; permanece `0045_loan_workflow`.

## Verificação

- Backend completo: **417 aprovados, 19 skips condicionais e 6 avisos de depreciação existentes**. Inclui PostgreSQL descartável, isolamento por secretaria, catálogo, metadados, busca e ciclo de entrega/devolução.
- Frontend completo: **144 aprovados em 31 arquivos**. Inclui 15 testes novos de formulário, permissões, edição de valores, odômetro zero, bloqueios, conflitos, falhas e respostas fora de ordem.
- Build concluído e lint dos quatro novos módulos de implementação sem erros.
- Navegador real pelo túnel: sessão autenticada, menu, lista e abertura do formulário com catálogo real verificados; captura em `output/playwright/phase4-proposta.png`. Nenhuma proposta fictícia foi salva na base de trabalho.
- Smoke de leitura: `backend/.venv/Scripts/python.exe scripts/verify_loan_phase4.py`; resultado em `storage/loan-tests/phase4-smoke.json`.
- Produção: saúde HTTP 200 e árvore Git limpa no commit `12150b19919b999cd47668abe4c3e6b5f3504329`.

## Próxima fase

Fase 05: termos de empréstimo/devolução e assinaturas. Esses documentos ainda não são gerados nesta interface. Regularização retroativa e publicação em produção continuam nas fases 06 e 07.
