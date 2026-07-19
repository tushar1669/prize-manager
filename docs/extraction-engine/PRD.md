# PRD — Brochure Extraction Engine

**Product:** Prize Manager (prize-manager.com) — first face of the Universal Extraction Engine
**Status:** Approved — in build
**Owner:** Tushar (Product/Eng), Claude (architecture & QA support)
**Version:** 1.0 — July 2026
**Repo location:** `docs/extraction-engine/PRD.md`

---

## Problem Statement

Chess tournament organizers publish event and prize details in designed PDF/image brochures. To use Prize Manager, an organizer today re-keys everything by hand: tournament details, every prize category, its eligibility criteria, and every prize row. Across the live database this is already 74 tournaments, 526 categories, and 3,262 prizes of manual entry. Re-keying takes 30–60 minutes per tournament, introduces transcription errors that surface at the worst moment (prize distribution), and is the single largest onboarding barrier for new organizers.

The cost of not solving it: slower organizer adoption, error-prone prize data feeding the allocation engine, and no path to the larger product vision (a universal document extraction engine with invoice, statement, and photo faces).

## Goals

1. **Reduce tournament setup time from ~45 minutes to under 5 minutes** for brochure-based tournaments (upload → review → approve).
2. **Zero hallucinated values ever committed** to production tables — every committed field is verifiably grounded in the source document.
3. **≥95% field-level accuracy** on extractions that pass the auto-ok gate, measured against hand-labeled ground truth.
4. **≥60% of test brochures reach auto_ok** without any human field correction (stretch: 80%).
5. **Prove the engine as a reusable core** — the same `/extract` pipeline must work unchanged when a second document type (invoice) is added later.

## Non-Goals (v1)

- **No invoice / bank statement / photo support.** The schema registry is versioned per `doc_type` to allow this later, but v1 ships chess brochures only. (Separate phase; sensitive documents also require the local privacy lane.)
- **No automatic commit without human review.** Even `auto_ok` extractions require an explicit Approve click before touching `tournaments`/`categories`/`prizes`. Trust is earned with data, not assumed.
- **No editing of the source PDF.** This is extraction, not document manipulation (Stirling-PDF class tools are out of scope).
- **No batch/multi-brochure upload.** One brochure → one tournament per flow in v1; batch is a P2.
- **No public API or MCP server in v1.** That is the standalone-product phase (P2, designed-for but not built).

## User Stories

- As a **tournament organizer**, I want to upload my brochure PDF when creating a tournament so that the event details, categories, and prize structure fill themselves in.
- As a **tournament organizer**, I want to see exactly which extracted fields the system is unsure about so that I only verify what needs verifying instead of proofreading everything.
- As a **tournament organizer**, I want the stated prize fund cross-checked against the itemized prize sum so that brochure typos are caught before players see wrong amounts.
- As a **tournament organizer**, I want to correct any extracted field before approving so that a bad OCR read never becomes bad tournament data.
- As a **tournament organizer**, I want a clear error message if my brochure can't be processed so that I can fall back to manual entry without losing work.
- As the **platform owner**, I want every extraction stored with its grounding evidence and model metadata so that failures can be audited and the trust layer tuned.

## Requirements

### Must-Have (P0)

**F1 — Upload path.** New Tournament flow offers "Import from brochure"; accepts PDF/JPEG/PNG/WebP/HEIC up to 10MB; stores to `extraction-uploads` bucket under the user's folder (RLS-enforced); creates an `extraction_documents` row.
*Acceptance:* Given a logged-in organizer, when they upload a valid brochure, then a document row exists with `status='pending'` and the file is retrievable via signed URL. Invalid type/size shows a clear error and no row is created.

**F2 — Two-pass extraction.** `/extract` Edge Function: Pass 1 transcribes the full document text (stored as `ocr_text`); Pass 2 extracts structured JSON against the active `extraction_schemas` version using constrained structured output.
*Acceptance:* Given a processed brochure, then `ocr_text` length > 500 chars and `extractions.payload` validates against the active schema.

**F3 — Machine-readable criteria.** Every prize category emits typed criteria mappable to `categories.criteria_json`: `age_max` (Under-16), `age_min` (Veteran 55+), `rating_min`/`rating_max` (1401–1650), `gender` (Best Female), `state` (Best Rajasthan).
*Acceptance:* Given the two reference brochures, then 100% of their categories carry non-empty structured criteria (or an explicit `criteria: {}` for open categories) — no category is silently dropped.

**F4 — Trust check (grounding).** Every extracted value is verified against Pass-1 text with normalization (Indian digit grouping ₹1,00,000 ≡ 100000; date formats). Ungrounded → blanked + flagged `ungrounded`; genuinely-absent → null, no flag. Structural fields (`is_main`, booleans, currency) are exempt by documented rule.
*Acceptance:* Given a payload value not present in `ocr_text`, then it is null in the payload and listed in `field_flags` — it never survives to review as a confident value.

