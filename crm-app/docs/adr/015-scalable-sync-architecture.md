# ADR 015: Scalable Synchronization Architecture (Event-Driven + Cron)

## Status
Accepted (2026-02-24)

## Context
Initial implementations of the CRM relied on aggressive polling and "sync-on-read" patterns (triggering a full Facebook sync every time a user listed customers or opened a chat). This approach:
1.  Risked exceeding Meta Graph API Rate Limits (User/App level).
2.  Caused significant server-side load as concurrent users increased.
3.  Provided suboptimal performance as UI responses were often throttled by background sync processes.

## Decision
Transition to a **Scalable Sync Architecture** consisting of three layers:

1.  **Reactive Layer (Event-Driven):** 
    - Implement a Facebook Webhook listener at `/api/webhooks`.
    - Push incoming events (messages, leads) to a BullMQ (Redis) queue.
    - Process jobs asynchronously to ensure the webhook endpoint responds within the mandatory 3-second window.
2.  **Consistency Layer (Periodic):**
    - Implement an hourly cron job in `instrumentation.js` (minute 10) to perform a "Full Reconciliation" (Consistency Sync).
    - This ensures any missed webhook events or delayed marketing insights are correctly captured.
3.  **Optimization Layer (UI Throttling):**
    - Remove the "Sync-on-Read" logic from `GET /api/customers`.
    - Reduce frontend polling frequency in `FacebookChat.js` from 15s/5s to 60s/30s, as the server-side cache is now updated via webhooks.

## Consequences
- **Pros:** 
    - Dramatically reduced risk of Facebook Rate Limit blocks.
    - Improved UI responsiveness and reduced server CPU/Memory spikes.
    - Better handling of concurrent staff sessions.
- **Cons:** 
    - Slightly higher complexity (requires Redis and Webhook infrastructure).
    - Testing requires webhook simulation or external tunneling (e.g., ngrok).
- **Risk:** If the Webhook endpoint is unreachable, data freshness depends on the hourly cron job.
