# Diagrama de componentes — baseline da Fase 0

O diagrama representa a branch `feat/posse-rotas-relatorios-devolucao` no SHA `3f956950959f1e38e544ebff09071043db57359f`.

```mermaid
flowchart LR
    U[Usuário<br/>ADMIN / PRODUCAO / PADRAO]

    subgraph FE[Frontend React + Vite]
        PR[ProtectedRoute]
        AC[AuthContext]
        PP[PossessionPage]
        PF[PossessionForm]
        API[api/client.js<br/>Axios + cookies]
        EXP[exportData.js<br/>jsPDF + zipcelx]
        MOD[Modal reutilizável]
    end

    subgraph BE[Backend FastAPI]
        CORS[CORSMiddleware]
        AUTH[auth router/service]
        DEPS[get_current_user<br/>require_writer<br/>require_admin]
        ROUTER[possession router]
        SERVICE[PossessionService]
        REPO[PossessionRepository]
        AUDIT[AuditService / AuditRepository]
        FILES[FileResponse protegido]
    end

    subgraph PERSIST[Persistência]
        DB[(PostgreSQL 16.13)]
        VP[vehicle_possession]
        PH[vehicle_possession_photos]
        AL[audit_logs]
        FS[(backend/storage<br/>photos + documents)]
    end

    U --> PR
    PR --> AC
    AC --> API
    U --> PP
    PP --> PF
    PP --> MOD
    PF --> API
    PP --> EXP
    API --> CORS
    CORS --> AUTH
    CORS --> ROUTER
    AUTH --> DEPS
    ROUTER --> DEPS
    ROUTER --> SERVICE
    SERVICE --> REPO
    SERVICE --> AUDIT
    SERVICE --> FS
    SERVICE --> FILES
    FILES --> FS
    REPO --> DB
    AUDIT --> DB
    DB --- VP
    DB --- PH
    DB --- AL
```

## Sequência atual de criação/substituição

```mermaid
sequenceDiagram
    actor Operador
    participant Form as PossessionForm
    participant API as POST /api/possession
    participant Svc as PossessionService
    participant Repo as PossessionRepository
    participant DB as PostgreSQL
    participant Disk as Storage
    participant Audit as AuditService

    Operador->>Form: seleciona veículo/condutor
    Form->>Form: captura foto + geolocalização
    Form->>API: multipart + fotos + metadados<br/>+ documento opcional
    API->>Svc: require_writer + payload validado
    Svc->>Repo: get_active_by_vehicle
    Repo->>DB: SELECT posse ativa (sem lock)
    Svc->>Repo: end_active_for_vehicle(effective_start)
    Repo->>DB: UPDATE fim/hodômetro da posse anterior
    Note over Svc,DB: encerramento silencioso, sem confirmação<br/>ou evento específico de substituição
    Svc->>Repo: create(nova posse)
    Repo->>DB: INSERT + flush
    Svc->>Disk: grava documento e fotos
    Svc->>Audit: record CREATE/POSSESSION
    Audit->>DB: INSERT audit_logs
    Svc->>DB: COMMIT
    Svc-->>API: posse serializada
    API-->>Form: 200

    alt IntegrityError, OSError ou exceção
        Svc->>DB: ROLLBACK
        Svc->>Disk: remove arquivos recém-gravados
        Svc-->>API: 409, 500 ou erro original
    end
```

## Fronteiras e ausências relevantes

```mermaid
flowchart TB
    CURRENT[Baseline atual]
    CURRENT --> COOKIE[Cookie HttpOnly + SameSite=Lax]
    CURRENT --> RBAC[RBAC por três papéis]
    CURRENT --> UNIQUE[Índice parcial: uma posse ativa]
    CURRENT --> NOSTORE[no-store em fotos/documentos]

    CURRENT -. ausente .-> CSRF[CSRF + Origin/Referer]
    CURRENT -. ausente .-> RID[Request/correlation ID]
    CURRENT -. ausente .-> MASK[Mascaramento doc/contato]
    CURRENT -. ausente .-> TRIP[Rota e destino]
    CURRENT -. ausente .-> RETURN[Confirmação versionada]
    CURRENT -. ausente .-> SERVERREPORT[Registry/relatório de posse no backend]
    CURRENT -. ausente .-> E2E[Testes de posse/RBAC/arquivos]
```

## Incompatibilidade observada

O banco está marcado em `0038_require_user_cpf`, enquanto o grafo Alembic desta branch termina em dois heads antigos (`0014_fleet_analytics` e `10d2f34e089d`). Portanto, o diagrama da aplicação não cobre todas as tabelas e colunas existentes no banco local. Essa incompatibilidade é bloqueadora para a Fase 1.
