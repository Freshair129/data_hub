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
[External Users/Customers]                 [Facebook Ecosystem]   [LINE Platform]
         |                                          |                    |
         | (Web Requests)                           | (Webhooks)         | (Webhooks / Push API)
         v                                          v                    v
+-----------------------------------------------------------------+-----------+
|                        CRM Web Application                                  |
|                                                                             |
|   [API Routes] <--- (Read/Write) ---> [Prisma ORM (db.js)]                 |
|        ^                                       |                            |
|        | (Event Processing)                    v                            |
|   [BullMQ / Redis] <------------------ [Webhook Listeners]                  |
|                                        (FB + LINE)                          |
+-----------------------------------------------------------------------------+
                           |         |                    |
      (Primary Data Flow)  |         |                    | (Outbound Alerts)
                           v         v                    v
+-----------------------------+   +------------------+  +-------------------+
|     Single Source of Truth  |   | Local File Cache |  | LINE Messaging    |
|        [PostgreSQL]         |   |   [cache/]       |  | (Flex Messages,   |
|         (Supabase)          |   |   [logs/]        |  |  Push Alerts)     |
+-----------------------------+   +------------------+  +-------------------+
```

### 2. Pipeline Work Flow (Event-Driven Sync)
```text
[Phase 1: Ingestion]
    FB Webhooks (Real-time)  OR  Cron Job (Hourly Reconciliation)
              |                          |
              +-----------+--------------+
                          |
                          v
                  +-----------------+
                  |  Event Queue    | (BullMQ / Redis)
                  +-----------------+
                          |
                          v
                  +-----------------+
                  | Sync Services   | (chatService, marketingService)
                  +-----------------+
                          |
                          v (Upsert Data)
                  +-----------------+
                  |  PostgreSQL DB  |
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
- `crm-app/`: Core Web App & API.
- `crm-app/cache/`: Internal local data mirror & fallback.
- `docs/`: Technical documentation (ADRs, arc42).
- `scripts/`: Maintenance & data sync utilities.
- `logs/`: System activity & checkpoint reports.

---

### 3. Agent Sync & Attribution (Playwright)
```text
[Playwright Worker] ──(Deep Scroll)──> [Business Suite UI]
         |                                     |
         | (Extract Fiber Props: threadID, responseId)
         v
[API: /api/marketing/chat/message-sender] ──> [DB: Conversation (t_ID)]
                                         └──> [DB: Message (msgId)]
```

---

## 🏗️ Architecture Decisions
Major technical choices and their rationale.
👉 [**View ADR Directory**](./adr/)

| ADR | Title | Summary |
|---|---|---|
| **019** | Agent Attribution | Automation of staff tracking via Business Suite scraping. |
| **020** | Threading Standard | Unified `t_THREAD_ID` mapping and Deep-Sync logic. |
