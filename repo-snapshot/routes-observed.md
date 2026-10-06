# Rotas observadas no `App.jsx`

Snapshot `12150b19919b999cd47668abe4c3e6b5f3504329`.

| Rota | Página | Proteção |
|---|---|---|
| `/` | DashboardPage | ProtectedRoute/Layout |
| `/vehicles` | VehiclesPage | `vehicles:view` |
| `/posses` | PossessionPage | `possession:view` |
| `/condutores` | DriversPage | `drivers:view` |
| `/manutencoes` | MaintenancePage | `maintenance:view` |
| `/sinistros` | ClaimsPage | `claims:view` |
| `/multas` | FinesPage | `fines:view` |
| `/abastecimentos` | FuelSuppliesPage | `fuel_supplies:view` |
| `/postos` | FuelStationsPage | `fuel_stations:view` |
| `/ordens-abastecimento` | FuelSupplyOrdersPage | `fuel_supply_orders:view` |
| `/processos-pagamento` | PaymentProcessesPage | `payment_processes:view` |
| `/users` | UsersPage | admin only |
| `/analytics` | AdminAnalyticsDashboard | `analytics:view` |
| `/importacao-dados` | DataImportsPage | `data_imports:view` |
| `/auditoria` | AuditPage | admin only |

Rotas públicas de validação/assinatura também existem e estão fora do escopo visual inicial. Não alterá-las como efeito colateral.
