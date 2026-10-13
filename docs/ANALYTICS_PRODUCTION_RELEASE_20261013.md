# ExecPlan — Promoção integral do Analytics — 13/10/2026

## Autorização e objetivo
Usuário: “aplique agora todas as mudanças do ambiente de homologação no de produção.” Autoriza promover o código testado e a migration aditiva 0052. Banco, anexos, segredos e casos de teste da homologação não serão importados. Docker automático permanece etapa futura.

## Estado inicial verificado
- Homologação: `D:\FROTAS\frota_emprestimos_testes`, `feature/analytics-evolution-hml`, `169cde957796c2b0af68df94620da58374d93f6b`, working tree limpo e sincronizado com origin.
- Produção: `D:\FROTAS\frota_certificado_homologacao`, `main`, `05fbf512571d4ba80c482b7d19367c43275bfb03`, working tree limpo e sincronizado com origin.
- PostgreSQL produção: loopback 5432, `frota_db`, migration 0051; 304 veículos e 208 abastecimentos no preflight. HML: cluster distinto 5441. Watchdog local monitora API 8000/frontend 3000; Cloudflare permanece ativo.
- Diferença entre árvores limitada ao Analytics e resumo de alertas de Abastecimentos/documentação/testes. Correções emergenciais de mapas, cadastro/escopo, cartão Prime e termos impressos já equivalentes na HML; sem diferenças em deploy/configuração/dependências.
- Gates HML: frontend 304 aprovados/59 arquivos, backend 644 aprovados/88 pulados, lint 0 erros/45 avisos preexistentes, build aprovado.

## Arquivos previstos
Merge integral da fonte no histórico de produção; build específico com configuração de produção; migration 0052; este relatório e status. Artefatos operacionais protegidos/ignorados em `storage/loan-tests/production-release-20261013/`.

## Passos
- [x] Preflight, comparação e confirmação do runtime ativo.
- [x] Preparar merge isolado com histórico da main preservado e comparar árvore funcional.
- [x] Backup consistente de produção, anexos/configuração/build anterior e Git.
- [x] Restaurar dump no cluster de QA e ensaiar 0051→0052; conferir dados antigos e tabelas novas vazias.
- [x] Testes/build de produção no checkout isolado; preparar ativação/rollback revisáveis.
- [x] Suspender apenas watchdog/API na janela; backup final offline; fast-forward local da main, migration, API nova e assets/index.
- [x] Conferir dados, saúde/autenticação/versão/assets e login público; reabilitar watchdog.
- [ ] Registrar resultado/limites e alinhar histórico de HML/main pelo PR com checks obrigatórios.

## Reversão
Antes da ativação preservar commit `05fbf51` e build anterior. Falha de aplicação: reiniciar código/build anterior, preservando schema aditivo 0052 e dados novos; não executar downgrade destrutivo. Migration roda em transação; se falhar, não expor frontend novo. Backups nunca versionados. Não parar PostgreSQL, Cloudflare, HML ou sistema de obras.

## Resultado

**Publicado em 13/10/2026, às 15:43:43 (America/Sao_Paulo)**, em https://frota.sirel.com.br. Release inicial `df8416167c1686c455e3e30062a7f2676eb1905b`, merge da main `05fbf51` com HML `169cde9`; árvore idêntica à HML, mantendo histórico de correções emergenciais da main. Produção permaneceu na branch `main`. A janela de ativação durou aproximadamente 16 segundos; API reiniciada e watchdog reabilitado. PostgreSQL/Cloudflare/HML/sistema de obras não foram parados ou alterados.

| Verificação | Resultado |
|---|---|
| Release frontend | 304 aprovados / 59 arquivos |
| Release backend | 623 aprovados / 109 pulados / 7 avisos preexistentes |
| PostgreSQL opt-in na HML, gate anterior do mesmo código | 644 aprovados / 88 pulados; não apresentado como teste de produção |
| Lint/build | 0 erros / 45 avisos preexistentes; build com aviso de chunk preexistente |
| Build de produção | `index-CfE8XNxs.js`; `VITE_APP_ENV=production`, `VITE_HOMOLOGATION=false`; configuração própria de produção |
| Ensaio sobre snapshot e migration real | 0051→0052; 54 tabelas antigas idênticas antes/depois por contagem e fingerprint de todas as colunas |
| Casos novos | Três tabelas vazias; nenhum backfill/reconciliação ou importação de casos da HML |
| Configuração | `.env` backend e `.env.production` frontend preservados por SHA-256 |
| Origem/publicação | Readiness app/banco ok; HTML e 10 assets servidos com SHA-256 idêntico ao build validado |
| Autorização anônima | Nove endpoints auth/Analytics retornaram 401; docs/OpenAPI continuam 404 |
| Serviços/exports em produção | Oito serviços, 1–5 SQL cada, sete igualdades entre visões; 12 PDF/XLSX status 200 com assinaturas válidas; conexão read-only e zero escrita |
| HML | Readiness mantido; configuração e banco isolado preservados |

Os 109 testes pulados na release dependem de ambiente/opt-in; os testes PostgreSQL com guarda específica de diretório foram executados anteriormente na HML, e o ensaio desta promoção usou snapshot atual de produção em banco descartável do cluster 5441. O banco descartável foi removido após o ensaio. Tabelas operacionais de produção mantiveram seus registros (304 veículos e 208 abastecimentos no preflight). Exportações de produção foram geradas somente em memória, sem publicar conteúdo operacional.

## Evidências e limites

[Resumo sanitizado](analytics-evolution/evidence/production-20261013/publication.json). Artefatos completos permanecem no diretório ignorado `storage/loan-tests/production-release-20261013/`: backups `production-before.dump`, `production-offline.dump`, `production-files-before/` com configurações/uploads/build/Git; rehearsal, gates, activation, production-migration, publication, analytics-production-qa e scripts revisados. Nenhum backup ou segredo será versionado. Não executar downgrade da 0052 com casos reais.

O navegador público confirmou login institucional sem banner HML e sem erros JS; não havia sessão autenticada em produção, portanto a inspeção visual das oito abas com usuário real não foi repetida em produção. As telas passaram QA na HML com árvore funcional idêntica; serviços e exports foram novamente conferidos em produção por sonda read-only. Sem ensaio de carga e sem geração/tratamento de caso em produção para QA. A fila começa vazia e depende de reconciliação manual autorizada. Docker automático permanece desabilitado (`FROTA_DEPLOY_ENABLED=false` confirmado), conforme pedido para etapa futura.

## Versionamento

Release e relatório serão publicados pelo PR `release/analytics-evolution-20261013` → `main`, respeitando os três checks obrigatórios e sem alterar proteção (zero aprovações obrigatórias já configuradas). Sincronização da main local e da branch HML somente após os checks/merge. O resultado final do PR será registrado no mesmo relatório.
