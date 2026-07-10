# ADR 002 — Compatibilidade com produção e governança do domínio de posse

- **Status:** aprovado
- **Data:** 2026-07-10
- **Escopo:** desbloqueio anterior à Fase 1
- **Substitui parcialmente:** ADR 001, somente nos pontos expressamente descritos abaixo
- **Base reconciliada:** `modulo-analytics` em `bb3b094a9751d0b2ae72c47dc1384cde0580792b`

## Contexto

A branch de implementação foi criada antes de 86 commits hoje presentes em produção. Nesse intervalo, produção recebeu permissões granulares, termos separados de empréstimo/devolução, códigos públicos, assinaturas internas, exclusão física de posse e migrations até `0038_require_user_cpf`.

O ADR 001 continua definindo o destino funcional do novo domínio, mas não pode apagar silenciosamente dados, contratos ou evidências já existentes.

## Decisões

### Código e Alembic

- `modulo-analytics` é a fonte de verdade funcional para a sincronização.
- A feature preserva o plano em `docs/posse-rotas` e descarta helpers experimentais divergentes.
- O grafo Alembic aplicado em produção é preservado sem edição, `stamp` ou migration de reconciliação.
- `0038_require_user_cpf` é o único head esperado antes da Fase 1.

### Termo único e legado

- Até a ativação da Fase 5, os termos atuais continuam operacionais para não interromper produção.
- A partir da Fase 5, o termo único passa a ser autoritativo para novos fluxos.
- Registros que não possuírem a estrutura/versionamento do termo único serão tratados como legados.
- Anexos, códigos públicos e assinaturas de registros legados permanecem consultáveis e verificáveis, sem conversão destrutiva.
- Após a ativação do termo único, não serão criados novo termo separado de devolução nem nova assinatura no modelo legado.
- Endpoints públicos existentes atenderão somente registros legados. O termo único novo exigirá autenticação e não terá endpoint público nessa fase.
- A nova confirmação de devolução será denominada **declaração autenticada pela sessão**. Ela não será apresentada como assinatura digital, qualificada ou ICP-Brasil.
- A nomenclatura histórica de assinaturas já registradas será preservada como evidência do fluxo vigente à época.

### Exclusão

- Não existe hard delete de posse, rota, destino ou confirmação de devolução no domínio governado por estes ADRs.
- O endpoint legado de DELETE permanece temporariamente apenas como contrato não mutativo: tentativa administrativa é auditada e recebe `409 POSSESSION_HARD_DELETE_DISABLED`.
- Correções usam retificação, cancelamento, inativação ou versionamento append-only, conforme a entidade.
- Permissões granulares não podem reativar hard delete de posse.

### RBAC e exposição de dados

- Permissões individuais continuam existindo, mas no módulo de posses podem apenas restringir o teto do perfil.
- `ADMIN`: consulta e mutações administrativas, dados integrais, localização e auditoria; sem delete.
- `PRODUCAO`: consulta/criação/edição/encerramento, documento e contato integrais, localização e relatórios operacionais; sem auditoria administrativa e sem delete.
- `PADRAO`: consulta com documento mascarado, contato ausente e sem localização, download integral ou exportação operacional.
- `POSTO`: sem acesso ao módulo de posses por padrão.

## Compatibilidade de API

- `DELETE /api/possession/{id}` continua roteável para `ADMIN`, mas nunca remove banco ou arquivos e sempre responde 409 após auditar a tentativa.
- Downloads integrais de anexos da posse são permitidos apenas a `ADMIN` e `PRODUCAO`.
- Respostas autenticadas de posse mascaram documento, omitem contato e URLs de anexos para `PADRAO`.
- Endpoints públicos atuais permanecem inalterados até a transição da Fase 5.

## Consequências

- A Fase 1 pode partir do código e do grafo Alembic reais de produção.
- Não há migration neste desbloqueio.
- A Fase 5 deverá implementar explicitamente a classificação legado/termo único e os testes de transição.
- Qualquer mudança destas decisões exige novo ADR substitutivo.
