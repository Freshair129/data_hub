# CLAUDE.md — V School CRM: Project Reference

> ไฟล์นี้สร้างเพื่อให้ Claude (และ AI agents) ใช้เป็น reference ในการทำงานกับโปรเจคนี้
> อัปเดตล่าสุด: 2026-02-25

---

## 1. Project Overview

**V School CRM** — ระบบ CRM สำหรับ The V School (โรงเรียนสอนทำอาหารญี่ปุ่น กรุงเทพฯ)

| Item | Detail |
|---|---|
| **Business** | สอนทำสูชิ, ราเมน, ดิมซำ, kids camp |
| **ลูกค้า** | นักเรียน / ลีด ผ่าน Facebook Messenger + LINE |
| **เงินสกุล** | THB (บาท) |
| **ภาษา UI** | ไทย |
| **Framework** | Next.js 14.2.5 (App Router) |
| **Database** | PostgreSQL via Supabase (Prisma ORM) + JSON cache fallback |
| **Queue** | Redis + BullMQ |
| **AI** | Google Gemini (gemini-pro) |
| **Marketing API** | Meta Graph API v19.0 |

---

## 2. Agent Workflow (Claude + Gemini Antigravity)

### บทบาท
| Agent | บทบาท |
|---|---|
| **Claude** | Full-stack dev / Tech Lead — วิเคราะห์, วางแผน, เขียนโค้ด, เขียน prompt |
| **Gemini (antigravity)** | Heavy-lifting executor — รับ prompt จาก Claude, ทำงานที่ใช้ token มาก |

### กระบวนการ Manual Delegation
```
1. Claude เขียน prompt ที่ละเอียด
2. User copy prompt ไป paste ใน Gemini CLI (antigravity)
3. Gemini ทำงาน → สรุปผล
4. User paste ผลกลับมาใน Claude session
5. Claude อ่านผล → ดำเนินการต่อ
```

### เมื่อไหรควร Delegate ให้ Gemini
- อ่านไฟล์หลาย 10+ ไฟล์พร้อมกัน
- สร้าง report หรือ audit ยาวๆ
- Batch analysis ข้อมูลจำนวนมาก
- งานที่ไม่ต้องการ tool access (read-only analysis)

### Output ของ Gemini
- Path: `~/.gemini/antigravity/brain/`
- ตัวอย่างผลงาน: `clean_code_audit.md` (สร้างโดย Gemini แล้ว paste กลับ)

---

## 3. Project Structure

### Root `/Users/ideab/Desktop/data_hub/`

| Path | หน้าที่ |
|---|---|
| `crm-app/` | **Next.js application หลัก** — ทุก feature อยู่ที่นี่ |
| `CLAUDE.md` | Reference document นี้ |
| `AGENTS.md` | Developer guide สำหรับ WARP agents |
| `GEMINI.md` | Context document สำหรับ Gemini |
| `CHANGELOG.md` | Version history |
| `clean_code_audit.md` | Technical debt audit (สร้างโดย Gemini) |
| `v_school_catalog.csv` | ข้อมูล catalog หลักสูตร |
| `.venv/` | Python virtual environment |
| `.agents/` | WARP agent workflows |

### `crm-app/` Structure

#### App Layer (`src/app/`)
| Path | หน้าที่ |
|---|---|
| `src/app/page.js` | **Root SPA** — ทุก view ควบคุมผ่าน `activeView` state (ไม่มี page routing) |
| `src/app/api/customers/` | CRUD ลูกค้า (GET list, POST, GET by ID, PUT) |
| `src/app/api/catalog/` | Product catalog |
| `src/app/api/employees/` | จัดการพนักงาน (list, update `[id]`, delete `[id]`) |
| `src/app/api/marketing/sync/` | Trigger Facebook Ads sync |
| `src/app/api/analytics/team/` | Team performance metrics ตาม date range |
| `src/app/api/events/` | **SSE stream** — real-time updates ผ่าน Redis pub/sub |
| `src/app/api/webhooks/` | Facebook webhook receiver → enqueue BullMQ |
| `src/instrumentation.js` | **Cron scheduler** (Next.js startup) — hourly/daily background jobs |

