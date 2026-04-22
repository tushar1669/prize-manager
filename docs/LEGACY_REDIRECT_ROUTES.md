# Legacy Redirect Routes (Intentional)

These routes are intentionally retained in `src/App.tsx` as redirects/aliases to protect existing links and bookmarks:

- `/pending-approval`
- `/p/:slug/details`
- `/t/:id/public`
- `/t/:id/upgrade`

Dead page components removed as part of this cleanup:

- `src/pages/PendingApproval.tsx` (route is now a redirect)
- `src/pages/PublicTournament.tsx` (public detail route uses `src/pages/PublicTournamentDetails.tsx`)
