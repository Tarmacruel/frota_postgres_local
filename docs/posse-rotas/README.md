# Plano de Implementação — Posse, Rotas, Devolução e Relatórios

## 1. Finalidade

Este diretório organiza a implementação incremental do novo domínio operacional de posse de veículos da Frota da Prefeitura Municipal de Teixeira de Freitas.

A alteração separa dois conceitos que não podem continuar sendo tratados como equivalentes:

- **Posse:** período contínuo de responsabilidade de um condutor por determinado veículo.
- **Rota:** cada saída, deslocamento, inclusão de destino e retorno realizado durante uma posse ativa.

Uma posse poderá conter várias rotas. O retorno de uma rota não encerrará a posse. A posse somente será encerrada quando houver devolução efetiva do veículo e confirmação autenticada pelo usuário responsável pela operação no sistema.

## 2. Estratégia de branches

- Branch de produção atualmente utilizada: `módulo-analytics`.
- Branch criada para esta implementação: `feat/posse-rotas-relatorios-devolucao`.
- A branch de implementação foi criada a partir do estado atual de `módulo-analytics`.
- Nenhuma fase deverá ser implementada diretamente em `módulo-analytics` ou `main`.
- Cada fase deve terminar com commit próprio, testes executados e atualização do checklist deste diretório.
- Ao final, a branch de implementação deverá ser sincronizada com o estado mais recente de `módulo-analytics`, submetida a validação integral e encaminhada para `main` por Pull Request.
- Não realizar merge automático. A integração com `main` dependerá de revisão humana e verificação da divergência entre `main`, `módulo-analytics` e a branch de implementação.

## 3. Sequência obrigatória

| Ordem | Documento | Resultado esperado |
|---|---|---|
| 0 | `00_BASELINE_E_GOVERNANCA.md` | Inventário do sistema, baseline reproduzível e decisões confirmadas |
| 1 | `01_SEGURANCA_AUDITORIA_E_CONTEXTO.md` | Contexto de requisição, CSRF, autorização e auditoria transversal |
| 2 | `02_MODELO_DE_DADOS_E_MIGRACOES.md` | Tabelas, constraints, índices e migrations sem perda de legado |
| 3 | `03_BACKEND_DE_POSSES_E_ROTAS.md` | Serviços, regras de domínio e endpoints seguros |
| 4 | `04_FRONTEND_DE_POSSES_E_ROTAS.md` | Fluxo operacional responsivo e acessível |
| 5 | `05_TERMO_UNICO_E_DEVOLUCAO.md` | Termo único e confirmação autenticada da devolução |
| 6 | `06_RELATORIOS_CONFIGURAVEIS.md` | PDF/XLSX com filtros, presets e seleção uniforme de colunas |
| 7 | `07_HARDENING_LGPD_E_ACESSIBILIDADE.md` | Revisão final de segurança, privacidade e eMAG/WCAG |
| 8 | `08_TESTES_ROLLOUT_E_INTEGRACAO_MAIN.md` | Ensaio de migração, validação, rollback e PR final para `main` |

Documentos de apoio:

- `ADR_001_MODELO_POSSE_ROTA.md`: decisões arquiteturais vinculantes.
- `ADR_002_COMPATIBILIDADE_PRODUCAO_E_GOVERNANCA.md`: prevalência de produção, transição do legado, hard delete e tetos de acesso.
- `MATRIZ_RBAC_LGPD.md`: permissões, classificação de dados e regras de exposição.
- `CHECKLIST_EXECUCAO.md`: acompanhamento objetivo do progresso.
- `RELATORIO_FASE_1.md`: implementação, testes, deploy, riscos residuais e rollback da camada transversal de segurança.
- `RELATORIO_FASE_2.md`: schema, migration, ensaios limpo/cópia, contagens, downgrade e riscos para serviços.
- `RELATORIO_FASE_3.md`: contratos REST, transações, locks, auditoria, testes e compatibilidade com o frontend atual.
- `RELATORIO_PRONTIDAO_FASE_4.md`: backup e upgrade do banco fonte, reconciliação Alembic, preparação de testes frontend e critérios de liberação.

## 4. Regras não negociáveis

1. Preservar todos os registros e arquivos legados.
2. Não executar reset, drop, truncate ou recriação do banco de produção.
3. Não realizar hard delete de posse, rota, destino, devolução ou auditoria.
4. Não confiar no frontend para autorização.
5. Toda mutação deve ser validada novamente no backend.
6. Operações compostas devem ser transacionais.
7. Não permitir sobreposição de posse ativa para um mesmo veículo.
8. Não permitir mais de uma rota em andamento dentro da mesma posse.
9. Não permitir encerramento da posse com rota em andamento.
10. Correções retroativas exigem perfil `ADMIN`, justificativa e auditoria `before/after`.
11. O termo de devolução separado será eliminado; a devolução integrará o termo único da posse.
12. A confirmação de devolução não deve ser descrita como assinatura digital ICP-Brasil ou assinatura eletrônica qualificada.
13. Relatórios devem aplicar minimização de dados por padrão.
14. Documento, contato, localização e metadados técnicos somente podem ser exibidos a perfis autorizados.
15. Nenhuma fase pode afirmar que testes passaram sem apresentar o comando efetivamente executado e seu resultado.

## 5. Disciplina de execução pelo Codex

Em cada fase, o Codex deverá:

1. Ler este `README`, a fase atual, o ADR e a matriz RBAC/LGPD.
2. Confirmar a branch ativa antes de alterar arquivos.
3. Inspecionar o código real, sem presumir nomes de classes, heads do Alembic ou dependências.
4. Limitar as alterações ao escopo da fase.
5. Evitar refatorações não relacionadas.
6. Criar ou atualizar testes da fase.
7. Executar os comandos de validação previstos.
8. Apresentar arquivos alterados, migrations, decisões, riscos e pendências.
9. Atualizar `CHECKLIST_EXECUCAO.md` somente com evidências verificáveis.
10. Interromper a fase quando houver risco de perda de dados, ambiguidade de autorização ou divergência estrutural relevante.

## 6. Convenções de commits

Sugestões:

- `docs(posse-rotas): registrar baseline e decisões`
- `feat(security): adicionar contexto de requisição e proteção csrf`
- `feat(possession): criar modelo de rotas e destinos`
- `feat(possession): implementar serviços e endpoints de rotas`
- `feat(frontend): implementar fluxo de rotas na posse`
- `feat(possession): consolidar termo e devolução autenticada`
- `feat(reports): adicionar relatórios configuráveis de posse`
- `test(possession): ampliar cobertura de rotas e devolução`
- `chore(release): preparar integração do módulo de posse na main`

## 7. Critério global de conclusão

A entrega será considerada concluída somente quando:

- um condutor puder manter uma posse ativa e registrar múltiplas rotas;
- novos destinos puderem ser incluídos em rota em andamento;
- o retorno da rota não encerrar a posse;
- a devolução final exigir confirmação explícita e autenticada;
- o termo único consolidar posse, rotas e devolução;
- PDF e XLSX utilizarem a mesma definição de colunas e filtros;
- autorização, proteção contra IDOR, CSRF e auditoria estiverem cobertas por testes;
- migrations forem validadas sobre cópia de banco existente;
- o procedimento de rollback estiver documentado e testado;
- o Pull Request final para `main` estiver acompanhado das evidências de validação.