#### Components (`src/components/`)
| Component | หน้าที่ |
|---|---|
| `Sidebar.js` | Main nav panel |
| `Dashboard.js` | KPI overview (revenue, students, churn, marketing spend) + AI insights |
| `CustomerList.js` | รายชื่อลูกค้า + search/filter/sort/grid view |
| `FacebookChat.js` | Messenger inbox พร้อม SSE, AI product discovery, agent assignment |
| `FacebookAds.js` | Ad campaign analytics (campaign/adset/daily, health score) |
| `Analytics.js` | Business intelligence — campaigns, insights, ad mapping |
| `EmployeeManagement.js` | Staff registry, permissions, performance |
| `TeamKPI.js` | Team performance dashboard (per agent, timeframe filter) |

#### Lib — Core Business Logic (`src/lib/`)
| File | หน้าที่ |
|---|---|
| `db.js` | **Database adapter** — Strategy Pattern รองรับ JSON / Prisma ผ่าน `DB_ADAPTER` env |
| `cacheSync.js` | อ่าน/เขียน local JSON cache (`cache/customer/{id}/profile.json`) |
| `chatService.js` | Facebook Messenger — sync messages, agent detection, persona sending |
| `googleSheetsService.js` | ส่ง/ดึงข้อมูล Google Sheets ผ่าน Apps Script webhook |
| `lineService.js` | ส่ง LINE Notify notification ให้ staff |
| `personaService.js` | จัดการ Facebook Persona (ส่งข้อความในนาม team member) |

#### Services & Utils
| File | หน้าที่ |
|---|---|
| `src/services/marketingService.js` | Sync Facebook Ad insights → PostgreSQL (30-day chunks, pagination, rate-limit) |
| `src/utils/BusinessAnalyst.js` | **Gemini AI wrapper** — executive report, chat Q&A, product extraction, agent detection, smart reply |

#### Workers (`src/workers/`)
| File | หน้าที่ |
|---|---|
| `eventProcessor.mjs` | **BullMQ worker** (Node.js) — consume `fb-events` queue, orchestrate: sync → AI tasks/labels → persona reply → Sheets |
| `python/db_adapter.py` | Python database adapter (mirrors db.js) |
| `python/event_processor.py` | Python event processor — token guard, slip detection, behavioral analysis |
| `python/marketing_sync.py` | Bulk Facebook Ads API fetcher ด้วย retry + rate-limit |

#### Scripts (`crm-app/scripts/`)
39 ไฟล์ utility สำหรับ data migration และ diagnostics:
- `full_initial_sync.js` — Full initial data sync
- `sync_sales_from_sheets.ts` — นำเข้าข้อมูลการขายจาก Google Sheets
- `bulk_update_aliases.js` — อัปเดต alias ลูกค้าแบบ bulk
- `find_unique_agents.js` — หา unique agent names จาก conversations

#### Data & Config
| Path | หน้าที่ |
|---|---|
| `prisma/schema.prisma` | Database schema — Customer, Order, Employee, Campaign, Ad, Message, Task ฯลฯ |
| `cache/` | Local JSON mirror ของ database (cache-first reads) |
| `cache/customer/{id}/` | Profile, wallet, inventory, chathistory ต่อลูกค้า |
| `docs/` | Arc42 architecture docs + 15 ADRs + incident log + performance reports |

---

## 4. Data Flow

### Flow 1: Incoming Event (Facebook Webhook)
```
Facebook Messenger (customer message/image)
       │
  POST /api/webhooks
       │ validate x-hub-signature-256
       │
  BullMQ queue (fb-events) ──── 3 retries, exponential backoff
       │
  eventProcessor.mjs (worker)
       ├── syncChat()   ──── FB Graph API → cache + DB
       │       └── detectAgentFromChat() → performAgentAssignment()
       │
       ├── Gemini AI Analysis (if GEMINI_API_KEY set)
       │       ├── suggestProactiveTasks() → createTask() → LINE Notify (if HIGH)
       │       ├── suggestLabels() → applyFacebookLabel()
       │       └── generateSmartReply() → sendFacebookMessage() via Persona
       │
       ├── Slip OCR (if image attachment) → verifySlip() → SlipOK API
       │
       └── Redis Publish → chat-updates / task-updates / slip-updates
                  │
         SSE /api/events/stream ──── React UI (real-time updates)
```

