# Fase 5 — Termo Único e Confirmação Autenticada da Devolução

## 1. Objetivo

Eliminar o fluxo redundante de termo separado de devolução e consolidar entrega, rotas e devolução no **Termo de Posse e Responsabilidade do Veículo**, gerado a partir de dados persistidos no backend.

## 2. Princípio documental

O termo é um documento administrativo associado à posse. A devolução complementa o mesmo registro e o mesmo documento.

A confirmação realizada no sistema é uma **declaração autenticada pela sessão do usuário**. Não deve ser denominada:

- assinatura digital ICP-Brasil;
- assinatura eletrônica qualificada;
- certificado digital;
- reconhecimento de firma eletrônico.

## 3. Pré-condições

- rotas e destinos em produção de desenvolvimento;
- entidade versionada de confirmação criada;
- auditoria com request context funcionando;
- nenhuma rota em andamento para encerramento da posse.

## 4. Fluxo de devolução

Ao selecionar `Encerrar posse`, o backend e o frontend devem verificar novamente se há rota em andamento.

O modal deve apresentar:

- identificação do veículo e da posse;
- condutor responsável;
- início da posse;
- última rota e último hodômetro conhecidos;
- data/hora da devolução;
- hodômetro final;
- observações sobre as condições do veículo;
- declaração integral;
- checkbox não previamente marcado;
- confirmação final da operação.

Texto inicial sugerido, sujeito a versionamento:

> Declaro que o veículo identificado nesta posse foi devolvido à Frota Municipal na data e hora informadas, com o hodômetro e as condições registradas neste sistema.

A versão e o texto efetivamente aceitos devem ser persistidos.

## 5. Payload canônico e hash

Criar representação canônica determinística contendo, no mínimo:

- possession ID e número público;
- vehicle ID;
- driver ID ou snapshot aplicável;
- confirmed_by_user_id;
- declaration_version;
- declaration_text;
- confirmed_at em UTC;
- final_odometer_km normalizado;
- vehicle_condition_notes normalizadas;
- last_trip_id;
- request_id.

Serializar com ordenação estável, encoding UTF-8 e formato numérico definido. Calcular SHA-256 no backend.

O hash serve para integridade e verificabilidade interna. Não equivale a assinatura digital.

## 6. Transação de encerramento

Na mesma transação:

1. bloquear a posse ativa;
2. verificar rota em andamento;
3. validar data e hodômetro;
4. verificar se já existe confirmação atual;
5. criar confirmação versionada;
6. atualizar fim e hodômetro da posse;
7. registrar auditoria `POSSESSION_RETURN_CONFIRMATION` e `POSSESSION_END` ou evento consolidado claramente definido;
8. confirmar a transação.

Não criar confirmação se o encerramento falhar.

Correção por `ADMIN` deve criar nova versão e substituir logicamente a anterior, nunca sobrescrever ou apagar.

## 7. Geração do termo

Criar endpoint protegido, por exemplo:

- `GET /api/possession/{possession_id}/term?disposition=inline`
- `GET /api/possession/{possession_id}/term?disposition=attachment`

O backend deve:

- carregar posse, veículo, condutor, rotas, destinos e confirmação;
- aplicar mascaramento conforme perfil;
- gerar PDF institucional;
- incluir número público, UUID/identificador verificável, data e versão do documento;
- incluir status atual;
- incluir entrega inicial;
- incluir relação ordenada de rotas e destinos;
- incluir devolução quando confirmada;
- indicar registros legados quando não houver informação;
- usar paginação e quebra de tabela adequadas;
- incluir cabeçalho/rodapé institucional conforme padrão existente;
- devolver `Cache-Control: private, no-store, max-age=0`;
- auditar preview e download.

Não utilizar dados editáveis apenas no estado do navegador.

Caso seja necessária nova biblioteca PDF, fixar versão, avaliar licença e registrar impacto. Preferir biblioteca estável e compatível com execução Windows/local existente.

## 8. Documento assinado original

