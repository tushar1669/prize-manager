# PRODUCT_FLOW_MAP — Prize Manager

**Status:** Canonical flow-map candidate, source-reconciled and runtime-evidence annotated  
**Source baseline:** `251101b8b2aed80318578913f6c76646f5d0b731` (`main`, verified 20 Sep 2026)  
**Prior source-audit baseline:** `c31938cbb6465281177abc747f2de35f965527ed`  
**Delta after prior audit:** three commits, changing only `.lovable/plan.md`; no application-code delta  
**Runtime evidence date:** 20 Sep 2026  
**Scope:** public, authenticated organizer, master/admin, technical/system actors, route aliases, handoffs, recovery paths, and candidate dead ends  
**No-change boundary:** this document does not change application code, database schema/data, auth, payment state, publication state, deployments, or production records.

---

## 1. How to read this document

This file is the operational route/action authority for role-based product flow. It answers:

> For this actor in this state, what can they see or do, where does it go, what changes, and what does another actor see next?

It does **not** replace the PRD, architecture documents, security rules, runtime register, or detailed feature specifications.

### Evidence labels

| Label | Meaning |
|---|---|
| **SOURCE VERIFIED** | Re-checked against current GitHub `main` at the source baseline above. |
| **RUNTIME ROUTE OBSERVED** | Route appeared in Lovable project analytics for the deployed/published project. This proves route use, not button-level UI correctness. |
| **RUNTIME DB OBSERVED** | Read-only production Supabase evidence was queried directly. |
| **RUNTIME FUNCTION OBSERVED** | Deployed Edge Function inventory was read directly. |
| **NOT UI VERIFIED** | Source defines the surface/control, but this cycle did not obtain rendered-browser evidence for that exact UI state. |
| **VISIBLE — NOT EXECUTED** | Source defines a consequential control; this audit intentionally did not trigger it. |
| **CANDIDATE** | Needs additional traffic/runtime or product-decision evidence before being called dead, defective, or removable. |
| **UNKNOWN** | Evidence was unavailable without creating/changing production state or using unavailable credentials/session state. |

### Runtime evidence available this cycle

- Lovable project is published and currently points at source commit `251101b8...`. **RUNTIME ROUTE OBSERVED**
- 20 Sep 2026 analytics include one organizer-path traversal on the same tournament through:
  `/setup` → `/order-review` → `/import` → `/review` → `/finalize` → `/publish`, plus `/settings`. **RUNTIME ROUTE OBSERVED**
- Historical runtime analytics show `/admin`, `/admin/users`, `/admin/payments`, and `/admin/coupons` were reached on 28 Aug 2026. **RUNTIME ROUTE OBSERVED**
- Recent runtime analytics show `/public`, `/auth`, `/dashboard`, `/pricing`, `/how-it-works`, `/terms`, and public tournament routes in use. **RUNTIME ROUTE OBSERVED**
- Production Supabase project reports `ACTIVE_HEALTHY`. **RUNTIME DB OBSERVED**
- Production roles: 1 master, 40 organizers; all 41 current role rows are `is_verified=true`. No current live unverified organizer state exists to inspect without creating/modifying data. **RUNTIME DB OBSERVED**
- Production tournament statuses: 82 draft, 17 finalized, 37 published; `published_tournaments` returns 37 rows. **RUNTIME DB OBSERVED**
- `brochure_import` and `payment_auto_approve` platform flags are enabled. **RUNTIME DB OBSERVED**
- Current payment rows observed: 3 approved, 9 rejected, and no pending row in the grouped result. Therefore the pending-payment review state was not available for a safe current-state runtime walkthrough. **RUNTIME DB OBSERVED**
- Extraction states include approved, auto-ok, needs-review, rejected, and error records, so the extraction workflow has real production history. **RUNTIME DB OBSERVED**
- Deployed functions include `allocatePrizes`, `finalize`, `parseWorkbook`, `allocateInstitutionPrizes`, `publicTeamPrizes`, `backfillTeamAllocations`, `extract`, `commit-extraction`, and payment-notification functions. **RUNTIME FUNCTION OBSERVED**

### Runtime evidence not available this cycle

The connected tools did not expose an authenticated interactive browser session or a safe rendered-page inspector that could click through organizer/master controls. Lovable's prior response was only a plan and changed only `.lovable/plan.md`; it is **not** UI runtime proof. Therefore exact button rendering, disabled states, modal appearance, mobile clipping, focus behavior, and visual error states remain **NOT UI VERIFIED** unless separately stated.

---

## 2. Actor model

| Actor/state | Product role | Current evidence |
|---|---|---|
| Public / unauthenticated visitor | Browse published tournaments, results, marketing/legal pages; enter auth | **SOURCE VERIFIED + RUNTIME ROUTE OBSERVED** |
| Authenticated organizer | Create/manage own tournaments, configure prizes, import players, allocate/finalize, pay/upgrade, publish, manage account/referrals | **SOURCE VERIFIED + RUNTIME ROUTE OBSERVED** |
| Legacy unverified organizer | Source allows normal protected routes but Dashboard displays an attention warning | **SOURCE VERIFIED**; **no current live role row exists**, so runtime UI is unavailable without creating/changing data |
| Master/admin | Uses ordinary organizer routes plus `/admin/*` operational surfaces | **SOURCE VERIFIED + historical RUNTIME ROUTE OBSERVED** |
| Technical `user` role | Type exists in client role union; no distinct supported journey found | **SOURCE VERIFIED**; production role counts show no current `user` rows |
| Published-results viewer | Reads published tournament details/results without organizer access | **SOURCE VERIFIED + RUNTIME ROUTE OBSERVED** |
| System/automation | Auth callbacks, referral hooks, extraction, entitlement/payment automation, publication pinning, notifications | **SOURCE VERIFIED + RUNTIME FUNCTION OBSERVED** |

---

## 3. Route and access matrix

### 3.1 Public and authentication

