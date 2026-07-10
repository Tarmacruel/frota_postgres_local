# Matriz RBAC, LGPD e Exposição de Dados

## 1. Objetivo

Este documento é vinculante para as fases de backend, frontend, relatórios, termo, auditoria e testes. A autorização do backend é a fonte de verdade. Ocultar botão ou rota no frontend é apenas medida de experiência do usuário.

Perfis atualmente considerados:

- `ADMIN`
- `PRODUCAO`
- `PADRAO`

O perfil `POSTO`, existente em produção, não possui acesso ao módulo de posses por padrão.

Caso o código real utilize nomenclatura adicional, o Codex deverá mapear os perfis existentes sem criar permissões implícitas.

## 2. Matriz de operações

| Operação | ADMIN | PRODUCAO | PADRAO | Regra adicional |
|---|:---:|:---:|:---:|---|
| Listar posses | Sim | Sim | Sim | Aplicar mascaramento por perfil |
| Consultar posse individual | Sim | Sim | Sim | Validar escopo e campos retornados |
| Criar posse | Sim | Sim | Não | `require_writer` ou equivalente |
| Substituir posse ativa | Sim | Sim | Não | Confirmação explícita e justificativa |
| Editar posse retroativamente | Sim | Não | Não | Justificativa e auditoria `before/after` |
| Iniciar rota | Sim | Sim | Não | Posse ativa e sem rota em andamento |
| Adicionar destino | Sim | Sim | Não | Rota em andamento |
| Encerrar rota | Sim | Sim | Não | Datas e hodômetros válidos |
| Cancelar rota operacional | Sim | Sim | Não | `PRODUCAO` apenas antes do encerramento e com justificativa |
| Corrigir rota encerrada | Sim | Não | Não | Nova versão ou auditoria completa |
| Encerrar posse/devolver veículo | Sim | Sim | Não | Sem rota aberta e com declaração confirmada |
| Substituir confirmação de devolução | Sim | Não | Não | Registro versionado, sem apagar anterior |
| Visualizar termo | Sim | Sim | Sim | `PADRAO` recebe somente representação mascarada |
| Baixar termo oficial integral | Sim | Sim | Não | Download integral é operacional |
| Previsualizar relatório resumido | Sim | Sim | Sim | Sem colunas restritas por padrão |
| Exportar relatório operacional | Sim | Sim | Não | `PRODUCAO` pode incluir dados operacionais autorizados |
| Selecionar documento do condutor | Sim | Sim | Não | `PADRAO` recebe somente valor mascarado em consulta |
| Selecionar contato | Sim | Sim | Não | Contato integral restrito à operação |
| Selecionar localização | Sim | Sim | Não | Não incluir em preset padrão; acesso operacional auditável |
| Consultar auditoria detalhada | Sim | Não | Não | Endpoint exclusivo de `ADMIN` |
| Excluir auditoria | Não | Não | Não | Operação inexistente |
| Hard delete de posse/rota/destino | Não | Não | Não | Operação inexistente |

Estas decisões foram confirmadas no desbloqueio anterior à Fase 1 e são complementadas pelo ADR 002. Permissões individuais podem restringir o módulo de posses, mas não ampliar o teto do perfil.

## 3. Classificação dos dados

| Dado | Classificação | Exposição padrão | Regras |
|---|---|---|---|
| Placa e identificação do veículo | Dado administrativo | Permitida a autenticados | Não expor publicamente |
| Nome do condutor | Dado pessoal | Permitido no escopo operacional | Evitar logs desnecessários |
| CPF/documento | Dado pessoal de alta criticidade operacional | Mascarado | Integral somente a perfil autorizado e finalidade justificada |
| Telefone/contato | Dado pessoal | Oculto por padrão | Exibir somente a perfil operacional autorizado |
| Localização/coordenadas | Dado pessoal/operacional sensível | Oculta | Somente perfis autorizados; nunca em preset padrão |
| IP e User-Agent | Metadado de segurança | Oculto na interface comum | Auditoria exclusiva de `ADMIN` |
| Foto do veículo | Evidência administrativa | Protegida | Requer autenticação, autorização e `no-store` |
| Documento assinado | Documento administrativo com dados pessoais | Protegido | Sem URL pública permanente |
| Observações | Potencial dado pessoal | Permitida com cautela | Orientar usuário a não inserir dados excessivos |
| Auditoria | Dado administrativo e de segurança | Restrita | Append-only, sem exclusão por usuário |
| Relatório exportado | Documento administrativo | Conforme perfil | Minimização de dados e evento de auditoria |