**F5 — Arithmetic check.** Sum of all extracted `cash_amount`s compared to stated `total_prize_fund`; mismatch beyond ₹100 tolerance → high-severity `sum_mismatch` flag with both numbers.
*Acceptance:* Given the Jaipur reference brochure (fund ₹11,50,000; itemized sum equals it exactly), then no sum flag. Given any brochure whose itemized sum differs from the stated fund by > ₹100, then `sum_mismatch` is flagged with `expected` and `stated`.

**F6 — Status gate.** `auto_ok` only when: all required fields grounded AND arithmetic within tolerance AND zero flags. Otherwise `needs_review`. Technical failure → `error` + message.
*Acceptance:* Each terminal state is reachable and visible in `extraction_review_queue`.

**F7 — Review screen.** Side-by-side document preview (signed URL) and editable extracted-field form; flagged fields visually distinct with reason; stated vs computed totals displayed; Approve / Discard actions.
*Acceptance:* Given `needs_review`, when the organizer edits a flagged field and approves, then the edited value (not the original) is committed.

**F8 — Commit path.** New `commit-extraction` Edge Function (JWT-verified, ownership-checked): maps payload → `tournaments` + `categories` (+`criteria_json`) + `prizes` transactionally; expands grouped ranks ("11 to 15" → five prize rows); handles trophy-only prizes (cash 0, `has_trophy` true); idempotent (refuses if `linked_tournament_id` already set); sets `extractions.status='approved'` and links the tournament.
*Acceptance:* Approving the Jaipur brochure creates 1 tournament, 14 categories, and 100 cash-prize rows matching the brochure; approving twice creates nothing new and returns the existing tournament.

**F9 — No silent production writes.** The client never writes `tournaments`/`categories`/`prizes` directly for this flow; only `commit-extraction` does, only on explicit Approve.

### Nice-to-Have (P1)

- **Processing progress states** (uploading → reading → extracting → checking) instead of a single spinner; extraction takes 30–90s.
- **Confidence display** per field, not just flags.
- **Re-run extraction** button after schema/prompt updates without re-uploading.
- **Eval harness**: script that runs N labeled brochures and outputs the accuracy scorecard (field accuracy, grounding rate, false-blank rate, auto_ok rate, cost, latency).

### Future Considerations (P2 — design for, don't build)

- **Second doc_type (invoice)** to prove engine generality; schema registry already versioned per type.
- **Privacy local lane** for `privacy_class='sensitive'` documents (bank statements) via local processing (Docling / Stirling-PDF); public lane may use free-tier cloud models, sensitive lane must not.
- **Standalone product surface**: REST API keys + MCP server (`extract_document`, `get_extraction`, `query_documents`) hosted on Edge Functions; multi-tenant metering.
- **Batch upload; embeddings/pgvector semantic search** over extracted corpus.

## Success Metrics

**Leading (first 2 weeks):** time-to-approved-tournament (target < 5 min median); auto_ok rate (target ≥ 60%); extraction error rate (target < 5% technical failures); fields corrected per review (target ≤ 3).
**Lagging (first quarter):** % of new tournaments created via brochure import (target ≥ 50%); committed-field defect reports from organizers (target: 0 hallucinations, < 1% any-cause); organizer setup NPS movement.
**Measurement:** `extractions` table metadata (status, flags, tokens, duration) + `import_logs`-style audit; evaluated at 2 weeks and 8 weeks post-launch.

## Open Questions

- **(Data, non-blocking)** Auto_ok threshold tuning: are the current grounding exemptions (`is_main`, booleans, `gender:"any"`) correct once 20+ real brochures are run? Owner: Tushar with eval harness.
- **(Engineering, non-blocking)** Multi-page poster brochures with prize tables as low-quality photos — does Pass 1 need per-page tiling? Decide after validation run.
- **(Product, non-blocking)** Should approved-but-edited fields feed back as few-shot examples for prompt improvement? Privacy is fine (public docs); effort/benefit TBD.

## Timeline & Phasing

- **Gate 1 — Engine validation (now):** two reference brochures end-to-end through deployed `/extract`; honest verdict vs ground truth. Exit: sums match stated funds, category counts match (Jaipur 14 / Delhi 18), zero ungrounded values in payloads.
- **Gate 2 — Feature integration (next session):** F1, F7, F8 built on branch → PR → merge → Lovable publish. Exit: real tournament created from each reference brochure in production by the owner.
- **Beta (week 1–2):** owner-only usage across new VCA tournaments; eval harness (P1) built; thresholds tuned.
- **GA (after ≥95% accuracy on 20-brochure eval):** feature visible to all organizers.
- **Phase 2 (separate PRD):** invoice doc_type + standalone API/MCP product.
