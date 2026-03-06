# ADR 015: Database ID Architecture & Facebook Integration Strategy

## Status
Accepted

## Context
Integrating Facebook Business Suite chat data into the V School CRM requires handling multiple identifiers (IDs) specific to Facebook's ecosystem. The challenge lies in mapping these external IDs to the CRM's internal relational database schema (`Customer`, `Conversation`, `Message`) without requiring a complete database overhaul, while simultaneously supporting future scale (e.g., Supabase Webhooks) and immediate operational needs (e.g., accurate admin attribution via web scraping).

Facebook uses a hierarchical ID structure for messaging:
1.  **Page ID (`asset_id`)**: Identifies the Facebook Page (e.g., The V School).
2.  **Conversation ID / Thread ID (`t_...` or 15-digit UID)**: Identifies a specific chat thread between the Page and a Customer.
3.  **PSID (`selected_item_id` / Page-Scoped ID)**: A 17-digit ID uniquely identifying a customer to a specific page.
4.  **Message ID (`mid.$c...` or `m_...`)**: Uniquely identifies a single message within a thread.

The CRM needs to correctly associate these IDs to track customer history, attribute sales to specific admins, and enable seamless navigation back to the Facebook Business Suite UI.

## Decision
We will **NOT** restructure the existing database tables. Instead, we will leverage the flexibility of the current `String` typed ID fields and implement a unified mapping strategy across the API, Scraper, and UI layers.

### 1. Database Schema Mapping
The existing Prisma schema will store Facebook IDs as follows:

*   **`Customer` Table**:
    *   `facebookId`: Stores the 17-digit PSID. (Primary identifier for webhook matching).
*   **`Conversation` Table**:
    *   `conversationId`: Stores the 15-digit User ID (UID) prefixed with `t_` (e.g., `t_123456789012345`). This is the "Source of Truth" for Inbox navigation.
    *   `participantId`: Stores the 17-digit PSID for backward compatibility and webhook routing.
*   **`Message` Table**:
    *   `messageId`: Stores the exact Facebook Message ID (`mid.$c...` or `m_...`). This ensures 100% precision for deduplication (`upsert`) and attribution.

### 2. The Hybrid Data Ingestion Strategy
To overcome the limitation of Facebook Graph API not exposing *which* specific admin replied to a message, we employ a hybrid approach:

*   **Inbound (API / Webhooks)**: 
    *   Handles real-time message events.
    *   Creates/Updates `Message` records using the reliable `mid` provided by the webhook payload.
    *   Links to `Conversation` via Thread ID/PSID.
*   **Outbound (Scraper - `sync_agents_v2.js`)**: 
    *   Runs asynchronously to enrich the data.
    *   Uses **React Fiber Extraction** to dive into the Facebook UI's underlying data structure.
    *   Extracts the exact `message_id` (`mid`) and matches it with the visible sender name (e.g., "Satabongkot").
    *   Updates the `responderId` field in the database based on the exact `messageId` match, achieving 100% attribution accuracy.

### 3. UI Navigation Alignment (UID Unification)
Historically, URLs used the 17-digit PSID. However, Facebook Business Suite requires the 15-digit UID for direct thread navigation.
*   The Scraper actively learns the 15-digit UID when navigating to a thread.
*   The Scraper reports this back to the CRM API.
*   The API updates the `Conversation.conversationId` on-the-fly from the 17-digit PSID format to the prioritized 15-digit UID format (`t_{15_digit_uid}`).
*   The CRM UI (Sidebar/Inbox) will use the updated `conversationId` to generate clean, working navigation links back to Facebook.

## Consequences
### Positive
*   **Zero Downtime / No Breaking Changes**: The existing CRM functionality (Orders, Tasks, Inventory) remains unaffected because the underlying schema structure hasn't changed.
*   **100% Attribution Accuracy**: Extracting `mid` via React Fiber solves the "Missing Link" problem where admin names were not verifiable by API alone.
*   **Future-Proof for Supabase**: The schema is perfectly aligned with the standard Graph API hierarchy, making a future transition to Supabase Edge Functions (Webhooks) straightforward. The `upsert` logic relying on `messageId` is ready for direct database connections.
*   **Reliable UI Navigation**: By unifying around the 15-digit UID, dead links in the CRM UI are eliminated.

### Negative / Risks
*   **Scraper Dependency**: The system currently relies on the web scraper (`sync_agents_v2.js`) to function correctly to achieve full attribution. Any UI changes by Meta that break the React Fiber structure will require script updates.
*   **ID Transition Period**: There may be a brief period where the database contains a mix of 17-digit and 15-digit `conversationId`s until the scraper has fully processed all active threads. The API's flexible lookup logic mitigates this.
