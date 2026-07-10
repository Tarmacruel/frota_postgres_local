# Fase 8 — Testes Integrados, Rollout e Integração com `main`

## 1. Objetivo

Validar a implementação completa em condições próximas ao ambiente real, ensaiar migration, backup e rollback, preparar implantação controlada e abrir Pull Request final para `main` sem merge automático.

## 2. Regra de branches

- origem histórica desta implementação: `módulo-analytics`;
- branch de trabalho: `feat/posse-rotas-relatorios-devolucao`;
- destino final solicitado: `main`.

Antes do PR final:

1. buscar o estado remoto mais recente;
2. confirmar que a feature contém todas as mudanças necessárias de `módulo-analytics`;
3. analisar a divergência entre `main` e `módulo-analytics`;
4. definir estratégia de integração sem perder código que hoje está em produção;
5. resolver conflitos na feature ou em branch de integração, nunca diretamente em produção;
6. repetir todos os testes após a sincronização.

Se `main` estiver defasada em relação a `módulo-analytics`, documentar explicitamente. Não abrir PR que remova silenciosamente funcionalidades existentes em produção.

## 3. Congelamento funcional

Nesta fase:

- não adicionar funcionalidade nova;
- não alterar schema sem bloqueio crítico e nova migration revisada;
- não realizar refatoração estética ampla;
- aceitar apenas correção de defeito, segurança, migration, teste ou documentação de rollout.

## 4. Matriz integrada de testes

### 4.1 Backend

Executar suíte completa e incluir:

- autenticação e sessão;
- CSRF;
- RBAC;
- posse sem rota;
- posse com rota inicial;
- substituição explícita;
- rota/destino/retorno/cancelamento;
- concorrência;
- IDOR;
- devolução e versionamento;
- termo;
- relatórios;
- uploads/downloads;
- auditoria;
- legado;
- paginação/filtros;
- migrations.

### 4.2 Frontend

Executar:

- testes unitários/componentes;
- fluxo integrado com API de teste;
- build de produção;
- navegação por teclado;
- viewport móvel e desktop;
- sessão expirada;
- conflito concorrente;
- download/preview;
- presets e colunas.

### 4.3 Smoke test manual

Roteiro mínimo:

1. login `ADMIN`;
2. criar posse sem rota;
3. iniciar rota com dois destinos;
4. adicionar terceiro destino;
5. registrar retorno;
6. iniciar segunda rota;
7. registrar retorno;
8. encerrar posse com declaração;
9. abrir termo consolidado;
10. gerar relatório resumido;
11. gerar relatório personalizado autorizado;
12. consultar auditoria;
13. repetir verificações com `PRODUCAO` e `PADRAO`;
14. validar registro legado.

Não utilizar dados pessoais reais no ambiente de teste quando não necessário.

## 5. Ensaio de migration

Usar cópia recente e protegida do banco, nunca o banco de produção durante o ensaio.

Procedimento:

1. criar backup verificável;
2. restaurar em ambiente de ensaio;
3. registrar versão/heads antes;
4. registrar contagens das tabelas críticas;
5. executar migration;
6. medir duração;
7. verificar locks e indisponibilidade;
8. validar números públicos e constraints;
9. executar smoke test;
10. comparar contagens e amostras;
11. testar restauração do backup em ambiente descartável.

O downgrade Alembic não deve ser apresentado como único rollback quando puder apagar dados novos. O rollback operacional preferencial é restaurar backup e versão anterior da aplicação, conforme janela de implantação.

## 6. Desempenho

Avaliar:

- listagem de posses;
- carregamento de timeline;
- relatório por período significativo;
- geração PDF/XLSX;
- queries e `EXPLAIN` das rotas críticas;
- uso de índices;
- N+1;
- memória durante exportação;
- timeout e limites;
- concorrência de operadores.

Registrar métricas comparáveis, sem exigir benchmark artificial incompatível com o ambiente.

## 7. Plano de implantação

Documentar em `docs/posse-rotas/PLANO_IMPLANTACAO.md`:

- pré-requisitos;
- backup;
- janela;
- versão/commit;
- variáveis novas;
- instalação de dependências;
- migration;
- build frontend;
- reinício controlado;
- healthcheck;
- smoke test;
- monitoramento;
- responsáveis;
- critério de abortar.

## 8. Plano de rollback

Documentar em `docs/posse-rotas/PLANO_ROLLBACK.md`:

- gatilhos;
- parada segura;
- restauração de versão anterior;
- restauração do banco;
- tratamento de arquivos criados após o backup;
- validação pós-rollback;
- comunicação;
- preservação de logs e evidências.

Não executar rollback real em produção nesta fase.

## 9. Pull Request final

Título sugerido:

`feat: separar posse, rotas, devolução e relatórios da frota`

O corpo deve conter:

- problema;
- solução;
- arquitetura;
- alterações de banco;
- endpoints;
- telas;
- autorização;
- LGPD;
- auditoria;
- acessibilidade;
- testes;
- migration;
- implantação;
- rollback;
- riscos;
- evidências.

Anexar checklist completo. Não marcar como pronto para merge se houver item crítico pendente.

## 10. Critérios de aprovação

- todas as fases concluídas com evidências;
- nenhum crítico/alto de segurança aberto sem decisão formal;
- migration ensaiada em cópia;
- backup restaurado em teste;
- build e suítes passam;
- fluxo manual validado por perfil;
- desempenho aceitável;
- planos de implantação e rollback completos;
- divergência com `main` resolvida sem perda do estado de produção;
- PR aberto sem merge automático.

## 11. Prompt para o Codex

```text
Execute exclusivamente a Fase 8 descrita em:

docs/posse-rotas/08_TESTES_ROLLOUT_E_INTEGRACAO_MAIN.md

Branch obrigatória durante validação:
feat/posse-rotas-relatorios-devolucao

Origem de produção atual: módulo-analytics
Destino final solicitado: main

Não adicione funcionalidades novas. Faça apenas correções indispensáveis encontradas
nos testes, com commits separados e justificativa.

Primeiro, confirme o estado remoto e compare:
- feature x módulo-analytics;
- módulo-analytics x main;
- feature x main.

A feature foi criada da branch de produção. Não permita que o PR final remova código
que existe em módulo-analytics mas ainda não está em main. Documente e resolva a
estratégia de integração antes de abrir o PR.

Execute:
- suíte backend completa;
- suíte frontend completa;
- build de produção;
- lint/typecheck;
- smoke test por perfil;
- testes de segurança;
- ensaio de migration em cópia do banco;
- backup e restauração em ambiente descartável;
- análise de performance, índices e N+1;
- validação do termo e dos relatórios.

Crie:
- PLANO_IMPLANTACAO.md;
- PLANO_ROLLBACK.md;
- RELATORIO_VALIDACAO_FINAL.md;
- atualização final do CHECKLIST_EXECUCAO.md.

O relatório deve conter comandos reais, resultados, duração da migration, contagens
antes/depois, riscos residuais e evidências. Não declare teste executado sem saída
ou registro verificável.

Após sincronizar e repetir os testes, abra Pull Request para main com descrição
completa. Não faça merge automático, não altere diretamente main e não altere
diretamente módulo-analytics.

Se main estiver defasada ou houver conflito que possa remover funcionalidade de
produção, não improvise: documente o bloqueio e deixe o PR como draft ou não o abra
até a estratégia ser validada.
```