| Route | Component/surface | Access/gate | Canonical state | Primary entry/exit | Evidence |
|---|---|---|---|---|---|
| `/` | `RootRedirect` | Public | Redirect shell | Authenticated → `/dashboard`; otherwise → `/public` | **SOURCE VERIFIED + RUNTIME ROUTE OBSERVED** |
| `/public` | `PublicHome` | Public | Canonical | Public directory → `/p/:slug`, `/how-it-works` | **SOURCE VERIFIED + RUNTIME ROUTE OBSERVED** |
| `/p/:slug` | `PublicTournamentDetails` | Public, published data | Canonical | Public detail, individual winners, external/brochure links | **SOURCE VERIFIED + RUNTIME ROUTE OBSERVED** |
| `/p/:slug/results` | `PublicResults` | Public, published data | Canonical | Public results including team-prize surface | **SOURCE VERIFIED**; route-specific current analytics not captured in this cycle |
| `/p/:slug/details` | redirect | Public | **Legacy alias / orphan candidate** | Redirects to `/p/:slug` | **SOURCE VERIFIED; CANDIDATE** |
| `/t/:id/public` | `LegacyPublicRouteCompat` | Public | Legacy compatibility | Slug present → `/p/:slug`; otherwise fallback `PublicWinnersPage` | **SOURCE VERIFIED; CANDIDATE fallback behavior** |
| `/how-it-works` | public page | Public | Canonical | Links to pricing | **SOURCE VERIFIED + RUNTIME ROUTE OBSERVED** |
| `/pricing` | public page | Public | Canonical | Links refund policy | **SOURCE VERIFIED + RUNTIME ROUTE OBSERVED** |
| `/about` | public page | Public | Canonical | External links | **SOURCE VERIFIED + RUNTIME ROUTE OBSERVED** |
| `/faq` | public page | Public | Canonical | Accordion FAQ | **SOURCE VERIFIED** |
| `/contact` | public page | Public | Canonical | Mailto + message form UI | **SOURCE VERIFIED + RUNTIME ROUTE OBSERVED** |
| `/terms` | Terms | Public | Canonical | Legal content | **SOURCE VERIFIED + RUNTIME ROUTE OBSERVED** |
| `/privacy` | legal placeholder | Public | Canonical placeholder | Contact/legal notice | **SOURCE VERIFIED** |
| `/refund` | legal placeholder | Public | Canonical placeholder | Contact/legal notice | **SOURCE VERIFIED + RUNTIME ROUTE OBSERVED** |
| `/auth` | `Auth` | Public | Canonical | Sign-in/signup/recovery entry → dashboard/callback | **SOURCE VERIFIED + RUNTIME ROUTE OBSERVED** |
| `/auth/callback` | `AuthCallback` | Public auth callback | Canonical | Resolves session/role → dashboard or auth recovery | **SOURCE VERIFIED** |
| `/reset-password` | `ResetPassword` | Public auth recovery | Canonical | Password update → `/auth` | **SOURCE VERIFIED + historical RUNTIME ROUTE OBSERVED** |
| `*` | `NotFound` | Public | Fallback | 404 → root | **SOURCE VERIFIED** |

### 3.2 Organizer/protected

| Route | Surface | Access/gate | Canonical state | Primary transition | Evidence |
|---|---|---|---|---|---|
| `/pending-approval` | protected redirect | Auth required | **Legacy alias** | Always redirects to `/dashboard` | **SOURCE VERIFIED** |
| `/dashboard` | Dashboard | Auth required | Canonical | Create/import/resume/manage tournaments; master sees Admin entry | **SOURCE VERIFIED + RUNTIME ROUTE OBSERVED** |
| `/account` | Account | Auth required | Canonical | Profile, coupons, referral code/rewards | **SOURCE VERIFIED + historical RUNTIME ROUTE OBSERVED** |
| `/import/brochure/:extractionId` | Brochure Review | Auth + `brochure_import` flag | Canonical when enabled | Review → approve/commit → setup; re-extract/discard/retry | **SOURCE VERIFIED + historical RUNTIME ROUTE OBSERVED + flag RUNTIME DB OBSERVED enabled** |
| `/t/:id/setup` | Tournament Setup | Auth; ownership/RLS is backend boundary | Canonical | Details/prizes → settings/order-review/import/review | **SOURCE VERIFIED + RUNTIME ROUTE OBSERVED** |
| `/t/:id/order-review` | Category Order Review | Auth | Canonical | Reorder/delete → import; cancel → setup | **SOURCE VERIFIED + RUNTIME ROUTE OBSERVED** |
| `/t/:id/import` | Player Import | Auth | Canonical | Parse/map/dedup/append-or-replace → review | **SOURCE VERIFIED + RUNTIME ROUTE OBSERVED** |
| `/t/:id/review` | Allocation Review | Auth + entitlement checks for gated commit/finalize paths | Canonical | Preview/commit/resolve → finalize | **SOURCE VERIFIED + RUNTIME ROUTE OBSERVED** |
| `/t/:id/finalize` | Finalize Allocations | Auth | Canonical | Final views/exports/team prizes → publish | **SOURCE VERIFIED + RUNTIME ROUTE OBSERVED** |
| `/t/:id/payment` | Tournament Payment / Pro | Auth + profile/payment gate | Canonical | Coupon or UPI claim → entitlement/return path | **SOURCE VERIFIED** |
| `/t/:id/upgrade` | redirect | Auth | **Legacy alias** | Redirects to `/t/:id/payment`, preserving safe `return_to` and coupon flag | **SOURCE VERIFIED** |
| `/t/:id/final/:view` | Final Prize View | Auth | Canonical | Print/display tabs; back to finalize | **SOURCE VERIFIED** |
| `/t/:id/publish` | Publish Success / Manage Publication | Auth | Canonical | View/open public URL, final views, unpublish/republish, dashboard | **SOURCE VERIFIED + RUNTIME ROUTE OBSERVED** |
| `/t/:id/settings` | Tournament Settings | Auth | Canonical | Allocation-rule configuration → prize structure/order review | **SOURCE VERIFIED + RUNTIME ROUTE OBSERVED** |

### 3.3 Master/admin

All `/admin/*` routes are wrapped by `ProtectedRoute requireMaster`. Client role checks are UX only; server/RLS/RPC authorization remains the security boundary.

| Route | Surface | Meaningful capability | Evidence |
|---|---|---|---|
| `/master-dashboard` | redirect | Legacy alias → `/admin/users` | **SOURCE VERIFIED** |
| `/admin` | Admin Home | Overview, publish-state drift, health/probe links | **SOURCE VERIFIED + historical RUNTIME ROUTE OBSERVED** |
| `/admin/users` | Master Dashboard | Organizer access exceptions; Verify / Disable Access | **SOURCE VERIFIED + historical RUNTIME ROUTE OBSERVED** |
| `/admin/martech` | Martech Dashboard | Growth/activation/revenue-proxy analytics and filters | **SOURCE VERIFIED** |
| `/admin/tournaments` | Admin Tournaments | Search, public/setup/allocation links, hide/archive/trash/restore/hard-delete | **SOURCE VERIFIED** |
| `/admin/payments` | Admin Payments | Pending/history payment review | **SOURCE VERIFIED + historical RUNTIME ROUTE OBSERVED** |
| `/admin/coupons` | Coupons | Codes + analytics; create/edit/toggle coupon state | **SOURCE VERIFIED + historical RUNTIME ROUTE OBSERVED** |
| `/admin/audit` | Audit Logs | Filter/paginate audit events | **SOURCE VERIFIED** |
| `/admin/team-snapshots` | Team Snapshots | Detect and backfill missing team allocation snapshots | **SOURCE VERIFIED** |

