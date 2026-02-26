# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
