# V School CRM - Project Portal

### 📗 Technical Infrastructure (arc42/C4 Model)
The Single Source of Truth for system architecture, data flow, and technical decisions.
👉 [**Read the Architecture Documentation**](./architecture/arc42-main.md)

---

## 🚀 Quick Start
```bash
cd /Users/ideab/Desktop/data_hub/crm-app
npm run dev
# Access at http://localhost:3000
# Login: admin@vschool.co.th / admin123
```

---

## 📊 System Architecture Overview

### 1. Data Flow Diagram
```text
[External Users/Customers]                 [Facebook Ecosystem]
         |                                          |
         | (Web Requests / Triggers)                | (Webhooks / API Sync)
         v                                          v
+-----------------------------------------------------------------+
|                        CRM Web Application                      |
|                                                                 |
|   [API Routes] <--- (Read/Write) ---> [Prisma ORM (db.js)]      |
|                                                                 |
+-----------------------------------------------------------------+
                           |         |
      (Primary Data Flow)  |         |  (Fallback / Cache / Legacy Flow)
                           v         v
+-----------------------------+   +-------------------------------+
|     Single Source of Truth  |   |    Local File System (JSON)   |
|                             |   |                               |
|        [PostgreSQL]         |   |    +-- [cache/ ] (Fast Read)  |
|         (Supabase)          |   |    +-- [logs/ ]  (Incidents)  |
|                             |   |    +-- [customer/ ](Legacy)   |
+-----------------------------+   +-------------------------------+
```

### 2. Pipeline Work Flow (Sync & Analysis)
```text
[Phase 1: Ingestion & Sync]
      Facebook API / Webhooks
              |
              v
      +-----------------+
      | Sync Services   | (e.g., syncMarketingData, syncProducts)
      +-----------------+
              |
              v (Upsert Data)
      +-----------------+
      |  PostgreSQL DB  | <--- [Source of Truth for Products & Marketing]
      +-----------------+

              |
[Phase 2: Data Extraction & Processing]
              |
              v (Query via Prisma: getAllProducts, findMany)
      +-----------------+
      | Context Builder | (Prepares Data for AI)
      +-----------------+
              |
              v (Structured Context: JSON/Text)
      +-----------------+
      | Gemini AI Model | (BusinessAnalyst.js)
      +-----------------+

              |
[Phase 3: Output Generation]
              |
              v
   +-----------------------+
   | Executive Summary     |
   | Intelligence Insights |  <--- (Sent as Response to CRM Frontend)
   | Recommendations       |
   +-----------------------+
```

---

## 📂 Directories at a Glance
- `crm-app/`: Core Web App & API (Single Source of Truth)
- `scripts/`: Standalone automation scripts
- `knowledge/`: AI Chatbot knowledge base
- `archive/`: Legacy files & system archives
- `logs/`: System incident reports and fallback logs

---

## 🏗️ Architecture Decisions
Major technical choices and their rationale.
👉 [**View ADR Directory**](./adr/)
