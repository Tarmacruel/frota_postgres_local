# Diagrama de componentes — baseline e Fase 1

O domínio funcional foi inventariado na Fase 0. A camada transversal de segurança representa a implementação da Fase 1 no commit `61d3433`.

```mermaid
flowchart LR
    U[Usuário<br/>ADMIN / PRODUCAO / PADRAO]

    subgraph FE[Frontend React + Vite]
        PR[ProtectedRoute]
        AC[AuthContext]
        PP[PossessionPage]
        PF[PossessionForm]
        API[api/client.js<br/>Axios + cookies + CSRF em memória]
        EXP[exportData.js<br/>jsPDF + zipcelx]
        MOD[Modal reutilizável]
    end

    subgraph BE[Backend FastAPI]
        CORS[CORSMiddleware]
        SEC[RequestContext + CSRF<br/>erros e headers]
        AUTH[auth router/service]
        DEPS[get_current_user<br/>require_permission<br/>require_admin]
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
    API --> SEC
    SEC --> CORS
    CORS --> AUTH
    CORS --> ROUTER
    AUTH --> DEPS
    ROUTER --> DEPS
    ROUTER --> SERVICE
    SERVICE --> REPO
    SERVICE --> AUDIT
    SEC -. ContextVar .-> AUDIT
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
    API->>Svc: require_permission(create) + payload validado
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

## Fronteiras após a Fase 1 e ausências relevantes

```mermaid
flowchart TB
    CURRENT[Estado após Fase 1]
    CURRENT --> COOKIE[Cookie HttpOnly + SameSite=Lax]
    CURRENT --> RBAC[RBAC granular + teto por perfil]
    CURRENT --> UNIQUE[Índice parcial: uma posse ativa]
    CURRENT --> NOSTORE[no-store em toda API]
    CURRENT --> CSRF[Double-submit CSRF + Origin/Referer]
    CURRENT --> RID[Request ID em resposta, erro e auditoria]
    CURRENT --> CONTEXT[IP/UA/método/path/UTC normalizados]
    CURRENT --> HEADERS[nosniff + referrer + anti-frame + CSP mínima]
    CURRENT --> MASK[Novos detalhes de auditoria sanitizados]

    CURRENT -. ausente .-> TRIP[Rota e destino]
    CURRENT -. ausente .-> RETURN[Confirmação versionada]
    CURRENT -. ausente .-> SERVERREPORT[Registry/relatório de posse no backend]
    CURRENT -. pendente .-> LEGACYAUDIT[Tratamento LGPD das auditorias legadas]
    CURRENT -. pendente .-> PROXY[CIDRs reais do proxy institucional]
```

## Alembic reconciliado

O código e o banco retornam um único head/current `0038_require_user_cpf`. A Fase 1 não alterou migration ou schema. A incompatibilidade registrada no baseline inicial foi resolvida antes da implementação de segurança.
