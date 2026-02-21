# ADR 011: Custom ID Formatting and Smarter Sessioning

## Status
**Accepted**

## Context
To improve traceability across systems and enable AI-driven insights (episodic chat summaries), we needed a more descriptive and universally applicable ID formatting strategy than the initial `TVS-CUS` sequence. Additionally, the daily session window was too broad, making it difficult for AI to distinguish distinct user intents over a 24-hour period.

## Decision
1. **Custom ID Formatting**: We will use a semantic, prefix-based identifier system.
   - **Customer ID**: `TVS_{CHANNEL}_{ORIGIN}_{NameEn}_{ExtID}` (e.g., `TVS_FB_AD_John_123456`)
   - **Conversation ID**: `{CHANNEL}_TVS_{ORIGIN}_{Timestamp}_{ExtID}`
   - **Session ID**: `session_{YYYYMMDD}_{HHMMSS}_{ExtID}`
   - **Message ID**: `msg_{channel}_{SessionID}_{ExtMsgID}`
2. **Smarter Sessioning Rules**:
   - **Time-based**: A new session starts automatically if there is > 30 minutes of inactivity.
   - **Intent-based**: A new session starts immediately if the entry point changes (e.g., clicking a new Facebook Ad `ad_id`), even if within the 30-minute window.

## Consequences
- **Positive**: IDs now inherently describe the channel and origin (Organic vs. Ad), reducing the need for constant database joins.
- **Positive**: 30-minute and intent-driven sessions provide clean, focused data boundaries for AI summarization (`ChatEpisode`).
- **Negative**: Longer string IDs compared to plain sequential numbers, requiring more storage space in unstructured caches.
