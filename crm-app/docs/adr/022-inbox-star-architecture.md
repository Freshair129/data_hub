# ADR 022: Inbox Star Architecture

**Status:** Accepted
**Date:** 2026-03-06

## Context
As the CRM conversation volume grows, agents need a fast, reliable method to flag and prioritize specific chats directly from the FacebookChat UI. Previously, filtering heavily relied on date ranges, which added UX friction and cluttered the sidebar UI without explicitly establishing priority.

## Decision
1. **Remove Date Filters:** The Start/End date UI has been ripped out from the FacebookChat sidebar to create a cleaner, more focused agent experience.
2. **Boolean `isStarred` Flag:** Added a direct `isStarred` boolean property to the `Conversation` table in PostgreSQL.
3. **Dual-Sync Mechanism:** Created a dedicated API route (`/api/marketing/chat/star`) that strictly handles toggling this flag. To honor our `DB_ADAPTER` fallback strategy, this endpoint attempts to update PostgreSQL (Primary) and then strictly mirrors the change into the `chathistory/{conversationId}.json` local cache.
4. **Client-Side Sorting:** Unread counting is native to Meta, but `isStarred` is explicitly CRM-side. We implemented local sorting in the `filteredConversations` useMemo block to ensure Starred chats reliably "float" to the top of the inbox, bypassing strict chronological updating if necessary.

## Consequences
- **Positive:** Cleaner UI with focus on agent actionability. High-priority chats won't drown under incoming spambots or non-essential queries.
- **Positive:** Preserves the offline-capable architecture by updating the local JSON cache immediately.
- **Negative:** Re-sorting thousands of chats on the client-side (`FacebookChat.js`) could add slight CPU overhead if the `conversations` array grows excessively large without pagination.

