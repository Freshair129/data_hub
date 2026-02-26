# GEMINI.md - V School CRM Context

This project is a hybrid Customer Relationship Management (CRM) system for **The V School** (Japanese Culinary Academy in Thailand). It integrates Facebook Messenger chat, Meta Ads marketing data, AI-driven business intelligence via Google Gemini, and automated bank slip verification.

## 🚀 Quick Start

```bash
# Core Application (Next.js)
cd crm-app
npm install
npm run dev # Access at http://localhost:3000

# Background Tasks (Requires Redis)
npm run worker

# Infrastructure (PostgreSQL + Redis via Docker)
docker compose up -d
npx prisma generate
npx prisma db push
```

## 🏗️ Architecture & Core Strategy

### 1. Hybrid Database (Strategy Pattern)
Controlled via `DB_ADAPTER` in `.env.local`:
- `prisma`: PostgreSQL/Supabase (Primary/Production).
- `json`: Local flat-file storage in `crm-app/cache/` (Zero-setup fallback).
Implementation in `crm-app/src/lib/db.js` ensures high availability by falling back to JSON if the database is unreachable.

### 2. AI & Intelligence Layer
- **Google Gemini (gemini-pro):** Powers the `BusinessAnalyst.js` utility for executive reporting and sentiment analysis.
- **Chat Automation (ADR-014):** Hybrid detection for agent assignment using regex for Meta system messages and Gemini for intent/mention detection in conversations.
- **Product Extraction:** Automated discovery of products mentioned in chat history.

### 3. Reporting & Attribution Logic
- **Product-Matched Attribution (ADR-011):** Distinguishes between "Direct Revenue" (Ad target = Purchase) and "Cross-Sell/Halo Revenue". This prevents misattribution errors where unrelated high-value sales were credited to specific lead-magnet ads (e.g., Shabu ad vs. Ramen course sale).

### 4. Scalable Sync Architecture (ADR-015)
- **Reactive (Webhooks):** `/api/webhooks` receives real-time events from Meta and queues them in BullMQ.
- **Consistency (Cron):** `instrumentation.js` runs a full reconciliation hourly (:10) to ensure data integrity.
- **Efficient UI:** High-frequency polling has been replaced by event-driven updates, reducing API overhead and preventing rate limiting.

## 📂 Key Directory Structure

- `crm-app/`: Main Next.js application.
    - `src/lib/`: Core logic (Database, Cache, Chat, Event Handling).
    - `docs/`: Technical documentation following **arc42** and **C4 Model** standards.
        - `adr/`: Architecture Decision Records (e.g., 001-014).
        - `incidents/`: Post-mortem reports for logic and system failures.
    - `automation/`: Playwright scripts for Facebook agent sync.
    - `cache/`: Local data mirror (Customer, Ads, Products).
- `scripts/`: Root-level migration and utility scripts.

## 🛠️ Development Conventions

- **Documentation First:** All major architectural changes must be recorded in `docs/adr/`. Logic errors are tracked in `docs/incidents/`.
- **Standardized IDs:** Customer IDs follow the `TVS-CUS-*` format (ADR-007).
- **Language/Currency:** UI is primarily Thai; currency is THB.
- **Path Aliases:** Use `@/*` for `crm-app/src/*`.

## 📡 External Integrations
- **Meta Graph API (v19.0):** Marketing insights and Messenger sync.
- **Google Gemini:** AI Analysis and automation.
- **SlipOK:** Thai QR code/Bank slip verification.
- **Redis:** Queueing for BullMQ workers.
