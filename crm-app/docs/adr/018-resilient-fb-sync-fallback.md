# 18. Resilient FB Sync Fallback

Date: 2026-03-01

## Status

Accepted

## Context

During a period of local server downtime, Facebook webhooks failed to deliver messages to the CRM. When the Playwright sync script (`sync_agents_v2.js`) attempted to attribute matched texts, it failed because the messages were never persisted. Additionally, Facebook Business Suite utilizes short Participant IDs while the Graph API requires fully-qualified Thread IDs (`t_...`). The API fetching logic in `chatService.js` was stripping the `t_` prefix, rendering historical fetching broken for new conversations, and the database `findUnique` strict query dropped messages for non-existent local conversations.

## Decision

We implemented a robust multi-layered fallback strategy:
1. **Endpoint Resolution:** `chatService.js` now dynamically structures FB Graph API URLs. If a Thread ID is provided (`t_`), it preserves the prefix and calls `?fields=messages`. If a Participant ID is provided, it uses the `/{id}/messages` endpoint.
2. **Conversation Upsertion:** Before saving any messages, `chatService.js` forces a Prisma `upsert` on the Conversation record. This guarantees that missing initial webhook events do not cause the entire message history block to be silently discarded.
3. **Global DB Text Search (`route.js`):** If the scraper provides an invalid UI ID, the attribution route first attempts to match via the specific conversation. If that fails, it executes a "Global Search" across the latest 200 system messages to discover the correct Thread ID via text matching, automatically identifying and linking the orphaned customer.

## Consequences

- **Positive:** We are no longer strictly reliant on 100% webhook uptime. If webhooks miss a message, a manual sync combined with UI scraping will successfully bridge the IDs, create the missing DB entries, and attribute the messages correctly.
- **Negative:** Global text searching (scanning up to 200 messages system-wide) incurs a minor performance overhead compared to direct ID lookups, though the limit ensures it remains performant.
