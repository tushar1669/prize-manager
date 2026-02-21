# FAQ: Screens, Buttons, Meanings, and Failure Modes

This FAQ is generated from the current repository routes and component labels (no external docs).

## 1) Screen-by-screen Actions Map

> Source of truth for routes: `src/App.tsx`.

| Route | Screen | Action label (exact text) | Enabled / disabled logic | Result |
|---|---|---|---|---|
| `/` | Root redirect | (automatic redirect, no visible button) | N/A | Redirects via `RootRedirect` component based on auth state. |
| `/public` | Public tournament list | `View Details` | Always enabled when card is rendered | Navigates to `/p/:slug`. |
| `/public` | Public tournament list | `Load more` / `Loading...` | Disabled while loading more (`isLoadingMore`) | Fetches next page of tournaments. |
| `/public` | Public tournament list (error state) | `Retry` | Enabled in error state | Refetches tournament list. |
| `/p/:slug` | Public tournament details | `Back` | Always enabled | Browser back if history exists; else `/`. |
| `/p/:slug` | Public tournament details | `Brochure` | Rendered only when brochure URL exists; disabled while signed URL loads | Opens brochure link in new tab. |
| `/p/:slug` | Public tournament details | `Chess Results` | Rendered only when `chessresults_url` exists | Opens external link in new tab. |
| `/p/:slug` | Public tournament details | `External Results` | Rendered only when `public_results_url` exists | Opens external link in new tab. |
| `/p/:slug/results` | Public final results | `Back` | Always enabled | Browser back if history exists; else `/`. |
| `/p/:slug/results` | Public final results | `Brochure` | Rendered only when brochure URL exists; disabled while signed URL loads | Opens brochure link in new tab. |
| `/p/:slug/results` | Public final results | `View Details` | Always enabled when page loads | Navigates to `/p/:slug`. |
| `/p/:slug/details` | Legacy details redirect | (automatic redirect, no visible button) | N/A | Redirects to `/p/:slug`. |
| `/t/:id/public` | Public winners page | `Back` | Always enabled | Browser back if history exists; else `/`. |
| `/t/:id/public` | Public winners page | `Brochure` | Rendered only when brochure URL exists | Opens brochure link in new tab. |
| `/t/:id/public` | Public winners page | `Category Cards` / `Table View` / `Poster Grid` / `Arbiter Sheet` | Tabs shown when data exists | Switches public winners layout tab. |
| `/t/:id/public` | Public winners page | `Back to Home` | Always enabled | Navigates to `/`. |
| `/auth` | Auth | `Resend Confirmation Email` | Disabled while resend request is running (`resendLoading`) | Sends confirmation email again. |
| `/auth` | Auth | `Forgot password?` | Requires non-empty email input | Sends password reset email. |
| `/auth` | Auth | `Sign In` / `Create Account` (loading states: `Signing in...`, `Creating account...`) | Disabled while auth submit is running (`loading`) | Signs in or creates account. |
| `/auth` | Auth | `Already signed up? Resend confirmation email` | Signup mode only | Reveals resend panel. |
| `/auth` | Auth | `Sign up` / `Sign in` | Always enabled | Toggles auth mode. |
| `/auth/callback` | Auth callback | (no user-facing buttons) | N/A | Handles token/callback processing, referral capture, and redirect. See [Auth Callback](./AUTH_CALLBACK.md). |
| `/pending-approval` | Pending approval | `Refresh Status` | Always enabled | Re-checks user verification state. |
| `/pending-approval` | Pending approval | `Sign Out` | Always enabled | Signs user out. |
| `/dashboard` | Tournament dashboard | `Approvals` (master only) | Visible for master role only | Navigates to `/master-dashboard`. |
| `/dashboard` | Tournament dashboard | `Admin` (master only) | Visible for master role only | Navigates to `/admin/tournaments`. |
| `/dashboard` | Tournament dashboard | `Create Tournament` / `Creating...` | Visible only for master/verified users; disabled while create is pending | Creates tournament and navigates to setup details tab. |
| `/dashboard` | Tournament dashboard | `Resume` | Always enabled per row | `draft`→setup, `finalized`→finalize, otherwise publish screen. |
| `/dashboard` | Tournament dashboard | `View Public` | Visible when tournament status is `published` | Navigates to `/t/:id/public`. |
| `/dashboard` | Tournament dashboard | `Create Your First Tournament` | Visible when no tournaments and no search query | Creates first tournament. |
| `/account` | Account settings | `Save Profile`, `Claim Reward`, `Copy referral signup link` | Save disabled while saving; Claim Reward enabled at 100% profile completion (one-time); Copy link always enabled | Edit profile fields, claim profile completion reward, generate/copy referral link, view referred users and earned rewards. |
| `/t/:id/setup` | Tournament setup | `Details` / `Prize Structure` | Tab triggers always enabled | Switches setup tab. |
| `/t/:id/setup` | Tournament setup (details tab) | `Save & Continue` / `Saving...` | Disabled while save mutation pending | Saves tournament details and proceeds in flow. |
| `/t/:id/setup` | Tournament setup (details tab) | `Cancel` | Always enabled | Cancels edits (navigation/reset behavior from handler). |
| `/t/:id/setup` | Tournament setup (prizes tab) | `Individual Prizes` / `Team / Institution Prizes` | Toggle buttons always enabled | Switches prize-mode UI. |
| `/t/:id/setup` | Tournament setup (prizes tab) | `Save All Categories` / `Saving All…` | Disabled when already saving or no non-main categories | Saves all dirty category prize editors. |
| `/t/:id/setup` | Tournament setup (prizes tab) | `Add Category` | Organizer-only in this section | Opens add-category dialog. |
| `/t/:id/setup` | Tournament setup (flow navigation) | `Review Category Order` | Always enabled | Navigates to `/t/:id/order-review`. |
| `/t/:id/setup` | Tournament setup (flow navigation) | `Next: Import Players` / `Next: Review & Allocate` | Disabled while loading player count or when `!canProceed` | Goes to import if no players, else review route. |
| `/t/:id/order-review` | Category order review | `Drag to reorder` | Always available on rows | Reorders categories (brochure priority). |
| `/t/:id/order-review` | Category order review | `Confirm & Continue` / `Saving…` | Disabled while saving | Persists order/active flags and continues flow. |
| `/t/:id/order-review` | Category order review | `Cancel` | Disabled while saving | Returns to setup page. |
| `/t/:id/import` | Player import | `Restore draft` / `Discard` | Shown when saved draft exists | Restores/discards import draft. |
| `/t/:id/import` | Player import | `Swiss-Manager export tip: enable 'Print all columns'` | Always enabled in upload panel | Opens instruction dialog image. |
| `/t/:id/import` | Player import | `Back` | Always enabled | Navigates to setup prizes tab. |
| `/t/:id/import` | Player import | `Import players & continue` (`Processing...` / `Importing...`) | Disabled unless parse OK + rows present + no validation errors + conflicts resolved + not pending | Writes players and proceeds to review/allocation. |
| `/t/:id/import` | Player import | `View details` (tie ranks) | Shown when tie-rank imputation occurred | Opens tie-rank detail dialog. |
| `/t/:id/review` | Review allocations | `Preview Allocation` | Disabled while alloc pending or no players | Runs dry-run allocation and fills debug/coverage. |
| `/t/:id/review` | Review allocations | `Commit Allocation` | Disabled until preview completed with coverage and no critical unfilled errors; also disabled while pending | Commits allocation with current overrides. |
| `/t/:id/review` | Review allocations | `Accept` / `Override` (conflict row) | Disabled while alloc mutation pending | Applies suggested resolution or opens manual override drawer. |
| `/t/:id/review` | Review allocations | `Finalize` / `Finalizing` | Disabled in preview mode, before preview, with conflicts, with zero winners, or while finalize pending | Finalizes and navigates to finalize page. |
| `/t/:id/review` | Review allocations | `Back` | Always enabled | Navigates back to import page. |
| `/t/:id/finalize` | Finalize | `Make Public` / `Publishing...` | Disabled while publish mutation pending | Publishes immutable version and exposes public URL. |
| `/t/:id/finalize` | Finalize | `View Public Page` | Disabled when no winners | Opens internal public page `/t/:id/public`. |
| `/t/:id/finalize` | Finalize | `Export XLSX` | Disabled on team tab or without winner rows | Downloads Excel export for final views. |
| `/t/:id/finalize` | Finalize | `Print` | Disabled on team tab when no team winner rows | Triggers print for active final view. |
| `/t/:id/finalize` | Finalize | `Back to Review` | Always enabled | Navigates to `/t/:id/review`. |
| `/t/:id/finalize` | Finalize | `Publish Tournament` (`Publishing...`) | Disabled while finalize mutation pending or when winners empty | Runs finalize+publish handler. |
| `/t/:id/final/:view` | Final prize view | `Category Cards` / `Poster Grid` / `Arbiter Sheet` / `Team Prizes` | Tabs always visible; unknown view redirects to `/final/v1` | Switches printable/public-friendly view layout. |
| `/t/:id/upgrade` | Tournament upgrade | `Submit Payment` / `Apply Coupon` | Submit requires valid UTR (6+ chars); Apply requires valid coupon code | Submits UPI payment claim or applies coupon for Pro upgrade. |
| `/t/:id/publish` | Publish success | `View Public Page` | Published state | Opens published page. |
| `/t/:id/publish` | Publish success | `Open in New Tab` | Published state | Opens public URL in new tab. |
| `/t/:id/publish` | Publish success | `Unpublish Tournament` | Published state | Unpublishes tournament. |
| `/t/:id/publish` | Publish success | `Republish (Create v2)` / `Republish Tournament` | Published/unpublished variants | Republishes and creates new version. |
| `/t/:id/publish` | Publish success | `Back to Dashboard` | Always enabled | Navigates to dashboard. |
| `/t/:id/settings` | Tournament settings | `Enforce age rules` (switch) | Always enabled | Toggles strict age eligibility. |
| `/t/:id/settings` | Tournament settings | `Allow Missing DOB for Age Rules` (switch) | Always enabled | Allows missing DOB players for age rules. |
| `/t/:id/settings` | Tournament settings | `Inclusive Maximum Age` (switch) | Always enabled | Toggles `<= max` vs `< max` age behavior. |
| `/t/:id/settings` | Tournament settings | `Age Eligibility Cutoff` (radio options) | Always enabled | Selects Jan1/start/custom age cutoff strategy. |
| `/t/:id/settings` | Tournament settings | `Main vs Place Priority` (radio options) | Always enabled | Chooses tie-break preference (`main_first`/`place_first`). |
| `/t/:id/settings` | Tournament settings | `Age Band Policy` (switch) | Always enabled | Toggles overlapping vs non-overlapping age bands. |
| `/t/:id/settings` | Tournament settings | `Edit Category Order` | Always enabled | Navigates to `/t/:id/order-review`. |
| `/t/:id/settings` | Tournament settings | `Cancel` | Always enabled | Returns back/history (or setup prizes fallback). |
| `/t/:id/settings` | Tournament settings | `Save Settings` / `Saving...` | Disabled while save mutation pending | Persists rule settings. |
| `/master-dashboard` | Master dashboard | `Approve` / `Reject` | Disabled during approve/reject mutation | Verifies or rejects pending organizer account. |
| `/master-dashboard` | Master dashboard | refresh icon button (`title="Refresh pending approvals"`) | Disabled while pending list loading | Refreshes pending approvals list. |
| `/master-dashboard` | Master dashboard | Verification toggle in "All Users" | Disabled while toggle mutation pending | Toggles organizer verification state. |
| `/master-dashboard` | Master dashboard | `Approve` / `Reject` (Payment Approvals) | Disabled during mutation | Reviews manual UPI payment claims. |
| `/admin/tournaments` | Admin tournaments | Filter chips: `All`, `Active`, `Draft`, `Archived`, `Deleted` | Always enabled | Filters tournament list by status. |
| `/admin/tournaments` | Admin tournaments | Row menu actions | Depends on state | View Public, Open Setup, Open Allocation, Hide, Archive, Trash, Delete. |
| `/admin/audit` | Admin audit logs | Search + filter by event type | Always enabled for master | Searchable audit event log. |
| `/reset-password` | Password reset | `Update Password` | Requires 6+ char password | Sets new password after email reset link. |
| `*` | Not found | `Back to Home` | Always enabled | Fallback for unknown routes. |

