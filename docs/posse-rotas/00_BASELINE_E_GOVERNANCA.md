# Fase 0 — Baseline, Inventário e Governança

## 1. Objetivo

Estabelecer uma linha de base reproduzível antes de qualquer alteração funcional. Esta fase não implementa o novo domínio. Ela confirma o estado real do repositório, do banco, das migrations, das permissões e dos testes.

## 2. Dependências

Ler integralmente:

- `README.md` deste diretório;
- `ADR_001_MODELO_POSSE_ROTA.md`;
- `MATRIZ_RBAC_LGPD.md`;
- `CHECKLIST_EXECUCAO.md`.

## 3. Escopo obrigatório

### 3.1 Git e branches

Registrar:

- branch ativa;
- SHA atual;
- SHA de origem em `módulo-analytics`;
- diferenças atuais entre a feature branch, `módulo-analytics` e `main`;
- arquivos modificados ou não rastreados no ambiente do Codex.

Não executar rebase, merge ou force push nesta fase.

### 3.2 Backend

Inventariar:

- aplicação FastAPI e inclusão dos routers;
- autenticação e cookies;
- dependências `get_current_user`, `require_writer` e `require_admin`;
- modelos de posse, condutor, veículo, usuário, auditoria e anexos;
- services e repositories envolvidos;
- tratamento de transações e `commit/rollback`;
- padrões de erro;
- geração atual de PDF/XLSX;
- armazenamento de arquivos;
- configuração de CORS e headers;
- testes existentes.

### 3.3 Frontend

Inventariar:

- `PossessionPage`;
- `PossessionForm`;
- API client;
- `AuthContext` e proteção de rotas;
- modais e componentes reutilizáveis;
- exportação atual;
- tratamento de 401/403;
- acessibilidade existente;
- testes e ferramentas de build.

### 3.4 Banco e Alembic

Executar e registrar:

- `alembic heads`;
- `alembic current`;
- `alembic history --verbose`;
- tabelas, índices e constraints atuais de `vehicle_possession`;
- existência de múltiplos heads;
- versão do PostgreSQL;
- estratégia atual de backup e restauração.

Não criar migration nesta fase.

### 3.5 Baseline de validação

Executar os comandos existentes e registrar resultados reais:

- testes backend;
- build frontend;
- testes frontend, se existirem;
- lint/typecheck, se existirem;
- smoke test documentado no projeto.

Caso um comando falhe antes das alterações, registrar como falha de baseline. Não corrigir débitos não relacionados sem autorização.

### 3.6 Fluxo atual

Reproduzir e documentar:

1. criação de posse;
2. encerramento automático de posse anterior;
3. captura de evidência;
4. anexo de documento;
5. encerramento da posse;
6. edição administrativa;
7. exportação PDF/XLSX;
8. consulta de auditoria;
9. comportamento de cada perfil.

## 4. Entregáveis

Criar ou atualizar:

- `docs/posse-rotas/BASELINE_TECNICO.md`;
- `docs/posse-rotas/DIAGRAMA_COMPONENTES.md` em Mermaid;
- `docs/posse-rotas/RISCOS_E_DEBITOS.md`;
- `CHECKLIST_EXECUCAO.md` com evidências reais.

O baseline deve conter comandos, versões, datas, resultados e limitações do ambiente.

## 5. Fora do escopo

- alterar models;
- criar migration;
- adicionar endpoint;
- alterar autenticação;
- refatorar `PossessionPage`;
- corrigir todo débito técnico encontrado;
- alterar branch de produção.

## 6. Critérios de aceitação

- estado do repositório reproduzível;
- fluxo atual documentado;
- heads do Alembic conhecidos;
- baseline de testes registrado;
- matriz RBAC confrontada com o código;
- riscos classificados por severidade;
- nenhuma mudança funcional introduzida.

## 7. Prompt para o Codex

```text
Trabalhe exclusivamente na Fase 0 do plano localizado em:

docs/posse-rotas/00_BASELINE_E_GOVERNANCA.md

Repositório: Tarmacruel/frota_postgres_local
Branch obrigatória: feat/posse-rotas-relatorios-devolucao
Branch de origem/produção atual: módulo-analytics
Destino futuro, não nesta fase: main

Antes de começar:
1. Confirme a branch ativa e o SHA.
2. Leia todos os documentos de docs/posse-rotas.
3. Não altere código funcional.
4. Não crie migration.
5. Não execute merge, rebase, reset, force push, drop ou recriação de banco.

Execute o inventário completo do backend, frontend, autenticação, autorização,
auditoria, armazenamento de arquivos, relatórios, testes e Alembic.

Reproduza o fluxo atual de posse e registre exatamente:
- como a posse ativa anterior é encerrada;
- quais dados e arquivos são exigidos;
- como a edição administrativa funciona;
- como PDF/XLSX são gerados;
- quais permissões cada perfil possui;
- quais proteções existem ou faltam.

Execute somente os comandos de validação já previstos no projeto. Uma falha prévia
deve ser registrada como baseline, não ocultada nem atribuída à futura implementação.

Entregue:
- BASELINE_TECNICO.md;
- DIAGRAMA_COMPONENTES.md com Mermaid;
- RISCOS_E_DEBITOS.md;
- atualização verificável do CHECKLIST_EXECUCAO.md.

No relatório final, informe:
- arquivos criados/alterados;
- comandos executados;
- resultados reais;
- heads do Alembic;
- versões do ambiente;
- divergências entre documentação e código;
- bloqueios para a Fase 1.

Não avance para a Fase 1.
```