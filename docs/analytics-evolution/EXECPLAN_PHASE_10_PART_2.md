# ExecPlan — Fase 10, parte 2 — persistência autorizada

## Objetivo

Implementar somente em homologação o desenho aprovado em `EXECPLAN_PHASE_10_PART_1.md`: três tabelas, casos fuel-v2.1, reconciliação manual, estados, justificativas, histórico imutável, auditoria e idempotência. Autorização expressa do usuário nesta sessão: “autorizada a persistencia da fase 10”.

## Estado inicial verificado

- Branch `feature/analytics-evolution-hml`, HEAD `82f3415fc358e3f5152a9ee4d0fad53594d264e5`.
- Working tree com alterações anteriores das Fases 10–12/revisão; todas preservadas. Inventário anterior: `evidence/phase-12/review-20261013/final-git-status.txt`; status consultado novamente antes de editar.
- Baseline: backend 608 aprovados/88 pulados; frontend 285 aprovados; lint 0 erros/45 avisos; build aprovado.
- HML isolada: root `D:\FROTAS\frota_emprestimos_testes`, PostgreSQL 127.0.0.1:5441, banco `frota_emprestimos_testes`. Migração somente pelo runner que valida cluster/credenciais. Nenhuma produção.

## Arquivos previstos

Migration 0052, modelos/schemas/service/rotas de alertas, testes de transações PostgreSQL e autorização, componente Alertas e conteúdo no drawer existente, client/dashboard/CSS, evidências e status.

## Alterações funcionais proibidas

Backfill automático, geração em GET, rotina agendada, alteração de flags operacionais/regras fuel-v2.1, importação de insights V1 como casos, concessão automática de permissão, deploy de produção, fases posteriores.

## Passos de implementação

1. Conferir head/schema/UUID em HML; criar três tabelas vazias e proteção do histórico.
2. Compartilhar detector existente; deduplicar por fonte/regra com lock transacional e preservar primeira evidência/decisão humana.
3. Implementar contratos fechados, revalidação de escopo/fonte inclusive no replay, If-Match e auditoria no mesmo commit.
4. Integrar fila e tratamento ao drawer/pilha; manter painel e exportação V1 identificados e acessíveis.
5. Testar migration upgrade/downgrade em schema descartável, concorrência, rollback e controles; aplicar upgrade apenas à HML autorizada.
6. Rodar regressões completas, lint/build, validar claro/escuro/mobile e registrar status/arquivos/limitações.

## Decisão de apresentação do escopo de evidências

Usuário restrito recebe somente eventos/evidências cujo contexto registra exatamente sua secretaria, além de a fonte ainda estar autorizada pela atribuição histórica. Se a evidência atual foi global, exibir caso autorizado com evidência indisponível; detalhe pode mostrar avaliação compatível anterior, identificada pelo próprio recorte. Evidência original global nunca é reescrita ou liberada. Reconciliação continua exclusivamente administrativa. A linha do tempo de usuário restrito é filtrada antes da contagem/paginação.

## Validação visual

Fila, filtros, vazio, justificativa, conflito, histórico, fonte e pilha; reutilizar componentes/tokens existentes em claro/escuro e mobile. Não fabricar casos na base operacional para screenshot: usar as regras reais e reconciliação explicitamente acionada ou fixtures isoladas.

## Testes e build

Testes de autorização, estados, deduplicação, idempotência, concorrência/rollback e histórico; PostgreSQL em schema de QA descartável no cluster HML. `npm run test`, `npm run lint`, `npm run build`, backend completo e diff check.

## Resultado

Concluído em 13/10/2026. [Entrega, contratos, arquivos e limites](DELIVERY_PHASE_10.md). Migration 0052 aplicada exclusivamente em HML, inicialmente com três tabelas vazias. QA PostgreSQL em schemas descartáveis confirmou deduplicação/concorrência, idempotência, rollback de auditoria, escopo e imutabilidade; nenhum schema de QA permaneceu.

Gates: backend **644 aprovados/88 pulados**, frontend **295 aprovados/58 arquivos**, regressão focada **41 aprovados**, lint **0 erros/45 avisos preexistentes**, build aprovado. Durante QA foram corrigidos overflow de select no mobile, identificação de ocorrências pela data e foco em summaries/retorno quando o acionador desaparece.

Homologação pública: reconciliação explícita gerou cinco casos reais, uma abertura justificada para conferência, segunda reconciliação sem duplicação. Estado final: 5 casos/11 eventos/3 requests/11 linhas de auditoria; 4 NEW/1 IN_REVIEW. Fontes operacionais preservadas. Seis combinações de tema/viewport reais e seis com fixtures; drawer, motivo, histórico/original e teclado validados. Bundle final `index-D0qAPC_i.js` confirmado. Sem produção, commit/push ou nova fase.

## Pendências / decisões

Sem nova fase, produção ou commit/push. Retenção de chaves de 30 dias documentada; limpeza futura deve ser explícita, sem remover histórico de casos.

## Rollback

Rollback de código preservando diffs anteriores. Não fazer downgrade de HML depois de casos reais sem backup e ordem explícita; downgrade destrói as três tabelas. Ensaio de downgrade somente no schema descartável vazio de QA.
