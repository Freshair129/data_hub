# 19. Business Suite Playwright Agent Attribution

Date: 2026-03-01

## Status

Accepted

## Context

V School CRM tracks which admin/agent replied to each customer conversation on Facebook Messenger. The natural solution would be to use the Facebook Graph API `from` field on Message objects. However, Facebook's architecture treats all messages sent by any Page admin as originating from the Page identity — the `from` field always returns `{ id: PAGE_ID, name: "The V School" }` regardless of which individual admin (e.g., NuPhung, Satabongkot, Fafah) actually typed and sent the message.

Alternative API approaches were investigated and ruled out:

| Approach | Why Ruled Out |
|---|---|
| Graph API `from` field | Always returns Page identity, not individual admin |
| Page Insights API | Aggregate metrics only, no per-message attribution |
| Conversation Participants API | Returns all admins who have access, not who sent a specific message |
| Meta Business API admin audit log | Not exposed via Graph API; internal Meta only |

Facebook Business Suite (business.facebook.com) **does** display "ส่งโดย [ชื่อ]" (Sent by [Name]) on each admin-sent message bubble. This UI-level attribution is rendered from internal signals not exposed through any public API endpoint.

**Additional technical challenges:**
- Business Suite's inbox uses a **virtual list renderer**: only 2–3 conversation items exist in the DOM at any time; the rest are unmounted as you scroll
- Conversation links use `href="#"` with no thread ID in the DOM attribute — all routing data is stored exclusively in **React internal fiber props**
- Thread IDs from React fiber (`threadID = "100002428547834"`) are participant PSIDs, structurally different from the DB's `conversationId` format (`t_XXXXXXXX`)

## Decision

We implement a Playwright-based scraper (`crm-app/automation/sync_agents_v2.js`) that attaches to an existing authenticated Chrome session via Chrome DevTools Protocol (CDP) and reads agent names directly from the Business Suite UI.

### Architecture

```
Chrome (--remote-debugging-port=9222)
  └── business.facebook.com/latest/inbox/all
          │
    sync_agents_v2.js (Playwright CDP attach)
          │
    ┌─────┴──────────────────────────────────┐
    │  Phase 1: Collect Thread IDs           │
    │  • Walk ._4bl9 a[role="row"] elements  │
    │  • Extract threadID from __reactFiber  │
    │  • Scroll container 500px × N times   │
    │  • Collect until limit reached         │
    └─────┬──────────────────────────────────┘
          │  (for each threadID)
    ┌─────┴──────────────────────────────────┐
    │  Phase 2: Navigate + Extract           │
    │  • Try: row.click() (natural nav)      │
    │  • Fallback: URL ?selected_item_id=    │
    │  • Wait 5–12s (anti-bot)               │
    │  • Scroll message area upward 2–4×     │
    │  • extractSenders(): fiber props walk  │
    │    → responseId/messageId              │
    │    → responseText/consumerText/text    │
    │    → DOM sibling fallback              │
    └─────┬──────────────────────────────────┘
          │
    ┌─────┴──────────────────────────────────┐
    │  Phase 3: Attribute via CRM API        │
    │  POST /api/marketing/chat/message-sender│
    │  { conversationId, senders }           │
    │                                        │
    │  API Strategy 1 (message-level):       │
    │  • Lookup: conversationId OR           │
    │            participantId (PSID bridge) │
    │  • Phase A: search within conversation │
    │  • Phase B: global search 200 msgs     │
    │  • Update message.fromName             │
    │                                        │
    │  API Strategy 2 (conv-level):          │
    │  • Update conversation.assignedAgent   │
    │  • Update cache JSON (ADR-009)         │
    └────────────────────────────────────────┘
```

### Key Technical Decisions

**1. React Fiber for Thread ID extraction**

Business Suite does not expose thread IDs in href attributes or data attributes. The only source is React's internal fiber tree. We walk `__reactFiber$*` keys on `._4bl9 a[role="row"]` elements, traversing up to 35 fiber nodes via `.return` until we find `memoizedProps.threadID`.

This is an internal API with no stability guarantees, but it is the only feasible approach given the constraints.

**2. Virtual list scrolling**

The sidebar uses virtualized rendering. We find the scroll container by walking parent elements until we find one with `overflowY: auto | scroll` and `scrollHeight > clientHeight + 50`, then increment `scrollTop` by 500px per iteration, waiting for React to remount new items between each step.

**3. Message text matching instead of timestamp matching**

Business Suite renders message timestamps in localized Thai format ("พ. 16:18 น.") with no Unix timestamp available in the message area DOM (the `abbr[data-utime]` elements exist only in the sidebar, not in the chat area). We therefore match messages by their text content (first 80 characters) against `message.content` in the database.

**4. Dual ID lookup (PSID → Thread ID bridge)**

The `threadID` extracted from React fiber is the customer's participant PSID (format: `100002428547834`). The database stores conversations using the Graph API thread ID format (`t_XXXXXXXX`). The API route bridges this by attempting `conversationId` match first, then falling back to `participantId` match.

**5. Anti-bot measures**

To reduce risk of Facebook detecting and rate-limiting the scraper:
- Random inter-conversation waits (5,000–12,000ms)
- Shuffled batching: 20–30 randomly selected conversations per run (not sequential)
- Human-like scroll simulation in message area (variable speed, random step count)
- Click-first navigation (simulates natural user click on sidebar item) with URL navigation as fallback only

**6. Auto-reply filtering**

Admin "ส่งโดย" labels appear on automated replies (ข้อความตอบกลับอัตโนมัติ) as well as human messages. We filter these by checking `el.textContent.includes('ข้อความตอบกลับอัตโนมัติ')` before attributing a name.

### Operational Requirements

```bash
# 1. Start Chrome with CDP enabled
./crm-app/automation/เปิด_Chrome_CRM.command   # port 9222

# 2. Log into Business Suite and open Inbox tab manually

# 3. Ensure CRM Next.js server is running
cd crm-app && npm run dev   # port 3000

# 4. Run attribution sync
node automation/sync_agents_v2.js --attach --limit=30
# DEBUG output:
DEBUG_SYNC=1 node automation/sync_agents_v2.js --attach --limit=5
```

## Consequences

**Positive:**
- Solves a previously unsolvable data gap: agent attribution is now possible despite Facebook Graph API limitation
- Two-level attribution (message-level `fromName` + conversation-level `assignedAgent`) gives both granular and summary views
- Runs independently of webhook availability — can be triggered manually or scheduled as a cron job
- Anti-bot measures make the scraper resilient to casual detection

**Negative:**
- Depends on Facebook Business Suite DOM structure (`._4bl9`, React fiber prop names like `threadID`, `responseId`, `responseText`) — changes to Business Suite's frontend may break the scraper silently
- Requires Chrome to be running, logged-in, and pointed at Business Suite's Inbox view — cannot run fully headlessly without a pre-authenticated profile
- Message text matching can produce false positives if two messages share the same opening text (mitigated by scoping Phase A to the specific conversation first)
- Global search (Phase B / ADR-018) scans up to 200 messages system-wide — minor performance overhead on large databases
- Running during peak hours with fast conversation switching may trigger Facebook's bot detection

**Risk Mitigation:**
- Selector breakage risk: `._4bl9` is the only hard-coded CSS class; React fiber walk is prop-name based (more stable). If DOM changes, the script logs `⊘ ไม่พบ sender` per conversation rather than crashing.
- Scheduled cadence of once per hour (matching cron :10 sync) keeps request volume low.
