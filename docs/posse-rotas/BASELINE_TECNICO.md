# Baseline técnico — Fase 0

Data da coleta: **2026-07-10**, fuso `America/Sao_Paulo`.

## 1. Escopo e método

Este documento registra o estado observado da branch obrigatória, sem alteração de código funcional, migration ou banco. O fluxo de posse foi reproduzido por rastreamento ponta a ponta do formulário, cliente HTTP, router, service, repository, modelos, arquivos e auditoria. Não foi criada posse de teste no banco local porque não há fixture E2E isolada e o banco existente está à frente do código desta branch.

Todos os 13 arquivos existentes em `docs/posse-rotas` foram lidos antes da coleta. As únicas alterações da Fase 0 são documentais.

## Atualização após o desbloqueio da Fase 1

Atualização executada em **2026-07-10**:

| Marco | Evidência |
|---|---|
| Baseline preservado | commit `6127290` |
| Merge explícito de `origin/modulo-analytics` | commit `9611f38` |
| Governança, RBAC e hard delete bloqueado | commit `7942826c678f79d11ecaa0b99d822bf5556cc3ba` |
| Divergência atual com produção | `origin/modulo-analytics...HEAD = 0 / 19`; nenhum commit de produção ausente |
| Alembic | `heads` e `current` em `0038_require_user_cpf`; `history --verbose` aprovado |
| Schema de `vehicle_possession` | inalterado: 31 colunas, 7 índices e 3 constraints |
| Testes backend | 81 aprovados em 6,54 s; permanece o warning conhecido do `pytest-asyncio` |
| Build frontend | aprovado; 1.071 módulos em 1 min 33 s; warning não bloqueante de chunks acima de 650 kB |

O código funcional da feature agora parte integralmente de produção. Os helpers experimentais `MasterDataContext.jsx`, `useAnalytics.js` e `lib/axios.js` foram removidos; os usos restantes de `localStorage` guardam somente tema/layout, nunca token.

As decisões institucionais foram formalizadas no ADR 002. O endpoint legado de DELETE de posse é não mutativo, audita a tentativa administrativa e responde `409 POSSESSION_HARD_DELETE_DISABLED`. `ADMIN` e `PRODUCAO` recebem os dados operacionais integrais definidos; `PADRAO` recebe documento mascarado, contato/URLs integrais/localização ausentes e não pode mutar assinaturas legadas; `POSTO` não acessa posses.

## Atualização após a Fase 1

Em **2026-07-11**, o commit funcional `61d3433` implantou request ID, contexto tipado, confiança explícita de proxy, CSRF com `Origin`/`Referer`, sanitização de novas auditorias, erros seguros e headers mínimos. A suíte pós-fase possui **95 testes aprovados** e o build Vite continua aprovado com 1.071 módulos. `alembic heads/current` permanecem em `0038_require_user_cpf`; nenhuma migration ou alteração de schema foi criada. O desenho, resultados, deploy, rollback e riscos residuais estão em `RELATORIO_FASE_1.md`.

Os quatro bloqueios listados na seção 10 foram resolvidos. A Fase 1 está liberada do ponto de vista de branch, Alembic, precedência documental e RBAC/LGPD, mas **não foi iniciada** neste desbloqueio.

## 2. Estado Git da coleta inicial — histórico

Após `git fetch origin`:

| Referência | SHA |
|---|---|
| Branch ativa `feat/posse-rotas-relatorios-devolucao` | `3f956950959f1e38e544ebff09071043db57359f` |
| `origin/feat/posse-rotas-relatorios-devolucao` | `3f956950959f1e38e544ebff09071043db57359f` |
| Origem/produção real `origin/modulo-analytics` | `bb3b094a9751d0b2ae72c47dc1384cde0580792b` |
| Destino futuro `origin/main` | `359ecc81daa652f6e7025dacfb7f112586656f19` |
| Merge-base feature/produção | `11f6be31ba7d112a7dbf86f17cabade933ce1d10` |

Observação de nomenclatura: os documentos usam “módulo-analytics” em prosa, mas a referência Git existente é `modulo-analytics`, sem acento.

Divergência observada:

