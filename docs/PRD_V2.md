# Prize-Manager.com — PRD V2
Last updated: 2026-02-13 (Asia/Kolkata)

## Table of Contents
- [Current System Map](#current-system-map)
- [1) Product Summary](#1-product-summary)
- [2) Target Users](#2-target-users)
- [3) Current MVP Flow (Shipped)](#3-current-mvp-flow-shipped)
- [4) Goals & Success Metrics](#4-goals--success-metrics)
- [5) Problems / Opportunities (Next Phases)](#5-problems--opportunities-next-phases)
- [6) Scope: Phase 1 — Payments (Immediate next build after context lock)](#6-scope-phase-1--payments-immediate-next-build-after-context-lock)
- [7) Scope: Phase 2 — Mar-Tech Admin](#7-scope-phase-2--mar-tech-admin)
- [8) Scope: Phase 3 — Public “/” + Performance](#8-scope-phase-3--public--performance)
- [9) Scope: Phase 4 — Player Profiles](#9-scope-phase-4--player-profiles)
- [10) Scope: Phase 5 — Certificate Hub Integration](#10-scope-phase-5--certificate-hub-integration)
- [11) Security & Compliance (Hard Requirements)](#11-security--compliance-hard-requirements)
- [12) Open Decisions (Need answers)](#12-open-decisions-need-answers)
- [13) Release Strategy](#13-release-strategy)
- [14) Acceptance Tests (Must pass)](#14-acceptance-tests-must-pass)
- [Glossary](#glossary)

## Current System Map
- **Frontend (Vite + React + TypeScript):** app entry and pages/components are under `src/` (for example `src/main.tsx`, `src/App.tsx`, `src/pages/*`, `src/components/*`).
- **Backend data + auth + policies:** Supabase migrations and DB policy changes are under `supabase/migrations/`.
- **Server-side functions (Edge Functions):** API-style workloads (allocation, finalize, parse workbook, PDF, public team prizes) are implemented in `supabase/functions/*`.
- **Quality gates and tests:** unit tests in `src/**/*.test.ts` and `src/__tests__/`, e2e coverage in `e2e/*.spec.ts`, and helper QA scripts under `scripts/`.
- **Product + technical docs:** existing documentation lives in `docs/`.

## 1) Product Summary
Prize-Manager helps chess organizers create prize structures, import participant lists (Swiss-Manager + template XLS/XLSX), allocate prizes with deterministic accuracy, and publish results publicly for players and for arbiter/organizer export/print needs.

## 2) Target Users
1) Tournament organizers (primary)
2) Arbiters/technical officials (secondary)
3) Players & parents (public consumers)
4) Master/Admin (approvals + admin ops)
5) Internal ops (future: mar-tech / product analytics)

## 3) Current MVP Flow (Shipped)
Setup (details + prizes) → Import (XLS/XLSX only) → Allocate/Review → Finalize/Print → Publish

Non-negotiable constraints:
- NO CSV anywhere (import/export)
- Allocation engine logic is protected and must not change without explicit approval
- Public access must remain read-only and only to published outputs

## 4) Goals & Success Metrics
### Primary success
- Organizers publish tournaments and share public links
- Players can reliably view results publicly (no login)

### Metrics (phaseable)
- # tournaments created / published
- Public views per tournament
- Allocation success rate (no errors/timeouts)
- Time-to-publish from import start
- Payment conversion (once billing ships)

## 5) Problems / Opportunities (Next Phases)
A) Payment & Billing
- Add pricing + payment page
- Gate advanced features (e.g., number of tournaments, exports, certificate generation)
- Provide invoice/receipt and subscription management

B) Mar-Tech Admin Section (requested)
- Admin panel section that shows product usage + funnels + operational health:
  - new users, active organizers, tournaments created/published, public views, allocations run, import volume, errors
  - edge function health/error rates
  - cohorting (weekly/monthly)

C) Public Player Experience
- Make results easily accessible “at / without login”
- Improve performance under high public traffic
- Player search and player profile pages (by FIDE ID) with tournament history

D) Certificate Generation (via certificate-hub.com)
- After Finalize, generate certificates for participants using certificate-hub.com API
- Provide download links + status tracking + retries

