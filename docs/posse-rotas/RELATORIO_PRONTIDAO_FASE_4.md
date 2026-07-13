# Relatório de prontidão para a Fase 4

Data: 2026-07-13

Branch: `feat/posse-rotas-relatorios-devolucao`

Commit técnico: `abbf266` (`chore(release): preparar base da fase 4`)

Status: **Fase 4 liberada para início; nenhuma funcionalidade da Fase 4 foi implementada neste trabalho.**

## 1. Resultado

Os bloqueios técnicos registrados ao final da Fase 3 foram tratados:

- o banco fonte foi protegido por backup validado e avançou de `0038_require_user_cpf` para `0039_possession_trips`;
- o upgrade preservou as 357 posses, 27 posses ativas, referências e arquivos legados;
- `alembic heads`, `alembic current` e o banco fonte convergem em `0039_possession_trips`;
- o ruído histórico do autogenerate foi eliminado pela reconciliação do metadata ORM com o schema já aplicado, sem migration nem alteração de schema;
- o frontend ganhou Vitest, jsdom, React Testing Library e ESLint;
- dependências vulneráveis foram atualizadas e `npm audit` passou de 9 achados para zero;
- o build foi dividido em chunks menores e não ultrapassou o limite configurado de 650 kB;
- arquivos de log locais deixaram de ser versionados, mas permaneceram fisicamente no servidor.

Os itens `ACTIVE_POSSESSION_EXISTS`, timeline/paginação de rotas, restrição visual por perfil e filtros dos novos eventos de auditoria continuam sendo requisitos funcionais da própria Fase 4, não bloqueios para iniciá-la.

## 2. Backup e baseline do banco fonte

Backup criado antes do upgrade:

| Evidência | Valor |
|---|---|
| Arquivo local e ignorado pelo Git | `storage/backups/pre-phase4-0038-20260713-090359.dump` |
| Formato | custom (`pg_dump -Fc`) |
| Tamanho | 1.324.309 bytes |
| SHA-256 | `a010a55399a1d92a3cfcdd6e171221a8f07710528eb4e17fa0c350d9245a1f09` |
| Validação | `pg_restore --list` aprovado, 310 entradas de catálogo |
| Dados de posse no catálogo | `TABLE DATA public vehicle_possession` presente |

A primeira consulta de baseline com `psql` colocou opções depois da URL e, por isso, o cliente ignorou a SQL. O comando foi corrigido antes do upgrade; os números abaixo são da execução válida. O backup não foi afetado.

## 3. Aplicação controlada da migration 0039

### 3.1 Primeira tentativa e rollback

O comando normal `python -m alembic upgrade 0039_possession_trips`, usando `frota_user`, falhou em:

```sql
ALTER SEQUENCE vehicle_possession_public_number_seq
OWNED BY vehicle_possession.public_number;
```

Motivo real: banco e conexão pertencem a `frota_user`, mas a tabela `vehicle_possession` pertence a `postgres`; o PostgreSQL exige o mesmo owner para tabela e sequence. A DDL transacional reverteu integralmente a tentativa. Evidências após a falha:

- `alembic current = 0038_require_user_cpf`;
- coluna `public_number` inexistente;
- sequence inexistente;
- 357 posses e checksum legado inalterados.

Não houve edição de migration, `stamp`, mudança de owner, drop, reset ou recriação.

### 3.2 Execução válida

A migration versionada foi executada sem alteração, em sessão temporária com `options=-c role=postgres`. O login permaneceu `frota_user`, mas o papel efetivo tornou-se o owner já existente da tabela durante a transação. A variável de ambiente temporária foi removida após o comando.

Resultado:

- upgrade aprovado;
- `alembic heads = 0039_possession_trips (head)`;
- `alembic current = 0039_possession_trips (head)`;
- tabela e sequence continuam pertencendo a `postgres`;
- FK `vehicle_possession.vehicle_id` continua com `ON DELETE RESTRICT`.

## 4. Preservação antes/depois

| Medida | Antes (0038) | Imediatamente após (0039) |
|---|---:|---:|
| `vehicle_possession` | 357 | 357 |
| Posses ativas | 27 | 27 |
| Fotos da galeria | 2 | 2 |
| Veículos | 223 | 223 |
| Usuários | 35 | 35 |
| Auditorias | 2.195 | 2.195 |
| Colunas de `vehicle_possession` | 31 | 33 |
| `public_number` nulo | — | 0 |
| `public_number` distinto | — | 357 |
| Faixa de número público | — | 1–357 |
| Rotas/destinos/confirmações | tabelas ausentes | 0 / 0 / 0 |

Checksums antes/depois:

- registros legados de posse: `182ae9587ca4e128b2d06b0c5ba2164f`;
- referências de arquivos: `600ba0a6ae83cceb1c916222871fe8e1`;
- referências verificadas no storage: 10;
- arquivos ausentes: 0.