---

## 4. Screen/action contracts

The tables below inventory meaningful controls. Repetitive row-level edit/remove controls are grouped where they share the same contract.

### 4.1 Public home and public results

| Surface | Visible control/action | Condition | Destination/effect | Failure/recovery | Evidence |
|---|---|---|---|---|---|
| `/public` | **View Details** | Published tournament row/card | `/p/:slug` | Query error exposes Retry | **SOURCE VERIFIED; NOT UI VERIFIED** |
| `/public` | **See how it works and what it costs** | Always on page | `/how-it-works` | Normal navigation | **SOURCE VERIFIED** |
| `/public` | **Retry** | Public list query error | Refetches directory | Keeps user on page | **SOURCE VERIFIED** |
| Public header | **Organizer / Organizer sign-in** | Header/mobile nav | `/auth` | Normal auth recovery | **SOURCE VERIFIED** |
| Public header/footer | public navigation/legal links | Public | Public GTM/legal pages | Normal navigation | **SOURCE VERIFIED** |
| `/p/:slug` | **Chess Results / External Results / External Final Results** | URL present in publication/tournament data | External result target | External-link failure is browser-level | **SOURCE VERIFIED** |
| `/p/:slug/results` | **View Details** | Results loaded | Back to `/p/:slug` | RPC error/empty results state in page | **SOURCE VERIFIED** |
| Legacy public fallback | **Category Cards / Table View / Poster Grid / Arbiter Sheet** | Fallback `PublicWinnersPage` rendered | Changes public result presentation only | No source mutation | **SOURCE VERIFIED** |

Public data is intended to come from publication-backed read paths; source does not make public pages proof of deployed authorization by itself. Production has 37 rows in `published_tournaments`. **RUNTIME DB OBSERVED**

### 4.2 Authentication

| Surface | Control | Effect | Recovery | Evidence |
|---|---|---|---|---|
| `/auth` | **Sign In** | Supabase auth; success navigates toward dashboard | Inline auth errors / cooldown | **SOURCE VERIFIED** |
| `/auth` | **Create Account** | Signup with auth metadata/referral context | Email-confirmation path | **SOURCE VERIFIED** |
| `/auth` | **Resend confirmation email** | Resends signup confirmation | Cooldown prevents repeated sends | **SOURCE VERIFIED** |
| `/auth` | **Forgot password?** | Starts password recovery | Cooldown/error state | **SOURCE VERIFIED** |
| `/auth/callback` | **Resend Confirmation Email** | Recovery for incomplete verification | Cooldown/error state | **SOURCE VERIFIED** |
| `/auth/callback` | **Go to Sign In** | `/auth` | — | **SOURCE VERIFIED** |
| `/auth/callback` | **Back to Signup** | `/auth?mode=signup` | — | **SOURCE VERIFIED** |
| `/reset-password` | password update + **Back to sign in** | Updates auth password; returns to `/auth` | Error shown in page | **SOURCE VERIFIED** |

Current production has 41 role rows and all are verified. Therefore the historical `is_verified=false` waiting-room journey cannot be runtime-validated without creating/changing data. **RUNTIME DB OBSERVED**

### 4.3 Dashboard

| Control | Condition | Transition/effect | Backend effect | Recovery | Evidence |
|---|---|---|---|---|---|
| **Admin** | Master role | `/admin` | None | Route guard redirects non-master | **SOURCE VERIFIED** |
| **Import from brochure** | brochure rollout enabled | Opens upload dialog | Later upload creates extraction document and invokes `extract` | File validation / manual-entry fallback | **SOURCE VERIFIED + flag RUNTIME DB OBSERVED enabled** |
| Create tournament | Organizer/master | Creates draft then `/t/:id/setup?tab=details` | Tournament insert/mutation | Mutation error toast/state | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| **Continue Setup →** | Incomplete draft | Setup details | None | — | **SOURCE VERIFIED** |
| **Resume** | Existing tournament | Route chosen from tournament status | None | — | **SOURCE VERIFIED** |
| **View Public** | Publicly available tournament | Legacy public route | None | Compatibility fallback | **SOURCE VERIFIED** |
| Delete/archive draft action | Eligible draft | Removes/hides draft via `archive_own_draft_tournament` | Mutates tournament state | Confirmation dialog + cancel | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| Payment alerts | Query finds entitlement/payment issue | Links `/t/:id/payment` | None until payment action | Alert omitted on query failure by design | **SOURCE VERIFIED** |
| Legacy organizer warning | organizer + `!is_verified` | Warns but allows dashboard use | None | No current live state to inspect | **SOURCE VERIFIED + runtime state unavailable** |

### 4.4 Brochure upload and review

| Step/control | Condition | Transition/effect | Backend | Recovery | Evidence |
|---|---|---|---|---|---|
| **Choose file** | Import dialog open | Upload begins | Creates `extraction_documents`, invokes `extract` | Invalid file/error stage | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| Upload success | Extraction created | `/import/brochure/:extractionId` | Extraction pipeline runs | Review state | **SOURCE VERIFIED** |
| **Try another file** | Upload/extraction error | Reset dialog | No production commit | Safe retry | **SOURCE VERIFIED** |
| **Continue with manual entry** | Import error/choice | Close dialog, manual setup route remains available | None | — | **SOURCE VERIFIED** |
| Review fields | Extraction available | Editable draft only | No tournament write until approval | Flags/low-confidence review | **SOURCE VERIFIED** |
| **Approve** | Review accepted | Commit then `/t/:id/setup?tab=details` | invokes `commit-extraction` | Error leaves review available | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| **Re-extract** | Retry allowed | New/retried extraction route | invokes `extract` | New extraction ID / error state | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| **Discard** | Review state | Discards extraction | Extraction state mutation | Dashboard/manual recovery | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| **Try again / Set up manually / Go to Dashboard** | Error/fallback states | Dashboard/manual flow | None | Explicit recovery | **SOURCE VERIFIED** |

Production has real extraction history in approved, auto-ok, needs-review, rejected, and error states. **RUNTIME DB OBSERVED**

### 4.5 Tournament setup — details and prize structure

