# Inventário de dados — módulo de posses

Revisão: 2026-07-13. A coluna “retenção” não cria prazo legal; onde não existe política formal, a decisão está explicitamente pendente.

| Dado / classificação | Finalidade e origem | Armazenamento | Acesso / saídas | Retenção | Controle técnico |
|---|---|---|---|---|---|
| Identificador e número público da posse — interno | Identificar o vínculo; gerado pelo backend | `vehicle_possession` | ADMIN, PRODUCAO e PADRAO; telas, termo e relatórios | Histórico operacional; prazo institucional a definir | UUID não sequencial interno e número estável; sem endpoint público novo |
| Nome e CPF do condutor — pessoal restrito | Responsabilização; cadastro/posse | usuário e snapshot legado da posse | integral: ADMIN/PRODUCAO; mascarado: PADRAO | Prazo administrativo/jurídico a definir | serializer/RBAC, preset mínimo sem documento, nomes de arquivo opacos |
| Telefone/contato — pessoal restrito | Contato operacional; formulário/cadastro | posse/usuário conforme legado | ADMIN/PRODUCAO; ausente para PADRAO | A definir | não entra no preset padrão nem no localStorage |
| Veículo, placa e patrimônio — operacional | Identificar bem público; cadastro | veículo e posse | perfis autorizados ao módulo | Histórico do bem | escopo organizacional e relacionamentos sem hard delete |
| Datas, status, hodômetros — operacional | Evidenciar entrega, deslocamento e devolução | posse, rota e confirmação | ADMIN/PRODUCAO; visão resumida PADRAO | Histórico; prazo a definir | UTC/timestamptz, decimal novo, constraints e versões |
| Origem, finalidade e observação — operacional potencialmente pessoal | Planejar/documentar deslocamento; operador | rota/posse | ADMIN/PRODUCAO; minimizado para PADRAO | A definir | orientação para não inserir dados pessoais desnecessários; escape React/PDF |
| Destinos e ordem — localização operacional restrita | Rastrear itinerário; operador | `vehicle_possession_trip_destination` | ADMIN/PRODUCAO; ausente para PADRAO | A definir | sequência por rota, IDOR, sem endpoint público |
| Coordenadas — localização restrita | Apoio operacional quando coletada | campos de rota/destino | ADMIN/PRODUCAO autorizado; nunca PADRAO | Decisão administrativa/jurídica pendente | coluna restrita na registry, seleção manual e Permissions-Policy |
| Fotos e documentos legados — pessoal/restrito | Evidência de entrega/devolução | storage privado + metadados no banco | ADMIN/PRODUCAO conforme permissão; PADRAO sem foto integral | Política de descarte pendente | magic bytes, limite, path containment, auth, `no-store` |
| Declaração e confirmação de devolução — evidência administrativa | Confirmar encerramento; usuário autenticado | confirmação append-only/versionada | ADMIN; visualização autorizada no termo consolidado | Preservar histórico; prazo a definir | payload canônico, SHA-256, versão atual única, sem alteração retroativa |
| PDF do termo — derivado restrito | Documento oficial consolidado | gerado sob demanda, não na auditoria | perfis autorizados; preview/download autenticados | Sem cópia oficial persistida nesta fase | backend, `no-store`, auditoria e nome opaco |
| Relatório PDF/XLSX — derivado | Operação e prestação de contas | gerado em memória | colunas limitadas por perfil | Não persistido pelo sistema | registry única, limites, fórmula neutralizada, `no-store` |
| Preferência de relatório — não pessoal | Preset, modo e ordem de colunas | `user_possession_report_preference` | próprio usuário | Enquanto aplicável; a definir | sem filtros nem conteúdo pessoal; validação pela registry |
| IP, User-Agent e request ID — metadado técnico restrito | Segurança e rastreabilidade | `audit_logs` | ADMIN na auditoria; nunca em relatórios operacionais | Política de logs pendente | proxy confiável, normalização, minimização e acesso administrativo |
| Eventos before/after — administrativo restrito | Auditoria de correções/mutações | `audit_logs` | ADMIN | Política de auditoria pendente | não armazena binários, segredo ou relatório integral |

## Fluxos e minimização

- O frontend não armazena token, CPF, contato, localização, termo ou relatório em `localStorage`; somente preferências visuais e o marcador não pessoal do tour.
- O preset Resumido é o padrão e não inclui documento, contato, coordenadas ou metadados técnicos.
- URLs de documentos contêm IDs internos e exigem sessão; o novo termo não possui verificação pública. Endpoints públicos antigos atendem somente registros legados conforme ADR 002.
- Erros expõem código e mensagem operacional, não payload, segredo, IP ou stack trace em produção.
