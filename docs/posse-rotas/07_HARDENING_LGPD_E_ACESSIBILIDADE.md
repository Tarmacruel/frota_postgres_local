# Fase 7 — Hardening, LGPD e Acessibilidade

## 1. Objetivo

Executar revisão transversal do fluxo completo antes do rollout, corrigindo vulnerabilidades, exposições de dados, inconsistências de autorização, problemas de acessibilidade e riscos operacionais introduzidos ou revelados pelas fases anteriores.

Esta fase não deve adicionar novas funcionalidades de negócio.

## 2. Threat model

Atualizar `docs/posse-rotas/THREAT_MODEL.md` usando abordagem STRIDE ou equivalente, cobrindo:

- autenticação por cookie;
- CSRF;
- IDOR em URLs aninhadas;
- escalonamento de privilégio;
- concorrência entre operadores;
- uploads e downloads;
- path traversal;
- MIME spoofing;
- XSS em observações, origem, finalidade e destinos;
- CSV/XLSX formula injection;
- exposição em PDF;
- vazamento por logs;
- cache de respostas;
- geolocalização;
- request headers forjados;
- negação de serviço por relatório amplo ou upload;
- dependências vulneráveis;
- falhas de backup/rollback.

Cada ameaça deve possuir ativo, vetor, impacto, controles, teste e risco residual.

## 3. Autorização e IDOR

Revisar todos os endpoints novos e modificados:

- leitura;
- mutação;
- arquivo;
- termo;
- relatório;
- metadados;
- preferências;
- auditoria.

Confirmar que:

- recurso aninhado pertence ao pai da URL;
- campos restritos não aparecem no schema serializado;
- `ADMIN`, `PRODUCAO` e `PADRAO` obedecem à matriz;
- alteração manual de payload não amplia permissões;
- download não usa URL pública;
- endpoints administrativos usam `require_admin`.

## 4. Cookies, CORS, CSRF e sessão

Revisar configuração de produção:

- `HttpOnly` no cookie de autenticação;
- `Secure=true` sob HTTPS;
- `SameSite` compatível e restritivo;
- domínio/path mínimos;
- expiração coerente;
- logout invalida cookie corretamente;
- CORS permite apenas origens institucionais explícitas;
- credenciais sem wildcard;
- CSRF em todas as mutações autenticadas;
- rotação/expiração de token tratada;
- erros 401 não geram loop infinito no frontend.

Não alterar para configuração insegura apenas para facilitar localhost; usar configurações por ambiente.

## 5. Headers e conteúdo

Revisar:

- Content-Security-Policy;
- `frame-ancestors`;
- `X-Content-Type-Options`;
- `Referrer-Policy`;
- HSTS no ponto correto da infraestrutura HTTPS;
- `Cache-Control` em autenticação, arquivos, termos e relatórios;
- nomes e disposições de arquivos;
- prevenção de MIME sniffing.

CSP deve ser testada, não apenas adicionada de forma que quebre a aplicação.

## 6. Uploads e storage

Confirmar:

- limites de tamanho no backend;
- extensão e MIME real;
- nomes opacos;
- diretório fora da raiz pública;
- caminho resolvido dentro do storage autorizado;
- ausência de `..`, caminhos absolutos e caracteres indevidos;
- arquivos incompletos removidos após rollback;
- permissões mínimas no filesystem;
- cache desabilitado;
- autorização antes de abrir arquivo;
- política de malware documentada, ainda que a varredura dependa da infraestrutura.

## 7. LGPD e minimização

Executar teste por perfil e tela:

- JSON de listagem;
- detalhe;
- timeline;
- termo;
- PDF;
- XLSX;
- auditoria;
- notificações;
- mensagens de erro.

Verificar:

- documento mascarado;
- contato ausente quando não autorizado;
- localização ausente;
- IP/User-Agent exclusivos de auditoria administrativa;
- logs sem dados excessivos;
- presets mínimos;
- preferências sem dados pessoais;
- observações com orientação para não inserir dados desnecessários;
- ausência de dados pessoais em nome de arquivo e URL.