- `origin/modulo-analytics...HEAD`: produção tem 86 commits exclusivos; a feature tem 16;
- `origin/main...HEAD`: `main` tem 3 commits exclusivos; a feature tem 49;
- `origin/main...origin/modulo-analytics`: `main` tem 3 commits exclusivos e produção tem 119;
- diferença de produção contra `main`: 343 arquivos, 44.697 inserções e 4.599 remoções no lado de produção desde o merge-base;
- a feature adiciona principalmente os documentos deste plano e alterações de analytics; a produção alterou posse, autenticação, autorização, auditoria, testes, migrations e diversos módulos desde a criação da feature.

A árvore estava limpa antes da Fase 0 e continua contendo somente os quatro artefatos documentais desta fase ao final.

## 3. Ambiente

| Componente | Versão/estado observado |
|---|---|
| Sistema | Windows/PowerShell, workspace em unidade de rede |
| Python | `3.12.10` |
| FastAPI | `0.115.12` |
| SQLAlchemy | `2.0.38` |
| Alembic | `1.14.1` |
| pytest | `8.3.4` |
| Node.js | `v24.14.0` |
| npm | `11.12.1` |
| Vite instalado | `6.4.2` |
| React instalado | `18.3.1` |
| PostgreSQL client/server | `16.13`, 64-bit |
| Ambiente da aplicação | `development` |
| Cookie seguro no ambiente carregado | `COOKIE_SECURE=False` |
| Storage resolvido | `backend/storage` no workspace de rede |

O `package.json` usa intervalos (`^`) e o `npm list --depth=0` mostrou versões instaladas superiores a alguns mínimos declarados, além de dependências extraneous. O projeto não declara `engines` para Node/npm.

## 4. Inventário do backend

### 4.1 Aplicação e camadas

- FastAPI em `backend/app/main.py`, com routers de autenticação, auditoria, notificações, usuários, cadastros mestres, condutores, veículos, manutenções, posses, sinistros, multas, abastecimentos, busca e analytics.
- Organização em `api/routes`, `schemas`, `services`, `repositories` e `models`.
- SQLAlchemy assíncrono na aplicação; Alembic converte `postgresql+asyncpg` para `postgresql+psycopg`.
- A sessão é entregue por request e não possui commit/rollback automático em `get_db_session`; os services fazem commits explícitos.
- O service de posse controla commit/rollback, mas o repository `end_active_for_vehicle` executa `UPDATE` em massa sem lock de linha.
- Erros de domínio usam `HTTPException`; não há handler global com request ID nem envelope uniforme.

### 4.2 Domínio atual de posse

Arquivos centrais:

- `models/possession.py`: `VehiclePossession`;
- `models/possession_photo.py`: galeria de evidências;
- `schemas/possession.py`: create, end, admin update e respostas;
- `repositories/possession_repository.py`;
- `services/possession_service.py`;
- `api/routes/possession.py`.

O modelo da branch contém veículo, snapshot do condutor, período, observação, hodômetros `Float`, foto legada, galeria de fotos, coordenadas e um documento assinado. Existe índice parcial único `uq_possession_active` por veículo com `end_date IS NULL`. A FK de veículo usa `ON DELETE CASCADE`; fotos também são apagadas em cascata. Não existem rota, destino, confirmação versionada de devolução ou número público da posse nesta branch.

Modelos relacionados:

- `Driver`: nome, documento obrigatório, contato, e-mail, categoria/validade da CNH, flag `ativo` e índices parciais para documento ativo; a posse guarda também um snapshot desses dados;
- `Vehicle`: placa/chassi únicos, marca, modelo, tipo, propriedade e status; relaciona posses com `passive_deletes`, enquanto a FK da posse define o cascade real no banco;
- `User`: nome, e-mail, hash de senha, enum `ADMIN/PRODUCAO/PADRAO` e timestamps; não possui flag ativo nesta branch;
- `AuditLog`: snapshot de ator/perfil, ação, entidade, rótulo, JSON de detalhes e timestamp; FK do ator usa `SET NULL`;
- `VehiclePossessionPhoto`: arquivo, MIME, tamanho, captura e geolocalização; FK para posse com `CASCADE`.

### 4.3 Autenticação e sessão