O anexo assinado da entrega inicial continua vinculado à posse e acessível conforme autorização. Ele não deve ser novamente exigido em cada rota.

O termo consolidado gerado pelo sistema e o anexo assinado são artefatos distintos:

- anexo: documento externo arquivado;
- termo consolidado: representação atual dos dados persistidos.

## 9. Verificabilidade

Incluir no termo:

- identificador público;
- versão do termo;
- data/hora de geração;
- hash ou código de integridade da confirmação, quando existir;
- aviso de que a autenticidade deve ser verificada no sistema institucional.

Não criar endpoint público de verificação sem análise de exposição de dados. Qualquer consulta deve exigir autenticação nesta fase.

## 10. Auditoria

Eventos:

- `POSSESSION_RETURN_CONFIRMATION`;
- `POSSESSION_RETURN_CORRECTION`;
- `TERM_PREVIEW`;
- `TERM_DOWNLOAD`.

Para preview/download registrar usuário, posse, versão, request ID e resultado, sem armazenar o PDF no log.

## 11. Testes obrigatórios

- encerramento sem checkbox/aceite é rejeitado;
- encerramento com rota aberta é rejeitado;
- data anterior ao início é rejeitada;
- hodômetro inferior é rejeitado;
- confirmação e encerramento são atômicos;
- hash é determinístico;
- alteração de campo muda hash;
- segunda confirmação atual é rejeitada;
- correção admin cria nova versão;
- perfil não autorizado não recebe dados integrais;
- termo de posse ativa é gerado sem seção de devolução;
- termo encerrado contém devolução;
- rotas/destinos aparecem em ordem;
- registros legados não quebram o PDF;
- preview/download exigem autenticação e geram auditoria;
- headers de cache e conteúdo estão corretos.

## 12. Critérios de aceitação

- encerramento da posse exige declaração explícita;
- confirmação é persistida e versionada;
- não existe termo separado de devolução;
- PDF oficial é gerado no backend com dados persistidos;
- termo consolida todas as rotas;
- segurança, mascaramento e auditoria são aplicados;
- o texto não promete nível de assinatura inexistente.

## 13. Prompt para o Codex

```text
Implemente exclusivamente a Fase 5 descrita em:

docs/posse-rotas/05_TERMO_UNICO_E_DEVOLUCAO.md

Branch obrigatória: feat/posse-rotas-relatorios-devolucao

Leia ADR, matriz RBAC/LGPD e implementações das Fases 1 a 4. Não crie termo
separado de devolução.

Implemente:
- modal de encerramento com declaração integral e checkbox não pré-marcado;
- validação backend independente do frontend;
- transação atômica de confirmação e encerramento;
- confirmação append-only/versionada;
- payload canônico e hash SHA-256 calculado no backend;
- correção administrativa por nova versão;
- PDF oficial do Termo de Posse e Responsabilidade gerado no backend;
- seções de entrega, rotas, destinos, status e devolução;
- preview/download protegidos, sem cache e auditados.

Restrições:
- não chamar a confirmação de assinatura digital, qualificada ou ICP-Brasil;
- não gerar PDF oficial somente a partir do estado do navegador;
- não exigir novo termo assinado a cada rota;
- não expor documento, contato ou metadados técnicos sem autorização;
- não apagar confirmação anterior;
- não armazenar PDF/binário na auditoria;
- não criar endpoint público de verificação nesta fase.

Se introduzir biblioteca PDF, fixe a versão, verifique compatibilidade com Windows,
registre a licença e atualize os arquivos de dependência/documentação.

Crie testes de transação, hash, versionamento, RBAC, PDF, legado, headers e auditoria.
Execute testes backend/frontend e build.

Atualize CHECKLIST_EXECUCAO somente com evidências. Entregue:
- texto e versão da declaração;
- estrutura do payload canônico;
- amostra estrutural do termo sem dados pessoais reais;
- arquivos e dependências alterados;
- testes e resultados;
- riscos para a Fase 6.

Não avance para a Fase 6.
```