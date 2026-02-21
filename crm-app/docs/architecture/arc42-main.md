# System Architecture Documentation — V School CRM
Documentation template based on **arc42** (v8.2) and visual representations using the **C4 Model**.

---

## 1. Introduction and Goals
A comprehensive CRM system designed for V School (Japanese Culinary Academy). It provides a 360° view of customer engagement, real-time marketing analytics, and AI-driven insights to optimize business operations and student recruitment.

### Key Goals
- **Real-time Insights:** Instant visibility into marketing spend and ROAS.
- **Engagement:** Seamless integration with Facebook Messenger for student communication.
- **Scalability:** Hybrid architecture to handle growing student data and complex AI workloads.

---

## 2. Architecture Constraints
- **Database:** PostgreSQL (Supabase) as the primary relational store.
- **High Performance:** Must use local JSON caching for high-traffic dashboard components.
- **AI Integration:** Python-based worker for Gemini AI processing and heavy data manipulation.
- **Queueing:** Redis/BullMQ for asynchronous job processing.

---

## 3. Context and Scope
Describes the system's environment and external interfaces.

### 3.1 Business Context
The CRM interacts with students (Customers), Academy staff (Employees), and external platforms like Meta (Facebook/Messenger).

### 3.2 Technical Context
```mermaid
graph TD
    User([Customer / Employee])
    System[V School CRM System]
    Meta[Meta Graph API / Facebook]
    Supabase[(Supabase / PostgreSQL)]
    Gemini[Google Gemini AI]

    User -->|Uses| System
    System -->|Fetches Marketing/Chat Data| Meta
    System -->|Stores & Retrieves Data| Supabase
    System -->|Processes Intelligence| Gemini
    Meta -->|Sends Webhooks| System
```

---

## 4. Solution Strategy
- **Hybrid Platform:** Next.js for the web interface and API; Python for background AI and sync tasks.
- **Cache-First UI:** Local filesystem caching to minimize database latency and API rate limits.
- **Event-Driven:** Changes in the database or external webhooks trigger background workers via Redis.

---

## 5. Building Block View
Detailed decomposition of the system using C4 containers and components.

### 5.1 Level 2: Containers
```mermaid
graph TD
    User([Customer / Employee])
    
    subgraph V_School_CRM_System [V School CRM System]
        Web_App[Next.js App]
        Python_Worker[Python AI Worker]
        Redis_Queue[Redis Queue]
        JSON_Cache[Local JSON Cache]
    end

    Supabase[(PostgreSQL / Supabase)]
    Meta[Meta Graph API]
    Gemini[Google Gemini AI]

    User -->|Interacts with| Web_App
    Web_App -->|Reads/Writes| Supabase
    Web_App -->|Fast Reads| JSON_Cache
    Web_App -->|Enqueues Jobs| Redis_Queue
    
    Redis_Queue -->|Processed by| Python_Worker
    Python_Worker -->|Syncs/Responds| Meta
    Python_Worker -->|RAG / AI Analysis| Gemini
    Python_Worker -->|Updates| Supabase
    
    Meta -->|Webhooks| Web_App
```

### 5.2 Level 3: Components (CRM Web App)
```mermaid
%% [MermaidChart: e0a42f31-fbb1-49a2-b675-007850abd9a3]
graph TD
    subgraph Nextjs_App [Next.js Web Application]
        API_Routes[API Routes / App Router]
        UI_Components[React UI Components]
        Lib_Core[Lib Core: chatService, taskManager, marketingService]
        Prisma_Client[Prisma Client / DB Adapter]
        Cache_Sync[Cache Sync Utility]
        Cron_Scheduler[Cron Scheduler / Instrumentation]
    end

    subgraph External_APIs [External APIs]
        FB_API[Facebook Marketing API]
    end

    UI_Components -->|Queries| API_Routes
    API_Routes -->|Uses| Lib_Core
    Lib_Core -->|Database Ops| Prisma_Client
    Lib_Core -->|Caching Ops| Cache_Sync
    Lib_Core -->|Fetch Insights| FB_API
    
    Cron_Scheduler -->|Triggers Sync| Lib_Core
    Cache_Sync -->|Read/Write| JSON_Cache[(Local JSON Cache)]
    Prisma_Client -->|Read/Write| Postgres[(PostgreSQL)]
```

---

## 6. Runtime View
Behavior of the system during specific scenarios.

### 6.1 Marketing Data Synchronization
```mermaid
sequenceDiagram
    participant FB as Facebook Marketing API
    participant PS as marketing_sync.py (Python)
    participant DB as PostgreSQL (Supabase)
    participant NX as Next.js API/Cron
    participant RD as Redis (BullMQ)
    participant WK as cacheSyncWorker.js
    participant LC as Local JSON Cache

    rect rgb(240, 240, 240)
        Note over PS, FB: Daily Bulk Sync (Legacy/Deep)
        FB->>PS: Bulk Fetch Data
        PS->>DB: SQL Upsert Data
        PS->>NX: Trigger Sync
    end

    rect rgb(230, 240, 255)
        Note over NX, FB: Hourly Breakdown Sync (New)
        NX->>FB: Fetch Hourly Breakdown
        FB-->>NX: Success
        NX->>DB: Prisma Upsert AdHourlyMetric
    end

    NX->>RD: Enqueue Job
    RD->>WK: Process Job
    WK->>DB: Read Latest Metrics
    WK->>LC: Write JSON Cache
    Note over LC: Optimized for High Performance UI
```

---

## 7. Deployment View
Managed via a unified repository structure under `data_hub/` with a portable Node.js environment. Production targets include Supabase for the database and Vercel or custom VPS for the web/worker nodes.

---

## 8. Cross-cutting Concepts
### 8.1 Data Consistency & Caching
- **Cache-First:** UI reads local `.json` files in `crm-app/cache/`.
- **Stale-While-Revalidate:** Immediate stale data display with background refresh.
- **Sync Logic:** Managed by `src/lib/cacheSync.js`.

### 8.2 Security & Compliance
- PDPA compliance via dedicated logging in `marketing/logs/compliance/`.
- Audit logging for all critical business actions.

---

## 9. Architecture Decisions (ADR)
Detailed history of key architectural choices:
- [ADR 001: Event-Driven Architecture](../adr/001-event-driven-architecture.md)
- [ADR 002: Hybrid Python Integration](../adr/002-hybrid-python-integration.md)
- [ADR 003: Hybrid Database Adapter](../adr/003-hybrid-database-adapter.md)
- [ADR 007: Customer ID Standardization](../adr/007-customer-id-standardization.md)
- [ADR 009: Hybrid Cache Marketing Sync](../adr/009-hybrid-cache-marketing-sync.md)
- [ADR 010: Database-First Product Catalog](../adr/010-database-first-product-catalog.md)

---

## 10. Quality Requirements
- **Reliability:** Background workers must handle retries for Meta Graph API rate limits.
- **Performance:** Page load for dashboards under 500ms using local cache.
- **Maintainability:** Standardized ID systems and directory structure.

---

## 11. Risks and Technical Debt
- **JSON File Size:** Large customer lists may require more optimized directory splitting (partially addressed by ID subdirectories).
- **Concurrency:** Ensure atomic writes to JSON files during high-frequency updates.

---

## 12. Glossary
- **TVS:** The V School / Thai Video Solution.
- **RAG:** Retrieval-Augmented Generation (used in knowledge base).
- **SSOT:** Single Source of Truth.
- **BullMQ:** Message queue on top of Redis.
