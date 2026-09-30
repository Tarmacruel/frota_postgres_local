# Matriz de telas e estratégia de evolução

| Tela | Arquivo conhecido | Fase | Intervenção principal | Referência atual |
|---|---|---:|---|---|
| Início | `DashboardPage.jsx` | 3 | KPIs, ações rápidas, pendências | `01-inicio-dashboard.png` |
| Veículos | `VehiclesPage.jsx` | 4 | miniaturas, filtros, tabela, overflow | `02-veiculos.png` |
| Empréstimos | localizar no working tree | 4 | manter fluxo; estilizar após auditoria | `03-emprestimos.png` |
| Posses | `PossessionPage.jsx` | 4 | tabela, miniaturas, ação primária, overflow | `04-posses-operacional.png` |
| Condutores | `DriversPage.jsx` | 4 | filtros, alertas CNH, paginação | `05-condutores.png` |
| Manutenções | `MaintenancePage.jsx` | 4 | status, custo, serviço/peças | `06-manutencoes.png` |
| Sinistros | `ClaimsPage.jsx` | 5 | lista compacta e status | `07-sinistros.png` |
| Multas | `FinesPage.jsx` | 5 | tabela compacta e status | `08-multas.png` |
| Abastecimentos | `FuelSuppliesPage.jsx` | 5 | ordens + histórico; ações agrupadas | `09-abastecimentos.png` |
| Histórico abastecimentos | `FuelSuppliesPage.jsx` | 5 | filtros e leitura de consumo | `10-abastecimentos-historico.png` |
| Ordens abertas | `FuelSupplyOrdersPage.jsx` | 5 | prazo, assinatura, confirmação | `11-ordens-abertas.png` |
| Cadastros | `CadastrosPage.jsx` | 6 | tabs, formulário e tabela | `12-cadastros.png` |
| Postos | `FuelStationsPage.jsx` | 6 | cadastro, vínculos, tabela | `13-postos.png` |
| Pagamentos / Processos | `PaymentProcessesPage.jsx` | 6 | filtros/KPIs/lista | `14-processos-pagamento-processos.png` |
| Pagamentos / Gestão contrato | `PaymentProcessesPage.jsx` | 6 | dashboard financeiro e gráficos | `15-processos-pagamento-gestao-contrato.png` |
| Pagamentos / Contratos | `PaymentProcessesPage.jsx` | 6 | lista mestre/detalhe | `16-processos-pagamento-contratos.png` |
| Pagamentos / Fornecedores | `PaymentProcessesPage.jsx` | 6 | lista + criação lateral | `17-processos-pagamento-fornecedores.png` |
| Análises | `AdminAnalyticsDashboard.jsx` | 6 | cards, gráficos, alertas | `18-analises.png` |
| Importar/Exportar | `DataImportsPage.jsx` | 6 | lotes, revisão, conflitos, ações | `19-importar-exportar.png` |
| Usuários | `UsersPage.jsx` | 6 | status/perfil, ações, tabela | `20-usuarios.png` |
| Auditoria | `AuditPage.jsx` | 6 | densidade, JSON/detalhes legíveis | `21-auditoria.png` |

## Priorização visual

### P0

- Shell global
- Dashboard
- Veículos
- Posses
- Condutores
- Manutenções

### P1

- Abastecimentos
- Ordens abertas
- Sinistros
- Multas
- Processos de pagamento

### P2

- Cadastros
- Postos
- Análises
- Import/Export
- Usuários
- Auditoria

P2 não significa pouca importância funcional; significa que o padrão visual já estará consolidado quando essas telas forem tratadas.
