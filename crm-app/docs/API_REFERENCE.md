# API Reference — V School CRM

> อ้างอิง API routes ทั้งหมดใน `crm-app/src/app/api/`
> Base URL: `http://localhost:3000/api`
> อัปเดตล่าสุด: 2026-02-25

---

## สารบัญ

1. [Auth](#1-auth)
2. [Customers](#2-customers)
3. [Employees](#3-employees)
4. [Products & Catalog](#4-products--catalog)
5. [Marketing — Data](#5-marketing--data)
6. [Marketing — Chat](#6-marketing--chat)
7. [AI](#7-ai)
8. [Webhooks](#8-webhooks)
9. [Events (SSE)](#9-events-sse)
10. [Analytics](#10-analytics)
11. [Export / Import](#11-export--import)
12. [Verification](#12-verification)
13. [Test](#13-test)

---

## 1. Auth

### `POST /api/auth/login`

ล็อกอินพนักงาน

| Field | Value |
|---|---|
| Body | `{ email, password }` |
| Response | `{ success: true, user: { ...employee, credentials: stripped } }` |
| Error | `{ success: false, error: "Invalid email or password" }` (401) |
| Dependencies | `getEmployeeByEmail()` จาก `db.js` |

---

## 2. Customers

### `GET /api/customers`

ดึงรายชื่อลูกค้าทั้งหมด พร้อม agent enrichment

| Field | Value |
|---|---|
| Query | `?index=true` (optional — return lightweight index เท่านั้น) |
| Response | `Customer[]` พร้อม `_source: 'cache'` สำหรับ cache hits |
| Dependencies | `getAllCustomers()`, `readCacheList()`, Facebook Graph API |

### `POST /api/customers`

สร้างหรืออัปเดตลูกค้า

| Field | Value |
|---|---|
| Body | `{ customer_id, profile: {...}, contact_info: {...}, intelligence: {...} }` |
| Response | `{ success: true, data: Customer }` |
| Dependencies | `upsertCustomer()`, `writeCacheEntry()`, `emitCacheSyncJob()` |

### `GET /api/customers/[id]`

ดึงข้อมูลลูกค้ารายบุคคลจาก filesystem

| Field | Value |
|---|---|
| Route Param | `id` (customer ID) |
| Response | Customer profile object |
| Dependencies | `fs.readFileSync` (cache directory) |

### `PUT /api/customers/[id]`

อัปเดตข้อมูลลูกค้า

| Field | Value |
|---|---|
| Route Param | `id` (customer ID) |
| Body | Full customer object |
| Response | `{ success: true }` |
| Dependencies | `fs.writeFileSync` (cache directory) |

### `GET /api/customers/[id]/cart`

ดึงตะกร้าสินค้าของลูกค้า (cache-first)

| Field | Value |
|---|---|
| Route Param | `id` (customer ID) |
| Response | `{ items: CartItem[], _cachedAt: ISO8601 }` |
| Dependencies | `getCart()` จาก `db.js` |

### `POST /api/customers/[id]/cart`

จัดการตะกร้าสินค้า

| Field | Value |
|---|---|
| Route Param | `id` (customer ID) |
| Body | `{ action: 'UPSERT'\|'REMOVE'\|'CLEAR', productId?, quantity? }` |
| Response | `{ success: true, result }` |
| Dependencies | `upsertCartItem()`, `removeFromCart()`, `clearCart()`, `emitCacheSyncJob()` |

### `GET /api/customers/[id]/chat`

ดึงประวัติแชทของลูกค้า (cache-first, background refresh)

| Field | Value |
|---|---|
| Route Param | `id` (customer ID) |
| Response | `{ success: true, _cachedAt: ISO8601, data: ChatMessage[] }` |
| Dependencies | `getChatHistory()`, `readCacheEntry()`, `writeCacheEntry()` |

### `POST /api/customers/sync`

Sync Facebook Messenger conversations → สร้าง customer profiles

| Field | Value |
|---|---|
| Body | None (ใช้ env vars) |
| Response | `{ success: true, created: N, skipped: N, message }` |
| Dependencies | Facebook Graph API, `generateCustomerId()`, `getOrigin()` |

---

## 3. Employees

### `GET /api/employees`

ดึงรายชื่อพนักงานทั้งหมด พร้อม performance metrics

| Field | Value |
|---|---|
| Response | `Employee[]` พร้อม `total_customers_registered`, `total_revenue_generated` |
| Dependencies | `getAllEmployees()`, `getAllCustomers()` |

### `PUT /api/employees/[id]`

อัปเดตข้อมูลพนักงาน

| Field | Value |
|---|---|
| Route Param | `id` (employee ID) |
| Body | `{ firstName, lastName, nickName, role, department, status, email, phonePrimary, lineId, facebookName, lineName, permissions, metadata }` |
| Response | `{ success: true, data: updatedEmployee }` |
| Dependencies | `getPrisma()`, `writeCacheEntry()` |

### `DELETE /api/employees/[id]`

ลบพนักงาน

| Field | Value |
|---|---|
| Route Param | `id` (employee ID) |
| Response | `{ success: true }` |
| Dependencies | `getPrisma()`, `invalidateCacheEntry()` |

---

## 4. Products & Catalog

### `GET /api/catalog`

ดึง catalog แบ่ง packages vs products พร้อม image paths

| Field | Value |
|---|---|
| Response | `{ packages: [], products: [] }` พร้อม id, name, description, price, image |
| Dependencies | `getAllProducts()`, filesystem image lookup `public/images/products/` |

### `GET /api/products`

ดึงสินค้าทั้งหมดแบ่งตาม category (cache-first)

| Field | Value |
|---|---|
| Response | `{ courses: [], packages: [], equipment: [], _source: 'cache' }` |
| Dependencies | `getAllProducts()`, `readCacheEntry()`, `writeCacheEntry()` |

---

## 5. Marketing — Data

### `POST /api/marketing/sync`

Trigger Python bulk sync สำหรับ marketing data

| Field | Value |
|---|---|
| Query | `?months=3` (default: 3) |
| Response | `{ success, message, python: {...} }` |
| Dependencies | `runPython()` → `marketing_sync.py`, `emitRebuildMarketing()`, `emitRebuildSummary()` |

### `GET /api/marketing/sync`

เหมือน POST (convenience endpoint)

### `GET /api/marketing/campaigns`

ดึง Facebook campaigns พร้อม insights (cache-first, 15 min TTL)

| Field | Value |
|---|---|
| Query | `?range=last_30d\|last_7d\|today\|maximum` (default: maximum) |
| Response | `{ success, data: Campaign[] }` หรือ `{ errorType: 'TOKEN_EXPIRED' }` |
| Dependencies | Facebook Graph API v19.0, `readCacheEntry()`, `writeCacheEntry()` |

### `GET /api/marketing/adsets`

ดึง ad sets พร้อม insights

| Field | Value |
|---|---|
| Query | `?range=last_30d\|maximum` (default: maximum) |
| Response | `{ success, data: AdSet[] }` |
| Dependencies | Facebook Graph API v19.0 |

### `GET /api/marketing/ads`

ดึง ads ทั้งหมดพร้อม performance metrics + creative thumbnails

| Field | Value |
|---|---|
| Query | `?range=last_30d\|maximum` (default: maximum) |
| Response | `{ success, data: Ad[] }` พร้อม thumbnail, image, creative_name |
| Dependencies | Facebook Graph API v19.0 |

### `GET /api/marketing/ads/insights`

ดึง daily insights ย้อนหลัง 30 วันของ ad ตัวเดียว

| Field | Value |
|---|---|
| Query | `?ad_id=xxx` (required) |
| Response | `{ success, data: DailyInsight[] }` |
| Dependencies | Facebook Graph API v19.0 |

### `GET /api/marketing/daily`

ดึง daily metrics จาก cache หรือ DB

| Field | Value |
|---|---|
| Query | `?days=30` (default: 30) |
| Response | `{ success, count, data: [{date, spend, impressions, clicks, leads, purchases, revenue, roas}] }` |
| Dependencies | `readCacheList()`, `getPrisma()` → adDailyMetric |

### `GET /api/marketing/hourly`

ดึง hourly insights สำหรับวันที่ระบุ (DB-first, API fallback)

| Field | Value |
|---|---|
| Query | `?date=YYYY-MM-DD` (required) |
| Response | `{ success, date, source: 'database'\|'api', data: HourlyMetric[] }` |
| Dependencies | `getPrisma()` → adHourlyMetric, Facebook Graph API v19.0 (fallback) |

### `GET /api/marketing/leads`

ดึง Facebook leads แล้ว map เป็น CRM format

| Field | Value |
|---|---|
| Response | `{ success, data: Lead[] }` พร้อม customer_id, name, email, phone, source, status |
| Dependencies | Facebook Graph API v19.0 |

### `GET /api/marketing/insights`

ดึง overall ad account insights (30 วันล่าสุด)

| Field | Value |
|---|---|
| Response | `{ success, insights: {spend, reach, impressions, clicks, actions?, action_values?} }` |
| Dependencies | Facebook Graph API v19.0 |

### `GET /api/marketing/overview`

ดึง KPI overview สำหรับ dashboard (cache-only)

| Field | Value |
|---|---|
| Response | `{ success, _cachedAt, kpis: {totalCustomers, newCustomersThisMonth, totalRevenue, revenueThisMonth, adSpend, adLeads, roas}, summary? }` |
| Dependencies | `readCacheEntry()` → analytics/summary, ads/campaign |

### `GET /api/marketing/conversations`

ดึง conversations ล่าสุดพร้อม staff responders

| Field | Value |
|---|---|
| Response | `{ success, data: [{conversation_id, customer_name, customer_id, last_staff_reply, staff_name, messages}] }` |
| Dependencies | Facebook Graph API v19.0 |

### `GET/POST/DELETE /api/marketing/mapping`

จัดการ campaign/ad name mappings

| Field | Value |
|---|---|
| GET | ดึง mapping ทั้งหมด |
| POST Body | `{ type: 'campaign'\|'ad', data: object }` |
| DELETE Query | `?type=xxx&name=xxx` |
| Response | `{ success, mapping: {campaign_mappings, ad_mappings} }` |
| Dependencies | `fs` → `ad_mapping.json` |

---

## 6. Marketing — Chat

### `GET /api/marketing/chat/conversations`

ดึง conversations พร้อม agent assignment (merge FB API + local cache + DB)

| Field | Value |
|---|---|
| Response | `{ success, data: [{id, updated_time, snippet, participants, unread_count, agent, is_local?, customer?}], pageId }` |
| Dependencies | Facebook Graph API v19.0, `getPrisma()`, local cache, `extractAgentFromText()`, `mapToNickname()` |

### `GET /api/marketing/chat/messages`

ดึง messages ของ conversation (live API + local cache fallback)

| Field | Value |
|---|---|
| Query | `?conversation_id=xxx` (required) |
| Response | `{ success, data: Message[], episodes?, is_local? }` พร้อม sessionId, episodeId, metadata |
| Dependencies | Facebook Graph API v19.0, `getPrisma()`, local cache |

### `POST /api/marketing/chat/assign`

มอบหมาย agent ให้ conversation

| Field | Value |
|---|---|
| Body | `{ conversationId, agentName }` |
| Response | `{ success, agent, prismaUpdated, cacheUpdated }` |
| Dependencies | `getPrisma()`, local cache |

### `POST /api/marketing/chat/send`

ส่งข้อความ Facebook (รองรับ Persona)

| Field | Value |
|---|---|
| Body | `{ recipientId, message, usePersona?, ownerName?, ownerImage? }` |
| Response | `{ success, data: {message_id} }` |
| Dependencies | `sendFacebookMessage()`, `getOrCreatePersona()` จาก chatService, personaService |

---

## 7. AI

### `POST /api/ai/chat`

AI chatbot สำหรับถามข้อมูลธุรกิจ

| Field | Value |
|---|---|
| Body | `{ question, history: [{role, content}] }` |
| Response | `{ success: true, answer }` |
| Dependencies | `BusinessAnalyst.chat()`, `prepareContext()`, `getPrisma()`, `getAllProducts()` |

### `GET /api/ai/analyze`

สร้าง executive report ด้วย AI

| Field | Value |
|---|---|
| Response | `{ success, data: {healthScore, sentiment, risks, opportunities, insights, marketContext} }` |
| Fallback | ถ้า Gemini fail → ส่ง static template กลับ |
| Dependencies | `BusinessAnalyst.generateExecutiveReport()`, `prepareContext()` |

### `GET /api/ai/discover-products`

AI ค้นหาสินค้าที่กล่าวถึงใน chat + suggest agent

| Field | Value |
|---|---|
| Query | `?customerId=xxx` (required) |
| Response | `{ success, data: EnrichedProduct[], suggested_agent, justification, customerId }` |
| Dependencies | `BusinessAnalyst.extractProductsFromChat()`, `detectAgentFromChat()`, `getAllProducts()`, `getAllEmployees()` |

### `POST /api/ai/discover-products`

เพิ่มสินค้าใหม่เข้า store

| Field | Value |
|---|---|
| Body | `{ product_name, price, category }` (product_name, price required) |
| Response | `{ success, message: 'Product added to store', product }` |
| Dependencies | `fs` → `cache/products/` |

---

## 8. Webhooks

### `GET /api/webhooks`

Facebook webhook verification

| Field | Value |
|---|---|
| Query | `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge` |
| Response | Challenge string (200) หรือ "Verification failed" (403) |
| Env | `FB_VERIFY_TOKEN` (default: `vschool_crm_2026`) |

### `POST /api/webhooks`

รับ Facebook events → enqueue BullMQ

| Field | Value |
|---|---|
| Headers | `x-hub-signature-256` (HMAC validation) |
| Body | Facebook webhook payload `{ object: 'page', entry: [...] }` |
| Response | `{ status: 'EVENT_RECEIVED' }` — **ต้อง respond ภายใน 3 วินาที** |
| Queue | `fb-events` queue, 3 retries, exponential backoff |
| Dependencies | `bullmq.Queue`, `ioredis`, `crypto` |

### `GET/POST /api/webhooks/facebook`

Redundant Facebook webhook endpoint (เหมือน `/api/webhooks`)

| Field | Value |
|---|---|
| Queue | `process-event` queue, 3 retries |
| Dependencies | `bullmq.Queue`, `ioredis` |

### `GET/POST /api/facebook/webhook`

Facebook webhook พร้อม audit logging

| Field | Value |
|---|---|
| Response | Challenge (GET) หรือ `{ status: 'EVENT_RECEIVED' }` (POST) |
| Side Effects | Log raw events เป็น timestamped JSON files |
| Dependencies | `fs`, `path` |

### `POST /api/webhooks/bank`

Test endpoint สำหรับ bank transfer webhook (stub)

| Field | Value |
|---|---|
| Body | `{ amount, transRef }` |
| Response | `{ success, message: 'Transfer queued for processing', timestamp }` |
| Note | Redis queue integration ยัง TODO (Phase 3.2) |

---

## 9. Events (SSE)

### `GET /api/events/stream`

Server-Sent Events stream สำหรับ real-time updates

| Field | Value |
|---|---|
| Response | `text/event-stream` |
| Channels | `chat-updates`, `slip-updates`, `task-updates` |
| Heartbeat | ทุก 15 วินาที (`: heartbeat\n\n`) |
| Cleanup | `request.signal.onabort` → `redis.quit()` |
| Dependencies | `ioredis` (Pub/Sub) |

**Client-side usage:**
```javascript
const es = new EventSource('/api/events/stream');
es.onmessage = (e) => {
  const { channel, data } = JSON.parse(e.data);
  // channel: 'chat-updates' | 'slip-updates' | 'task-updates'
};
```

---

## 10. Analytics

### `GET /api/analytics/team`

Team KPI dashboard พร้อม date filtering

| Field | Value |
|---|---|
| Query | `?timeframe=lifetime\|today\|weekly\|monthly`, `?from=ISO`, `?to=ISO` |
| Response | `{ success, data: AgentStats[], summary: {totalRevenue, totalLeads, totalCustomers, marketingSpend, timeframe} }` |
| Dependencies | `getAllEmployees()`, `getAllCustomers()`, `getPrisma()` → adDailyMetric |

---

## 11. Export / Import

### `GET /api/export`

Export ข้อมูล CRM เป็น Excel หรือ JSON

| Field | Value |
|---|---|
| Query | `?format=excel\|json` |
| Response | Excel: `{ success, message, filePath, format: 'xlsx', sheets, features }` — JSON: `{ success, count, data, exported_at }` |
| Dependencies | `runPython()` → `data_service.py`, `getAllCustomers()` |

### `POST /api/export`

Import ข้อมูลจาก Excel หรือ Google Sheets

| Field | Value |
|---|---|
| Body | `{ source: 'excel'\|'gsheets', filePath?, spreadsheetId?, sheetName? }` |
| Response | Result from Python `data_service.py` |
| Dependencies | `runPython()` |

---

## 12. Verification

### `POST /api/verify-slip`

ตรวจสอบสลิปโอนเงินผ่าน SlipOK API

| Field | Value |
|---|---|
| Body | `FormData` with `file` field (multipart) |
| Response | `{ success, data: {amount, date, time, bank, transaction_id, receiver} }` |
| Note | ปัจจุบันยังเป็น mock data (SlipOK integration รอ activate) |
| Dependencies | `SLIPOK_API_KEY`, `SLIPOK_BRANCH_ID` |

---

## 13. Test

### `GET /api/test`

Health check

| Field | Value |
|---|---|
| Response | `{ ok: true, time: ISO_timestamp }` |
| Dependencies | None |

---

## หมายเหตุ

- ทุก route ใช้ `export const dynamic = 'force-dynamic'` เพื่อ bypass Next.js caching
- ไม่มี route ที่ต้อง auth middleware (ยกเว้น login เอง) — authentication ทำที่ client side
- Webhook routes ต้อง respond ภายใน 3 วินาที ตาม Facebook requirement
- Marketing routes ส่วนใหญ่ใช้ **cache-first** strategy (15 min TTL)
- Error format มาตรฐาน: `NextResponse.json({ error: message }, { status: code })`
- Facebook API ใช้ version **v19.0** ทั้งหมด

### Duplicate Webhook Routes

มี webhook endpoints ซ้ำกัน 3 ที่ (เป็น tech debt):

| Route | หมายเหตุ |
|---|---|
| `/api/webhooks` | **Primary** — ใช้ HMAC validation + BullMQ |
| `/api/webhooks/facebook` | Redundant — enqueue ด้วย `process-event` key ต่างกัน |
| `/api/facebook/webhook` | Legacy — มี file logging เพิ่ม |

ควรรวมเป็น endpoint เดียวในอนาคต
