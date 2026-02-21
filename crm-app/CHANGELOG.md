# Changelog

All notable changes to the CRM project will be documented in this file.

## [Unreleased]

### Added
- **Event-Driven Messenger Sync**: Implemented real-time Facebook Messenger webhooks connected to the Python worker for immediate state updates.
- **Custom ID Formatting & Sessioning (ADR 011)**: Replaced sequential customer IDs with descriptive `TVS_{CH}_{ORIGIN}` identifiers. Implemented 30-minute inactivity timeouts and intent-driven (Ad ID) chat sessions to enable AI-driven episodic summaries.
- **Advanced Ad Data Integration**: New Prisma models for Ads, AdSets, Campaigns, and AdCreatives. Enhanced Python sync scripts to track ROAS, Revenue, and daily metrics with exponential backoff API handling.
- **Course Store Images**: Fixed asset loading in the Course Store by resolving symlink and pathing issues.
- **Facebook "Student 360" Sync**: New scripts for comprehensive data ingestion from Facebook Marketing API (`sync_leads_to_db.ts`) and Messenger (`sync_conversations_to_db.ts`).
- **Full Offline Cache**: Implemented `clone_db_to_local.ts` to mirror the entire remote database and media assets to a local JSON cache.
- **Adaptive Database Connector**: Enhanced `src/lib/db.js` with automatic offline fallback, ensuring zero UI disruption during connection loss.
- **Career Courses**: Added "Sushi Career Creation" (4900 THB) and "Ramen Career Creation" (4900 THB) to catalog.
- **Documentation**: Added ADR 009 (Hybrid Cache & Marketing Sync Strategy) and ADR 011 (Custom ID Formatting and Smarter Sessioning).
- **Quality Assurance**: Added `verify_offline_cache.ts` for automated fallback validation.

### Changed
- **Database Architecture**: Implemented adaptive fallback logic in `db.js`.
- **Task Management**: Refined `task.md` to reflect Phase 25 (Facebook Sync & Offline Clone).
### Added
- **Phase 20: Customer ID Standardization (Stable V7)**: Refactored existing customer IDs to alphabetical-sequential format `TVS-CUS-[CHANNEL]-[YEAR]-[SERIAL]`.
- **Phase 19: Mega-Batch Intelligence**: Implemented Context Packing, reducing API overhead by 95% by analyzing 20+ chats per call.
- **Phase 18: Hybrid Intelligence**: Implemented Token Guard (Real-time intent detection) and Batch Auditor (Hourly sweep) to optimize costs.
- **ADR 007**: Documented the immutable Customer ID standard.

### Fixed
- **Profile Fragmentation**: Resolved tag visibility issues caused by consolidated profile folders.
- **Data Persistence**: Fixed `DATA_DIR` pathing errors in Python workers.
- **Discovery Resolution**: Fixed path resolution in AI product discovery when IDs are fragmented.

## [0.2.0] - 2026-02-18

### Added
- **Hybrid Architecture (Python Worker):**
    - `src/workers/python/event_processor.py`: Python-based event consumer handling chat sync and AI tasks.
    - `src/workers/python/requirements.txt`: Python dependencies (redis, requests, facebook-business).
    - `src/lib/pythonBridge.js`: Execution bridge between Node.js and Python.
    - `src/workers/python/integrity_check.py`: Proactive anomaly detector for business logic errors.
- **Workflow Automation:**
    - `.agent/workflows/checkpoint.md`: Professional-grade maintenance workflow with QA and Git automation.
- **Error Resolution & Persistent Memory:**
    - `src/lib/errorLogger.js`: Universal logging with unique Error IDs and tags.
    - `docs/adr/004-error-resolution-persistence.md`: Standardizing how errors and fixes are tracked.
    - `incident_log.md`: Persistent record of logic errors and their resolution quality.

### Changed
- **Logic Delegation:** Migrated `syncChat` and `verifySlip` core logic from Node.js to the Python Worker.
- **Full Delegation:** `src/lib/eventHandler.js` now acts as a dispatcher to the Python Bridge.

### Fixed
- **Redis Dependency:** Implemented "Direct Bridge Mode" to allow Python logic execution without a running Redis server.

## [0.1.1] - 2026-02-18
### Added
- **Initial Event-Driven Support**: Foundation for Python worker event consumption.

## [0.1.0] - 2026-02-12
### Added
- Initial project setup with Next.js.
- Basic CRM functionalities: Customer Profile, Chat UI, Dashboard.
- Facebook Graph API integration.
