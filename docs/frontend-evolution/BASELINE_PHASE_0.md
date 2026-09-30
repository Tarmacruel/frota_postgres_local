# Baseline — Fase 0 — 30/09/2026

## Estado comprovado

- Pasta: `D:\FROTAS\frota_emprestimos_testes`; VS Code confirmado por `code --status` nessa pasta.
- Origem: `https://github.com/Tarmacruel/frota_postgres_local.git`.
- Branch inicial: `feature/emprestimos-testes-evolucao`.
- HEAD inicial: `06d44c1c4da59db94467006436fc47d4f469dc82`, consolidação das evoluções de homologação.
- Branch criada nesta fase: `feature/frontend-evolution-hml`, a partir desse HEAD, preservando todas as evoluções.
- Status inicial: nenhum arquivo rastreado modificado; somente `FROTA_FRONTEND_EVOLUTION_CODEX_V1.zip` e sua pasta extraída não rastreados.
- Snapshot do pacote: `feature/certificado-digital-hml`, HEAD `12150b19919b999cd47668abe4c3e6b5f3504329`.
- `git ls-remote --heads origin ...` confirmou que a branch remota de referência ainda aponta para `12150b1`. As branches locais de empréstimos/evolução visual consultadas não existem no remoto. Não houve push, pull ou merge.
- Comparação snapshot → HEAD inicial: **0 commits atrás, 1 à frente; 138 arquivos diferentes**, sendo 81 backend, 39 frontend, 8 documentos, 9 scripts e `.gitignore`. Não são modificações pendentes: pertencem ao commit inicial da homologação.

## Contexto importado, sem implementação

`AGENTS.md`, `.agent/`, `docs/frontend-evolution/`, `references/` e `repo-snapshot/` não estavam na raiz. Foram localizados no pacote duplamente aninhado `FROTA_FRONTEND_EVOLUTION_CODEX_V1/FROTA_FRONTEND_EVOLUTION_CODEX_V1/`, lidos e copiados para as posições esperadas, sem sobrescrever arquivos existentes.

Os 13 documentos numerados de `docs/frontend-evolution/`, as instruções `.agent/` e os dois contact sheets foram lidos. O starter-kit permanece no pacote; nenhum componente, SVG do kit ou CSS foi instalado no frontend. Documentos do pacote preservam o snapshot histórico; este relatório contém as correções locais.

## Discrepâncias relevantes

| Assunto | Evidência atual e consequência |
|---|---|
| Empréstimos | Implementação real em `frontend/src/pages/VehicleLoansPage.jsx`, rota `/emprestimos` em `App.jsx`, menu e badge em `Layout.jsx`, cliente `api/vehicleLoans.js`, formulários, documentos, regularização e hook de pendências. Backend em `app/api/routes/vehicle_loans.py`, serviços próprios e migrations 0044–0047. A ausência no snapshot é explicada pelo commit posterior, não por uma tela fictícia. Preservar recebimento/devolução, termos/assinaturas internas, permissões e notificações. |
| Permissões | Rota protegida por `vehicle_loans:view`; contador usa `usePendingVehicleLoans`. Não ocultar o módulo nem substituir sua proteção por permissão genérica de veículos. |
| Posses | Tela de retificação unificada, histórico imutável e controle de versão da migration 0048 já existem. O redesign deve preservar esse caminho e a confirmação de devolução. |
| Abastecimentos | Criação individual e em lote já sugere 30 litros, secretaria do usuário e primeiro posto ativo. Esses padrões não devem ser perdidos ao integrar componentes. |
| CSS | `main.jsx` importa `styles.css` **e depois `styles-light.css`**, ausente no snapshot. Essa segunda folha reforça contraste claro. A futura folha deve entrar depois das duas, com classes próprias e sem sobrescrever indiscriminadamente tokens antigos. |
| Cantos | O código usa escala 4/6/8/10 px, conforme pedido anterior do usuário. O pacote sugere 8/10/12/16 e chips 999 px. Registrar a divergência e manter os cantos menores como proposta até decisão explícita; não aumentar silenciosamente. |
| Referências alvo | `01-design-system-board.png` e `02-telas-alvo-board.png` são byte a byte idênticos: SHA256 `C16BA96BB6D2F1BC9C75EDAA5010DC8019F62116A17BA1D8E54F033F8C4583F7`. O segundo não traz um board separado de dashboard/posses como sugere o texto. O conceito 00 contém essas composições, mas não substitui uma decisão específica futura. |
| Homologação | Ambiente efetivo: backend + frontend compilado em `localhost:6969`, túnel `testefrota.sirel.com.br`, PostgreSQL isolado 5441. Os exemplos 8010/3010 do pacote não descrevem essa cópia. Validador local passou; nenhuma porta ou configuração foi alterada. |
| Assinaturas | Integrações externas de certificado estão desabilitadas nesta cópia, conforme isolamento já implantado. O pacote mostra exemplo habilitado. Preservar a configuração efetiva e os fluxos internos existentes. |
| Dependências | `package.json`/lock não diferem do commit do snapshot; o resumo JSON do pacote omite algumas devDependencies, como ESLint, plugin React e jsdom. Não interpretar a omissão como dependências ausentes. |
| Starter-kit | `ActionMenu` ainda precisa de gestão/restauração de foco, comportamento completo de teclado e retirada de estilo inline fixo. Os três testes do kit não cobrem isso. Adaptar na Fase 1, não copiar cegamente. |
| Screenshots e perfis | As referências usam outros registros/perfis. Capturas atuais são de Admin e têm contagens diferentes; não alterar dados ou indicadores para reproduzir números do mockup. |

