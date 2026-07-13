# Relatório da Fase 6 — relatórios configuráveis

Data: **2026-07-13**  
Branch: `feat/posse-rotas-relatorios-devolucao`  
Commit de entrada (Fases 4/5): `d86ce4236d08023becb6b30f13435b6bf49b6067`

## Resultado

O módulo de posses deixou de manter colunas oficiais no frontend. Metadados, autorização, presets, extração, ordem e formatação lógica são definidos em uma registry tipada no backend. PDF e XLSX recebem o mesmo `PreparedReport`, produzido por filtros parametrizados e consultas limitadas no servidor. O PDF oficial do Termo de Posse da Fase 5 não foi reutilizado.

O preset padrão Resumido contém somente número da posse, placa, condutor, início, fim, status, quantidade de rotas e quilômetros totais. Documento, contato, coordenadas e metadados técnicos não integram esse preset.

## Catálogo de colunas

Classificações: `ADMINISTRATIVE`, `PERSONAL`, `PERSONAL_HIGH_CRITICALITY`, `OPERATIONAL_SENSITIVE` e `SECURITY_METADATA`. `A/P/S` significam `ADMIN`, `PRODUCAO` e `PADRAO`.

| Chave | Modo | Classificação | Perfis | Presets/uso |
|---|---|---|---|---|
| `possession_number` | posse/rota | administrativa | A/P/S | todos os presets fixos |
| `vehicle_plate` | posse/rota | administrativa | A/P/S | todos os presets fixos |
| `vehicle_identification` | posse/rota | administrativa | A/P | operacional/completo |
| `driver_name` | posse/rota | pessoal | A/P/S | todos os presets fixos |
| `driver_document` | posse/rota | pessoal de alta criticidade | A/P | completo |
| `driver_contact` | posse/rota | pessoal | A/P | completo |
| `possession_start` | posse/rota | administrativa | A/P/S | todos os presets fixos |
| `possession_end` | posse/rota | administrativa | A/P/S | todos os presets fixos |
| `possession_status` | posse/rota | administrativa | A/P/S | todos os presets fixos |
| `possession_start_odometer` | posse | administrativa | A/P | operacional/completo |
| `possession_end_odometer` | posse | administrativa | A/P | operacional/completo |
| `trip_count` | posse | administrativa | A/P/S | todos os presets fixos |
| `destination_count` | posse/rota | administrativa | A/P/S | operacional/completo |
| `total_trip_kilometers` | posse | administrativa | A/P/S | todos os presets fixos |
| `first_trip_departure` | posse | administrativa | A/P | operacional/completo |
| `last_trip_return` | posse | administrativa | A/P | operacional/completo |
| `destinations` | posse/rota | operacional sensível | A/P | operacional/completo |
| `possession_observation` | posse | pessoal potencial | A/P | operacional/completo |
| `return_status` | posse | administrativa | A/P/S | completo |
| `return_condition_notes` | posse | pessoal potencial | A/P | completo |
| `trip_sequence` | rota | administrativa | A/P/S | todos os presets fixos |
| `trip_status` | rota | administrativa | A/P/S | todos os presets fixos |
| `trip_origin` | rota | operacional sensível | A/P | operacional/completo |
| `trip_purpose` | rota | operacional sensível | A/P | operacional/completo |
| `trip_departure` | rota | administrativa | A/P/S | todos os presets fixos |
| `trip_return` | rota | administrativa | A/P/S | todos os presets fixos |
| `trip_start_odometer` | rota | administrativa | A/P | operacional/completo |
| `trip_end_odometer` | rota | administrativa | A/P | operacional/completo |
| `trip_kilometers` | rota | administrativa | A/P/S | todos os presets fixos |
| `trip_observation` | rota | pessoal potencial | A/P | completo |
| `trip_cancellation_reason` | rota | operacional sensível | A/P | completo |
| `capture_latitude` | posse | operacional sensível | A/P | somente seleção manual |
| `capture_longitude` | posse | operacional sensível | A/P | somente seleção manual |
| `return_confirmation_hash` | posse | metadado de segurança | A | somente seleção manual |
| `return_request_id` | posse | metadado de segurança | A | somente seleção manual |
| `return_ip_address` | posse | metadado de segurança | A | somente seleção manual |
| `return_user_agent` | posse | metadado de segurança | A | somente seleção manual |