### Flow 2: Background Sync (Cron — `instrumentation.js`)
```
Next.js startup → node-cron registers:
  ├── :10 every hour → chatService.syncChat() (full reconciliation) → DB
  ├── :00 every hour → marketingService.syncMarketingData() → FB Ads API → PostgreSQL
  └── :05 every hour → syncHourlyMarketingData() → AdHourlyMetric table
```

### Flow 3: UI Data Access
```
React Component → Next.js API route
       │
  db.js (Strategy Pattern)
       ├── DB_ADAPTER=prisma → PostgreSQL (Supabase) via Prisma
       └── DB_ADAPTER=json  → cache/*.json (fallback)
```

---

## 5. Key Functions & Logic

### ฟังก์ชันสำคัญ

| Function | File | หน้าที่ |
|---|---|---|
| `getAllCustomers()` | `lib/db.js` | Prisma → Cache → JSON fallback |
| `upsertCustomer()` | `lib/db.js` | Strategy-aware upsert |
| `resolveAgentFromContent()` | `lib/db.js` | ดึง agent จาก regex patterns |
| `syncChat()` | `lib/chatService.js` | ดึง FB messages → save cache → detect agent → DB |
| `detectAgentFromChat()` | `utils/BusinessAnalyst.js` | Regex → Gemini fallback |
| `performAgentAssignment()` | `lib/chatService.js` | อัปเดต Prisma + JSON + Timeline |
| `syncMarketingData()` | `services/marketingService.js` | FB Ads API → 30-day chunks → upsert |
| `suggestProactiveTasks()` | `utils/BusinessAnalyst.js` | วิเคราะห์ intent → Task type + Priority |
| `suggestLabels()` | `utils/BusinessAnalyst.js` | สร้าง Facebook labels สูงสุด 3 ตัว |
| `generateSmartReply()` | `utils/BusinessAnalyst.js` | สร้าง Thai reply ในนาม persona |

### Agent Detection Priority (ใน `db.js`)
```
1. intelligence.agent        (AI-persisted, highest priority)
2. conversation.assignedAgent (explicit DB field)
3. resolveAgentFromContent()  (regex scan ใน messages)
   ├── Thai: /กำหนดการสนทนานี้ให้กับ (.+)/
   ├── Thai: /ระบบมอบหมายแชทนี้ให้กับ (.+) ผ่านระบบอัตโนมัติ/
   └── English: /assigned this conversation to (.+)$/
4. "Unassigned"               (fallback)
```

### Session Boundary Logic (ใน `chatService.js`)
New chat session เกิดขึ้นเมื่อ:
- ช่วงห่างระหว่างข้อความ **> 30 นาที** (timeout)
- **Ad ID เปลี่ยน** (เข้าจาก ad ใหม่ = intent ใหม่)

### Mega-batch AI (ADR-006)
- Pack 20-30 conversations ต่อ 1 Gemini API call
- ลด API calls 95%+ และ token cost 85%+
- Trigger: hourly batch worker (ไม่ใช่ real-time ทุกข้อความ)

### Customer ID Format (ADR-007)
```
TVS-CUS-[CHANNEL]-[YEAR]-[SERIAL]
ตัวอย่าง: TVS-CUS-FB-26-0123

Channels: FB (Facebook), LN (LINE), WB (Web), WL (Walk-in)
```

---

## 6. External Integrations

