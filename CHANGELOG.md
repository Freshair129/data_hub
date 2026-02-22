# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Deterministic Agent Detection**: Added signature-based detection for Meta system assignment messages in `BusinessAnalyst.js`.
- **Hybrid Assignment Logic**: API routes now use a hybrid approach (Signatures + AI) to identify assigned agents.
- **Agent Name Mapping**: Automatic mapping of full names from Facebook (e.g., "Jutamat Fah...") to short nicknames (e.g., "Fah") using the employee database.
- **Staff Registry**: Registered new employees: **NuPhung** (Manager) and **Satabongkot** (Admin/Sales).
- **Profile Fallback**: Added fallback logic for the "View Full Profile" button to handle leads not yet synced to the primary database.

### Changed
- **API Robustness**: Switched Prisma `update` to `upsert` in chat assignment routes to gracefully handle missing conversation records.
- **Cache Normalization**: Consolidated and normalized JSON profile structures in the local cache to ensure UI consistency.
- **Messages Sync**: Updated the `messages` API to dynamically search for conversation history files across multiple naming patterns (`t_*.json`, `conv_*.json`).
- **Launch Script**: Refined `รันระบบ_NextJS.command` for better error handling and path resolution.

### Fixed
- **Assignment Failures**: Resolved "Customer directory not found" error during chat claims by correctly mapping folder paths.
- **Profile Load Errors**: Fixed silent failures in the Inbox when clicking "View Full Profile" for new customers.
- **Inbox Agent Badges**: Fixed missing agent badges in the inbox by scanning both message history and live snippets for assignment evidence.