| Control/group | Effect | Backend/state | Recovery | Evidence |
|---|---|---|---|---|
| **Details / Prize Structure** tabs | Switches setup mode | Local/navigation state | Dirty-state guard where applicable | **SOURCE VERIFIED** |
| **Restore draft / Discard** | Restores or discards local persisted draft state | Local draft | Explicit user choice | **SOURCE VERIFIED** |
| **Copy from Tournament** | Opens selection/copy workflow | Reads other owned/source configuration; selected copy writes current tournament config | Cancel available | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| **Add Category** | Adds category configuration | Category write when saved | Deletion requires confirm | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| Category **Edit Rules** | Opens criteria editor | Category/prize rule changes | Cancel/revert via draft controls | **SOURCE VERIFIED** |
| Category duplicate/delete | Duplicates/removes category | Writes categories/prizes | Delete confirmation with typed confirmation in parent flow | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| Prize-row add/duplicate/remove | Edits prize list | Prize writes on save | Unsaved dirty state | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| **Save All Prize Sections** | Dirty prize sections exist | Persists prize config | DB error keeps dirty state | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| **Download Template** | Always available | Downloads prize template | No mutation | **SOURCE VERIFIED** |
| **Import from Template** | User chooses file | Adds/imports prize configuration | Validation/error dialog | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| **Template Guide / Legacy Template (advanced)** | Help/import compatibility | No direct production state until import | — | **SOURCE VERIFIED** |
| **Edit Rules** | Setup | `/t/:id/settings` | None | **SOURCE VERIFIED** |
| **Review Category Order** | Categories available | `/t/:id/order-review` | None | **SOURCE VERIFIED** |
| Next/continue | Depends on player count | players > 0 → review; otherwise → import | None | **SOURCE VERIFIED** |
| Team **Add Team Prize Group / Edit Rules / Add Prize / duplicate/delete** | Team prize feature | Writes institution prize group/prize tables | Cancel/delete confirmation | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |

### 4.6 Category order review

| Control | Effect | Backend | Recovery | Evidence |
|---|---|---|---|---|
| Reorder categories | Changes display/evaluation order | Category order writes | Draft/discard behavior | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| Delete category | Deletes selected category/prizes | Category/prize writes | Confirmation dialog | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| **Discard** | Reverts local draft/order changes | Local state | — | **SOURCE VERIFIED** |
| **Cancel** | `/t/:id/setup` | None | — | **SOURCE VERIFIED** |
| Continue | `/t/:id/import` | None | — | **SOURCE VERIFIED + RUNTIME ROUTE OBSERVED** |

### 4.7 Player import

| Control/action | Effect | Backend/state | Recovery | Evidence |
|---|---|---|---|---|
| Upload Swiss-Manager XLS/XLSX | Parse/map candidate rows | Parsing/import pipeline | Mapping/validation errors | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| **Fix mapping** | Opens column mapper | Local mapping state | Return to import | **SOURCE VERIFIED** |
| **Set Full Name = Name** | Mapping convenience | Local mapping | — | **SOURCE VERIFIED** |
| **Accept all first occurrence / Prefer richest row** | Dedup policy | Local candidate resolution | Manual conflict resolution | **SOURCE VERIFIED** |
| append/replace import | Saves mapped players | `import_replace_players` RPC with import mode; writes import logs | Error rows returned, import remains reviewable | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| **Reset Import** | Clears current import session | Local state | Re-upload | **SOURCE VERIFIED** |
| **Download Excel Template** | Downloads template | No mutation | — | **SOURCE VERIFIED** |
| **Download Conflicts Excel / Download Cleaned Excel / Export Players** | Diagnostic/export | Client-generated files | Export error toast | **SOURCE VERIFIED** |
| **Clear all players** | Destructive | Deletes/clears player set | Browser confirmation; intentionally not executed | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| **Back** | Setup/prize structure | None | — | **SOURCE VERIFIED** |
| Continue | Allocation review | None after import success | `/t/:id/review` | **SOURCE VERIFIED + RUNTIME ROUTE OBSERVED** |

Gender-summary and missing-gender warnings are rendered by dedicated import components when data/categories make them relevant. Exact visual behavior remains **NOT UI VERIFIED**.

### 4.8 Allocation review

| Control/action | Condition | Backend effect | Transition/recovery | Evidence |
|---|---|---|---|---|
| **Preview Allocation** | Tournament inputs available | invokes `allocatePrizes` in preview mode | Results/conflicts remain reviewable | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| **Commit Allocation** | Gating conditions satisfied | invokes `allocatePrizes` commit path | Allocation state persisted | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| **Upgrade to Pro / Apply Coupon** | Entitlement blocks gated action | Payment route with return path | Returns after entitlement | **SOURCE VERIFIED** |
| **Resolve All / Accept / Override / Apply Override** | Conflicts present | Persists conflict decisions/finalization inputs | Validation errors remain on review | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| Team **Resolve Tie / Edit** | Team tie state present | Tie-resolution state | Team result recompute/display | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| **Back** | Always | `/t/:id/import` | None | **SOURCE VERIFIED** |
| Finalize/continue | Conflicts resolved/gates pass | invokes `finalize` | `/t/:id/finalize` | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |

The team preview hook invokes `allocateInstitutionPrizes` and can also read finalized `team_allocations` / notes. **SOURCE VERIFIED + function RUNTIME FUNCTION OBSERVED**

### 4.9 Finalize and final views

| Control/action | Effect | Backend/state | Recovery | Evidence |
|---|---|---|---|---|
| **Export XLSX** | Exports final allocation | No mutation | Export error handling | **SOURCE VERIFIED** |
| **Print** | Browser/print output | No mutation | Browser print recovery | **SOURCE VERIFIED** |
| **Category Cards / Poster Grid / Arbiter Sheet / Team Prizes** | Changes presentation | No mutation | — | **SOURCE VERIFIED** |
| **Upgrade to Pro / Apply Coupon** | Entitlement gate | Payment route | Return to finalize | **SOURCE VERIFIED** |
| **Back to Review** | Returns review | None | — | **SOURCE VERIFIED** |
| Publish action | Eligible finalized tournament | invokes `finalize` where required + `publish_tournament` RPC; writes publication state/version pin | Publish error stays on finalize | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| final view tabs | `/t/:id/final/:view` | Authenticated printable views | No mutation | **SOURCE VERIFIED** |

### 4.10 Payment / Pro

| Control/action | Condition | Backend effect | Cross-role result | Evidence |
|---|---|---|---|---|
| **Try again** | Price/gate query failed | Refetches price/payment gate | None | **SOURCE VERIFIED** |
| **Go to your account** | Profile incomplete/gate | `/account` | Organizer completes profile | **SOURCE VERIFIED** |
| Coupon code + apply | Code supplied | `redeem_coupon_for_tournament` | May create entitlement and referral rewards | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| UPI claim submit | Valid claim fields | `submit_tournament_payment_claim`; payment screenshot extraction may invoke `extract` | Pending/auto-decision/master review path | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| **Use this UTR** | Duplicate/confirmation path | Confirms selected UTR for submit | Payment claim write | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| **Return / Continue** | Gate/payment state | Safe `return_to` destination | Organizer resumes workflow | **SOURCE VERIFIED** |