## 4. Mascaramento mínimo

### 4.1 Documento

- CPF: exibir preferencialmente `***.***.***-00`, preservando apenas dígitos finais quando houver finalidade operacional.
- Outros documentos: ocultar parte central, mantendo somente prefixo/sufixo indispensáveis.
- O backend deverá produzir o valor mascarado. O frontend não deve receber o valor integral quando não autorizado.

### 4.2 Contato

- Para perfil sem autorização: retornar `null` ou campo ausente, não apenas CSS oculto.
- Quando mascarado: preservar no máximo DDD e dois últimos dígitos, conforme necessidade confirmada.

### 4.3 Localização

- Não retornar coordenadas para perfil não autorizado.
- Não incluir coordenadas em logs comuns, mensagens de erro, nomes de arquivo ou relatórios padrão.

## 5. Princípios LGPD aplicáveis

A implementação deverá demonstrar:

- **Finalidade:** cada campo e relatório deve possuir finalidade administrativa definida.
- **Adequação:** o tratamento deve ser compatível com a gestão da frota.
- **Necessidade:** somente os dados mínimos devem ser exibidos ou exportados.
- **Segurança:** autenticação, autorização, CSRF, controle de arquivos, logs seguros e proteção contra IDOR.
- **Prevenção:** validações, constraints, testes e confirmação de ações críticas.
- **Responsabilização:** auditoria, justificativas, evidências de testes e documentação de implantação.

A base jurídica institucional deverá ser validada pela Administração/encarregado de dados fora do código. O software não deve exibir afirmação jurídica automática sobre consentimento quando o tratamento decorrer de atribuição legal ou execução de política pública.

## 6. Regras para relatórios

Presets mínimos:

### Resumido

- número da posse;
- placa;
- condutor;
- início;
- fim;
- status;
- quantidade de rotas;
- quilômetros totais.

### Operacional

- campos do resumido;
- veículo;
- finalidade;
- destinos;
- saída/retorno;
- hodômetros;
- observações estritamente operacionais.

### Completo

- disponível somente para perfis autorizados;
- ainda deve excluir, por padrão, IP, User-Agent, request ID e coordenadas.

### Personalizado

- frontend recebe apenas as colunas autorizadas pelo backend;
- backend valida novamente as chaves solicitadas;
- tentativa de selecionar coluna não autorizada deve retornar `403` ou erro de validação seguro;
- auditoria registra nomes das colunas, filtros e quantidade de registros, sem conteúdo integral.

## 7. Regras para arquivos

- Exigir autenticação em todos os endpoints.
- Validar autorização sobre a posse antes de transmitir o arquivo.
- Usar `Cache-Control: private, no-store, max-age=0`.
- Usar nomes físicos opacos, sem CPF, nome ou placa quando houver risco de exposição.
- Validar MIME real e extensão permitida.
- Limitar tamanho.
- Impedir path traversal.
- Não servir diretório de storage como pasta pública.
- Não registrar conteúdo binário em auditoria.

## 8. Regras para auditoria

Registrar:

- ator e perfil;
- ação;
- entidade e identificador;
- data/hora UTC;
- request ID;
- IP normalizado;
- User-Agent limitado;
- justificativa;
- `before/after` em alterações administrativas;
- resultado da operação.

Não registrar:

- senha;
- token JWT;
- cookie;
- arquivo binário;
- documento integral sem necessidade;
- telefone integral;
- coordenadas integrais em evento comum;
- corpo completo do relatório.

## 9. Testes mínimos de autorização

Para cada endpoint novo, criar testes para:

1. ausência de autenticação: `401`;
2. perfil sem permissão: `403`;
3. recurso inexistente: `404` sem vazamento;
4. tentativa de acessar rota vinculada a outra posse: `404` ou `403` consistente;
5. tentativa de selecionar coluna restrita: rejeição no backend;
6. arquivo protegido sem sessão: rejeição;
7. auditoria sem perfil `ADMIN`: rejeição;
8. payload contendo papel forjado: ignorado;
9. JWT válido de usuário removido/inativo: rejeição conforme política do sistema;
10. dados restritos ausentes no JSON retornado ao perfil não autorizado.
