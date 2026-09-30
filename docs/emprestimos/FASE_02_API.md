# Fase 02 — API de empréstimos entre secretarias

Base de testes: `https://testefrota.sirel.com.br/api/vehicle-loans` ou `http://localhost:6969/api/vehicle-loans`.

## Permissões e contrato

Novo módulo `vehicle_loans`, disponível por padrão para ADMIN e PRODUCAO (consulta, criação e edição). Exclusão física não é oferecida. Permissões explícitas podem restringir essas ações; PADRAO e POSTO não recebem acesso mesmo com flags elevadas. Operadores de produção veem apenas empréstimos das suas secretarias; administradores têm consulta global.

Todas as mutações usam a sessão e a proteção CSRF existentes. Informar `acting_organization_id`; operadores devem pertencer à secretaria indicada. Para ADMIN, `justification` de 8 a 1.000 caracteres é obrigatória em cada mutação. Nenhum administrador pode confirmar o próprio envio de entrega ou devolução.

Após criar o rascunho, todas as mutações exigem `expected_version` igual à versão consultada. Uma alteração de proposta aguardando recebimento volta ao rascunho, exigindo novo envio e nova revisão. Não há efetivação retroativa nesta etapa.

## Endpoints

| Método e caminho relativo | Comportamento |
|---|---|
| `GET /` | Lista paginada; parâmetros `page`, `limit`, `vehicle_id`, `status` |
| `POST /` | Cria rascunho na secretaria de origem |
| `GET /{id}` | Consulta dados e versão |
| `PUT /{id}` | Substitui os dados editáveis de rascunho/proposta pendente |
| `GET /{id}/events` | Histórico imutável de eventos |
| `GET /{id}/context` | Versão, pendências abertas e referência mínima de odômetro |
| `POST /{id}/submit` | Origem envia proposta para recebimento |
| `POST /{id}/accept` | Recebedora aceita e efetiva a entrega |
| `POST /{id}/reject` | Recebedora rejeita, com justificativa |
| `POST /{id}/cancel` | Origem cancela rascunho/proposta pendente, com justificativa |
| `POST /{id}/request-return` | Recebedora solicita a devolução |
| `POST /{id}/accept-return` | Origem confirma recebimento e efetiva devolução |
| `POST /{id}/reject-return` | Origem rejeita a devolução; empréstimo volta a ativo |
| `POST /{id}/cancel-return` | Recebedora retira a solicitação de devolução; empréstimo volta a ativo |

O caminho da listagem/criação é `/api/vehicle-loans`, sem necessidade de barra final.

### Criação de rascunho

```json
{
  "vehicle_id": "UUID_DO_VEICULO",
  "acting_organization_id": "UUID_DA_ORIGEM",
  "destination_allocation_id": "UUID_DA_LOTACAO_RECEBEDORA",
  "reason": "Atendimento temporário das atividades da secretaria",
  "expected_return_at": null,
  "delivery_odometer_km": "12500.0",
  "delivery_condition": "Veículo entregue sem ressalvas"
}
```

Motivo e destino são obrigatórios no rascunho. Odômetro e condições podem ser preenchidos depois, mas são obrigatórios no envio. Prazo nulo significa indeterminado; uma previsão informada deve incluir fuso e permanecer futura no aceite. A origem é obtida do cadastro, e a recebedora é obtida da lotação de destino.

### Envio, aceite e outras ações

```json
{
  "expected_version": 2,
  "acting_organization_id": "UUID_DA_SECRETARIA_DA_ACAO",
  "justification": "Justificativa quando exigida pela ação ou pelo perfil"
}
```

Para `PUT`, enviar os mesmos campos da proposta (sem `vehicle_id`) e a versão. `request-return` também exige `return_allocation_id`, `return_odometer_km` e `return_condition`. A lotação de retorno deve pertencer à origem. Rejeições e cancelamentos sempre exigem justificativa.

## Regras transacionais

- Entrega: `DRAFT → AWAITING_RECEIPT → ACTIVE`.
- Devolução: `ACTIVE → AWAITING_RETURN_RECEIPT → RETURNED`.
- Solicitação de devolução rejeitada ou retirada volta para `ACTIVE`.
- Entrega rejeitada termina em `REJECTED`; proposta cancelada termina em `CANCELLED`. Um novo empréstimo pode ser criado depois.
- Rascunhos não reservam o veículo. Apenas uma proposta enviada/empréstimo ativo pode existir por veículo.
- O instante efetivo é o horário do servidor no aceite; não é fornecido pelo cliente.
- Posses/rotas abertas e ordens com estado OPEN bloqueiam envio e aceite da troca. Uma ordem ainda marcada OPEN bloqueia mesmo se seu prazo já passou: ela deve ser resolvida pelo fluxo de ordens.
- Aceites revalidam versão, secretaria, lotação, odômetro e pendências. A transação grava estado, lotação, evento e auditoria de forma atômica.
- Na entrega, o odômetro não pode ficar abaixo da última posse encerrada. Na devolução, considera-se também o maior odômetro registrado em posses, rotas encerradas e abastecimentos desde o início do empréstimo.
- Escritas usam bloqueio de veículo antes do empréstimo e da lotação. Lotes de ordens bloqueiam veículos em ordem estável para evitar deadlock.
- A criação de posses revalida o acesso depois de adquirir o bloqueio. Ordens novas/reabertas precisam corresponder à responsável atual quando existe histórico de empréstimo. Edição cadastral não pode transferir a lotação durante empréstimo em andamento.

Respostas usuais: `201` na criação, `200` nas demais ações, `403` para ação não autorizada, `404` para empréstimo fora do escopo, `409` para estado/versão/pendências conflitantes e `422` para dados incompletos ou inválidos. Conflitos retornam código e mensagem em `detail`, com contexto quando aplicável.

## Validação e operação

Migration `0045_loan_workflow`: versão e identificação dos usuários que enviaram entrega/devolução. Aplicada somente no banco de testes. O downgrade recusa remover evidências de um fluxo já utilizado.

```powershell
Set-Location D:\FROTAS\frota_emprestimos_testes\backend
$env:LOAN_MIGRATION_TESTS='1'
.\.venv\Scripts\python.exe -m pytest tests/test_vehicle_loan_api.py tests/test_vehicle_loan_migration.py tests/test_vehicle_loan_foundation.py -q
```

Resultado: 24 testes específicos aprovados, incluindo concorrência real em PostgreSQL e origem automática de veículos novos. A suíte backend completa terminou com 405 aprovados e 19 skips condicionais. Cada suíte de integração cria um banco descartável no cluster 5441 e o remove após os testes. Login e consulta autenticada da nova API também foram verificados pelo túnel, sem criar empréstimos fictícios na base restaurada.

Limite da fase: API e proteções necessárias à troca. A integração completa dos módulos/relatórios, os botões e formulários, os termos/assinaturas e a regularização retroativa seguem nas fases 03 a 06.
