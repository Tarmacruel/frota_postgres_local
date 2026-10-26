# Justificativas rápidas no vínculo de ordens anteriores

O formulário de vínculo contratual das ordens abertas usava um textarea simples, enquanto os outros ajustes já ofereciam sugestões e histórico pessoal. A correção reutiliza JustificationField com a finalidade order_funding, modelos de vínculo anterior, reprogramação e rede credenciada por valor. O texto escolhido continua editável; um rascunho preenchido exige confirmação antes de ser substituído. Selecionar um modelo não envia o formulário.

O catálogo usa as mesmas permissões de edição das ordens e restrição a ADMIN/PRODUCAO. A justificativa final só entra no histórico pessoal na transação bem-sucedida do vínculo, junto à auditoria. A repetição idempotente e a tentativa rejeitada de trocar o contrato não incrementam o uso. Nenhuma migration, regra financeira, reserva, prazo ou saldo é alterado por esta correção.

Validação: 700 testes backend aprovados e 49 integrações PostgreSQL aprovadas em banco descartável, incluindo catálogo, histórico do vínculo e proteção contra repetição. A suíte frontend executou 499 testes: 498 passaram, e a única falha foi a expectativa estática de 22 contextos no catálogo, agora com 23. A expectativa e a cobertura da nova finalidade foram atualizadas; os quatro testes dos dois arquivos envolvidos passaram na repetição. Lint sem erros (39 avisos anteriores) e build de produção aprovados. Registros de publicação em storage/backups/20261026-order-funding-justifications.

A publicação reutiliza o build de produção validado e preserva .env. Fontes anteriores permanecem no Git e o frontend anterior é copiado para a pasta de evidências antes da atualização. A verificação pública abre o formulário sem confirmar vínculo nem criar dados de teste em produção.
