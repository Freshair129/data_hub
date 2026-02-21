# ADR 013: Hourly Marketing Metrics Synchronization

## Status
**Accepted** (2026-02-21)

## Context
High-performance business analysis requires granular data. Previously, marketing data was synced daily, which limited the ability to monitor real-time ad performance or respond to intraday performance shifts. Additionally, relying on file-based logs was becoming unsustainable as data volume grew.

## Decision
Implement an automated hourly synchronization service for Facebook Marketing metrics.

1. **Granularity**: Fetch data with `hourly` breakdown using the Facebook Marketing API.
2. **Persistence**: Store metrics in the `AdHourlyMetric` table in PostgreSQL via Prisma.
3. **Automation**: Use Next.js instrumentation and a cron-like scheduler (running at 5 minutes past every hour) to trigger the sync.
4. **Resilience**: Implement the `PrismaPg` driver adapter to ensure stable long-lived connections for background tasks.
5. **Single Source of Truth**: AI services and Dashboards now query marketing data exclusively from the database, bypassing legacy JSON logs in `data_hub/marketing/logs`.

## Consequences
- **Deep Intelligence**: Enables the AI Business Analyst to provide hourly performance insights and "Winning Ad" identification.
- **Performance**: Database queries for marketing data are significantly faster than scanning multiple JSON files across a directory tree.
- **History**: Allows for historical analysis beyond the standard Facebook 37-day window by persisting historical hourly snapshots in our own DB.
- **Complexity**: Background instrumentation adds memory footprint to the running Next.js instance.
