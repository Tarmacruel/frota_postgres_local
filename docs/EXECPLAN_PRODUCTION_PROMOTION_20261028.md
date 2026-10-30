# ExecPlan — Publicar a homologação validada — produção — 28/10/2026

## Objetivo
Publicar em produção todas as melhorias já validadas na HML, por ordem expressa do usuário, antes de iniciar a expansão do padrão de formulários. Não incluir o redesign futuro nesta publicação.

## Estado inicial verificado
- HML limpa em56e107b, nova branch release/hml-promotion-20261028. Fonte anterior de produção main31543d4, limpa; sua árvore é idêntica a origin/main a216fa4, já ancestral da HML.
- Histórias equivalentes de produção foram unidas em merge de histórico com estratégia ours após conferir igualdade de árvores e ancestralidade. Nenhum arquivo HML alterado; isso permite fast-forward auditável do clone produtivo e preserva todos os commits locais.
- Diff:131 arquivos, itens/aditivos/quantidades, melhorias de integração financeira/operacional, abastecimentos compactos com abas e filtros, detalhes/progressão/formulários de empréstimos e orientação temporal de posses. Dependências inalteradas.
- Migrations0060_contract_items e merges0061/0062 aditivas; origem produtiva0061_network_value_fuel. Novas tabelas vazias, sem backfill ou confirmação automática.
- Backup privado em storage/backups/20261028-hml-promotion na produção. API8000/PID2512, HML6969/PID21432, PostgreSQL5432/5441. Watchdog produtivo executa como SYSTEM; elevação Windows necessária somente na ativação, após todo o candidato estar pronto.
- Gates HML anteriores:629 frontend/86 arquivos; lint zero erros/39 avisos; backend padrão719 (integrações descartáveis separadas),89 PostgreSQL financeiro e35 direcionados de responsabilidade temporal. Revalidar o candidato e o CI.

## Arquivos previstos
Somente fontes já validadas, migrations aditivas e documentação desta publicação. Candidato isolado com configuração de frontend própria de produção. Scripts, dumps, uploads, configurações e logs privados não entram no Git.

## Alterações funcionais proibidas
Não copiar dados HML, cadastrar itens/preços/pedidos fictícios, confirmar saldos/quantidades, efetuar pagamentos ou criar assinaturas para QA. Não restaurar banco oficial nem fazer downgrade. Não parar PostgreSQL, Cloudflare, frontend preview ou HML. Preservar rede por valor, histórico e permissões. Alterar apenas CONTRACT_QUANTITY_ENABLED na configuração para ativar o comportamento já validado; demais parâmetros permanecem iguais.

## Passos de implementação
1. [x] Inventário, autorização, confronto de árvores/histórias e branch.
2. [x] Backup consistente de produção, fontes/build/configurações/anexos e candidato isolado.
3. [x] Testes/lint/build, PostgreSQL descartável e ensaio da migração sobre cópia da produção com comparação de todas as colunas anteriores.
4. [x] PR para main, três checks obrigatórios e conferência da árvore resultante; sem contornar proteção ou disparar deploy remoto.
5. [x] Ativação exclusiva de produção com pausa breve de watchdog/API, backup final, fast-forward, migrations, integridade e reversão preparados.
6. [x] Readiness, assets, consultas protegidas e QA desktop/mobile/temas sem operações produtivas de teste; documentação final.
7. [x] Após produção concluída, iniciar nova fase de formulários globais somente na HML, com ExecPlan próprio.

## Validação visual
Conferir empréstimos e lotação sugerida, clique na linha, navegação compacta de abastecimentos e configuração dos itens/aditivos, claro/escuro e mobile. A lista de ordens pode expirar registros; testes que a alterem ficam na cópia descartável, não na QA produtiva. Não fechar/preencher o rascunho atual do usuário.

## Testes e build
Suítes completas backend/frontend, lint e build explícito production. Integrações financeiras em banco descartável no cluster5441. Ensaiar0061_network_value_fuel→0062_items_network_merge a partir do dump consistente; verificar todos os dados/colunas anteriores, tabelas novas vazias e flags próprias. CI backend-tests/frontend-tests/container-smoke obrigatório. Três testes antigos de empréstimos PostgreSQL com falhas já reproduzidas na base são documentados, não usados para liberar regras novas.

## Resultado
Publicação concluída em28/10/2026 às14:37:16, merge0cd053c da PR81. API8000/PID5804 pronta, watchdog reativado e HML6969/PID21432 preservada. Código, configurações, dump consistente final e reversão preparados na pasta privada indicada. Migração0062 preservou todas as colunas/registros anteriores de67 tabelas; sete novas tabelas inicialmente vazias. Nenhum cadastro/abertura/pedido de teste em produção.

Candidato:727 testes backend/201 pulados,78 PostgreSQL financeiro descartável,629 frontend/86 arquivos, lint zero erros/39 avisos anteriores, build production aprovado. CI backend-tests/frontend-tests/container-smoke verdes no candidato7cea5c4. Um teste de scroll foi corrigido para aguardar o requestAnimationFrame já existente, sem mudança de aplicação.

Pós-publicação:19 consultas autenticadas com transações PostgreSQL obrigatoriamente read-only,12 filtros de KPI e detalhe financeiro legado aprovados; nove assets públicos conferidos, health oficial/HML e proteção401 aprovados. GETs de contratos/elegibilidade e ordens que liberam reservas expiradas foram exercitados somente na cópia descartável (22 rotas,13 filtros,3 contratos), pois podem efetuar manutenção de estado. Não relaxamos a barreira de escrita na sondagem oficial.

QA autenticada: novo empréstimo, progressão, obrigatórios/erros, regularização, desktop1280×720/mobile390×844 e temas claro/escuro. Sem overflow ou gravação de teste; tema/viewport restaurados e guias do usuário preservadas. Capturas privadas production-desktop.png, production-mobile.png e production-dark.png. Próxima fase iniciada em branch HML separada.

## Pendências / decisões
Contratos fixos/manutenção passam a exigir conferência quantitativa pelo gestor antes de novos pedidos; não serão preenchidos automaticamente. Rede por valor mantém o fluxo validado, sem preço por litro ou reserva estimada obrigatórios. Rotina06h permanece pela entrada autorizada e aplica migrations antes de trocar o banco HML; não executar cópia extra nesta fase.

## Rollback
Restaurar código/build/configuração anterior e reiniciar somente a API se necessário, mantendo schema aditivo e novas gravações. Reativar watchdog em finally. Banco/downgrade não são rollback automático; dump é reserva de recuperação assistida. HML permanece intacta até a produção estar validada.
