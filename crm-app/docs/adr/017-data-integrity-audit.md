# ADR-017: Data Integrity Audit & Pipeline Verification

## Status
Accepted

## Context
A systematic trace of the 3 main data pipelines revealed 16 data integrity issues across the codebase:

1. **Webhook → Worker → SSE pipeline**: Missing imports (`verifySlip`, `logAiActionToTimeline`), wrong parameter (`senderId` instead of `conversationId`), null values published to Redis before validation.
2. **Marketing Sync → DB → UI pipeline**: ROAS calculated from mismatched sources (cache revenue ÷ DB spend), hourly API missing `actions` array from DB.
3. **UI → db.js → Prisma/JSON pipeline**: Cart shape inconsistency between adapters, profile file naming mismatch preventing cache writes, success returned when only one of two adapters updated.

The audit was triggered by a cross-sell misattribution incident (ERR-20260218-001) where a Dinner campaign customer purchased a Ramen course, and the system attributed the entire ฿34,000 revenue to the Dinner ad.

## Decision
- **Fix 9 actionable issues** (5 Critical, 3 High, 1 Warning) in a single coordinated batch across 7 files.
- **Create `slipService.js`** as a dedicated service module for SlipOK API integration, replacing the missing inline function.
- **Unify ROAS calculation** in the overview API to use `adDailyMetric.aggregate()` for both revenue and spend (same source = consistent ratio).
- **Add SSE channel handlers** for `chat-updates` and `slip-updates` using `window.dispatchEvent(CustomEvent)` for loose component coupling.
- **Defer 7 warning-level issues** (naming inconsistency, message reversal pipeline, agent resolution priority conflicts, ROAS double-calculation, linear attribution model) as they require broader refactoring.

### Files Modified
| File | Changes |
|---|---|
| `src/workers/eventProcessor.mjs` | +import verifySlip, +import logAiActionToTimeline, fix label param, add null check |
| `src/lib/chatService.js` | Export `logAiActionToTimeline()` |
| `src/lib/slipService.js` | New file — SlipOK API wrapper with graceful degradation |
| `src/app/api/marketing/chat/assign/route.js` | Fix profile file matching, add cache-sync warning |
| `src/app/api/marketing/overview/route.js` | Rewrite ROAS to use adDailyMetric.aggregate() |
| `src/components/CustomerList.js` | Fix cart init shape |
| `src/app/page.js` | Add SSE handlers for chat/slip channels |

## Consequences
- **Positive**: Slip verification no longer crashes the worker. ROAS numbers are consistent across the dashboard. Agent labels are applied to the correct conversation. Task creation failures are handled gracefully. SSE events are fully consumed by the UI.
- **Negative**: 7 warning-level issues remain as known tech debt (W1-W4, W7 documented in plan file). The `slipService.js` stub returns an error when `SLIPOK_API_KEY` is not configured. Window CustomEvents for SSE require individual components to register their own listeners.
- **Monitoring**: The `[Assign]` and `[Worker]` log prefixes now surface data-split warnings that were previously silent, enabling proactive detection via log monitoring.

## Addendum: UI Calculation Audit (2026-02-27)

A second pass audited all UI tab calculations against their API data sources. Found 14 issues (4 Critical, 3 High, 4 Medium, 3 Low). Fixed 7 actionable issues:

### Additional Files Modified
| File | Changes |
|---|---|
| `src/components/FacebookAds.js` | T1: Math.max → sum in action helpers, T6: Calculate CTR/CPC for daily mode |
| `src/components/Analytics.js` | T2: Mutually exclusive funnel, T3: Remove messaging from purchase filter, T9: RFM frequency default 0 |
| `src/app/api/marketing/overview/route.js` | T4: Use DB spend for ROAS denominator (completes C2 fix) |
| `src/components/EmployeeManagement.js` | T8: Case-insensitive agent matching |

### Resolved Deferred Issues (2026-02-28)
All previously deferred issues have been resolved in 3 batches:

| Fix | File | Resolution |
|---|---|---|
| T5 | `src/app/api/analytics/team/route.js` | Conversion rate uses CRM actuals (`stats.customers / stats.leads`) |
| T7 | `src/components/Dashboard.js` | Confirmed `total_spend` = customer LTV; added clarifying comment |
| T10 | `src/app/api/analytics/team/route.js` | Attribution changed from lead share → revenue share (with fallback) |
| T11 | `src/app/api/marketing/adsets/route.js` | Full rewrite: FB Graph API → Prisma DB query |
| T12 | `src/components/Dashboard.js` | `Math.ceil` → `Math.round` for lifespan |
| T13 | `src/components/FacebookAds.js` | 4 health checks + graduated scoring (was binary 100/75) |
| T14 | `src/components/CustomerList.js`, `CustomerCard.js` | Internship recency validation via inventory (2-year window) |
