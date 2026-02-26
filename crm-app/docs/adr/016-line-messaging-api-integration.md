# ADR-016: LINE Messaging API Integration

## Status
Accepted

## Context
The V School CRM needed a way to push real-time marketing alerts (disapproved ads, daily spend summaries) to the operations team via LINE, Thailand's dominant messaging platform. Initially LINE Notify was considered, but it was deprecated in favor of the LINE Messaging API which offers richer message types (Flex Messages) and targeted group delivery.

## Decision
- **LINE Messaging API (Push)**: Use the Push API (`/v2/bot/message/push`) to send targeted messages to a specific LINE Group ID instead of broadcasting to all followers.
- **Flex Messages**: Daily marketing summaries use LINE Flex Message format (structured JSON cards) for premium visual reporting with brand colors, KPI tables, and interactive buttons.
- **Dedicated Webhook**: A separate webhook endpoint (`/api/webhooks/line/route.js`) handles incoming LINE events independently from the existing Facebook webhook to prevent signature validation conflicts.
- **Lead Counting Fix**: Replaced `action_type == "lead"` with a priority-based `get_leads()` function that checks `messaging_conversation_started_7d` first, matching what Facebook Ads Manager displays for Messaging-objective campaigns.

## Consequences
- **Positive**: Team receives branded, actionable alerts in LINE. Lead counts now match Facebook Ads Manager exactly. Group-targeted messaging prevents spam to unrelated followers.
- **Negative**: Requires `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, and `LINE_GROUP_ID` environment variables. Flex Message JSON is verbose and requires API-specific validation (no `alpha` or `size` on certain components).