| Service | Library / Method | หน้าที่ | Env Var |
|---|---|---|---|
| **Meta Graph API v19.0** | native `fetch` | Messenger chat, Ads insights, webhook, persona, labels | `FB_PAGE_ACCESS_TOKEN`, `FB_AD_ACCOUNT_ID`, `FB_APP_SECRET` |
| **Google Gemini** | `@google/generative-ai` | AI analysis, agent detection, smart reply (model: `gemini-pro`) | `GEMINI_API_KEY` |
| **Supabase/PostgreSQL** | `@prisma/client` + `@prisma/adapter-pg` | Primary database | `DATABASE_URL` |
| **Redis** | `ioredis` | BullMQ queue + SSE pub/sub | `REDIS_URL` |
| **BullMQ** | `bullmq` | Async job queue (3 retries, exponential backoff) | via Redis |
| **SlipOK** | native `fetch` | Thai bank slip OCR verification | API key |
| **LINE Notify** | native `fetch` | Staff push notification | `LINE_NOTIFY_TOKEN` |
| **Google Sheets** | native `fetch` (Apps Script webhook) | Export lead + payment data | webhook URL |
| **Playwright** | `playwright` | Browser automation สำหรับ Facebook | — |
| **node-cron** | `node-cron` | Background scheduler ใน `instrumentation.js` | — |

### Required Environment Variables
```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/db
DB_ADAPTER=json   # หรือ 'prisma'

# Facebook
FB_PAGE_ACCESS_TOKEN=
FB_APP_SECRET=
FB_VERIFY_TOKEN=vschool_crm_2026
FB_PAGE_ID=
FB_AD_ACCOUNT_ID=act_...

# Redis
REDIS_URL=redis://localhost:6379

# AI
GEMINI_API_KEY=

# Integrations
LINE_NOTIFY_TOKEN=
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

---

## 7. Architecture Principles (จาก 15 ADRs)

| ADR | หลักการ | สรุป |
|---|---|---|
| ADR-003 | **Hybrid Database** | JSON fallback สำหรับ dev, Prisma สำหรับ production |
| ADR-006 | **Mega-batch AI** | Pack 20-30 conversations/call → ลด cost 85% |
| ADR-009 | **Cache-First** | อ่าน JSON cache ก่อน, DB เป็น reconciliation authority |
| ADR-011 | **Product-Matched Attribution** | แยก Direct Revenue vs Cross-Sell Revenue |
| ADR-014 | **Hybrid Agent Detection** | Regex signatures → Gemini fallback |
| ADR-015 | **3-Layer Sync** | Webhook (reactive) + Cron :10 (consistency) + Cache (speed) |

---

## 8. Technical Debt & Known Issues

### Code Quality Issues (จาก `clean_code_audit.md`)
1. **SRP Violation** — `db.js` ใหญ่เกินไป, มี concern ปนกัน (DB + cache + validation)
2. **DRY Violation** — `if (DB_ADAPTER === ...)` ซ้ำหลายที่ ควรใช้ factory pattern
3. **Sync I/O** — `fs.readFileSync/writeFileSync` ควรเป็น `async/await`
4. **Silent Catch** — `catch(e) {}` ซ่อน DB failures, ควร log + propagate
5. **Naming Inconsistency** — snake_case และ camelCase ปนกันใน JS layer
6. **Scripts Folder รก** — 39 ไฟล์ Python/TS/JS ปนกันไม่มี organization

### Known Business/Tracking Gaps
1. **LINE AO Gap** — ลูกค้าที่ปิดการขายผ่าน LINE ไม่ถูก report กลับ Facebook → ROAS under-report (จริง 5.29x vs system รายงาน 1.54x)
2. **Lead Quality** — Package campaigns ได้ leads 230% of target แต่ conversion 27% เท่านั้น
3. **Creative Fatigue** — ไม่มี alert เมื่อ creative รันนานกว่า 30 วัน → ad fatigue ไม่ถูก detect

---

## 9. Development Quick Start

```bash
cd crm-app
npm install
docker compose up -d          # PostgreSQL + Redis
npx prisma generate
npx prisma db push
npm run dev                   # http://localhost:3000

