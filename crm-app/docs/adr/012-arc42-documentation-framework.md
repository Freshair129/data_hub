# ADR 012: Adoption of arc42 Framework and C4 Model for Documentation

## Context
As the V School CRM system grows in complexity, a unified and structured way to document its architecture, data flow, and technical decisions is needed. Previously, documentation was scattered across separate files like `overview.md`, `data-architecture.md`, and `PROJECT_STRUCTURE.md`, leading to duplication and potential inconsistency.

## Decision
We have decided to adopt the **arc42 framework** (v8.2) for the project's technical documentation and use the **C4 Model** for all visual representations.

- All technical architecture documentation is now centralized in `crm-app/docs/architecture/arc42-main.md`.
- All diagrams are extracted into standalone Mermaid files within `crm-app/docs/architecture/diagrams/`.
- The root `overview.md` is simplified to serve as a high-level portal.

## Consequences
- **Positive:** Improved maintainability, clear separation of concerns, and a standardized format for onboarding new developers.
- **Negative:** Increased overhead in keeping multiple standalone diagram files and the main documentation file in sync.
- **Neutral:** Developer must be familiar with the arc42 structure and C4 Model concepts.
