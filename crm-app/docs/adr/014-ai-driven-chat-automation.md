# ADR 014: AI-Driven Chat Automation & Agent Assignment

## Status
Accepted (2026-02-21)

## Context
As the volume of customer inquiries in the Facebook Inbox increased, manual agent assignment became a bottleneck. Customers and staff often mention specific agents (e.g., "Boss", "Sales A") in the chat, but these instructions were previously processed manually. A system was needed to proactively detect these intents and automate the assignment flow.

## Decision
Implement **AI-Driven Chat Automation** using the Gemini Pro model.

1.  **Detection Method**: Added `detectAgentFromChat` to the `BusinessAnalyst` utility to analyze messages against a **dynamic list of employees** fetched from the database.
2.  **User Flow**: Integrated detection into the "Smart Explore" modal (Phase 1).
3.  **Full Automation (Phase 2)**: Integrated AI detection directly into the `syncChat` service. The background worker now automatically triggers assignment changes upon detecting staff mentions in incoming messages, updating the DB, Timeline, and Cache without manual intervention.
4.  **Backend Integrity**: Re-centralized assignment logic to ensure consistency across API and Webhook flows.

## Consequences
- **Increased Efficiency**: Reduces the number of clicks required to assign a conversation to the right person.
- **Improved Data Accuracy**: Ensures that conversations are attributed to the correct staff role for performance tracking.
- **Latency**: Adding AI analysis to the product discovery flow increases total response time for that specific action (~1-2 seconds), but provides higher value per interaction.
