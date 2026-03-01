# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added (REQ-01 & REQ-02: Admin Responder ID Attribution — 2026-03-01)
- **`Message.responderId → Employee.id` (REQ-01)**: เพิ่ม FK ใน schema และ migration — ทุก message ที่แอดมินตอบจะได้รับ `responderId` แทนที่จะเก็บแค่ `fromName` string
- **`Conversation.assignedEmployeeId → Employee.id` (REQ-02)**: เพิ่ม FK ใน schema — ทุก conversation ที่มี `assignedAgent` จะได้รับ `assignedEmployeeId` FK จริง
- **`resolveEmployeeId()` helper** (`message-sender/route.js`): Fuzzy match ชื่อแอดมินจาก Business Suite → `Employee.id` โดย match กับ `facebookName`, `nickName`, `firstName`, `fullName`, และ `metadata.aliases` — ทำงานทุกครั้งที่ sync ข้อมูลใหม่
- **`scripts/backfill_responder_ids.js`**: One-time backfill script สำหรับ records ที่มีอยู่แล้ว — ผลลัพธ์: Messages 1 linked (sync ยังไปได้ 49%), Conversations 46/46 linked
- **Reverse relations ใน `Employee` model**: `respondedMessages Message[]` และ `assignedConversations Conversation[]` — ทำให้ query จาก Employee ไป Messages/Conversations ได้โดยตรง
- **Unresolved name alert**: "Violet Pink" ไม่พบใน Employee records — ต้องเพิ่มเป็น alias ใน `Employee.metadata.aliases`

### Added (Business Suite Agent Attribution — 2026-03-01)
- **`sync_agents_v2.js` — Playwright Agent Scraper (ADR-019)**: New automation script that attaches to a running Chrome instance via CDP (`--remote-debugging-port=9222`) and scrapes "ส่งโดย [ชื่อ]" text from Facebook Business Suite to identify which admin sent each message — working around the fundamental Facebook Graph API limitation where the `from` field always returns the Page identity regardless of which individual admin replied.
- **React Fiber threadID Extraction**: Collects conversation thread IDs from Business Suite's virtual-list sidebar by walking `__reactFiber` internal props on `._4bl9 a[role="row"]` elements — the only viable method since hrefs are `#` and data attributes are absent.
- **Virtual List Sidebar Scrolling**: Auto-scrolls the `overflowY:auto` container above `._4bl9` in 500px increments, collecting new threadIDs on each render cycle until `limit` is reached or no new items appear.
- **Message Text Matching (Dual Strategy)**: `extractSenders()` first attempts React Fiber prop walk (`responseId`, `messageId`, `responseText`, `consumerText`) for precise ID+text pairs, then falls back to DOM sibling traversal (skipping Thai UI chrome: "ก่อนหน้านี้", "ปิด", "ถัดไป").
- **`POST /api/marketing/chat/message-sender`**: New API route that receives `{ conversationId, senders: [{ name, msgId, msgText }] }` from the scraper and performs two-strategy attribution: (1) message-level `fromName` update via text content matching within the conversation (Phase A) then global search across 200 latest messages (Phase B / ADR-018); (2) conversation-level `assignedAgent` update always.
- **participantId Fallback Lookup**: The API route bridges the ID mismatch between Business Suite (participant PSID, e.g. `100002428547834`) and the DB (`t_XXXXXXXX` thread format) by falling back to `conversation.findFirst({ where: { participantId: rawConvId } })`.
- **Cache JSON Sync**: API route updates corresponding `cache/customer/{id}/chathistory/{convId}.json` files in addition to PostgreSQL — maintains cache-DB consistency per ADR-009.
- **Anti-Bot Measures**: Random waits (5–12s per conversation), shuffled batching (randomly selects 20–30 conversations per run), human-like scroll simulation (2–4 upward scroll passes with variable speed), and click-first navigation with URL fallback.
- **Auto-Reply Filter**: `extractSenders()` skips any "ส่งโดย" elements containing "ข้อความตอบกลับอัตโนมัติ" to prevent Facebook automated replies from being attributed as human agents.