- Login gera JWT com `sub`, `role` e `exp`, armazenado no cookie `access_token`.
- Cookie: `HttpOnly`, `SameSite=Lax`, `path=/`, duração de 60 minutos; `Secure` depende de configuração e está falso no ambiente observado.
- `get_current_user` decodifica o JWT e recarrega o usuário pelo UUID no banco a cada request. O papel efetivo vem do registro atual do banco, não do payload cliente.
- Não há atributo de usuário ativo/bloqueado no modelo desta branch.
- Login possui rate limiting em memória, inadequado para múltiplos processos/reinícios.
- Não há proteção CSRF, validação de `Origin`/`Referer` ou correlation/request ID nesta branch.
- CORS permite credenciais, lista explícita de origens, porém libera todos os métodos e headers.
- Não há middleware de headers de segurança (`CSP`, `nosniff`, frame protection, `Referrer-Policy`) nem `no-store` global em respostas sensíveis.

### 4.4 Autorização

As dependências efetivas são:

- `get_current_user`: qualquer `ADMIN`, `PRODUCAO` ou `PADRAO` autenticado;
- `require_writer`: `ADMIN` e `PRODUCAO`;
- `require_admin`: somente `ADMIN`.

No módulo de posses:

| Operação | ADMIN | PRODUCAO | PADRAO | Implementação |
|---|:---:|:---:|:---:|---|
| Listar/detalhes agregados | Sim | Sim | Sim | `get_current_user` |
| Ver foto/documento | Sim | Sim | Sim | apenas autenticação |
| Criar posse | Sim | Sim | Não | `require_writer` |
| Encerrar posse | Sim | Sim | Não | `require_writer` |
| Editar retroativamente | Sim | Não | Não | `require_admin` |
| Consultar auditoria | Sim | Não | Não | `require_admin` |
| Exportar PDF/XLSX no navegador | Sim | Sim | Sim | dados já recebidos pela listagem |

Não existe escopo por secretaria/organização nesta branch. A API retorna `driver_document` e `driver_contact` integrais para todos os perfis autenticados; somente coordenadas são omitidas para não administradores. Isso diverge da matriz LGPD.

### 4.5 Auditoria

- `AuditService.record` grava ator, e-mail, perfil, ação, tipo/ID/rótulo da entidade, JSON de detalhes e timestamp.
- A consulta é exclusiva de `ADMIN`, com limite máximo de 300.
- Não existe delete de auditoria na API.
- Criação, encerramento e edição de posse são auditados na mesma transação da mudança principal.
- Edição administrativa registra justificativa e `before/after`.
- A criação registra documento e contato integrais do condutor em `details`, além de nome do arquivo e metadados: excesso frente à matriz LGPD.
- Não são registrados request ID, IP, User-Agent ou resultado padronizado.
- Preview/exportação de posse e download de arquivos não geram evento de auditoria.

### 4.6 Armazenamento de arquivos

- Diretórios físicos: `possession_photos/<uuid>.<ext>` e `possession_documents/<possession_id>.<ext>` sob `settings.STORAGE_DIR`.
- Fotos aceitas: JPEG, PNG e WEBP, até 8 MB cada.
- Documento aceito: PDF, JPEG, PNG, WEBP, DOC e DOCX, até 12 MB; opcional na criação.
- A validação confia em `UploadFile.content_type`; não há inspeção de assinatura/MIME real nem antivírus.
- Nome físico é opaco; nome original é saneado e limitado a 120 caracteres para download/metadados.
- Downloads exigem autenticação e usam `Cache-Control: private, no-store, max-age=0`.
- A autorização do download verifica apenas autenticação, não escopo adicional da posse.
- O caminho persistido é concatenado ao storage sem validação explícita de que o resultado permaneça dentro da raiz.
- Em erro de banco/arquivo na criação e edição, novos arquivos são removidos. A troca do documento antigo só o remove após commit.
- O banco não transaciona com o filesystem: queda do processo entre gravação física e compensação pode deixar órfãos.

### 4.7 Relatórios

- Para posses, veículos, condutores, manutenções, sinistros, multas, usuários e auditoria, o frontend recebe os registros e gera PDF com `jsPDF`/`jspdf-autotable` e XLSX com `zipcelx`.
- Em posses, a lista fixa contém veículo, condutor, documento, contato, início/fim, status, hodômetros e observação.
- Filtros e paginação do relatório de posse são aplicados no navegador; não existe registry autorizada no backend.
- PDF abre em blob URL; XLSX é baixado pelo navegador. Preview/exportação não são auditados.
- Não há neutralização explícita de formula injection antes de enviar textos ao XLSX.
- Analytics possui exportação no backend, mas o “PDF” atual é texto UTF-8 servido como `application/pdf`, não um PDF estruturado.

