# Testing — Brochure Extraction Engine

**Status:** Gate 1 validation record + Gate 2 test inventory
**Date:** July 2026

---

## 1. Two-brochure validation (Gate 1)

Two real brochures were run end-to-end through the deployed `/extract` function, judged against
hand-labeled ground truth that is never sent to any model prompt.

### Jaipur — 2nd Jaipur Open 2025 (PASS)

Ground truth: fund ₹11,50,000; itemized sum equals it exactly; 14 prize categories; cover states
"100 CASH PRIZES"; grouped ranks 11–15 and 16–20 in the General column.

Final validated run (schema v3):

| Check | Result |
|---|---|
| HTTP / status | 200, `needs_review`, confidence 1.0 |
| Categories | 14 / 14 |
| Computed sum vs stated fund | ₹11,50,000 vs ₹11,50,000 — diff 0 |
| Cash prize places | 100 (matches "100 CASH PRIZES", never prompted) |
| Grouped ranks | preserved as `rank_from`/`rank_to` (11–15 @6500, 16–20 @6000) |
| City vs state | Best Jaipur → `criteria.city`, Best Rajasthan → `criteria.state`, both grounded |
| event_code | `412442/RJ/2025`, grounded with evidence |
| Grounding audit | 10/10 random values found in ocr_text after normalization |
| Flags | 1 — `aicf_rated` ungrounded (correct catch: brochure says "under the aegis of AICF", never "AICF rated") |

`needs_review` with one truthful flag is the intended outcome — nothing auto-commits (PRD F9).

### Delhi — New Delhi Open 2025 (KNOWN LIMITATION)

Ground truth: fund ₹8,50,000; 18 categories; Academy/School trophy-only; Veteran 55+ has 3 cash
ranks; grouped ranks 11–15 / 16–20 / 21–35.

Result: **pdf-mode extraction fails with Gemini `finishReason=RECITATION`** on every prompt
variant (structured rendering, prose-free listing; temperature escape measured ineffective).
Pass 1 returns no text, so no payload is ever produced — the engine fails closed, never wrongly.

An image-mode workaround (mupdf WASM rasterization per page) was proven to *load* in the Edge
runtime but exhausts the worker memory limit (`WORKER_RESOURCE_LIMIT`) before completing; the
code remains behind `EXTRACT_OCR_MODE=image` (default `pdf`). Dense-table brochures that trip
the recitation filter are a **documented v1 limitation**: the UI surfaces a kind error and the
organizer falls back to manual entry with no data loss.

## 2. What the failure taught us (kept for future debugging)

- An empty Gemini response is not self-explaining: capture `finishReason`, `blockReason` and
  `thoughtsTokenCount` on every call. `ocr_empty` errors now carry the full attempt trail.
- Asking for *verbatim* transcription is what trips RECITATION; asking for a structured
  *rendering* with exact values preserved does not (for most documents) and keeps the grounding
  substrate intact, because grounding matches values, not sentences.
- Per-attempt provider failures must be non-fatal, or a retired fallback model masks the real
  cause (a 404 once hid the RECITATION diagnosis).

## 3. Automated tests (Gate 2)

Run with `npx vitest run`.

| File | Covers |
|---|---|
| `tests/extraction-grounding.spec.ts` (24) | numeric/date normalization, grounding methods, arithmetic invariants incl. rank spans, status gate |
| `tests/commit-extraction-mapper.spec.ts` (15) | rank expansion (11–15 → 5 rows), trophy-only rows, gift_items shape, structure-only categories (criteria_json always `{}`), malformed-row policy, determinism, Jaipur-shaped payload → 100 rows summing to fund |

Pre-existing, unrelated failures (3) in `conflict-utils` and `martech-metrics` fail identically
with and without extraction changes — tracked in ARCHITECTURE.md §6, out of scope here.

## 4. Manual verification path

1. Enable the flag (master): `select set_brochure_import_rollout_state(true);`
2. Dashboard → "Import from brochure" → upload `test-brochures/jaipur.pdf`
3. Watch staged progress (reading → extracting → checking, 30–90s)
4. Review screen: PDF left, fields right; `aicf_rated` carries a "not found in document" badge;
   sum bar shows ₹11,50,000 = ₹11,50,000
5. Edit any field (e.g. venue), Approve → lands on `/t/:id/setup` for the new draft
6. Verify: 1 tournament (draft), 14 categories, 100 prize rows; Approve again from the review
   URL → returns the same tournament (idempotent), creates nothing new