---

## 2) FAQ

## Getting Started

**Q: What is the shortest organizer flow?**
A: Dashboard → Setup (details + prize structure) → Import players → Review allocations (preview + commit) → Finalize → Publish.

**Q: Why can't I create a tournament from Dashboard?**
A: `Create Tournament` is visible only to master or verified users. Unverified users see a pending-approval banner.

**Q: Where do I edit tournament metadata (venue, dates, arbiter, links)?**
A: `/t/:id/setup` on the `Details` tab, then use `Save & Continue`.

## Import

**Q: Which file format is accepted for import?**
A: The import screen explicitly asks for Excel `.xlsx` or `.xls`.

**Q: What does "Import players & continue" require before it enables?**
A: Parse must be OK, mapped rows must exist, validation errors must be zero, and duplicate conflicts must be fully resolved.

**Q: What does Replace mode warning imply?**
A: Replace mode warns it will delete existing players before importing the new file for that tournament.

## Preview

**Q: Why is "Commit Allocation" disabled?**
A: It stays disabled until preview has completed with coverage data, and also if critical unfilled reasons exist (e.g., internal/category inactive issues).

**Q: What is the difference between Preview and Commit in review?**
A: `Preview Allocation` runs dry-run allocation for diagnostics; `Commit Allocation` performs the actual commit with overrides.

