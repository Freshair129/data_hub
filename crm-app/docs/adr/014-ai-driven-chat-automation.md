# ADR 014: AI-Driven Chat Automation & Agent Assignment

## Status
Accepted (2026-02-21)

## Context
As the volume of customer inquiries in the Facebook Inbox increased, manual agent assignment became a bottleneck. Customers and staff often mention specific agents (e.g., "Boss", "Sales A") in the chat, but these instructions were previously processed manually. A system was needed to proactively detect these intents and automate the assignment flow.

## Decision
Implement **AI-Driven Agent Detection** using the Gemini Pro model.

1.  **Detection Method**: Added `detectAgentFromChat` to the `BusinessAnalyst` utility to analyze the last 20 messages for assignment intent.
2.  **User Flow**: Integrated detection into the "Smart Explore" (Detect Products) modal.
3.  **Proactive Suggestions**: When a potential agent is identified, the UI presents a confirmation prompt (`window.confirm`) to the user, providing both the suggestion and the AI's justification.
4.  **Backend Integration**: Uses the existing `/api/marketing/chat/assign` route (now corrected for internal paths) to persist the assignment.

## Consequences
- **Increased Efficiency**: Reduces the number of clicks required to assign a conversation to the right person.
- **Improved Data Accuracy**: Ensures that conversations are attributed to the correct staff role for performance tracking.
- **Latency**: Adding AI analysis to the product discovery flow increases total response time for that specific action (~1-2 seconds), but provides higher value per interaction.
