---
description: "Update project documentation (ADR, Changelog, Overview), run QA checks, and push to GitHub."
---

# Checkpoint Workflow (Professional Edition) 🛡️🚀

This workflow ensures that the project documentation is up-to-date and that only high-quality, working code is pushed to the repository.

## 1. Analyze Changes
// turbo
1. Run `git status` or review recent conversation history to identify changes.
2. Identify "Architecturally Significant" changes for ADR updates.

## 2. Update Architecture Decision Records (ADR)
1. Check `docs/adr/` for existing ADRs.
2. Create a new ADR (e.g., `docs/adr/00X-title.md`) for major decisions (e.g., Python Worker, Redis).
   - Follow: **Title**, **Context**, **Decision**, **Consequences**.

## 3. Update Changelog
1. Update `CHANGELOG.md` under `[Unreleased]`.
2. Categorize: **Added**, **Changed**, **Fixed**, **Removed**.

## 4. Update System Overview
1. Update `doc/overview.md`.
2. Check Mermaid diagrams (Architecture, Data Flow) for consistency.
3. Update **File Structure** and **Key Integrations** tables.

## 5. Quality Assurance (Pre-Flight Check) 🛡️
// turbo
1. Run `cd crm-app && npm run lint` to catch syntax or style errors.
2. Run `cd crm-app && npm run build` to ensure the application compiles correctly.
3. **If any check fails**: STOP the workflow and fix the errors before proceeding.

## 6. Git Push & Backup 🐙☁️
// turbo
1. Run `git add .` to stage all changes.
2. Run `git commit -m "checkpoint: docs update and QA verified"`
3. Run `git push origin main` (or the active branch) to sync with GitHub.

## 7. Completion
1. Confirm all documents and code are in sync.
2. Notify the user with a summary of the checkpoint.