Current production payment grouping contained approved and rejected rows but no pending row in this cycle; no safe live pending-review walkthrough was possible. **RUNTIME DB OBSERVED**

### 4.11 Publication management

| Control/action | Condition | Backend effect | Public consequence | Evidence |
|---|---|---|---|---|
| **View Public Page** | Publication exists | None | Opens canonical public route | **SOURCE VERIFIED** |
| **Open in New Tab** | Public URL resolved | None | Opens public page | **SOURCE VERIFIED** |
| **View Final Prizes / Print Prize List** | Organizer | None | Authenticated final views | **SOURCE VERIFIED** |
| Unpublish action | Published | `unpublish_tournament` RPC | Removes/restores public visibility depending later republish | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| **Edit & Publish Again / Publish Again** | Publication state permits | Returns/edit/republish path | Public data updated on successful publish | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| **Back to Dashboard** | Always | Dashboard | None | **SOURCE VERIFIED** |

### 4.12 Settings

| Control/action | Effect | Backend | Recovery | Evidence |
|---|---|---|---|---|
| Allocation-rule form fields/switches/selects | Changes rule configuration | `rule_config` writes | Form validation/dirty state | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| TGM/TMG/GTM/GMT/MTG/MGT order choices | Prize artifact precedence/order setting | `rule_config` | Validation | **SOURCE VERIFIED** |
| **Open Prize Structure** | Setup prizes tab | None | — | **SOURCE VERIFIED** |
| **Edit Category Order** | Category-order route | None | — | **SOURCE VERIFIED** |
| **Cancel** | history back or setup prizes fallback | None | — | **SOURCE VERIFIED** |

### 4.13 Account / profile / referrals

| Control/action | Effect | Backend/state | Recovery | Evidence |
|---|---|---|---|---|
| Profile save | Saves organizer profile | Profile update RPC/hook path; complete save may auto-issue profile reward | Save/error toast | **SOURCE VERIFIED** |
| **Claim Free Tournament / Retrieve claimed coupon** | Compatibility/recovery UI | `claim_profile_completion_reward` | Coupon shown/copied on success | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| **Get My Referral Code** | Missing code | `get_or_create_my_referral_code` | Displays code | **SOURCE VERIFIED; VISIBLE — NOT EXECUTED** |
| **Copy referral signup link / Copy coupon** | Data available | Clipboard only | Toast/clipboard failure | **SOURCE VERIFIED** |

Normal current source behavior for profile reward is auto-issuance on complete save; the manual claim control should be documented as compatibility/recovery, not the primary lifecycle.

---

## 5. Master/admin action contracts

### 5.1 Admin overview

| Control/surface | Effect | Evidence |
|---|---|---|
| Admin section links | Navigate to users, martech, tournaments, payments, coupons, audit, team snapshots | **SOURCE VERIFIED** |
| Publish State Drift card/table | Reads drift view | **SOURCE VERIFIED** |
| Edge Function Health Probe accordion | Diagnostic display/probe surface | **SOURCE VERIFIED; NOT UI VERIFIED** |
| Back to dashboard | `/dashboard` | **SOURCE VERIFIED** |

### 5.2 Users & Access

| Control | Backend effect | Safety status | Evidence |
|---|---|---|---|
| Refresh | Refetch unverified/role rows | Read-only | **SOURCE VERIFIED** |
| **Verify** | Changes organizer verification/access state | **VISIBLE — NOT EXECUTED** | **SOURCE VERIFIED** |
| **Disable Access** | Changes organizer verification/access state | **VISIBLE — NOT EXECUTED** | **SOURCE VERIFIED** |

Production currently has no `is_verified=false` rows, so this exception queue may be empty today. **RUNTIME DB OBSERVED**

### 5.3 Martech

| Control | Effect | Evidence |
|---|---|---|
| Date/filter controls | Changes client analytics slice | **SOURCE VERIFIED** |
| **Clear filters** | Resets selected filters | **SOURCE VERIFIED** |
| Drilldown panels | Reads computed metrics from existing product tables | **SOURCE VERIFIED** |

### 5.4 Tournaments moderation

| Control | Effect | Safety status | Evidence |
|---|---|---|---|
| status/filter chips | Read/filter list | Read-only | **SOURCE VERIFIED** |
| **View Public** | Public route | Read-only | **SOURCE VERIFIED** |
| **Open Setup** | Organizer setup route | Read-only until edit actions | **SOURCE VERIFIED** |
| **Open Allocation** | Review route | Read-only until allocation actions | **SOURCE VERIFIED** |
| **Hide from Public** | Unpublish | **VISIBLE — NOT EXECUTED** | **SOURCE VERIFIED** |
| **Archive / Unarchive** | Changes tournament archive state | **VISIBLE — NOT EXECUTED** | **SOURCE VERIFIED** |
| **Move to Trash / Restore** | Soft delete/restore | **VISIBLE — NOT EXECUTED** | **SOURCE VERIFIED** |
| **Delete Permanently** | Hard delete related records | **VISIBLE — NOT EXECUTED**; requires separate production dependency/rollback validation before any future execution | **SOURCE VERIFIED** |

Hard-delete atomicity and live FK behavior remain **NOT RUNTIME VERIFIED**.

### 5.5 Payments

| Control | Backend effect | Safety status | Evidence |
|---|---|---|---|
| **Refresh** | Refetch payments/history | Read-only | **SOURCE VERIFIED** |
| Expand row | Read details/evidence | Read-only | **SOURCE VERIFIED** |
| **Approve** | `review_tournament_payment` RPC; entitlement/referral downstream effects | **VISIBLE — NOT EXECUTED** | **SOURCE VERIFIED** |
| **Reject** | `review_tournament_payment` RPC; rejection state/note | **VISIBLE — NOT EXECUTED** | **SOURCE VERIFIED** |

No current pending row was available in grouped production data, so exact pending-row UI is **NOT UI VERIFIED** this cycle.

### 5.6 Coupons

| Control | Backend effect | Safety status | Evidence |
|---|---|---|---|
| **Codes / Analytics** tabs | Switches view | Read-only by itself | **SOURCE VERIFIED** |
| **New Coupon** | Opens create form; insert to `coupons` on save | **VISIBLE — NOT EXECUTED** | **SOURCE VERIFIED** |
| Edit coupon | Update `coupons` | **VISIBLE — NOT EXECUTED** | **SOURCE VERIFIED** |
| Enable/disable | Updates `is_active` | **VISIBLE — NOT EXECUTED** | **SOURCE VERIFIED** |
| Filters/search | Client filtering | Read-only | **SOURCE VERIFIED** |
| Analytics | Reads redemptions/coupon data | Read-only | **SOURCE VERIFIED** |