### 4.8 Testes backend

Há somente:

- `tests/test_smoke.py`: raiz e presença de rotas no OpenAPI;
- `tests/test_analytics_metrics.py`: quatro funções matemáticas;
- `tests/conftest.py`: `httpx.ASGITransport` e SQLite.

Não há testes de autenticação, RBAC, posse, upload, storage, auditoria de posse, transação, concorrência, CSRF, IDOR ou Alembic nesta branch.

## 5. Inventário do frontend

### 5.1 Estrutura

- React 18 + Vite + React Router + Axios.
- Rotas autenticadas sob `Layout`; usuários, analytics e auditoria usam `adminOnly`.
- `PossessionPage.jsx` possui 1.007 linhas e concentra listagem, filtros, paginação cliente, encerramento, edição administrativa, fotos, localização e exportação.
- `PossessionForm.jsx` possui 626 linhas e concentra seleção, câmera, geolocalização, canvas, anexos e submit.
- `Modal.jsx` usa portal, `role=dialog`, `aria-modal` e Escape, mas não implementa foco inicial, focus trap ou retorno de foco.

### 5.2 API, 401 e 403

- O cliente efetivamente importado é `src/api/client.js`, com base `/api` e `withCredentials=true`.
- Esse cliente não possui interceptor global de 401/403.
- `AuthContext` transforma qualquer falha de `/auth/me` em sessão ausente; telas operacionais apenas mostram a mensagem retornada por `getApiErrorMessage`.
- Existe um segundo cliente não utilizado em `src/lib/axios.js` que lê token de `localStorage`, envia `Authorization` e redireciona em 401. Ele contradiz a arquitetura de cookie HttpOnly e cria risco de uso acidental.
- `ProtectedRoute` protege autenticação e rotas admin, mas o backend permanece a barreira real.

### 5.3 Acessibilidade observada

Proteções existentes: labels em boa parte dos inputs, nomes textuais de status, `aria-modal`, fechamento por Escape e mensagens visuais de erro.

Lacunas: alguns labels sem `htmlFor`, ausência de `aria-live`, ausência de associação de erro por campo, modal sem gestão completa de foco, ausência de testes por teclado/leitor de tela e nenhuma ferramenta automatizada declarada.

### 5.4 Testes e build

`package.json` possui apenas `dev`, `build` e `preview`. Não há Vitest/Jest/Testing Library, script de teste, lint ou typecheck.

## 6. Reprodução do fluxo atual de posse

### 6.1 Criação

1. Apenas `ADMIN`/`PRODUCAO` veem “Nova posse” e o backend exige `require_writer`.
2. O frontend exige veículo, condutor cadastrado e pelo menos uma foto capturada.
3. A câmera só funciona em contexto seguro (`https` ou `localhost`), solicita geolocalização de alta precisão e gera JPEG via canvas.
4. São enviados `multipart/form-data`: veículo, snapshot do condutor, início opcional, hodômetro inicial opcional, observação opcional, metadados JSON e fotos. Documento assinado é opcional.
5. O backend exige nome do condutor com 3–150 caracteres e pelo menos uma foto com timestamp, latitude, longitude e precisão positiva. Confirma veículo e, quando informado, condutor ativo.
6. Arquivos são lidos integralmente em memória e validados por MIME declarado/tamanho.

### 6.2 Encerramento automático da posse anterior

1. O service busca a posse ativa do mesmo veículo sem lock.
2. Rejeita a nova posse apenas se o novo início for anterior ao início ativo.
3. Define o fim da posse anterior exatamente como `effective_start` da nova.
4. Executa `UPDATE vehicle_possession SET end_date=:effective_start` para toda posse ativa do veículo.
5. Se a nova posse tem hodômetro inicial, ele é usado como hodômetro final anterior quando este estava vazio. Se já havia hodômetro final, ele é preservado; uma divergência gera notificação administrativa, não bloqueio.
6. Não exige confirmação nem justificativa e não registra evento específico de substituição da posse anterior.
7. A nova posse, seus arquivos, auditoria e eventual notificação são confirmados em um único commit de banco. `IntegrityError` vira 409 e remove arquivos recém-gravados.

