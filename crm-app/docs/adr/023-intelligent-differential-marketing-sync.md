# ADR 023: Intelligent Differential Marketing Sync

## Status
**Accepted** (2026-03-08)

## Context
As the number of ads and frequency of synchronization increases (from daily to hourly), two major constraints emerged:
1. **Rate Limiting**: Fetching full data for hundreds of ads every hour risk hitting Meta's Rate Limits.
2. **Database Storage**: Storing identical metrics for inactive or low-engagement ads every hour leads to redundant data growth.
3. **Attribution Precision**: We need to link specific ads to products while maintaining a verifiable audit trail up to the campaign level.

## Decision
Implement an "Intelligent Differential Sync" with an "Ad-Level First" fetching priority.

1. **Ad-Level Priority**: Fetch data at the finest granularity (Ad level) to enable direct product-to-ad mapping.
2. **Read Optimization**: Filter API calls using `updated_time` and `effective_status: ACTIVE` to only fetch ads modified since the last sync.
3. **Differential Write (Delta Rule)**: Only save a new database record if the metrics (spend, clicks, etc.) have changed compared to the previous hour. If the delta is zero, skip the write.
4. **Bottom-Up Aggregation**: Calculate Ad Set and Campaign totals by summing up Ad-level data. This ensures internal consistency.
5. **Daily Baseline Reset**: Perform one full sync every 24 hours (at 00:00) to ensure the system doesn't drift due to minor API discrepancies.
6. **Integrity Audit (Checksum)**: Periodically verify that [Sum of Ad Spends] equals [Campaign Total Spend] provided by the API.

## Consequences
- **Storage Efficiency**: Estimated 40-70% reduction in DB record growth by skipping "no-change" hours.
- **Rate Limit Safety**: Significant reduction in total API data transferred per hour.
- **High Granularity**: Enables exact ROAS calculation per product without sacrificing Campaign-level auditability.
- **Complexity**: Requires a "Baseline" tracking mechanism in the sync service.
