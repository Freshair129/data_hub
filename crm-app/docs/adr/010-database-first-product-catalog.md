# ADR 010: Database-First Product Catalog

## Status
Proposed / Accepted (2026-02-20)

## Context
The system initially relied on a monolithic `catalog.json` file for product and package data. This approach lacked scalability for complex relational data (e.g., packages containing products) and made multi-channel updates difficult. A shift to individual JSON files in `data_hub/products` improved organization, but direct database access was desired for better performance and relational integrity.

## Decision
Transition to a **Pure Database-First** approach for the product catalog.

1.  **Source of Truth**: The PostgreSQL database (Supabase) is the absolute single source of truth for all product and package definitions.
2.  **Legacy Directory Removal**: The legacy `data_hub/products` directory has been removed. All data previously stored in JSON files (`courses/`, `packages/`) has been committed to the database.
3.  **Media Consolidation**: All product images (`packages_picture`) have been migrated to the web application's static assets: `crm-app/public/images/products`.
4.  **Prisma Adapter**: Uses `@prisma/adapter-pg` for robust connectivity.

## Consequences
- **Internal Cache Consolidation**: The application now maintains an internal `crm-app/cache/` directory for high-speed local data access and fallback logic, ensuring the project is 100% portable and self-contained. All legacy `../customer` and `../products` references are removed.
- **Deployment Readiness**: The application no longer depends on local filesystem structures outside of its own root, making it container-ready and cloud-native.
- **Performance**: Direct database queries via Prisma eliminate file parsing overhead.
- **Data Integrity**: Enforces strict typing and relational constraints through Prisma schema.
