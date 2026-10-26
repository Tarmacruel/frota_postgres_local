# ExecPlan — Publicação de Contratos e saldos, KPIs e navegação — produção

## Objetivo
Aplicar as atualizações validadas em homologação na produção, conforme ordem expressa do usuário em26/10/2026. Inclui KPIs globais interativos, menu e ícones, Contratos e saldos integrado a abastecimentos/manutenções, preços versionados, substituição do combustível efetivo, exclusividade de posto, lista única de manutenção e processos de pagamento assistidos, com correções de persistência e abas.

## Estado inicial verificado
- HML: D:/FROTAS/frota_emprestimos_testes, feature/contracts-balances-hml-20261022, HEAD3bea6c9, limpo. Últimos gates474 frontend,698 backend,34 PostgreSQL real.
- Produção: D:/FROTAS/frota_certificado_homologacao, main, HEADc2226ac, limpo; schema esperado0055. Main remoto consultado antes da preparação.
- Diferença14 commits/163 arquivos, sem mudança de dependências ou scripts ativos de inicialização. Migrations0056–0059 aditivas; nenhuma abre saldos ou vincula histórico.
- API8000/frontend3000/PG5432; watchdog local controla disponibilidade. HML6969/PG5441. Cloudflare compartilhado não exige reinício.
- Autorização expressa supera a restrição de publicação HML da iniciativa visual. Não executar redesign novo nesta fase.

## Arquivos previstos
Fontes já validadas da branch HML, quatro migrations, este plano e status. Scripts/evidências privadas em storage/backups/20261026-contracts-kpis na produção; nunca versionar configurações, dumps, uploads, credenciais ou fixtures.

## Alterações funcionais proibidas
Não copiar dados HML para produção, confirmar saldos, criar preços/vínculos/pedidos fictícios, alterar permissões ou efetuar pagamentos para QA. Não reiniciar PostgreSQL, Cloudflare, frontend preview ou HML. Não restaurar/downgrade de banco automaticamente.

## Passos de implementação
1. [x] Conferir diff, ambientes, autorização e fluxo anterior de publicação.
2. [ ] Backup inicial consistente, anexos/configurações/build/Git; preparar candidato com configuração própria de produção.
3. [ ] Reexecutar testes/lint/build; testar migração0055→0059 em cópia descartável e preservar todas as colunas originais.
4. [ ] PR para main com checks obrigatórios, merge pelas proteções existentes e conferir árvore do candidato.
5. [ ] Pausa breve do watchdog/API8000, backup final e fingerprints, fast-forward, migrations e validação dos dados antes de reabrir.
6. [ ] Habilitar exclusivamente CONTRACT_BALANCE_ENABLED=true em produção; preservar demais parâmetros, assinaturas, cookies e chaves.
7. [ ] Iniciar API, publicar frontend sem faixa HML, reativar watchdog em finally; conferir endpoints em leitura, assets públicos e UI.
8. [ ] Registrar resultado, pendências de configuração e evidências.

## Validação visual
KPIs/ícones, contratos e dados pendentes, abas de processo, telas de abastecimento/manutenção, desktop e celular nos dois temas. Apenas consulta/abertura/cancelamento de formulários, sem gravação operacional. Preservar guia HML do usuário.

## Testes e build
Backend padrão com flag financeiro desabilitado nos fakes; suíte financeira em PostgreSQL descartável com flag habilitado. Frontend completo/lint e build production em candidato isolado. CI backend-tests/frontend-tests/container-smoke obrigatório. Cópia do dump real somente para banco descartável do cluster5441; migrar e comparar hashes das colunas anteriores, verificar novas colunas nulas e novas tabelas vazias.

## Resultado
Em preparação.

## Pendências / decisões
Contratos de produção continuam pendentes de rede/preços/vigência e abertura de saldo conferida pelo gestor. Não transportar configurações fictícias da homologação nem deduzir valores por nomes. Pedidos herdados precisam vínculo/reserva explícitos. Rotina06h segue destinada exclusivamente à HML; após a promoção os schemas ficam alinhados.

## Rollback
Backup privado de produção em storage/backups/20261026-contracts-kpis. Se necessário, restaurar código/index/configuração anteriores e reiniciar somente API, mantendo schema aditivo e novas gravações. Watchdog sempre reativado em finally. Restaurar banco apenas em recuperação assistida e autorizada, nunca automaticamente.
