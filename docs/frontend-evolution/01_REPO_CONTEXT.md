# Contexto técnico do repositório analisado

## Snapshot

| Item | Valor |
|---|---|
| Repositório | `Tarmacruel/frota_postgres_local` |
| Branch | `feature/certificado-digital-hml` |
| HEAD observado | `12150b19919b999cd47668abe4c3e6b5f3504329` |
| Último commit observado | `feat: sugere odometro inicial com historico de posses` |
| Frontend | React 18 + Vite |
| Router | react-router-dom 6 |
| HTTP | axios |
| Gráficos | recharts |
| PDF/XLSX | jspdf, jspdf-autotable, zipcelx |
| Mapas | leaflet |
| Testes | Vitest + Testing Library |
| CSS | arquivo global `frontend/src/styles.css` + variáveis CSS |

## Scripts do frontend

```json
{
  "dev": "vite",
  "build": "vite build",
  "lint": "eslint src",
  "test": "vitest run",
  "test:watch": "vitest",
  "preview": "vite preview"
}
```

## Homologação observada

O arquivo `frontend/.env.homologation.example` contém, no snapshot:

```text
VITE_API_BASE_URL=/api
VITE_API_PROXY_TARGET=http://127.0.0.1:8010
VITE_APP_ENV=homologation
VITE_HOMOLOGATION=true
VITE_CERTIFICATE_SIGNING_ENABLED=true
VITE_SIGNATURE_AGENT_URL=http://127.0.0.1:54174
VITE_SIGNATURE_BACKEND_URL=http://127.0.0.1:8010
VITE_FRONTEND_HOST=127.0.0.1
VITE_FRONTEND_PORT=3010
```

Não sobrescrever esses valores por causa do redesign.

## Arquivos centrais

- `frontend/src/main.jsx` — aplica tema salvo em `data-theme`.
- `frontend/src/App.jsx` — rotas e `ProtectedRoute`.
- `frontend/src/components/Layout.jsx` — shell, navegação, busca, tema, notificações e usuário.
- `frontend/src/styles.css` — ~146 KB no snapshot; contém tokens, componentes, dark theme e regras de densidade desktop.
- `frontend/src/pages/DashboardPage.jsx` — Início.
- `frontend/src/pages/VehiclesPage.jsx` — Veículos.
- `frontend/src/pages/PossessionPage.jsx` — Posses; arquivo grande e sensível.
- `frontend/src/pages/DriversPage.jsx` — Condutores.
- `frontend/src/pages/MaintenancePage.jsx` — Manutenções.
- `frontend/src/pages/ClaimsPage.jsx` — Sinistros.
- `frontend/src/pages/FinesPage.jsx` — Multas.
- `frontend/src/pages/FuelSuppliesPage.jsx` — Abastecimentos.
- `frontend/src/pages/FuelSupplyOrdersPage.jsx` — Ordens abertas.
- `frontend/src/pages/CadastrosPage.jsx` — Cadastros.
- `frontend/src/pages/FuelStationsPage.jsx` — Postos.
- `frontend/src/pages/PaymentProcessesPage.jsx` — Processos de pagamento; ~90 KB no snapshot.
- `frontend/src/pages/AdminAnalyticsDashboard.jsx` — Análises.
- `frontend/src/pages/DataImportsPage.jsx` — Importar/Exportar.
- `frontend/src/pages/UsersPage.jsx` — Usuários.
- `frontend/src/pages/AuditPage.jsx` — Auditoria.

## Tema atual

O sistema já tem tema claro/escuro e usa `document.documentElement.dataset.theme`. A evolução deve **aproveitar o mecanismo existente**, não criar um segundo sistema de tema.

## Observação importante sobre “Empréstimos”

Os screenshots fornecidos mostram um módulo/menu **Empréstimos**. Entretanto, no snapshot remoto analisado, `App.jsx`, `Layout.jsx` e a lista de páginas não exibem uma página/rota dedicada com esse nome.

Isso indica possível diferença entre:

- ambiente HML efetivamente executado;
- working tree local não publicado;
- branch remota no momento do snapshot;
- ou reutilização de outro fluxo.

**O Codex não deve inventar/remover esse módulo.** Na Fase 0, localizar a implementação real no working tree em uso antes de estilizar.