### Fixed (Data Integrity Audit — 2026-02-27)
- **C1: Missing `verifySlip` import** (eventProcessor.mjs): Added import from new `slipService.js` — previously caused ReferenceError when customers sent bank slip images.
- **C2: ROAS source mismatch** (overview/route.js): Unified ROAS calculation to use `adDailyMetric.aggregate()` instead of mixing cache revenue with DB spend.
- **C3: Cart shape inconsistency** (CustomerList.js): Fixed cart initialization from wallet shape `{balance, points}` to correct `{items: []}`.
- **C4: Profile file naming** (assign/route.js): Now matches both `profile.json` and `profile_*.json` patterns — previously skipped cache updates entirely.
- **C5: Assign success criteria** (assign/route.js): Added warning log when Prisma succeeds but cache doesn't sync, preventing silent data splits.
- **H1: `logAiActionToTimeline` not exported** (chatService.js): Added `export` keyword — previously caused ReferenceError after persona replies.
- **H2: Label applied to wrong ID** (eventProcessor.mjs): Changed `senderId` → `sanitizedConvId` for `applyFacebookLabel()` call.
- **H3: Null task published to SSE** (eventProcessor.mjs): Added null check before Redis publish and LINE notification.
- **W6: Incomplete SSE handlers** (page.js): Added handlers for `chat-updates` and `slip-updates` channels with `CustomEvent` dispatch + error logging.

### Fixed (UI Calculation Audit — 2026-02-27)
- **T1: Action aggregation used Math.max instead of sum** (FacebookAds.js): `getBestActionValue()` and `getBestActionCount()` now sum all matching action types — ROAS, purchase count, message count were undercounted when campaigns had multiple action types.
- **T2: Funnel counting was cumulative** (Analytics.js): Changed to mutually exclusive stage counting with cumulative display — previously Won was counted 4x (once in each stage).
- **T3: Messaging actions counted as purchases** (Analytics.js): Removed `messaging_user_depth_5_message_send` from purchase filter in Best Sellers — messaging ≠ purchase.
- **T4: ROAS denominator still used cache spend** (overview/route.js): Now uses `dbSpend` from `adDailyMetric.aggregate()` for both revenue AND spend in ROAS calculation.
- **T6: Daily mode showed CTR/CPC = 0** (FacebookAds.js): CTR and CPC now calculated from primitives (`clicks/impressions`, `spend/clicks`) since daily API doesn't return these fields.
- **T8: Case-sensitive agent matching** (EmployeeManagement.js): Added `.toLowerCase()` for both name keys and agent field — previously missed matches when case differed.
- **T9: RFM frequency defaulted to 1 for non-purchasers** (Analytics.js): Changed default from 1 to 0 — was inflating F-score for customers with no purchases.

### Fixed (Deferred Issues Resolution — 2026-02-28)
- **T5: TeamKPI conversion rate diluted** (team/route.js): Conversion rate now uses CRM actuals only (`stats.customers / stats.leads`) — no longer diluted by attributed marketing leads.
- **T10: Linear lead-based attribution** (team/route.js): Marketing revenue attribution changed from lead share to revenue share — agents who close high-value deals receive proportional marketing credit. Falls back to lead share for agents with 0 CRM revenue.
- **T11: Adsets route used live Facebook API** (adsets/route.js): Full migration from Facebook Graph API to Prisma DB — eliminates token expiry as single point of failure. Follows campaigns/route.js DB-first pattern.
- **T12: Lifespan upward bias** (Dashboard.js): Changed `Math.ceil` to `Math.round` — removes systematic +0.5 day bias per customer.
- **T13: Binary health score** (FacebookAds.js): Enhanced from 2-level (100/75) to graduated scoring with 4 checks: spend spike, CTR drop (<0.5%), low ROAS (<1.0x), creative fatigue (>30 days).
- **T14: L5 tier no internship recency check** (CustomerList.js, CustomerCard.js): Added inventory cross-reference — internship must be within 2 years to qualify for L5 Elite tier.
- **T7: Revenue field semantic ambiguity** (Dashboard.js): Added clarifying comment — `total_spend` confirmed as customer LTV (cumulative purchases), not ad spend.

