# Prize Manager — PRD V2.1 (Context-Locked)
_Last updated: 2026-04-18_

## 1. Purpose

This PRD updates the product plan for **prize-manager.com** using the latest confirmed project context. It is intentionally **context-locked**: where production truth, repo truth, and earlier PRDs disagree, this document follows the safest current understanding.

This version exists to prevent a common product mistake: building the next shiny thing while core truth is still drifting.

---

## 2. Product Summary

**Prize Manager** is a web app for chess tournament organizers to:

1. create a tournament,
2. define prize structures,
3. import players,
4. run allocation with one-player-one-prize logic,
5. review conflicts and edge cases,
6. finalize and publish results,
7. provide public read-only prize results.

The current reliable primary path for prize structure setup is:

1. **Copy from Tournament**
2. **XLSX Template Import**
3. **Manual editing**

**Brochure parsing is assistive only** and must not be treated as the primary reliable input path.

---

## 3. Context Lock: Source of Truth Order

When sources disagree, use this order:

1. **Production behavior**
2. **Production Supabase state**
3. **Current frontend/repo behavior**
4. **This PRD**
5. **Older chats / older PRDs**

This is a practical rule, not philosophy. Production wins.

---

## 4. Product Principles

### 4.1 Safety first
Do not break existing organizer workflows to ship new capability.

### 4.2 Reliable paths beat clever paths
Structured and repeatable inputs are preferred over brittle parsing.

### 4.3 Published data must stay public-safe
Anonymous/public flows must expose only intended published information.

### 4.4 Canonical rules must live in one place
Thresholds, entitlement rules, and publishing rules must not drift across SQL, UI copy, and functions.

### 4.5 Production is read-only during analysis
All risky changes must be planned first, then shipped through minimal diffs, migrations, tests, and rollout checks.

---

## 5. Primary Users

### Organizer
Creates tournaments, configures prizes, imports players, runs allocation, finalizes, publishes.

### Master/Admin
Handles platform oversight, user/admin functions, coupon/revenue/admin operations, and maintenance tools.

### Public Viewer
Can view published results only. No access to draft or non-published data.

---

## 6. Current Confirmed System Shape

### Frontend / hosting
- Lovable-hosted frontend
- React + Vite + TypeScript app
- Production domain: **https://prize-manager.com**

### Backend
- Supabase for database, auth, storage, and edge functions

### Confirmed production edge functions
- `allocateInstitutionPrizes`
- `allocatePrizes`
- `backfillTeamAllocations`
- `finalize`
- `generatePdf`
- `parseBrochurePrizes`
- `parseWorkbook`
- `pmPing`
- `publicTeamPrizes`

### Confirmed production storage buckets
- `brochures`
- `exports`

### Confirmed published/public surface
- `published_tournaments` view is part of the public-results model

---

## 7. Core Product Flows (Current)

### 7.1 Organizer lifecycle
1. Sign in
2. Create/open tournament
3. Complete tournament details
4. Configure prizes
5. Import players
6. Run allocation
7. Review conflicts/unfilled/manual prizes
8. Finalize
9. Publish
10. Share public results

### 7.2 Prize structure setup
Current primary supported path:
- Copy from Tournament
- Download Template / Import from Template (XLSX only)
- Manual edit

### 7.3 Brochure input
- Generate from Brochure remains available
- It is **best-effort**
- It must present itself as assistive
- It must not be sold internally as a reliable primary path

### 7.4 Public result access
Published tournaments can be viewed on public routes with read-only result information.

---

## 8. Explicit Product Decisions Locked in This Version

### 8.1 NO CSV anywhere
Prize-manager must support **Excel uploads only** (`.xls` / `.xlsx`) for structured import flows.

### 8.2 Brochure parsing is not the primary path
Brochure parsing remains available, but only as a best-effort assistive workflow.

### 8.3 The reliable primary prize-ingestion path is:
- Copy from Tournament
- XLSX Template Import
- Manual edits

### 8.4 150-player threshold is the intended product behavior
The app should consistently reflect **150** wherever access gating or entitlement messaging depends on that threshold.

### 8.5 Public pages must only show published data
No accidental draft/private exposure.

---

## 9. What Appears Working

These areas appear materially present and usable:

- tournament setup
- prize setup
- Copy from Tournament
- XLSX template import
- player import
- allocation/review
- finalize
- publish
- public published results
- core edge-function deployment
- organizer/admin/public route structure

This does **not** mean every edge case is bug-free. It means these are the current usable backbone.

---

## 10. Known Problems / Drift Risks

These are the most important current issues.

### 10.1 Onboarding / pending-approval mismatch
There is a likely mismatch between intended onboarding behavior and actual code/runtime behavior. The older `pending-approval` organizer gate appears to still exist, while later planning discussed auto-approve behavior.

**Why it matters:** fresh signups may not follow the intended product path.

### 10.2 Storage contract drift
Current production screenshots confirm `brochures` and `exports`. Repo/history references suggest an `imports` bucket may exist or may have existed in code paths.

**Why it matters:** import or parsing flows may depend on a production storage contract that is not actually current.

### 10.3 Threshold drift
The intended threshold is 150, but there is risk of older definitions still existing in migrations or duplicated logic.

**Why it matters:** entitlement and messaging can silently diverge.

### 10.4 Brochure upload RLS issue
A production brochure upload RLS failure was previously reported for at least one tournament.

**Why it matters:** this hits a visible setup action.

### 10.5 Brochure parser correctness
Brochure parsing remains inconsistent across real-world PDFs.

**Why it matters:** organizers may overtrust results from an assistive feature.

### 10.6 Import header heuristic bug
A known Swiss-Manager-style header mapping issue can still pick the wrong “Name” field.

**Why it matters:** player import quality affects everything downstream.