Criar `docs/posse-rotas/INVENTARIO_DADOS.md` com dado, finalidade, origem, armazenamento, perfis, saída, retenção institucional a definir e controle técnico.

Não inventar prazo legal de retenção. Marcar a definição como decisão administrativa/jurídica quando ainda não formalizada.

## 8. Acessibilidade eMAG/WCAG 2.1 AA

Revisar o fluxo completo:

- contraste;
- foco visível;
- ordem de tabulação;
- zoom e responsividade;
- labels;
- mensagens de erro;
- modais;
- tabelas e cabeçalhos;
- status textual;
- não dependência exclusiva de cor;
- teclado;
- leitores de tela;
- botões de reordenação;
- feedback assíncrono;
- áreas clicáveis em dispositivos móveis.

Executar ferramentas automatizadas disponíveis, mas não tratar resultado automático como validação suficiente. Documentar teste manual do fluxo crítico.

## 9. Dependências e qualidade

- executar auditoria de dependências Python e Node com ferramenta disponível;
- não atualizar major versions sem necessidade;
- corrigir vulnerabilidades relevantes sem quebrar compatibilidade;
- revisar licenças das novas bibliotecas;
- executar lint/typecheck;
- revisar complexidade e arquivos excessivamente grandes;
- identificar N+1;
- confirmar índices usados nas queries principais;
- validar limites e timeout de relatórios.

## 10. Testes de segurança obrigatórios

- CSRF em cada classe de mutação;
- IDOR por posse, rota, destino, termo e arquivo;
- role tampering;
- XSS armazenado/refletido em textos;
- path traversal;
- MIME spoofing;
- upload acima do limite;
- formula injection;
- filtros de relatório abusivos;
- request ID e forwarding headers forjados;
- download sem sessão;
- campo restrito em relatório;
- concorrência de encerramento;
- replay de confirmação de devolução;
- alteração de confirmação anterior;
- logs sem segredos.

## 11. Critérios de aceitação

- threat model e inventário de dados concluídos;
- vulnerabilidades críticas/altas corrigidas ou formalmente bloqueadoras;
- matriz RBAC validada em testes;
- nenhum dado restrito é enviado a perfil não autorizado;
- fluxo crítico atende aos requisitos principais de acessibilidade;
- dependências e headers estão documentados;
- nenhuma funcionalidade nova fora do plano foi adicionada.

## 12. Prompt para o Codex

```text
Execute exclusivamente a Fase 7 descrita em:

docs/posse-rotas/07_HARDENING_LGPD_E_ACESSIBILIDADE.md

Branch obrigatória: feat/posse-rotas-relatorios-devolucao

Não adicione novas funcionalidades de negócio. Revise e fortaleça o que foi
implementado nas Fases 1 a 6.

Produza e use:
- THREAT_MODEL.md;
- INVENTARIO_DADOS.md;
- matriz de endpoints/perfis;
- checklist manual de acessibilidade.

Revise CSRF, cookies, CORS, sessão, IDOR, RBAC, uploads, storage, PDF, XLSX,
relatórios, logs, auditoria, headers, cache, XSS, formula injection, concorrência e
proteção de dados.

Requisitos:
- backend continua fonte de verdade;
- nenhuma URL pública permanente para arquivos;
- nenhum dado restrito enviado para perfil sem autorização;
- nenhuma alteração retroativa sem histórico;
- nenhum prazo de retenção inventado;
- não atualizar dependência major sem justificativa e teste;
- CSP deve ser validada sem quebrar o frontend;
- configurações de localhost não podem enfraquecer produção.

Execute testes automatizados e manuais previstos, auditoria de dependências, build,
lint/typecheck e análise de queries. Classifique achados por severidade. Corrija
críticos e altos dentro do escopo; documente riscos residuais e decisões necessárias.

Atualize CHECKLIST_EXECUCAO somente com evidências reais. Entregue:
- ameaças e controles;
- inventário de dados;
- vulnerabilidades corrigidas;
- riscos residuais;
- testes e resultados;
- verificação de acessibilidade;
- impacto de configuração/deploy;
- bloqueios para a Fase 8.

Não avance para a Fase 8.
```