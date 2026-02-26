# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

V School CRM ("Customer 360 CRM") — a CRM system for The V School (Japanese Culinary Academy in Thailand). It provides a 360° customer view, Facebook Messenger chat integration, real-time marketing analytics, and AI-driven business insights via Google Gemini.

The primary language is **JavaScript** (Next.js 14 with App Router). The UI language is predominantly **Thai**. Currency is **THB**.

## Build & Run Commands

All commands run from `crm-app/`:

```bash
# Install dependencies
cd crm-app && npm install

# Development server (http://localhost:3000)
npm run dev

# Production build
npm run build

# Production server
npm run start

# Lint
npm run lint

# Background event worker (requires Redis)
npm run worker

# Infrastructure (PostgreSQL + Redis via Docker)
docker compose up -d

# Prisma schema push / generate
npx prisma generate
npx prisma db push

# Browser automation (agent sync from Facebook)
node automation/sync_agents.js
```

Double-click `รันระบบ_NextJS.command` from the repo root to start the dev server with auto browser open.

## Architecture

### Hybrid Database Strategy (Strategy Pattern)

Controlled by `DB_ADAPTER` env var in `.env.local`:
- `DB_ADAPTER=prisma` — PostgreSQL via Supabase (primary, production)
- `DB_ADAPTER=json` — Local JSON files in `crm-app/cache/` (fallback, zero-setup)

Every database function in `crm-app/src/lib/db.js` tries Prisma first, then falls back to JSON cache. This is the **central data access layer** — all API routes use it.

### Data Flow

```
Facebook (Webhooks/API) → Next.js API Routes → lib/ services → Prisma (Supabase PostgreSQL)
                                                            ↘ JSON Cache (crm-app/cache/)
                                                            
Cron (instrumentation.js) → marketingService → Facebook Marketing API → DB upsert
Redis (BullMQ) → eventProcessor worker → chatService / slipService
```

### Key Source Directories (under `crm-app/src/`)

- `app/page.js` — Single-page app root. All views are client-side components switched via `activeView` state. There is no file-based routing for pages; only `api/` uses the App Router.
- `app/api/` — Next.js API routes: `customers`, `employees`, `products`, `catalog`, `marketing`, `facebook`, `ai/*`, `analytics`, `webhooks`, `auth`, `export`, `verify-slip`
- `lib/db.js` — Database adapter layer (Prisma + JSON fallback). Exports `getAllCustomers`, `getCustomerById`, `upsertCustomer`, `getAllEmployees`, `getAllProducts`, `getChatHistory`, etc.
- `lib/cacheSync.js` — Read/write local JSON cache. Structure: `cache/customer/{id}/profile.json`, `cache/ads/campaign/{id}.json`, etc.
- `lib/chatService.js` — Facebook Messenger sync: fetches messages via Graph API, persists to DB and local cache, auto-detects agent assignment.
- `lib/eventProducer.js` / `lib/eventHandler.js` — BullMQ queue producer and event delegation (Node → Python bridge).
- `services/marketingService.js` — Syncs Facebook Ad insights to PostgreSQL. Called by cron in `instrumentation.js`.
- `utils/BusinessAnalyst.js` — Gemini AI wrapper. Generates executive reports, handles chat Q&A, extracts products from conversations, detects agent assignments.
- `workers/eventProcessor.mjs` — BullMQ worker consuming `fb-events` queue. Handles chat sync and slip verification.
- `workers/python/` — Python-based AI and data processing workers.
- `components/` — Large React components (each is a full view/panel). No component library; uses Tailwind CSS + Font Awesome icons.

### Prisma Schema

Located at `crm-app/prisma/schema.prisma`. Uses `@prisma/adapter-pg` (driver adapter) instead of the default engine. Key models: `Customer`, `Order`, `Transaction`, `Conversation`, `Message`, `ChatEpisode`, `Employee`, `Product`, `Campaign`, `AdSet`, `Ad`, `AdDailyMetric`, `AdHourlyMetric`, `Experiment`, `Task`, `AuditLog`.

The Prisma config is in `crm-app/prisma.config.ts` and uses `earlyAccess: true`.

### Cron / Background Tasks

`crm-app/src/instrumentation.js` registers cron jobs when Next.js starts in Node runtime:
- Every hour (`:00`) — daily marketing data sync from Facebook
- Every hour (`:05`) — hourly marketing breakdown sync

### Agent Assignment Detection

Chat assignment uses a **hybrid approach** (signatures + AI fallback):
1. Regex patterns match Thai-language Meta system messages (e.g., `กำหนดการสนทนานี้ให้กับ [Name]`)
2. If no signature match, falls back to Gemini AI detection
3. Full names from Facebook are mapped to employee nicknames via the employee database

### External Integrations

- **Meta Graph API v19.0** — Marketing insights, Messenger chat, webhooks
- **Google Gemini** (`gemini-pro`) — Business analysis, product extraction, agent detection
- **Supabase** — Hosted PostgreSQL
- **Redis / BullMQ** — Async job queue for webhook event processing
- **SlipOK** — Thai bank transfer slip verification

## Environment Variables

Defined in `crm-app/.env` and `crm-app/.env.local`. Key vars:
- `DB_ADAPTER` — `prisma` or `json`
- `DATABASE_URL` — PostgreSQL connection string (Supabase)
- `FB_ACCESS_TOKEN`, `FB_AD_ACCOUNT_ID`, `FB_PAGE_ID`, `FB_PAGE_ACCESS_TOKEN` — Meta API
- `GEMINI_API_KEY` — Google Gemini
- `REDIS_URL` — Redis connection (default `redis://localhost:6379`)
- `SLIPOK_API_KEY`, `SLIPOK_BRANCH_ID` — Slip verification

## Conventions

- Path alias: `@/*` maps to `crm-app/src/*` (configured in `jsconfig.json`)
- Customer IDs follow the format `TVS-CUS-*` (standardized per ADR-007)
- JSON cache files include `_cachedAt` and `_source` metadata fields
- Prisma models use `@map()` to map camelCase fields to snake_case database columns
- The `cache/` directory is a read-through mirror of the database, not a source of truth
- Architecture decisions are documented as ADRs in `crm-app/docs/adr/`

## Repository Structure (Non-obvious)

- `scripts/` (repo root) — One-off data migration and maintenance utilities (JS + Python)
- `crm-app/scripts/` — CRM-specific operational scripts (DB cloning, campaign analysis, etc.)
- `knowledge/` — FAQ and vector index for RAG-based AI features
- `leads-2026/` — Monthly lead CSV exports
- `logs/` — Error logs and checkpoint files
- `crm-app/automation/` — Playwright-based browser automation for Facebook agent sync