Current implementation writes the `coupons` table directly from the master-only UI hook rather than using the older `admin_create_coupon` documentation story. This is source/documentation drift to preserve for later docs cleanup, not a runtime defect conclusion.

### 5.7 Audit logs

| Control | Effect | Evidence |
|---|---|---|
| event/severity filters | Reads filtered `audit_events` | **SOURCE VERIFIED** |
| **Clear** | Clears UI filters | **SOURCE VERIFIED** |
| pagination | Reads additional audit rows | **SOURCE VERIFIED** |

### 5.8 Team snapshots

| Control | Backend effect | Safety status | Evidence |
|---|---|---|---|
| **Refresh** | `detect_missing_team_snapshots` read path | Read-only | **SOURCE VERIFIED** |
| **Backfill** | invokes `backfillTeamAllocations` for one tournament | **VISIBLE — NOT EXECUTED** | **SOURCE VERIFIED + deployed function RUNTIME FUNCTION OBSERVED** |
| **Backfill All** | invokes repair over detected set | **VISIBLE — NOT EXECUTED** | **SOURCE VERIFIED** |

Source authorization currently permits owner **or** master inside `backfillTeamAllocations`, while the documented operational policy describes master-only repair. This remains an explicit source/policy mismatch requiring a separate decision; do not infer UI visibility changes from it.

---

## 6. Access gates and authorization boundaries

### 6.1 Route guard behavior

`ProtectedRoute` currently implements:

1. auth/session loading → spinner;
2. no user → `/auth`;
3. master-only + role-resolution error → blocking **Verifying access…** state with **Reload if this persists**;
4. ready master → children;
5. ready non-master on master-only route → error toast + `/dashboard`;
6. ordinary authenticated route → children, even if role resolution ultimately errored.

**SOURCE VERIFIED**

The ordinary-route role-resolution failure path is therefore a reliability/UX candidate: role-dependent child controls can render with null/unresolved role state while backend RLS/RPC remains the actual security boundary. **CANDIDATE**

### 6.2 Master identity

Client source currently treats `role === 'master'` as the UI signal. `MASTER_EMAIL_ALLOWLIST` is now empty and `isEmailAllowedMaster()` is a compatibility no-op returning true; comments state real enforcement belongs to server-side `is_master()`/RLS. Any older documentation claiming a live client email allowlist is stale. **SOURCE VERIFIED**

### 6.3 Organizer verification

Source no longer routes legacy unverified organizers to a waiting room. `/pending-approval` redirects to dashboard, ordinary protected routes do not block on `is_verified`, and Dashboard shows an attention warning. Production currently has zero unverified role rows. **SOURCE VERIFIED + RUNTIME DB OBSERVED**

---

## 7. Cross-role handoffs

| # | Producer → consumer | Trigger/state change | Consumer surface | Recovery / unresolved path | Verification |
|---|---|---|---|---|---|
| 1 | Visitor → organizer | Signup/auth callback creates/resolves identity/role | Dashboard | resend confirmation, sign-in recovery | **SOURCE VERIFIED; auth route RUNTIME OBSERVED** |
| 2 | Referrer → new organizer → referrer | Referral attribution persists through signup; later qualifying upgrade issues rewards | Account/referral coupons | referral troubleshooting if attribution absent | **SOURCE VERIFIED** |
| 3 | Organizer profile → payment gate | Profile completeness controls payment eligibility | Payment page | Account link; retry gate | **SOURCE VERIFIED** |
| 4 | Organizer upload → organizer review | Brochure upload/extract creates reviewable extraction | Brochure Review | retry/re-extract/manual setup/discard | **SOURCE VERIFIED + extraction states RUNTIME DB OBSERVED** |
| 5 | Extraction approval → setup | `commit-extraction` creates tournament/categories/prizes | Setup | commit error leaves review | **SOURCE VERIFIED** |
| 6 | Setup/import → allocation engine | Prize rules + players become allocation inputs | Review | mapping/config fixes | **SOURCE VERIFIED + organizer route chain RUNTIME OBSERVED** |
| 7 | Conflict decisions → finalized version | Accepted/overridden conflicts feed finalize | Finalize | return to review | **SOURCE VERIFIED** |
| 8 | Organizer UPI claim → master | Submitted claim creates reviewable payment state unless auto path resolves it | `/admin/payments` | rejection/resubmission path | **SOURCE VERIFIED**; no current pending row |
| 9 | Master decision → organizer | Approval/rejection changes payment/entitlement | Payment/dashboard/return flow | rejected organizer retries/resubmits | **SOURCE VERIFIED** |
| 10 | Entitlement → referrers | qualifying upgrade issues referral rewards | Referrer Account coupons | audit/troubleshooting | **SOURCE VERIFIED** |
| 11 | Organizer publish → public viewer | publication becomes active/pinned | `/p/:slug`, `/p/:slug/results` | publish error remains organizer-side | **SOURCE VERIFIED + public routes RUNTIME OBSERVED** |
| 12 | Unpublish/republish → public viewer | public visibility removed/restored | public routes | organizer publication manager | **SOURCE VERIFIED; not executed** |
| 13 | Finalization → team snapshot repair | missing pinned team snapshot detected | Admin Team Snapshots | backfill function | **SOURCE VERIFIED** |
| 14 | Operational failure → master | audit event/error reference recorded | `/admin/audit` | diagnostics/support | **SOURCE VERIFIED** |

---

## 8. State machines

### 8.1 Tournament

`draft` → `finalized` → `published`

Additional operational overlays:
- archive / unarchive;
- soft delete / restore;
- hard delete (admin-only consequential path);
- unpublish / republish.

Production counts observed: **82 draft, 17 finalized, 37 published**. **RUNTIME DB OBSERVED**

### 8.2 Allocation/version

Configuration + players → preview allocation → conflict decisions → committed/finalized allocation → publication pins allocation version.

The public result path is publication-backed. `publications.version` is a publish counter, not an allocation version; publication pinning uses `allocation_version`. **SOURCE VERIFIED**

### 8.3 Extraction

upload → pending/processing → `auto_ok` or `needs_review` or `error` → organizer approval/rejection/re-extraction → commit → setup.

Production evidence includes:
- extraction documents: 20 auto_ok, 167 needs_review, 9 error;
- extractions: 32 approved, 13 auto_ok, 138 needs_review, 11 rejected.

**RUNTIME DB OBSERVED**

### 8.4 Payment / entitlement

profile gate → coupon redemption **or** UPI claim → auto/manual decision → entitlement → organizer returns to blocked workflow.