# Background worker (แยก terminal)
npm run worker                # BullMQ event processor
```

### Key Docs
- Architecture: `crm-app/docs/architecture/arc42-main.md`
- ADRs: `crm-app/docs/adr/`
- Incidents: `crm-app/docs/incident_log.md`
- Performance: `crm-app/docs/true_performance_report_feb_2026.md`

---

## 10. Coding Standards & Conventions

> Agent ต้องยึดกฎเหล่านี้อย่างเคร่งครัดเมื่อเขียนหรือแก้โค้ด

### Naming Rules
| Context | Convention | ตัวอย่าง |
|---|---|---|
| ตัวแปร, ฟังก์ชัน (JS/TS) | `camelCase` | `getAllCustomers`, `syncChat`, `isActive` |
| React Components | `PascalCase` | `CustomerList`, `FacebookChat`, `TeamKPI` |
| Database columns (Prisma) | `snake_case` | `first_name`, `created_at`, `ad_set_id` |
| Env vars | `SCREAMING_SNAKE` | `FB_PAGE_ACCESS_TOKEN`, `DATABASE_URL` |
| CSS classes | Tailwind utility | `bg-blue-500`, `text-sm` |
| Customer IDs | `TVS-CUS-[CH]-[YY]-[XXXX]` | `TVS-CUS-FB-26-0123` |

**ห้ามใช้ `snake_case` ใน Frontend (JS/TS) เด็ดขาด** — เป็น tech debt ที่ต้องแก้ไข

### Error Handling
- **ห้าม** `catch(e) {}` แบบเงียบ — ต้อง log error ทุกครั้ง
- ใช้ `console.error('[Module]', error.message)` format สำหรับ log
- API routes: return `NextResponse.json({ error: message }, { status: code })` เสมอ
- Workers: `throw error` เพื่อให้ BullMQ retry mechanism ทำงาน
- DB fallback: log warning แล้ว fallback ไป JSON — ห้ามเงียบ

### State Management
- UI State: ใช้ `useState` + `useEffect` ธรรมดา (ไม่มี Context API, ไม่มี Zustand)
- ทุก view ควบคุมผ่าน `activeView` state ใน `page.js`
- Real-time data ใช้ SSE (`EventSource`) ไม่ใช่ polling

### Database Access
- **บังคับใช้ `db.js` เสมอ** — ห้ามเรียก Prisma หรืออ่าน JSON cache โดยตรงจาก Component/API route
- ทุก DB operation ต้องผ่าน exported functions ใน `src/lib/db.js`
- ถ้าต้องการ query ใหม่ → เพิ่ม function ใน `db.js` (Strategy Pattern)

### File I/O
- **ห้ามใช้ `fs.readFileSync` / `fs.writeFileSync`** — ใช้ `fs.promises` แทน
- Cache operations ต้องผ่าน `cacheSync.js`

### API Route Patterns
```
src/app/api/[resource]/route.js       → GET (list), POST (create)
src/app/api/[resource]/[id]/route.js  → GET (by id), PUT (update), DELETE
```
- Response format: `NextResponse.json({ data })` หรือ `NextResponse.json({ error }, { status })`
- ต้อง respond ภายใน 3 วินาทีสำหรับ webhook routes

### Commit & Documentation
- CHANGELOG.md: อัปเดตทุกครั้งที่มี feature/fix สำคัญ
- ADR: สร้าง ADR ใหม่ใน `docs/adr/` เมื่อมี architectural decision สำคัญ
- Comment: เขียนเฉพาะเมื่อ logic ซับซ้อนจริงๆ — ไม่ต้องอธิบาย self-evident code

---

## 11. Deep Reference Links

สำหรับรายละเอียดเชิงลึก ให้อ่านไฟล์ต่อไปนี้:

| หัวข้อ | ไฟล์อ้างอิง |
|---|---|
| System Architecture (C4 Model) | `crm-app/docs/architecture/arc42-main.md` |
| Architectural Decisions ทั้งหมด | `crm-app/docs/adr/` (15 ADRs) |
| Database Schema | `crm-app/prisma/schema.prisma` |
| Technical Debt Audit | `clean_code_audit.md` (root) |
| Incident Post-Mortems | `crm-app/docs/incident_log.md` |
| True Performance Data (Feb 2026) | `crm-app/docs/true_performance_report_feb_2026.md` |
| Agency Audit Findings | `crm-app/docs/agency_report_audit_findings.md` |
| Lead Source Analysis | `crm-app/docs/lead_source_summary_feb_1_22.md` |
| WARP Agent Guide | `AGENTS.md` (root) |
| Gemini Context | `GEMINI.md` (root) |
