# Fase 1 — Segurança, Auditoria e Contexto de Requisição

## 1. Objetivo

Criar a infraestrutura transversal necessária para que as fases de domínio registrem autoria e contexto técnico de forma uniforme, com proteção efetiva das mutações realizadas por cookie autenticado.

Esta fase deve ser concluída antes das tabelas e endpoints de rotas.

## 2. Pré-condições

- Fase 0 concluída e documentada.
- Baseline de testes conhecido.
- Fluxo de autenticação e CORS confirmado no código real.
- Ambiente local e publicação institucional identificados.

## 3. Escopo técnico

### 3.1 Request/correlation ID

Implementar middleware que:

- aceite um request ID externo somente após validação estrita de formato e tamanho;
- gere UUID seguro quando ausente ou inválido;
- disponibilize o ID no contexto da requisição;
- devolva o ID em header de resposta;
- permita associação entre erro, auditoria e log;
- não confie em valor arbitrário sem normalização.

### 3.2 Contexto de auditoria

Criar estrutura tipada, por exemplo `RequestAuditContext`, contendo:

- request ID;
- IP normalizado;
- User-Agent limitado;
- método HTTP;
- path normalizado;
- timestamp UTC.

A resolução do IP deverá considerar proxy reverso somente quando a configuração de proxies confiáveis estiver explicitamente definida. Não aceitar cegamente o primeiro `X-Forwarded-For`.

Ampliar o `AuditService` sem quebrar chamadas existentes. Preferir método ou parâmetro opcional centralizado, evitando repetição manual em cada endpoint.

### 3.3 CSRF

Como a autenticação utiliza cookie, avaliar e implementar proteção contra CSRF em operações de alteração de estado.

Requisitos mínimos:

- token CSRF emitido por endpoint autenticado ou integrado ao fluxo de sessão;
- token enviado em header específico nas mutações;
- validação server-side em `POST`, `PUT`, `PATCH` e `DELETE` autenticados;
- cookie CSRF separado, quando adotado double-submit, sem dados de autenticação;
- validação adicional de `Origin` e, quando apropriado, `Referer`;
- exceções explícitas apenas para login/logout quando tecnicamente justificadas;
- CORS sem wildcard com credenciais;
- testes de token ausente, inválido e origem indevida.

A implementação deve preservar cookie de autenticação `HttpOnly`. Não transferir JWT para localStorage.

### 3.4 Autorização e usuário ativo

Confirmar que:

- o usuário é carregado do banco em cada requisição autenticada;
- usuário removido, inativo ou bloqueado não continua autorizado;
- papel enviado no payload ou existente apenas no JWT não substitui o papel atual do banco;
- `require_writer` e `require_admin` são aplicados no backend;
- respostas `401` e `403` são consistentes.

Caso não exista atributo de usuário ativo, apenas documentar a necessidade; não criar regra de negócio não validada sem decisão na Fase 0.

### 3.5 Tratamento de erros e logs

Garantir:

- mensagem segura ao cliente;
- request ID na resposta de erro;
- stack trace somente no log interno adequado;
- ausência de token, cookie, senha, CPF integral, contato integral ou binário em log;
- limite de tamanho para User-Agent e campos de auditoria;
- timestamps UTC.

### 3.6 Headers de segurança mínimos

Nesta fase, implementar apenas o conjunto compatível e confirmado pelo baseline:

- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy` restritiva;
- proteção contra framing por CSP `frame-ancestors` ou header equivalente;
- `Cache-Control: no-store` em respostas sensíveis;
- política de CSP inicialmente compatível, sem quebrar a aplicação.

O hardening integral será revisado na Fase 7.

## 4. Testes obrigatórios

- request ID é gerado e retornado;
- request ID inválido é substituído;
- IP de proxy não confiável não é aceito como origem real;
- mutação sem CSRF é rejeitada;
- token CSRF incorreto é rejeitado;
- origem não autorizada é rejeitada;
- requisição válida continua funcionando;
- perfil `PADRAO` não executa mutação de writer;
- perfil `PRODUCAO` não acessa operação de admin;
- auditoria recebe request ID, IP e User-Agent;
- auditoria não recebe cookie/token;
- erros contêm request ID sem detalhes sensíveis.

## 5. Arquivos esperados

A lista final depende do baseline, mas pode envolver:

- middleware/contexto em `backend/app/core` ou `backend/app/middleware`;
- dependência CSRF em `backend/app/api/deps.py` ou módulo dedicado;
- configuração em `backend/app/core/config.py`;
- ampliação de `backend/app/services/audit_service.py`;
- integração controlada em `backend/app/main.py`;
- interceptor Axios para header CSRF;
- testes backend e, quando pertinente, frontend;
- `.env.example` e documentação.

Não registrar segredos reais nos arquivos de exemplo.

## 6. Critérios de aceitação

- mutações autenticadas por cookie estão protegidas contra CSRF;
- request ID percorre resposta, erro e auditoria;
- autorização continua centralizada no backend;
- fluxo de login e operações existentes permanece funcional;
- testes de regressão passam ou falhas de baseline permanecem claramente separadas;
- nenhuma regra de rota/viagem é implementada nesta fase.

## 7. Prompt para o Codex

```text
Implemente exclusivamente a Fase 1 descrita em:

docs/posse-rotas/01_SEGURANCA_AUDITORIA_E_CONTEXTO.md

Branch obrigatória: feat/posse-rotas-relatorios-devolucao

Pré-condição: leia README, ADR, MATRIZ_RBAC_LGPD, CHECKLIST_EXECUCAO e todos os
entregáveis da Fase 0. Não presuma a arquitetura; confirme os arquivos e padrões reais.

Objetivos desta etapa:
1. request/correlation ID seguro;
2. contexto tipado de auditoria;
3. IP e User-Agent normalizados;
4. proteção CSRF coerente com autenticação por cookie HttpOnly;
5. validação de Origin/Referer nas mutações;
6. autorização baseada no usuário atual do banco;
7. tratamento seguro de erros e headers mínimos compatíveis.

Restrições:
- não implementar modelos ou endpoints de rotas;
- não alterar a regra funcional da posse;
- não mover JWT para localStorage;
- não usar CORS wildcard com credenciais;
- não confiar cegamente em X-Forwarded-For;
- não registrar token, cookie, senha ou dados pessoais integrais;
- não enfraquecer HttpOnly, Secure ou SameSite em produção;
- não corrigir débitos fora do escopo sem justificar.

Use testes automatizados para 401, 403, CSRF ausente/inválido, origem indevida,
request ID e auditoria. Preserve compatibilidade com chamadas existentes do
AuditService ou migre todas as chamadas de modo seguro e revisável.

Atualize exemplos de ambiente e documentação sem incluir segredos.

Antes do commit, execute os testes backend, build frontend e validações registradas
no baseline. Atualize CHECKLIST_EXECUCAO somente com resultados reais.

Entregue no relatório final:
- arquivos alterados;
- desenho da proteção CSRF;
- regra de confiança de proxy;
- comandos e resultados;
- riscos residuais;
- impacto no deploy;
- rollback da fase.

Não avance para a Fase 2.
```