O frontend não replica essa lista: ele renderiza títulos, classificação, seleção e ordem exclusivamente a partir do endpoint de metadados.

## Contratos

| Método e rota | Autorização | Contrato |
|---|---|---|
| `GET /api/possession/reports/metadata` | `possession.view` | modos, colunas e presets já reduzidos ao perfil; informa limites e disponibilidade de XLSX |
| `POST /api/possession/reports/preview-pdf` | `possession.view` | payload enumerado; PDF inline, autenticado, `private/no-store`; `PADRAO` limitado às colunas seguras |
| `POST /api/possession/reports/export-xlsx` | `possession.view` + teto A/P | mesmo payload/dataset; XLSX attachment, autenticado e `private/no-store` |
| `GET /api/users/me/report-preferences/possession` | `possession.view` | retorna preferência validada ou Resumido saneado |
| `PUT /api/users/me/report-preferences/possession` | `possession.view` + CSRF | persiste somente `mode`, `preset` e `column_keys`; audita atualização |

Payload de geração:

```json
{
  "mode": "POSSESSION | TRIP",
  "preset": "SUMMARY | OPERATIONAL | COMPLETE | CUSTOM",
  "column_keys": ["somente_no_preset_custom"],
  "filters": {
    "date_from": "RFC3339 com fuso",
    "date_to": "RFC3339 com fuso",
    "temporal_field": "POSSESSION_START | TRIP_DEPARTURE",
    "vehicle_id": "uuid opcional",
    "driver_id": "uuid opcional",
    "organization_id": "uuid opcional",
    "possession_status": "ACTIVE | CLOSED",
    "trip_status": "EM_ANDAMENTO | ENCERRADA | CANCELADA",
    "has_return": true,
    "has_return_confirmation": true,
    "search": "texto parametrizado, até 100 caracteres"
  },
  "orientation": "PORTRAIT | LANDSCAPE"
}
```

Chave desconhecida retorna `422 REPORT_COLUMN_UNKNOWN`; chave restrita retorna `403 REPORT_COLUMN_FORBIDDEN`; chave incompatível com o modo retorna `422 REPORT_COLUMN_MODE_MISMATCH`. SQL, atributo arbitrário, função, HTML ou template não fazem parte do schema aceito.

## Migration

- arquivo: `backend/alembic/versions/0040_add_user_report_preferences.py`;
- revision: `0040_report_preferences`;
- down revision confirmado: `0039_possession_trips`;
- tabela: `user_report_preferences`;
- unicidade: `(user_id, report_type)`;
- check: `report_type = 'possession'`;
- FK de preferência para usuário com `CASCADE`; isso remove somente configuração não histórica quando o próprio usuário é removido;
- JSONB recebe exclusivamente configuração validada, sem filtros, linhas ou dados pessoais.

Antes da criação, `alembic heads/current/history --verbose` confirmou `0039_possession_trips`. Após o arquivo, o head de código é `0040_report_preferences`; o banco existente foi preservado em `0039` e não recebeu upgrade nesta execução.

Em banco efêmero, `upgrade 0033` seguido de `upgrade head` produziu `0040`, tabela vazia e quatro constraints. `downgrade 0039` removeu apenas a tabela de preferências; novo upgrade retornou a `0040`. `alembic check` em outro banco efêmero no head retornou `No new upgrade operations detected`. Ambos foram removidos.

Limitação do downgrade: preferências de usuário são descartadas ao remover a tabela. Dados de posse, rota, destino, termo, confirmação e auditoria não são alterados.