### 6.3 Evidência e documento

- Evidência obrigatória: uma ou mais fotos + data/hora + coordenadas + precisão.
- Documento assinado inicial: opcional; PDF/imagens/DOC/DOCX; máximo 12 MB.
- A API permite que `ADMIN` acrescente fotos sem geolocalização durante edição.
- Todos os autenticados podem baixar fotos/documento; somente `ADMIN` recebe coordenadas no JSON.

### 6.4 Encerramento manual

- `ADMIN` e `PRODUCAO` podem chamar `PUT /api/possession/{id}/end`.
- Data final ausente vira horário UTC atual; observação e hodômetro final são opcionais.
- Só há validação de data final não anterior ao início. Não há validação de hodômetro final >= inicial.
- Não há declaração, checkbox, termo de devolução, confirmação versionada ou bloqueio de rota aberta, pois rotas ainda não existem.
- O frontend mostra o botão “Encerrar” também ao perfil `PADRAO`; esse perfil recebe 403 do backend. É divergência de UX/RBAC.

### 6.5 Edição administrativa

- Somente `ADMIN`, via `PUT /api/possession/{id}` multipart.
- Pode alterar condutor, período, observação, ambos os hodômetros, substituir o documento e acrescentar fotos.
- Justificativa obrigatória, mínimo 8 caracteres.
- Se o período mudou, o service consulta todas as posses do veículo e rejeita sobreposição em Python; não usa lock.
- Registra `before/after`, motivo, troca de documento e quantidade de fotos na auditoria.
- Fotos antigas não são removidas; documento antigo é removido após commit quando substituído.

### 6.6 PDF/XLSX

- A tela carrega posses autenticadas, filtra por estado/veículo no backend em parte e por busca/paginação no navegador.
- `PossessionPage` define colunas fixas, incluindo documento e contato.
- PDF: `previewRowsToPdf` importa dinamicamente `jsPDF` e `jspdf-autotable`, monta cabeçalho institucional/tabela, gera blob e abre nova guia.
- XLSX: `exportRowsToXlsx` importa `zipcelx`, monta linhas institucionais/filtros/cabeçalhos e inicia o download.
- Nenhum dos formatos consulta um endpoint específico, valida colunas no backend ou registra auditoria.

### 6.7 Auditoria e perfis

- `ADMIN`: todas as operações acima, coordenadas e auditoria.
- `PRODUCAO`: consulta, criação e encerramento; sem edição retroativa, coordenadas ou auditoria.
- `PADRAO`: consulta, fotos/documentos e exportação; sem mutações no backend. O botão de encerramento indevido permanece visível.

## 7. Banco e Alembic da coleta inicial — histórico

### 7.1 Resultado dos comandos

`alembic heads` retornou dois heads:

```text
0014_fleet_analytics (head)
10d2f34e089d (head)
```

`alembic history --verbose` passou e mostrou duas linhas descendentes de `0009_fines_module`: uma até `0014_fleet_analytics`, outra mergeando `0009_fines_module` e `4842680f7abd` em `10d2f34e089d`.

`alembic current` falhou:

```text
FAILED: Can't locate revision identified by '0038_require_user_cpf'
```

O catálogo confirmou que `alembic_version.version_num = 0038_require_user_cpf`. Essa migration existe em `origin/modulo-analytics`, mas não na feature.

### 7.2 Schema real de `vehicle_possession`

O banco contém 31 colunas. Além das colunas conhecidas pela feature, já existem:

- `return_document_path/name/mime_type/size_bytes/uploaded_at`;
- `loan_term_validation_code`;
- `return_term_validation_code`.

Índices reais:

- PK `vehicle_possession_pkey`;
- `idx_possession_vehicle`;
- `idx_possession_driver`;
- `ix_vehicle_possession_driver_id`;
- parcial único `uq_possession_active` por veículo ativo;
- únicos para os dois códigos de validação de termo.

Constraints reais: PK e FKs de veículo (`CASCADE`) e condutor (`SET NULL`). Não há checks de datas ou hodômetros.

O banco possui diversas tabelas que o código da feature não conhece, incluindo permissões granulares, importações, pagamentos, postos, ordens e assinaturas digitais. Isso comprova incompatibilidade estrutural entre código e banco.