### 10.7 Admin/legacy duplication risk
Some admin and coupon-related surfaces appear duplicated or legacy/dead.

**Why it matters:** future changes may hit the wrong surface or create drift.

---

## 11. Product Scope: What Is In Scope Now

### Immediate in-scope work
1. lock production truth
2. remove dangerous drift
3. protect the current reliable organizer path
4. only then continue roadmap work

### Specifically in scope now
- onboarding truth verification and cleanup
- storage contract verification and cleanup
- threshold canonicalization
- brochure upload permission/path fix
- reliable-path hardening
- test coverage for core flow
- low-risk cleanup where clearly safe

---

## 12. Product Scope: What Is Not the First Priority

These may still matter, but they are **not** first while truth is drifting:

- major brochure parser expansion
- OCR/vision-first ingestion as primary workflow
- large admin redesign
- broad UI cleanup without product risk payoff
- new cross-product integrations before core stabilization

---

## 13. Roadmap (Reordered Safely)

## Phase 0 — Truth Lock
Goal: stop guessing.

Deliverables:
- confirm live onboarding behavior
- confirm storage bucket contract
- confirm 150-threshold source of truth
- confirm current public/private data boundaries
- confirm function deployment parity for core flows

Success criteria:
- no major “unknowns” left in auth, storage, entitlement, publish/public access

## Phase 1 — Drift Repair
Goal: remove contradictions.

Deliverables:
- align onboarding behavior and copy
- canonicalize 150 threshold
- resolve storage contract drift
- fix brochure upload RLS/path issue

Success criteria:
- a fresh organizer can enter the product correctly
- threshold logic is consistent across DB/UI/functions
- upload/import storage expectations are production-true

## Phase 2 — Reliable Path Hardening
Goal: protect what organizers actually need.

Deliverables:
- test and stabilize Copy from Tournament
- test and stabilize prize XLSX import
- test and stabilize player import
- test and stabilize allocation/finalize/publish/public path

Success criteria:
- core organizer path survives regression testing
- brochure parsing remains optional and clearly marked as best-effort

## Phase 3 — Billing Modernization
Goal: evolve from manual UPI-style upgrade flow toward proper billing.

Deliverables:
- pricing/billing/account-billing surfaces
- entitlement model
- payment provider integration
- webhook-based state updates
- migration path from current manual payment flow

Success criteria:
- billing is feature-flagged, reversible, and does not break current users

## Phase 4 — Profiles / Ecosystem
Goal: expand value after the core is stable.

Candidate deliverables:
- player profiles
- profile-linked history
- certificate-hub integration
- broader ecosystem connections

---

## 14. Functional Requirements (Current)

### FR1 — Tournament setup
Organizer can create and edit tournament details.

### FR2 — Prize configuration
Organizer can configure prize categories and prize rows, including reusable structures from prior tournaments.

### FR3 — Structured template import
Organizer can download and import an Excel-based prize template.
- no CSV support
- add-only behavior unless deliberately redesigned later

### FR4 — Brochure assistive import
Organizer can attempt brochure-based prize draft generation.
- must be clearly labeled as best-effort
- unsupported/failed states must steer users to reliable paths

### FR5 — Player import
Organizer can import players from Excel/Swiss-Manager-style sheets with mapping and validation support.

### FR6 — Allocation
System can run prize allocation according to rules and one-player-one-prize logic.

### FR7 — Conflict handling
Organizer can review and resolve conflicts, inspect allocation output, and handle manual prize cases where needed.

### FR8 — Finalize and publish
Organizer can finalize and publish tournament prize results.

### FR9 — Public results
Public users can access published prize results without login.

### FR10 — Admin tools
Master/admin can access protected admin functions without exposing those actions to standard organizers/public users.

---

## 15. Non-Functional Requirements

### Reliability
Primary organizer path must be stable for real tournaments.

### Security
RLS and server-side checks must remain the real security layer.

### Backward safety
Changes must preserve working production flows.

### Clarity
UI language must not oversell unreliable features.

### Auditability
Important behavior changes should be discoverable through code, migrations, and tests.

---

## 16. Acceptance Criteria for Current Stabilization Program

The stabilization program is complete only when all of the following are true:

1. Fresh organizer onboarding behaves exactly as intended
2. Threshold behavior is consistently 150 in DB, UI, and functions
3. Production storage contract is verified and reflected in code/docs
4. Brochure upload succeeds for valid organizer-owned tournaments
5. Reliable primary path works end-to-end:
   - Copy from Tournament
   - Prize XLSX template import
   - Player import
   - Allocate
   - Finalize
   - Publish
   - Public results
6. Public routes do not expose unpublished/private data
7. Regression tests exist for the core path
8. Brochure parsing remains clearly assistive, not primary

---

## 17. Rollout Rules

- production should be treated as read-only during investigation
- risky work should be shipped behind minimal diffs and feature flags where possible
- database changes must be forward-safe migrations
- every auth/storage/publish change requires manual smoke testing in preview before production

---

## 18. Open Questions Still Allowed

These are valid open questions after this PRD:
- keep pending approval, or move to true organizer auto-approval?
- how should proper billing coexist with the current manual upgrade flow during migration?
- what is the cleanest long-term OCR fallback architecture for brochure parsing?
- how far should player profiles go before certificate integration begins?

These are **not** allowed to remain open:
- what the primary prize-setup path is
- whether CSV is supported
- whether brochure parsing is primary
- whether public routes must be published-only
- whether 150 is the intended threshold

---

## 19. Final Direction

This product should now be built in this order:

1. **lock truth**
2. **repair drift**
3. **protect the reliable organizer path**
4. **then resume roadmap expansion**

That is the safest path to keep prize-manager.com useful while it evolves.