## Arquivos principais

- backend: model/migration de preferência; schemas de relatório; registry; repository de consultas; service PDF/XLSX/preferência; rotas de posse/usuário; testes da Fase 6;
- frontend: `PossessionReportBuilder`, testes, API de posse, integração mínima na `PossessionPage`, acessibilidade de `SearchableSelect`/`DriverSelect` e estilos responsivos;
- documentação: checklist, riscos e este relatório.

Nenhuma dependência foi adicionada: openpyxl 3.1.5 e ReportLab 5.0.0 já estavam fixados.

## Segurança, auditoria e formatos

- repository usa somente expressões SQLAlchemy parametrizadas e extratores fixos da registry; a busca de `PADRAO` não consulta observações, origens, finalidades ou destinos ocultos, evitando inferência por filtro;
- consultas usam `joinedload/selectinload`, limite `N+1` e escopo organizacional de `PRODUCAO`;
- preview/exportação registram modo, preset, chaves, filtros normalizados, quantidade, duração, resultado e request context; busca registra somente presença/comprimento, nunca o texto ou as linhas;
- falhas esperadas também geram auditoria best-effort;
- XLSX preserva números/datas, congela cabeçalho, ativa autofiltro, limita largura, não contém macro e neutraliza `=`, `+`, `-`, `@` mesmo após whitespace;
- PDF repete cabeçalho e impõe limite de colunas para evitar fonte ilegível;
- arquivos usam `Content-Disposition`, `nosniff` e `Cache-Control: private, no-store, no-cache, max-age=0, must-revalidate`.

## Limites de volume e desempenho

- período máximo quando ambas as datas são informadas: 366 dias;
- PDF: 1.500 linhas, até 10 colunas em retrato ou 18 em paisagem;
- XLSX: 5.000 linhas e até 30 chaves no payload;
- busca: 100 caracteres, com `%`, `_` e `\\` escapados;
- probe read-only no banco existente, intervalo de um dia: modo posse, 5 linhas em 3 `SELECT`s/210,20 ms; modo rota, 0 linhas em 1 `SELECT`/200,08 ms. A quantidade de consultas não cresce por linha.

## Testes e comandos reais

- `python -m pytest tests/test_phase6_possession_reports.py -q`: **19 passed** na repetição final;
- `python -m pytest -q`: **137 passed, 17 skipped**;
- `npm test` na cópia local controlada: **12 arquivos, 25 testes aprovados**; cópia removida;
- Vitest direto no volume `Z:` iniciou e travou antes da coleta, reproduzindo o débito baseline;
- `npm run build`: **975 módulos, 9,23 s** na repetição final;
- `npm run lint`: **0 erros, 45 warnings preexistentes**;
- `npm audit --audit-level=high`: **0 vulnerabilidades**;
- `python -m compileall -q app`: aprovado;
- `alembic heads`: `0040_report_preferences`; banco existente `current`: `0039_possession_trips`;
- `alembic check` no banco efêmero em `0040`: nenhuma nova operação;
- primeiro `upgrade head` de banco totalmente vazio: falhou na migration legada `0034` por uso não efetivado do enum `PRODUCAO`; falha preservada, sem alteração de migrations aplicadas e sem `stamp`.

## Riscos para a Fase 7

1. Aplicar `0040` antes de liberar o configurador e remover o bloqueio temporário do módulo.
2. Institucionalizar execução frontend em workspace local/CI ou corrigir o runner no volume de rede.
3. Executar smoke test autenticado em navegador real com A/P/S, inclusive download, foco e leitor de tela.
4. Revisar memória/tempo em massa; a implementação atual é limitada e em memória, não streaming.
5. Revisar transversalmente retenção de relatórios, logs, cookies, CORS, CSP, arquivos e WCAG/eMAG.
6. Tratar em plano próprio a migration histórica `0034`; ela não foi editada nesta fase.

Nenhum item da Fase 7 foi implementado.