## Debug

**Q: Where can I inspect conflicts and manually override winners?**
A: On `/t/:id/review`, use `Accept` for suggested resolution or `Override` to assign prize→player manually.

**Q: Why is Finalize disabled on review screen?**
A: It is disabled in preview mode, before preview completion, when conflicts remain, with zero winners, or while finalize is running.

## Exports

**Q: Where is the final export button?**
A: On `/t/:id/finalize`, use `Export XLSX` in the Final Prize Views card.

**Q: Why is Export XLSX disabled?**
A: It's disabled on Team tab and also disabled when there are no final winner rows available.

**Q: Is print supported?**
A: Yes. `/t/:id/finalize` has a `Print` action for the active final view tab.

## Commit / Finalize

**Q: What does finalize do?**
A: It locks in allocation output for the current run and prepares publish actions (including immutable version semantics shown in UI copy).

**Q: Where can I re-check before publishing?**
A: Use `/t/:id/finalize` tabs (`Category Cards`, `Poster Grid`, `Arbiter Sheet`, `Team Prizes`) and `View Public Page`.

## Publish

**Q: What button makes the tournament public?**
A: `Make Public` (and also `Publish Tournament` in bottom action bar) on `/t/:id/finalize`.

**Q: Can I undo publication?**
A: Yes. On `/t/:id/publish`, use `Unpublish Tournament`.

