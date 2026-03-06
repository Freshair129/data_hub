# 22. Global Message Text Search as Attribution Fallback

Date: 2026-03-04

## Status

Accepted

## Context

ADR-019 established the Playwright-based "Sent by [Name]" scraper, and ADR-021 established PSID-based permanent mapping for admin attribution. However, during integration testing, a fundamental ID namespace mismatch was discovered between the two data sources the attribution system relies on:

| Layer | ID Type | Format | Example |
|---|---|---|---|
| Facebook Business Suite (React Fiber `threadID`) | Global Facebook User ID | 9–15 digits | `540006679`, `100015473020711` |
| Facebook Graph API / CRM DB (`participantId`) | Page-Scoped ID (PSID) | 16–17 digits | `25726727506923789` |
| CRM cache folder (`FB_CHAT_{id}`) | PSID (from Graph API) | Same as above | `FB_CHAT_25726727506923789` |

These are **two entirely different ID namespaces**. There is no numeric relationship between a Global Facebook User ID and a PSID — they cannot be compared or mapped without an additional Facebook Graph API call (`GET /{page}/conversations?user_id={globalId}`).

Testing against production data confirmed: **only 2 out of 127** scraper thread IDs matched any record in the CRM database when compared directly by ID. The remaining 125 conversations could not be located by conversation ID alone.

Additionally, it was confirmed that Facebook Business Suite's URL query parameter `selected_item_id` is **not populated when navigating via click** — only via direct URL navigation. This eliminates URL-based PSID extraction as a reliable approach.

The implication is that the system in ADR-021 (PSID backfill via scraper's `participantId`) is blocked from working at scale until a reliable PSID can be obtained from the UI. The scraper's `threadID` cannot serve as a `participantId` substitute.

## Decision

We implement **Global Message Text Search** as the primary fallback attribution method in `POST /api/marketing/chat/message-sender`.

### Strategy 1a — Conv-Scoped Search (Primary, when conv found)
When a matching `Conversation` record can be located in the DB, search for the message within that conversation scope:
```
prisma.message.findMany({
  where: { conversationId: conv.id, NOT: { fromId: conv.participantId } },
  orderBy: { createdAt: 'desc' }
})
→ find m where m.content.includes(msgText)
→ fallback: m.content.includes(msgText.slice(0, 20))   // if msgText.length >= 20
```

### Strategy 1b — Global DB Search (Fallback, when conv not found)
When no `Conversation` record is found (i.e., the scraper's thread ID has no DB equivalent), search across **all messages in the entire database**:
```
prisma.message.findFirst({
  where: { content: { contains: msgText } },
  orderBy: { createdAt: 'desc' }
})
```
Minimum text length guard: **msgText.length ≥ 15 characters** before triggering global search, to reduce false positive risk from short template phrases.

### Extended Conv Lookup (OR conditions)
Before falling back to Strategy 1b, the conv lookup tries multiple ID forms in parallel:
```
OR [
  { conversationId: rawConvId },
  { conversationId: "t_" + rawConvId },
  { participantId:  rawConvId },
  { participantId:  incomingPsid },     // if scraper sends PSID
  { conversationId: incomingPsid },
  { conversationId: "t_" + incomingPsid }
]
```

### Cache Update Strategies (3-tier)
After DB update, JSON cache is synced via:
- **Strategy A**: Direct PSID folder lookup `FB_CHAT_{psid}/chathistory/` — O(1), used when PSID is available
- **Strategy B**: Filename match — scan folders for chathistory file named `rawConvId` or `t_{rawConvId}`
- **Strategy C**: Full-text scan — pre-filter with `raw.includes(msgText.slice(0, 15))` before `JSON.parse`, then update `fromName` field where message text matches

## Consequences

**Positive:**
- **Bypasses ID mismatch entirely** — attribution succeeds regardless of whether the scraper's thread ID matches any DB ID
- **Immediate impact** — confirmed `+2 msgs` updated successfully in first production test where conv lookup returned null
- **No Graph API dependency** — does not require additional API calls to resolve Global ID → PSID mapping
- **Degrade gracefully** — Strategy 1a (precise, conv-scoped) is preferred; 1b (global) is only triggered when necessary

**Negative / Risks:**
- **False positive risk** — short or template messages (e.g., "สนใจลงวันไหนแจ้งแอดได้เลยนะคะ") sent to many customers could match the wrong DB record. Mitigated by the 15-character threshold.
- **Non-deterministic on identical messages** — if the same text appears in multiple conversations, `findFirst` returns the most recent, which may not be the correct one. Acceptable risk given current scale (~2,000 customers).
- **Performance** — Strategy 1b triggers a full-table `LIKE` scan on `messages`. Consider adding a `content` index if message volume grows significantly.
- **Strategy C cache scan** — O(n) over 788 chathistory files. Acceptable at current scale; should be monitored if cache grows.

**Future Improvement:**
- Once Admin PSID mapping is complete (ADR-021), Strategy 1a becomes the dominant path and Strategy 1b becomes rare
- A `content` GIN index on `messages.content` in PostgreSQL would make Strategy 1b fast at any scale
- Graph API fallback (`GET /{page}/conversations?user_id={globalId}`) can be implemented to resolve the namespace mismatch definitively
