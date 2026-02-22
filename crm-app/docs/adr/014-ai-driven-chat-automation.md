# ADR 014: AI-Driven Chat Automation & Agent Assignment

## Status
Accepted (2026-02-21)

## Context
As the volume of customer inquiries in the Facebook Inbox increased, manual agent assignment became a bottleneck. Customers and staff often mention specific agents (e.g., "Boss", "Sales A") in the chat, but these instructions were previously processed manually. A system was needed to proactively detect these intents and automate the assignment flow.

## Decision
Implement **AI-Driven Chat Automation** using the Gemini Pro model.

1.  **Detection Method**: Added hybrid detection to the `BusinessAnalyst` utility.
    - **Signature-based**: Specifically checks for Meta's assignment signatures (e.g., "กำหนดการสนทนานี้ให้กับ") to ensure 100% accuracy for system events.
    - **AI-based**: Uses Gemini Pro to analyze intent and mentions when no signature is found.
2.  **User Flow**: Integrated detection into the "Smart Explore" modal and Inbox loading flows.
3.  **Full Automation (Phase 2)**: Integrated detection directly into the `syncChat` service and `conversations` API. The system now automatically triggers assignment updates and maps full names to staff nicknames using the employee database.
4.  **Backend Integrity**: Re-centralized assignment logic using Prisma `upsert` to ensure consistency across API, Webhook, and local cache flows.

## Consequences
- **Increased Efficiency**: Reduces the number of clicks required to assign a conversation to the right person.
- **Improved Data Accuracy**: Ensures that conversations are attributed to the correct staff role for performance tracking.
- **Latency**: Adding AI analysis to the product discovery flow increases total response time for that specific action (~1-2 seconds), but provides higher value per interaction.
