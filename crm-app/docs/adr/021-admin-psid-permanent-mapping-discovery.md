# 21. Admin PSID Permanent Mapping & Discovery

Date: 2026-03-03

## Status

Accepted

## Context

While ADR-019 and ADR-020 established the ability to extract "Sent by [Name]" from the Facebook Business Suite UI, relying solely on names is fragile. Admins may change their profile names, and name-based matching is susceptible to Thai polite particles (คะ/ค่ะ) or nickname variations. 

To achieve industrial-grade reliability for KPI reporting, we need a unique, persistent identifier for each admin. Facebook provides a Page-Scoped ID (PSID) internally in the React Fiber tree for each message sender, including admins. However, this PSID is not exposed through the Graph API for admins, nor is it known upfront.

## Decision

We implement a permanent mapping system and an automated discovery flow to link Admin PSIDs to Employee records.

### 1. Schema Enhancement
Add `facebookId` (Unique String) to the `Employee` model in the PostgreSQL database and the corresponding local JSON employee cache.

### 2. Automated Discovery ("Backfill")
The CRM API (`/api/marketing/chat/message-sender`) is enhanced with discovery logic:
- When a message is matched via name-based heuristics, the system checks if the matched `Employee` has a `facebookId`.
- If missing, the `participantId` (PSID) extracted by the scraper is automatically "backfilled" into the `Employee` record.
- Once a `facebookId` is stored, all future syncs use the PSID as the primary (high-precision) matching key, bypassing name-based heuristics.

### 3. Dual-Save Strategy (Local + DB)
To maintain consistency between the primary PostgreSQL database and the zero-setup local JSON fallback:
- All `facebookId` updates are written to PostgreSQL via Prisma.
- Simultaneously, the update is synced to the local file `crm-app/cache/employee/[id].json`.

### 4. Dedicated Discovery Tooling
To accelerate the mapping of all admins, a specialized script `automation/backfill_agent_mapping.js` is created. This script:
- Queries the database for all active threads in a target period (e.g., February 2026).
- Navigates specifically to those threads in the browser.
- Forces an extraction run to trigger the PSID discovery/backfill in the CRM API.

## Consequences

**Positive:**
- **Immutable Attribution**: Once an admin is mapped by PSID, their attribution remains accurate even if they change their Facebook profile name or use different polite particles.
- **High-Precision matching**: Resolves ambiguity in cases where multiple admins might have similar nicknames.
- **Zero-Setup Resilience**: Local JSON cache remains a mirror of the DB identity mappings.

**Negative:**
- **Initial Discovery Required**: Every admin must send at least one message that gets synced while the scraper is active to be "discovered."
- **Browser Dependency**: Discovery still relies on the scraper's ability to read the React Fiber tree from a live browser session.

**Risk Mitigation:**
- The `admin_kpi_report.js` tool provides a "Name-only attribution" section to highlight admins who have not yet been discovered/mapped by PSID.