## 6) Scope: Phase 1 — Payments (Immediate next build after context lock)
### User stories
- As an organizer, I can view pricing and pay to unlock premium features.
- As an organizer, I can see my plan, billing status, and invoices/receipts.
- As the system, I enforce entitlements (limits/features) without breaking existing flows.

### MVP entitlements (initial proposal)
- Free: limited tournaments/month + limited exports
- Pro: higher limits + certificate generation + advanced exports
- Org: unlimited + team features + priority support

(Exact tiers/limits = OPEN DECISION)

### Requirements
- Payment page routes: /pricing, /billing, /account/billing
- Checkout flow via provider (OPEN DECISION: Razorpay vs Stripe)
- Webhook handling for payment events
- Subscription state stored in DB, read by app on auth/session
- Feature flags for rollout
- No impact on allocation algorithm

## 7) Scope: Phase 2 — Mar-Tech Admin
- Admin-only dashboard: /admin/martech
- Event logging (min viable): page views, publish actions, imports, allocations, errors
- Aggregations for performance (daily stats tables, not raw events forever)
- Export/report for ops

## 8) Scope: Phase 3 — Public “/” + Performance
- Decide what “/” should be for logged-out users:
  Option A: “/” becomes public search (current /public) and logged-in redirects to /dashboard
  Option B: keep /public but add a hero CTA and player search at /

(OPEN DECISION; must preserve organizer workflow)

Performance requirements:
- Public pages must handle spikes (pagination, caching, proper indexes, minimized joins)
- Avoid leaking data (published-only reads + strict RLS)

## 9) Scope: Phase 4 — Player Profiles
- Player entity keyed by FIDE ID
- Public profile: /player/:fideId
- Shows tournament history + prizes won
- Privacy controls: default public if tournament published, but allow organizer to hide specific fields (OPEN DECISION)

## 10) Scope: Phase 5 — Certificate Hub Integration
- API integration contract required (inputs, templates, auth, rate limits)
- Certificate jobs created post-finalize
- UI status: pending/processing/completed/failed
- Storage of generated PDFs and secure public access for participants

## 11) Security & Compliance (Hard Requirements)
- RLS is the source of truth for access control
- Edge Functions:
  - verify_jwt=true for private functions
  - verify_jwt=false only for webhooks or explicitly public endpoints
- Never expose service role keys client-side
- Public endpoints must enforce published-only constraints server-side too

## 12) Open Decisions (Need answers)
1) Payment provider: Razorpay vs Stripe (and business entity readiness)
2) Pricing tiers + limits
3) What exactly should “/” be for players?
4) Player profile privacy rules
5) Certificate-hub.com API contract + template requirements
6) Data retention policy for analytics/events

## 13) Release Strategy
- Feature flags for billing and mar-tech
- Ship behind admin/allowlist first
- Smoke tests required before enabling flags

## 14) Acceptance Tests (Must pass)
- Existing flow still works: Setup→Import→Allocate→Finalize→Publish
- Public pages load for published tournaments without login
- Unauthorized user cannot call private edge functions or read private tournaments
- Billing (when enabled) gates features but does not block existing paid users unintentionally

## Glossary
- **Allocator / Allocation engine:** The deterministic prize allocation logic used to assign winners based on configured rules.
- **Arbiter:** Tournament technical official supporting rules, standings, and result validation.
- **Edge Function:** Server-side function deployed in Supabase for operations like import parsing, allocation, finalize, and public data reads.
- **Entitlements:** Plan-driven limits and feature access controls (for example tournaments/month, exports, certificates).
- **FIDE ID:** Unique identifier used for chess players in rating and profile contexts.
- **Mar-Tech:** Internal admin analytics/operations tooling for product usage, funnels, and system health.
- **Published tournament:** Tournament state that is safe for public read-only access.
- **RLS (Row Level Security):** Database-enforced access control policy model in Supabase/Postgres.
- **Swiss-Manager:** Tournament-management source format used for XLS/XLSX participant imports.
- **Webhook:** Provider callback endpoint used to deliver external event updates (for example payment status changes).