**Q: What is republish?**
A: `Republish (Create v2)` / `Republish Tournament` creates a new published version after changes.

## Account & Referrals

**Q: How do I share my referral link?**
A: Go to `/account` → "My Referral Code" → click "Copy referral signup link". Format: `/auth?mode=signup&ref=REF-XXXX`.

**Q: What is the profile completion reward?**
A: Complete all 5 profile fields → click "Claim Reward" for a one-time Pro discount coupon (`PROFILE-` prefix). See [Referrals and Rewards](./REFERRALS_AND_REWARDS.md).

**Q: How do I upgrade a tournament to Pro?**
A: `/t/:id/upgrade` — pay ₹2,000 via UPI + submit UTR, or apply a coupon code.

**Q: My referral wasn't captured after cross-device signup.**
A: See [Troubleshooting](./TROUBLESHOOTING.md) playbook #6. Use `?debug_referrals=1` to debug.

## Troubleshooting

**Q: I see "No published results yet." on public results page. Why?**
A: No published result rows exist for that slug yet.

**Q: My account is stuck in pending approval.**
A: Use `Refresh Status` on `/pending-approval`; a master user must approve your account.

**Q: I can't access a route directly.**
A: Protected routes require authentication; master-only routes additionally require master role.

## Related docs
- [Referrals and Rewards](./REFERRALS_AND_REWARDS.md)
- [Coupons Lifecycle](./COUPONS_LIFECYCLE.md)
- [Auth Callback](./AUTH_CALLBACK.md)
- [Troubleshooting](./TROUBLESHOOTING.md)