### Added
- **LINE Messaging API Integration (ADR-016)**: Push notifications to a designated LINE Group for marketing alerts using the LINE Messaging API instead of the deprecated LINE Notify.
- **LINE Webhook Endpoint**: New `/api/webhooks/line/route.js` with HMAC signature verification for receiving LINE events, separate from Facebook webhook to avoid validation conflicts.
- **LINE Flex Message Daily Summary**: Premium visual report card sent at 9 AM daily with V School branding (#E62129), category breakdown (Sushi, Ramen, Dimsum, Kids Camp), MTD aggregates, and interactive "Open Dashboard" button.
- **`get_leads()` Priority Function**: New lead counting logic in `sync_ads_incremental.py` that checks `messaging_conversation_started_7d` → `total_messaging_connection` → `lead` to match Facebook Ads Manager's "Results" metric for Messaging campaigns.
- **Facebook Webhooks Interface**: Implemented `/api/webhooks` to receive real-time Messenger and Lead events from Meta.
- **Scalable Sync Architecture (ADR-015)**: Transitioned from aggressive polling to an event-driven model combined with hourly cron reconciliation.
- **CRM Reconciliation Cron**: Added a recurring task in `instrumentation.js` to perform a full sync of customers and conversations every hour.
- **Webhook Security**: Added X-Hub-Signature validation support for authenticating incoming Facebook events.

### Changed
- **Daily Metrics Sync Window**: Extended from 7 days to 30 days in `sync_ads_incremental.py` to match the dashboard's default view and catch delayed Facebook attribution updates.
- **Rate Limit Optimization**: Removed automatic background sync on every GET request to `/api/customers` to prevent Meta Graph API rate limiting.
- **Reduced Frontend Polling**: Decreased polling frequency in `FacebookChat.js` (60s for conversations, 30s for active messages) to optimize client and server resources.
- **Async Event Processing**: Offloaded webhook processing to BullMQ (Redis) to ensure immediate responses to Meta's servers (within the 3-second requirement).

### Added
- **Deterministic Agent Detection**: Added signature-based detection for Meta system assignment messages in `BusinessAnalyst.js`.
- **Hybrid Assignment Logic**: API routes now use a hybrid approach (Signatures + AI) to identify assigned agents.
- **Agent Name Mapping**: Automatic mapping of full names from Facebook (e.g., "Jutamat Fah...") to short nicknames (e.g., "Fah") using the employee database.
- **Staff Registry**: Registered new employees: **NuPhung** (Manager) and **Satabongkot** (Admin/Sales).
- **Profile Fallback**: Added fallback logic for the "View Full Profile" button to handle leads not yet synced to the primary database.

### Changed
- **API Robustness**: Switched Prisma `update` to `upsert` in chat assignment routes to gracefully handle missing conversation records.
- **Cache Normalization**: Consolidated and normalized JSON profile structures in the local cache to ensure UI consistency.
- **Messages Sync**: Updated the `messages` API to dynamically search for conversation history files across multiple naming patterns (`t_*.json`, `conv_*.json`).
- **Launch Script**: Refined `รันระบบ_NextJS.command` for better error handling and path resolution.

### Fixed
- **Ads API Crash (Prisma Relation Mismatch)**: Fixed `/api/marketing/ads` route that returned 500 error because `Ad` model has no direct `campaign` relation — must traverse `adSet → campaign`.
- **Lead Count Accuracy**: Fixed severe undercounting of leads (e.g., 4 vs 15 for Kids Camp) by using `messaging_conversation_started_7d` instead of `lead` action type for Messaging campaigns.
- **LINE Flex Message Schema**: Removed invalid `alpha` and `size` properties that caused LINE API rejection.
- **Assignment Failures**: Resolved "Customer directory not found" error during chat claims by correctly mapping folder paths.
- **Profile Load Errors**: Fixed silent failures in the Inbox when clicking "View Full Profile" for new customers.
- **Inbox Agent Badges**: Fixed missing agent badges in the inbox by scanning both message history and live snippets for assignment evidence.
