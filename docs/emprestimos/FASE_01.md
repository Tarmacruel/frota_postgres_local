# Empréstimos entre secretarias — fase 01

## Ambiente entregue

- Aplicação: **http://localhost:6969** (frontend compilado e API no mesmo endereço).
- Acesso pelo túnel: **https://testefrota.sirel.com.br**, apontando para `http://localhost:6969`. Host, CORS e CSRF permitem explicitamente esse endereço.
- Cópia: `D:\FROTAS\frota_emprestimos_testes`.
- Branch: `feature/emprestimos-secretarias`, baseada em `12150b1`.
- PostgreSQL 16 independente: `127.0.0.1:5441`, banco `frota_emprestimos_testes`.
- Arquivos próprios em `data/uploads`; banco, backup e logs em `storage/loan-tests`.
- Cookies exclusivos, segredos próprios, assinatura externa desabilitada e faixa de homologação.
- Não há atualização automática do snapshot nem inicialização automática no Windows.

Os usuários copiados mantêm suas senhas da data do snapshot. Uma conta administrativa adicional existe somente nesta cópia; as credenciais estão no arquivo local ignorado pelo Git `storage/loan-tests/test-login.json`. Não publicar esse arquivo, o backup nem os arquivos de configuração.

## Operação

No PowerShell, a partir da pasta da cópia:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/loan-tests.ps1 start
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/loan-tests.ps1 status
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/loan-tests.ps1 stop
```

Os comandos validam a pasta, as configurações e a identidade do processo. `start` não aplica migrations. Para aplicar novas migrations **somente na cópia**:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/loan-tests.ps1 migrate
```

Após alterações no frontend, executar `npm run build` em `frontend`. Após alterações no backend, usar `stop` e `start`.

O script `loan_test_environment.py` é de provisionamento único: recusa sobrescrever um cluster existente. Faz exportação consistente por snapshot, restauração em cluster independente, comparação das contagens e cópia de arquivos. Os scripts antigos de homologação de certificados têm caminhos fixos de outro ambiente e **não são usados** aqui.

## Fundação implementada

Migration: `0044_vehicle_loans`, após `0043_certificate_foundation`.

- `vehicles.owner_organization_id`: origem inicial obtida da lotação estruturada ativa. Sem origem identificável, fica nulo. Históricos conflitantes entre secretarias não são presumidos.
- `vehicle_loans`: origem/destino, lotações, representantes, motivo, estados, prazo opcional, datas efetivas, odômetros e condições de entrega/devolução.
- `vehicle_loan_events`: eventos com ator, secretaria representada, justificativa, data efetiva e detalhes. Trigger impede atualização e exclusão dos eventos.
- Índice parcial único impede dois empréstimos em andamento para o mesmo veículo. Rascunhos não reservam o veículo.
- `vehicle_loan_id` opcional em posses, abastecimentos, ordens, manutenção, multas e sinistros.
- `responsible_organization_id` opcional em posses, manutenção, multas e sinistros. Abastecimentos e ordens reutilizam `organization_id`.
- Nenhum registro operacional antigo foi reatribuído nesta fase.

`VehicleLoanRepository` resolve lotação e empréstimo por data. A política `VehicleScope` distingue consulta, operação e gestão cadastral; ela complementa as permissões de módulo, não as substitui. As rotas existentes ainda não usam essa política; a integração ocorre na fase 03.

Intervalos de responsabilidade incluem a entrega e excluem o instante da devolução. A consulta da recebedora inclui o evento de devolução, mas não operações posteriores. Datas devem ter fuso; períodos sobrepostos exigem revisão. Veículos legados sem origem mantêm a lotação atual como referência de gestão.

Downgrade é testado apenas sem dados novos; recusa remover empréstimos ou atribuições registrados. Após uso do módulo, preferir correções por migration posterior.

## Evidências

- 47 tabelas restauradas com contagens idênticas ao snapshot antes de criar a conta de teste.
- 262 referências de arquivos locais conferidas; nenhum arquivo referenciado ausente.
- Origem definida em 284 veículos; nenhum veículo pendente nesta cópia.
- 7 testes específicos de política/migration passaram, incluindo upgrade desde banco vazio, downgrade/upgrade e `alembic check` sem diferenças.
- Regressão backend: 385 passaram e 22 foram pulados por exigirem ambientes específicos. Os testes novos de migration, pulados na execução padrão, foram executados separadamente no cluster isolado.
- Frontend: 21 testes passaram com `--pool forks`; build concluído. O pool padrão `vmThreads` apresentou interferência entre mocks ao executar os arquivos juntos; o teste de posse isolado passou. Não houve alteração nos componentes da aplicação para contornar essa limitação.
- Login real, sessão, listagens de veículos, posses e abastecimentos: HTTP 200.
- Parada e retomada da cópia verificadas. Produção permaneceu saudável, com os mesmos processos nas portas 8000 e 3000 e árvore Git limpa.

Detalhes locais: `storage/loan-tests/restore-report.json` e logs no mesmo diretório. Para repetir as verificações específicas:

```powershell
Set-Location backend
$env:LOAN_MIGRATION_TESTS='1'
.\.venv\Scripts\python.exe -m pytest tests/test_vehicle_loan_foundation.py tests/test_vehicle_loan_migration.py -q
```

Os testes de migration criam banco descartável com prefixo `loan_migration_`, somente no cluster 5441, e o removem ao terminar. Não utilizam o banco restaurado para testes destrutivos.

## Limite e próxima etapa

**A fase 01 está concluída.** No encerramento desta fase ainda não havia tela nem API de empréstimos. A fase 02 foi posteriormente autorizada e entregue; consulte [o relatório atualizado das etapas](RELATORIO_ETAPAS.md). Telas, termos, integração operacional completa e regularização pertencem às fases seguintes.