### 7.3 Backup/restauração

- `scripts/backup-local.ps1` usa `pg_dump`, cria `database.sql`, copia ambiente/storage, compacta ZIP, gera SHA-256 e aplica retenção.
- `scripts/start_local_postgres.ps1` restaura automaticamente o ZIP mais recente somente quando cria banco novo, extraindo `database.sql` e executando via `psql`.
- Há script legado `scripts/backup_frota.ps1` com porta padrão 5434, divergente da porta 5432 documentada.
- Nesta fase não foi executado backup/restauração, pois o plano pede apenas inventário e proíbe recriação; também não há evidência automatizada de teste de restauração.

## 8. Validações executadas

| Comando | Resultado real |
|---|---|
| `python -m pytest tests -q` | **Passou:** 6 testes em 1,45 s; warning de `asyncio_default_fixture_loop_scope` não definido |
| comando smoke documentado (`pytest tests/test_smoke.py -q`) | Coberto pela suíte completa; 2 testes smoke entre os 6 aprovados |
| `npm run build` | **Passou:** 369 módulos; build Vite em 35,11 s |
| `alembic heads` | **Passou:** dois heads listados |
| `alembic history --verbose` | **Passou** |
| `alembic current` | **Falhou como baseline:** revisão do banco ausente no código |
| `Diagnostico.ps1` | **Resultado inválido apesar de exit 0:** erros em `$Host`, `psql` fora do PATH e falso “System OK” |

Não executados porque não existem como scripts do projeto: testes frontend, lint e typecheck. Não foi executado smoke funcional com mutações contra o banco existente.

## 9. Divergências entre documentação e código

1. A origem é nomeada com acento nos documentos, mas a branch real é `modulo-analytics`.
2. O README raiz fala principalmente em `ADMIN`/`PADRAO`, mas o código também possui `PRODUCAO`.
3. A matriz exige mascaramento por perfil; a listagem de posses entrega documento/contato integrais a todos.
4. A matriz pede ocultar ações indisponíveis; `PADRAO` vê “Encerrar”.
5. O plano pressupõe baseline sobre produção atual, porém a feature está 86 commits atrás e o banco está na migration 0038.
6. A produção atual já possui permissões granulares, CSRF, termos de empréstimo/devolução, códigos públicos, assinatura e hard delete de posse; nada disso existe nesta feature e parte conflita com o ADR futuro.
7. O README afirma PostgreSQL 16 e porta 5432; o script legado de backup usa 5434.
8. O README diz que o frontend não grava token em `localStorage`, mas há cliente alternativo que tenta fazê-lo, embora não esteja em uso.
9. O diagnóstico declara sucesso mesmo após falhas internas.

## 10. Bloqueios identificados no baseline inicial

1. **Bloqueador:** decidir e executar, fora desta fase, estratégia segura para incorporar os 86 commits de `modulo-analytics` sem perder os 16 commits da feature. Fase 1 não deve ser implementada sobre a arquitetura obsoleta.
2. **Bloqueador:** restaurar a coerência Alembic código/banco; nenhuma migration nova pode ser criada enquanto `0038_require_user_cpf` for desconhecida pela branch.
3. **Bloqueador:** reconciliar o ADR com funcionalidades já existentes na produção: termos separados, endpoints públicos, assinatura digital, permissões granulares e delete de posse.
4. Confirmar institucionalmente itens `*` da matriz RBAC, especialmente downloads, relatórios, contato e localização.
5. Definir proxies confiáveis e configuração HTTPS para request context, cookie `Secure` e IP real.
6. Definir política de MIME real/malware, retenção e autorização de arquivos.
7. Criar ambiente E2E descartável ou fixture PostgreSQL compatível para reproduzir mutações sem tocar dados operacionais.

No instante da coleta original, nenhum item da Fase 1 havia sido implementado. A atualização de 2026-07-11 acima e o `RELATORIO_FASE_1.md` substituem essa conclusão para o estado atual da branch.

Status posterior: itens 1–4 resolvidos pelos commits `9611f38` e `7942826`; itens 5–7 permanecem como entradas de implementação/validação da própria Fase 1 e fases posteriores, não como divergências impeditivas de branch ou migration.