Production evidence in this cycle:
- 3 approved payment rows;
- 9 rejected payment rows;
- 12 entitlement rows;
- no pending payment row in grouped result.

**RUNTIME DB OBSERVED**

### 8.5 Publication

finalized allocation → publish → public detail/results → optional unpublish → optional republish.

Public directory currently exposes 37 publication rows. **RUNTIME DB OBSERVED**

---

## 9. Failure and recovery register

| ID | Surface | Failure/recovery path | Status |
|---|---|---|---|
| FR-01 | Public directory | Query error → **Retry** | **SOURCE VERIFIED** |
| FR-02 | Auth signup | confirmation incomplete → resend confirmation; sign-in/signup recovery | **SOURCE VERIFIED** |
| FR-03 | Master authz resolution | blocking **Verifying access…** + reload link | **SOURCE VERIFIED** |
| FR-04 | Ordinary organizer authz resolution | role-query error can fall through to child route; backend remains final protection | **CANDIDATE** |
| FR-05 | Brochure upload | invalid/error → **Try another file** / **Continue with manual entry** | **SOURCE VERIFIED** |
| FR-06 | Brochure review | extraction/commit error → retry/re-extract/manual setup/dashboard | **SOURCE VERIFIED** |
| FR-07 | Prize setup | dirty/local draft → restore/discard; delete confirmation | **SOURCE VERIFIED** |
| FR-08 | Player import | mapping/validation/dedup conflicts → fix mapping/dedup/export diagnostics | **SOURCE VERIFIED** |
| FR-09 | Allocation | unresolved conflicts/unfilled/gating → resolve, override, upgrade/apply coupon, return import/setup | **SOURCE VERIFIED** |
| FR-10 | Payment price/gate | query error → **Try again** | **SOURCE VERIFIED** |
| FR-11 | Payment profile gate | **Go to your account** | **SOURCE VERIFIED** |
| FR-12 | Payment rejection | source supports rejected state and retry path; exact live rendered rejection UI not captured | **SOURCE VERIFIED + RUNTIME DB OBSERVED rejected rows** |
| FR-13 | Publish | failure remains on organizer finalize/publish flow; public state should not be inferred changed | **SOURCE VERIFIED** |
| FR-14 | Admin destructive operations | confirmation/cancel, but production dependency/rollback validation is required before future hard delete | **SOURCE VERIFIED; NOT EXECUTED** |

---

## 10. Legacy / compatibility registry

| Route/capability | Current behavior | Keep/remove evidence needed | Status |
|---|---|---|---|
| `/p/:slug/details` | Redirect → `/p/:slug` | Inbound-link/traffic evidence before removal | **CANDIDATE orphan** |
| `/t/:id/public` | Resolve slug → canonical public route; fallback `PublicWinnersPage` | Traffic + no-slug cases before removal | **Legacy compatibility** |
| `/t/:id/upgrade` | Redirect → `/t/:id/payment` preserving return/coupon flags | Old links/docs/traffic | **Legacy compatibility** |
| `/master-dashboard` | Redirect → `/admin/users` | Old bookmarks/docs/traffic | **Legacy compatibility** |
| `/pending-approval` | Protected redirect → `/dashboard` | Old auth links/docs; current source no waiting room | **Legacy compatibility** |
| Account **Claim Free Tournament** | Manual reward compatibility/recovery | Confirm whether still needed after auto-issuance | **CANDIDATE compatibility UI** |
| Old coupon docs using `admin_create_coupon` | Current master UI writes coupon table directly | Documentation cleanup decision | **Stale documentation candidate** |

---

## 11. Dead-end / orphan / drift candidates

These are not all defects. They are evidence-backed candidates requiring a separate implementation/decision item.

1. **`/p/:slug/details`** — no source-visible current UI link found in the prior source audit; keep until traffic/inbound-link evidence supports removal.
2. **Legacy `/pending-approval` story** — docs still describe a waiting-room flow that source no longer implements.
3. **Payment docs** — `/upgrade` and `/master-dashboard` are aliases, not canonical payment/review routes.
4. **Profile reward docs** — manual claim is no longer the primary lifecycle; complete profile save can auto-issue.
5. **Client master allowlist docs/comments elsewhere** — current client allowlist function is a no-op; server authorization is authoritative.
6. **Ordinary protected-route role-resolution error** — child routes can render after authz query failure; source reliability/UX candidate.
7. **`backfillTeamAllocations` policy mismatch** — server permits tournament owner or master while operational docs describe master-only.
8. **Deployment story inconsistency** — legacy PROJECT_STATE says every main push deploys all frontend/functions, while checked-in workflow evidence does not independently prove that whole model. Runtime function revisions exist, but exact deployment integration remains a separate production evidence item.
9. **Coupon admin implementation vs older RPC docs** — current UI directly inserts/updates `coupons`; older docs describe `admin_create_coupon`.
10. **Technical `user` role** — type exists but no current production role row or distinct supported route journey was found.

---

## 12. Security-sensitive backend capability map

UI visibility is not proof of authorization. Security-sensitive capabilities must be documented independently.

| Capability | Source/server observation | Runtime status |
|---|---|---|
| Master-only admin routes | UI guarded by `requireMaster`; real protection expected from RLS/RPC/server checks | One master role exists; admin routes historically observed |
| `extract` | Deployed with `verify_jwt=true`; source audit found no per-document caller ownership comparison inside function | **RUNTIME FUNCTION OBSERVED + source authorization gap remains** |
| `commit-extraction` | Resolves caller and checks document ownership before commit | **SOURCE VERIFIED + deployed function observed** |
| `backfillTeamAllocations` | Source permits owner OR master | **SOURCE VERIFIED + deployed function observed** |
| Public team prizes | `publicTeamPrizes` deployed with `verify_jwt=false`; intended public reader | **RUNTIME FUNCTION OBSERVED** |
| Payment review | `review_tournament_payment` RPC used by admin payment panel | **SOURCE VERIFIED** |
| Publication | publish/unpublish RPCs change public visibility | **SOURCE VERIFIED; not executed** |
| Hard delete | Admin tournament action deletes related records | **SOURCE VERIFIED; not executed; runtime atomicity unknown** |

The `extract` ownership issue is a high-risk implementation candidate, but this flow-map cycle intentionally stops before any security fix.

---

## 13. Runtime role-path evidence

### Public

Recent analytics show real visits to:
- `/public`;
- multiple `/p/:slug` pages;
- `/how-it-works`;
- `/pricing`;
- `/terms`;
- `/auth`.

This confirms deployed route reachability/use but does not prove exact rendered controls. **RUNTIME ROUTE OBSERVED**

