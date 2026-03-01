# ADR 020: Conversational ID Threading and Deep Attribution Standard

## Context
As the V School CRM matures, the mapping between Facebook Messenger conversations and the internal database has faced challenges with ID fragmentation. Specifically:
- Different APIs (Graph API vs. Business Suite UI) use different identifier formats.
- Staff attribution (Responder ID) was previously estimated or limited to recent messages due to scraping constraints.
- A requirement exists to perform a full historical sync of 2026 data without missing early message contexts.

## Decision
1. **Thread ID as Primary Key**: Standardize `conversationId` across all sync layers to use the raw Facebook `threadID`, prefixed with `t_` (e.g., `t_10163799966326505`). This aligns with the format used by both the Graph API and the Messenger UI fiber props.
2. **Fiber-Based Extraction**: Implement deep scanning in the Playwright scraper using React Fiber property traversal to extract `responseId` and `threadID` directly from the browser's memory, bypassing obfuscated HTML.
3. **Deep Deep Sync**: Implement a "Deep Scroll" logic with a date-based cutoff (February 1st, 2026). The scraper will scroll up within each chat until it encounters a January 2026 or older date, ensuring 100% accurate staff attribution for the first message of 2026.
4. **Persistent Success Logging**: Maintain a flat-file log (`logs/synced_threads.log`) of successfully processed threads to prevent redundant processing during multi-round loops.

## Consequences
- **Improved Accuracy**: 100% precision in matching agents to their specific messages using absolute `messageId` (Facebook's `responseId`).
- **Data Integrity**: Unified ID format eliminates duplicates where the same chat was previously tracked under different aliases (e.g., PSID vs ThreadID).
- **Processing Overhead**: Deep scanning increases the "time per chat" during the initial sync, but is mitigated by the persistent cache and hourly reconciliation and loop delays.
- **February 2026 Goal**: Successfully enables the business requirement to audit all February 2026 staff performance and revenue attribution.
