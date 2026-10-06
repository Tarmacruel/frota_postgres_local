# Fase 05 — termos e assinaturas

Entregue em 29/09/2026 na cópia `D:\FROTAS\frota_emprestimos_testes`, branch `feature/emprestimos-secretarias`.

## Como utilizar

Acesse https://testefrota.sirel.com.br/emprestimos (ou http://localhost:6969/emprestimos) e abra o detalhe do empréstimo.

1. Ao confirmar o recebimento, o sistema emite o **termo de empréstimo entre secretarias**.
2. Ao confirmar a devolução, emite um **termo de devolução** separado. O termo da entrega permanece preservado.
3. Em **Termos e assinaturas**, os dois representantes devem baixar e conferir o termo e então confirmar sua própria senha. Cada assinatura exige conta com CPF e senha regularizados e permissão de edição em empréstimos.
4. **Baixar termo e evidências** traz o conteúdo preservado e as assinaturas registradas no momento do download. **Baixar PDF original preservado** entrega os bytes originais armazenados, sem acrescentar assinaturas posteriores.
5. A central de assinaturas pendentes abre o empréstimo correspondente. A tela indica quem já assinou e quem falta.

O aceite operacional e a assinatura são distintos: a transferência ocorre no aceite; o documento permanece pendente até as duas assinaturas. Na entrega, assinam quem enviou a proposta e quem aceitou. Na devolução, quem solicitou o retorno e quem o recebeu. O administrador também precisa ser um desses representantes; sua assinatura registra a secretaria representada no ato original.

## Conteúdo e preservação

Os PDFs incluem identificação do empréstimo, placa, secretarias de origem e recebedora, lotações, motivo, prazo, datas efetivas, odômetros, condições e os representantes. O modelo possui identificação institucional, paginação, hash do conteúdo e marca visível de ambiente de testes.

O conteúdo é congelado no aceite, na mesma transação da transferência de lotação e do evento auditável. Falha de emissão desfaz toda a transação. Alterações posteriores no cadastro e o encerramento do empréstimo não reescrevem o termo anterior. A migration `0046_loan_terms` impede exclusão e alteração do conteúdo/identidade/quórum dos termos e impede duplicação por operação.

Reutilizados: documentos digitais, assinaturas por senha, evidências, auditoria, solicitações pendentes e armazenamento de PDFs canônicos. Os dois representantes são obrigatórios: não se pode reduzir o quórum cancelando uma solicitação nem substituir signatários por uma coassinatura arbitrária. Assinaturas simultâneas/repetidas são serializadas e recusadas quando duplicadas.

Consulta e download exigem autenticação, permissão `vehicle_loans` e vínculo com uma das secretarias (ou ADMIN). Não há link público de exposição dos documentos. A antiga recebedora mantém consulta aos termos após a devolução.

## Contratos adicionados

- `GET /api/vehicle-loans/{id}/documents`: documentos e resumos de assinatura.
- `GET /api/vehicle-loans/{id}/documents/{document_id}/pdf`: PDF do termo com evidências atuais, sem cache público.
- Tipos `VEHICLE_LOAN_DELIVERY_TERM` e `VEHICLE_LOAN_RETURN_TERM`, fonte `VEHICLE_LOAN`.
- Assinatura: endpoint existente `POST /api/document-signatures/documents/{document_id}/sign`.
- PDF original: endpoint existente de artefatos `GET /api/documents/{document_id}/artifacts/canonical`.

## Validação

- Backend completo: **423 aprovados, 19 skips condicionais e 6 avisos de depreciação existentes**.
- Frontend completo: **149 aprovados em 32 arquivos**; build e lint dos componentes alterados concluídos.
- Novos testes cobrem os dois termos, conteúdo congelado, permissões, dois signatários, senha incorreta, assinatura concorrente, representação de administradores, solicitações obrigatórias, PDF determinístico, proteção no PostgreSQL e rollback quando a emissão falha.
- Migration validada primeiro em bancos descartáveis, incluindo downgrade sem termos e verificação do schema; depois aplicada à cópia restaurada, após validação de pasta, banco, porta e armazenamento.
- PDFs de entrega, entrega assinada, devolução e condições longas renderizados e inspecionados visualmente. Exemplos sintéticos em `storage/loan-tests/pdf-qa`; não são documentos operacionais.
- Navegador real pelo túnel: detalhe e seção de termos carregados. O rascunho existente na base de trabalho foi apenas consultado. Os cenários de assinatura e geração foram executados em bancos descartáveis, sem concluir operações do usuário.
- Smoke: `backend/.venv/Scripts/python.exe scripts/verify_loan_phase5.py`; evidência em `storage/loan-tests/phase5-smoke.json`.
- Produção com saúde HTTP 200 e árvore Git limpa no commit `12150b19919b999cd47668abe4c3e6b5f3504329`.

## Configuração e limites

`CANONICAL_DOCUMENT_ARTIFACTS_ENABLED=true` somente no `.env` da cópia de testes. Certificados, agente de assinatura e acessos externos de validação permanecem desligados. A assinatura desta entrega é **eletrônica interna por senha**, não ICP-Brasil/PAdES; a interface e o PDF deixam isso explícito.

Termos são emitidos para aceites realizados a partir desta entrega. A fase não inventa assinaturas nem emite retroativamente documentos de operações antigas. Regularização retroativa permanece na fase 06; validação final e publicação em produção, na fase 07.

Início/parada/status permanecem em `scripts/loan-tests.ps1 start|stop|status`, executados na pasta de testes. A fase 05 foi encerrada sem avançar às fases seguintes.