### Organizer

On 20 Sep 2026 one tournament ID appeared in analytics at:
- `/t/:id/setup`;
- `/t/:id/order-review`;
- `/t/:id/import`;
- `/t/:id/review`;
- `/t/:id/finalize`;
- `/t/:id/publish`;
- `/t/:id/settings`.

This is strong runtime route-level evidence that the organizer lifecycle is reachable in the deployed project. It does not by itself prove which button caused each transition or whether all intermediate writes succeeded. **RUNTIME ROUTE OBSERVED**

### Master/admin

Historical analytics on 28 Aug 2026 include:
- `/admin`;
- `/admin/users`;
- `/admin/payments`;
- `/admin/coupons`.

Production has exactly one master role row. This establishes that master/admin surfaces have been reached in the deployed project, but current exact rendered admin UI and consequential controls remain **NOT UI VERIFIED** in this cycle. **RUNTIME ROUTE OBSERVED + RUNTIME DB OBSERVED**

---

## 14. Operational capability matrix

| Operation | Canonical path/command | Status/caution |
|---|---|---|
| Public browse | `/public` | Safe/read-only |
| Organizer setup | `/t/:id/setup` | Writes only when saving |
| Player import | `/t/:id/import` | Consequential when saving/replacing |
| Allocation preview | `/t/:id/review` | Preview safe by product intent; commit is consequential |
| Finalize | `/t/:id/finalize` | Finalization/publish are consequential |
| Organizer payment | `/t/:id/payment` | Canonical; `/upgrade` is alias |
| Master payment review | `/admin/payments` | Canonical; `/master-dashboard` is not payment authority |
| Publication manager | `/t/:id/publish` | Unpublish/republish mutate public state |
| Admin tournament moderation | `/admin/tournaments` | Archive/trash/delete are consequential |
| Team snapshot repair | `/admin/team-snapshots` | Backfill is consequential |
| Local build | `npm run build` | Build only; does not prove deployment |
| Lint | `npm run lint` | Required by AGENTS before merge |
| Unit tests | `npm run test:unit` | Required by AGENTS before merge |
| App TS check | `npx tsc -p tsconfig.app.json --noEmit` | Historical PROJECT_STATE says this is the meaningful app check |
| E2E/smoke | repo scripts | May touch configured environment; verify isolation first |

---

## 15. Documentation drift to reconcile after this item

This flow map intentionally records rather than silently rewrites these conflicts:

- `docs/SECURITY_ACCESS_CONTROL.md` still describes `/pending-approval`, a `PendingApproval.tsx` screen, and client-side master allowlist behavior that current source no longer uses.
- `docs/KEY_USER_FLOWS.md` still describes organizer payment at `/t/:id/upgrade`, master review at `/master-dashboard`, and a two-step coupon validation/redemption story that differs from current `TournamentUpgrade`.
- `docs/COUPONS_LIFECYCLE.md` still describes manual profile reward claiming as the normal lifecycle and older admin coupon creation conventions.
- Legacy `PROJECT_STATE.md` is oversized, stale at an older main commit, and still claims to be the single source of truth.
- The lean canonical operating files `SOURCE_OF_TRUTH.md`, `BACKLOG.md`, `DOCUMENT_INDEX.md`, `RUNTIME_STATE.md`, `RISK_REGISTER.md`, `EVIDENCE_REGISTER.md`, `QA_STATUS.md`, and `CHANGELOG.md` are missing at the source baseline.

The missing canonical spine is **normalization debt**. This document does not invent those files or manufacture backlog IDs.

---

## 16. Acceptance status for this flow-map item

| Gate | Status |
|---|---|
| Current source HEAD reconciled | **PASS** — `251101b8...`; delta after Codex audit changes only `.lovable/plan.md` |
| Every current route classified | **PASS at source level** |
| Primary screens and meaningful controls inventoried | **PASS at source level; rendered UI remains partially unverified** |
| Public role has runtime evidence | **PASS at route/runtime-data level** |
| Organizer role has runtime evidence | **PASS at route/runtime-data level** |
| Master/admin role has runtime evidence | **PASS at historical route/runtime-data level; current rendered UI not captured** |
| Cross-role workflows mapped | **PASS at source level; some end-to-end handoffs not executed** |
| Failure/recovery paths mapped | **PASS at source level; exact rendered states partly unverified** |
| Legacy aliases registered | **PASS** |
| Dead-end/orphan candidates distinguished from confirmed defects | **PASS** |
| Security-sensitive capabilities mapped independently of UI | **PASS** |
| No consequential production action executed | **PASS** |
| Canonical normalization completed | **NO — explicitly recorded as normalization debt** |

---

## 17. Re-verification triggers

Re-verify only affected sections when any of these change:

- `src/App.tsx` route table or redirect aliases;
- `ProtectedRoute`, auth callback, role model, or server authorization;
- Dashboard/create/import/resume controls;
- setup, player import, allocation, finalize, publication, or payment workflows;
- public publication/result readers;
- admin navigation or moderation/payment/coupon/team-snapshot controls;
- Edge Function authorization, JWT settings, or ownership checks;
- payment/entitlement/coupon/referral rules;
- brochure rollout/extraction contract;
- deployment integration or production environment;
- any route/control cited here that is renamed, removed, or newly gated.

Do not rerun a full product reconstruction for a localized change. Update the affected route/action/handoff rows and attach new targeted source/runtime evidence.

---

## 18. Open evidence gaps

1. Current rendered screenshots for public, organizer, and master/admin surfaces were not obtainable through the connected toolset in this cycle.
2. Mobile clipping, keyboard/focus accessibility, dirty-navigation prompts, and secondary-control visibility remain **NOT UI VERIFIED**.
3. No current unverified organizer exists in production, so that warning state cannot be observed without creating/changing production data.
4. No current pending payment row appeared in the production grouping, so pending-review rendering was not safely available.
5. Exact deployed frontend commit provenance outside the Lovable project metadata and exact external deployment integration remain separate runtime/deployment evidence questions.
6. Legacy-route inbound traffic for `/p/:slug/details`, `/t/:id/public`, `/t/:id/upgrade`, `/master-dashboard`, and `/pending-approval` was not exhaustively measured.
7. Hard-delete behavior against current live foreign-key/data dependencies remains unknown and must not be tested as part of documentation evidence work.

---

## 19. Current item exit

**Item:** Role-based Product Flow Map evidence/reconciliation  
**State:** **VERIFIED at source + route/runtime-data level; rendered-control runtime evidence remains partial**  
**Product/security implementation changes:** none  
**Next documentation dependency:** canonical normalization of the missing lean operating spine, preserving this map as the route/action authority and preserving legacy evidence without rewriting product behavior.