A regra de parada por divergência de rota em `.agent/IMPLEMENT.md` foi tratada nesta fase como diagnóstico, conforme o pedido explícito de investigar as discrepâncias. Nenhuma decisão de redesign foi implementada.

## Quality gates executados

Ambiente: Windows, Node `v24.14.0`, npm `11.12.1`; dependências já instaladas, sem instalação/atualização.

| Comando no frontend | Saída | Resultado |
|---|---:|---|
| `npm run test` | 1 | **149 aprovados, 16 falhas**, 35 arquivos (5 falharam), 56,64 s. Pool configurado: `vmThreads`, um worker. |
| `npm run test -- --pool=forks` | 0 | **165 aprovados**, 35 arquivos, 58,91 s. Verificação complementar sem alterar configuração. |
| `npm run lint` | 0 | **0 erros, 46 avisos** existentes. |
| `npm run build` | 0 | Build concluído, 5,37 s; aviso informativo de tempo em plugins CSS. |

Falhas do comando padrão: `DocumentSignaturePanel` (5), `CertificateSignatureFlow` (5), `Layout` (1), `FuelSupplyOrderCreateForm` (2), `usePendingVehicleLoans` (3). A diferença entre pools é compatível com interferência/isolamento de mocks; a causa raiz não foi corrigida nem afirmada como definitivamente provada. **O gate padrão de testes permanece vermelho**; a execução com forks não o substitui silenciosamente.

Avisos de jsdom sobre `window.scrollTo` aparecem também na execução aprovada. No navegador, o beacon de analytics injetado pelo Cloudflare é bloqueado pela CSP existente; não houve alteração da política nesta fase.

Logs completos locais: `storage/loan-tests/frontend-evolution-phase0/{test,test-forks,lint,build}.log`. Diff contra o snapshot em `snapshot-diff.txt` no mesmo diretório. Capturas e logs locais ficam fora do Git; o índice abaixo é versionado.

## Evidência visual antes do redesign

Seis capturas novas, inspecionadas em **1366 × 768**, no túnel de homologação, perfil Admin:

- `evidence/phase-0/inicio-light.png` e `inicio-dark.png`.
- `evidence/phase-0/veiculos-light.png` e `veiculos-dark.png`.
- `evidence/phase-0/posses-light.png` e `posses-dark.png`.

Não foram gravadas posses, ordens ou outros registros. Observações para fases posteriores: filtros quebram em duas linhas; conteúdo extenso de lotação aumenta a altura das linhas de Veículos; Posses mantém múltiplas ações por linha; contraste de links/ações em dark merece revisão. Todas são observações de baseline, não correções desta fase. Demais viewports e validação funcional completa ficam para as fases correspondentes.

## Fechamento

Nenhuma alteração em `frontend/` ou `backend/` frente a `06d44c1`; build apenas regenerou `dist` ignorado a partir do mesmo código. Somente instruções, referências, inventário, evidências locais e documentação da Fase 0 foram preparados. Produção não foi alterada. Branch de baseline será encerrada com commit documental; originais ZIP/pasta permanecem preservados e excluídos apenas localmente via `.git/info/exclude`.

Fase 0 concluída com ressalva explícita do teste padrão. Fase 1 não autorizada.
