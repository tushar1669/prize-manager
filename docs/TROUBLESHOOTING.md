# Troubleshooting (repo-grounded)

## If you see “Tournament not found” or blank public details
- **Likely cause:** Public pages read from `published_tournaments`, which only includes `is_published = true` and excludes archived/deleted tournaments. (supabase/migrations/20251226184159_c2405569-73f6-4622-827f-3183c54b8645.sql → CREATE VIEW public.published_tournaments)
- **Do this:** Verify the tournament is published and has an active publication/version in the publish flow. (src/pages/Finalize.tsx → publishMutation; src/pages/PublishSuccess.tsx → PublishSuccess)
- **Edge case:** If `published_tournaments.event_code` is missing in the DB view, the public details helper will surface a migration warning in dev. (src/utils/publicTournamentDetails.ts → getPublicTournamentDetailsErrorMessage)

## If public results load slowly
- **Likely cause:** The public results page performs multiple sequential fetches: allocations → players → prizes → categories. (src/pages/PublicResults.tsx → PublicResults)
- **Do this:** Check the Supabase responses and payload sizes for these queries to identify bottlenecks. (src/pages/PublicResults.tsx → PublicResults)

## If print layout looks wrong
- **Likely cause:** Print output uses dedicated HTML/CSS templates and recommends enabling background graphics. (src/utils/print.ts → buildPlayersPrintHtml; src/components/final-prize/FinalPrizeSummaryHeader.tsx → FinalPrizeSummaryHeader)
- **Do this:** Enable “Background graphics” in the browser print dialog and reprint. (src/components/final-prize/FinalPrizeSummaryHeader.tsx → FinalPrizeSummaryHeader)

## If export fails (PDF or XLSX)
- **PDF (print-to-PDF) issues:** The winners PDF export opens a print window; if popups are blocked, the flow throws an error message. (src/pages/Finalize.tsx → handleExportWinnersPdf)
- **XLSX export issues:** Final prize XLSX export is blocked when no winners exist. (src/components/final-prize/FinalPrizeSummaryHeader.tsx → handleExportXlsx)

## If import mapping or dedup results are surprising
- **Header detection:** Import parsing scans for headers using automatic detection or legacy row 1 parsing depending on the feature flag. (src/hooks/useExcelParser.tsx → useExcelParser)
- **Conflict rules:** Conflicts are computed by FIDE ID, Name+DOB, or SNo with rank-only duplicates ignored. (src/utils/conflictUtils.ts → detectConflictsInDraft, isRankOnlyCollision)
- **Dedup scoring:** Dedup uses weighted matching (name, FIDE, DOB, rating diff) with a fixed threshold and a merge policy that fills blanks and can prefer newer rating or preserve DOB. (src/utils/dedup.ts → scoreCandidate, applyMergePolicy)

## Troubleshooting: Import Name issues (Swiss-Manager files)
- **What to check**
  - Confirm duplicate headers are being renamed to **Name (2)**, **Name (3)**, etc., so the full-name column is not overwritten. (src/utils/sheetDetection.ts → withUniqueHeaders)
  - Verify the mapped **Name** column is the full-name candidate (not abbreviated) after auto-mapping. (src/components/ColumnMappingDialog.tsx → duplicate Name handling)
- **Where to look**
  - Browser console: `"[detect] headerRow="` and `"[parseExcel] V1 Legacy mode"` indicate the detected header row and parsed headers. (src/hooks/useExcelParser.tsx → useExcelParser)
  - Browser console: `"[import] Detected headers:"` and `"[import] Running auto-mapping"` show the post-dedup headers and auto-mapping run. (src/pages/PlayerImport.tsx → PlayerImport)