Na consulta final, `audit_logs` estava em 2.197 porque a aplicação permaneceu ativa e usuários reais registraram dois eventos de importação depois da janela do upgrade. As posses e os demais números relevantes permaneceram inalterados; esses eventos não foram produzidos pela migration nem pelos testes isolados.

## 5. Reconciliação do Alembic sem schema novo

O primeiro `alembic check` após o upgrade repetiu os diffs históricos já registrados nas Fases 2 e 3. O metadata ORM foi alinhado ao schema de produção:

- `JSON` passou a refletir `JSONB` em imports;
- índices automáticos passaram a usar os nomes existentes nas migrations;
- flags de índice inexistentes em `drivers.cnh_numero` e `vehicles.renavam` foram removidas do metadata;
- a FK `fines.created_by` passou a refletir a regra efetivamente aplicada;
- o índice único existente de `fuel_supply_orders.validation_code` deixou de ser duplicado por uma `UniqueConstraint` implícita.

Nenhuma migration foi criada e nenhuma DDL foi executada nessa reconciliação. Resultado final:

```text
No new upgrade operations detected.
```

## 6. Preparação do frontend

Dependências diretamente afetadas:

| Pacote | Estado anterior | Estado validado |
|---|---:|---:|
| Axios | 1.8.x | 1.18.1 |
| jsPDF | 2.5.x | 4.2.1 |
| jsPDF AutoTable | 3.8.x | 5.0.8 |
| React Router DOM | 6.30.x | 6.30.4 |
| Vite | 6.4.2 instalado | 8.1.4 |
| plugin React/Vite | 4.7 instalado | 6.0.3 |
| Vitest | ausente | 4.1.10 |

Foram adicionados:

- `npm test` e `npm run test:watch`;
- `npm run lint` com configuração incremental;
- jsdom, jest-dom, React Testing Library e user-event;
- quatro testes do contrato de erro/API e um smoke test real de geração PDF/AutoTable;
- chunks dedicados para React, mapas, Axios e exportações.

O utilitário de erro teve duas mensagens com codificação quebrada corrigidas (`Não foi possível...` e `referência`).

O lint termina com zero erros. Há 45 warnings legados — principalmente dependências de hooks e pequenas limpezas — mantidos como baseline para não antecipar uma refatoração funcional ampla. O projeto é JavaScript puro e não possui contrato de tipos; portanto, não foi criado um script de `typecheck` artificial.

## 7. Validações finais

| Comando | Resultado real |
|---|---|
| `python -m pytest tests -q` com `PHASE2_TEST_DATABASE_URL` e `PHASE3_TEST_DATABASE_URL` isoladas | **121 passed**, 22 warnings de `python-jose`, 31,17 s |
| `python -m compileall -q app` | aprovado |
| `python -m alembic heads` | `0039_possession_trips (head)` |
| `python -m alembic current` | `0039_possession_trips (head)` |
| `python -m alembic history --verbose` | cadeia íntegra; 0039 revisa 0038 |
| `python -m alembic check` | **No new upgrade operations detected** |
| `npm test` | **2 arquivos, 5 testes aprovados** |
| `npm run lint` / `eslint src --quiet` | zero erros; 45 warnings legados no relatório completo |
| `npm run build` | 964 módulos; maior chunk 451,68 kB; aprovado em 9,62 s |
| `npm audit --audit-level=low` | **0 vulnerabilidades** |
| `git diff --check` | aprovado |

## 8. Versões do ambiente

| Componente | Versão |
|---|---:|
| Python | 3.12.10 (`backend/.venv`) |
| pytest | 8.3.4 |
| Alembic | 1.14.1 |
| SQLAlchemy | 2.0.38 |
| PostgreSQL cliente/servidor | 16.13 / 16.13 |
| Node.js | 24.14.0 |
| npm | 11.12.1 |

A `.venv` da raiz referencia um Python 3.14 removido; ela não foi usada. O ambiente válido e documentado do backend é `backend/.venv`.

## 9. Condições para iniciar a Fase 4

A Fase 4 pode começar no commit técnico `abbf266`, observando:

1. tratar `409 ACTIVE_POSSESSION_EXISTS` com confirmação e justificativa explícitas;
2. consumir paginação/filtros de rotas e respeitar `operational_details_restricted`;
3. manter o backend como fonte de verdade de RBAC/LGPD;
4. incluir os seis eventos da Fase 3 nos filtros administrativos;
5. criar testes de componentes para cada novo estado de loading, erro, conflito e permissão;
6. não alterar schema nem avançar para termo único/devolução da Fase 5.

Não há bloqueio técnico conhecido para iniciar a Fase 4.
