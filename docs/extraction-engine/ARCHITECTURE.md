# Architecture — Brochure Extraction Engine

**Status:** Accepted — deployed (engine), in build (app integration)
**Date:** July 2026
**Deciders:** Tushar (owner), Claude (architecture), Claude Code Opus (implementation review)
**Repo location:** `docs/extraction-engine/ARCHITECTURE.md`

---

## 1. System Overview

One engine, many faces. The extraction engine ingests a document, transcribes it, extracts typed JSON against a versioned schema, verifies every value against the source, and routes the result to auto-ok or human review. Prize Manager's brochure import is the first face; the engine is deliberately generic (doc_type-driven) so invoices, statements, and photos can be added without rearchitecting.

```
 Organizer (browser, Lovable app)
        │ 1. upload PDF/image
        ▼
 Supabase Storage: extraction-uploads/{auth.uid()}/...     [RLS: own-folder only]
        │ 2. insert row
        ▼
 extraction_documents (status=pending, privacy_class, doc_type)
        │ 3. POST /functions/v1/extract {document_id}   [verify_jwt=true]
        ▼
 ┌──────────────────── /extract Edge Function (Deno) ────────────────────┐
 │ 4. download file, SHA-256, dedupe check                               │
 │ 5. PASS 1  Gemini 2.5 Flash → full plain-text transcription           │
 │            → extraction_documents.ocr_text / ocr_markdown             │
 │ 6. PASS 2  Gemini 2.5 Flash + active schema (structured output)       │
 │            → candidate payload JSON                                   │
 │ 7. TRUST LAYER (pure TS, unit-tested)                                 │
 │    grounding.ts  — normalization-aware value↔text verification        │
 │    trustCheck.ts — arithmetic invariants, flag assembly, status gate  │
 │ 8. write extractions row (payload, grounding, field_flags,            │
 │    confidence, tokens, status: auto_ok | needs_review | error)        │
 └───────────────────────────────────────────────────────────────────────┘
        │ 9. review UI (extraction_review_queue view)
        ▼
 Organizer approves (may edit fields first)
        │ 10. POST /functions/v1/commit-extraction {extraction_id}
        ▼
 tournaments + categories(criteria_json) + prizes   [transactional, idempotent]
        └─ extractions.linked_tournament_id set, status='approved'
```

## 2. Components

| Component | Location | Purpose |
|---|---|---|
| `extraction-uploads` bucket | Supabase Storage | Originals; 10MB cap; MIME allowlist; per-user folder RLS |
| `extraction_schemas` | Postgres | Versioned JSON Schema registry per `doc_type`; one active version; **v2 active** (adds `state`, `age_min` criteria) |
| `extraction_documents` | Postgres | File metadata, SHA-256, `privacy_class`, OCR text, provider, status |
| `extractions` | Postgres | Payload, per-field grounding evidence, `field_flags`, confidence, model + token telemetry, review audit fields, `linked_tournament_id` |
| `extraction_review_queue` | Postgres view | Feed for the review UI (`needs_review`/`pending`, flag counts) |
| `/extract` | Edge Function (Deno) | Orchestrates steps 4–8; files: `index.ts`, `grounding.ts`, `trustCheck.ts`, `responseSchema.ts` |
| `/commit-extraction` (Gate 2) | Edge Function | Payload → production tables; ownership check; transaction; idempotent |
| Trust-layer tests | `tests/extraction-grounding.spec.ts` | 24 unit tests over grounding + arithmetic logic |

## 3. The Trust Layer (core design)

**Principle: the model proposes, the document decides.** LLMs given an "invoice-shaped task" on messy input will complete the form with invented values; better prompts and bigger models do not fix this. Only deterministic post-generation verification does.

- **Grounding methods** (`grounding.ts`): `numeric` (normalizes Indian grouping — ₹1,00,000 ≡ 100000 — and matches token sets, so `100` cannot ground inside `1000`), `date` (multi-format), `string`, `digits` (phones/codes), `keyword` (booleans like `fide_rated` via pattern e.g. `/fide[\s-]*rat/i`), `exempt` (structural fields: `is_main`, `currency`, `criteria.gender:"any"`, all-false booleans).
- **Ungrounded vs absent:** a value the model produced that is *not* in the transcript is blanked and flagged `ungrounded` (hallucination caught); a field genuinely missing from the document is `null` with **no** flag. This distinction keeps auto_ok reachable for honest documents.
- **Arithmetic invariants** (`trustCheck.ts`): Σ all `cash_amount` must equal `total_prize_fund` within `SUM_TOLERANCE_INR = 100`; grouped ranks ("11 to 15" at ₹6,500) expand before summing; trophy-only cells contribute 0 cash but real prize rows. Reference ground truth: Jaipur ₹11,50,000 (exact, 100 cash prizes, 14 categories), Delhi ₹8,50,000 (exact, 18 categories incl. trophy-only Academy/School, Veteran column with only 3 cash ranks).
- **Status gate:** `auto_ok` ⇔ all required fields grounded ∧ |Σ − fund| ≤ 100 ∧ flags = ∅. Anything else `needs_review`; exceptions → `error` + message. Nothing auto-commits to production regardless of status (human Approve required — see PRD F9).

## 4. Decision Log (ADR summaries)

**D1 — Extraction model: Gemini 2.5 Flash free tier (Accepted).**
Options: (A) Gemini 2.5 Flash free — ₹0, multimodal, native structured output, free-tier data may train Google models → acceptable **only** for `privacy_class='public'`; (B) Mistral OCR + LLM — ~₹0.1/page, stronger pure OCR, two vendors; (C) local Docling — private, heavy setup, weakest on designed posters.
Decision: A for the public lane (brochures are published documents); B is the planned upgrade path; C/Stirling-PDF reserved for the future sensitive lane. Consequence: free-tier rate limits are volatile (≈10 RPM class) — fine for interactive single-document flows, revisit for batch.

**D2 — Two-pass over single-pass (Accepted).**
Single-pass (image → JSON) is cheaper but leaves nothing independent to verify against — grounding would compare the model to itself. Two-pass yields a transcript that serves as verification substrate, review-UI evidence, and future embedding input. Cost: ~2× tokens per document (~₹0 on free tier). Trade accepted.

**D3 — Schema registry v2 (Accepted).**
v1 criteria lacked `state` and `age_min`, making "Best Rajasthan" and "Veteran 55+" unrepresentable — and structured output would have *silently dropped* them (schema-constrained decoding discards non-conforming content; a data-loss class of bug, not an error class). v2 seeded additively; v1 deactivated, retained. Rule: schema changes are always new versions, never in-place edits, because `extractions.schema_id` must remain interpretable historically.

**D4 — Sum tolerance ₹100 (Accepted, tunable).** Absorbs OCR digit noise on small amounts while catching real omissions (a missed ₹4,500 cell breaches it). Constant lives in `trustCheck.ts`; eval harness may revise. Guardrail: never widened to force a pass.

**D5 — CLI is the canonical deploy path (Accepted).** MCP inline deploy worked but re-flowed comments (checksum drift a5168e83… → 6e3443d1…); `supabase functions deploy extract` from the repo is byte-exact and reproducible. MCP deploys reserved for emergencies.

**D6 — verify_jwt = true (Accepted).** Gateway rejects unauthenticated calls before code runs (confirmed: 401 `UNAUTHORIZED_NO_AUTH_HEADER` without bearer). Clients call with the user session token; server-side testing uses project keys. `commit-extraction` additionally checks row ownership (`uploaded_by = auth.uid()`), since JWT validity ≠ authorization for a specific document.

## 5. Security & Privacy

- RLS on all extraction tables (own-rows for users; service-role full access inside functions only). Storage policy requires first path segment = `auth.uid()`.
- Secrets (`GEMINI_API_KEY`) live in Supabase Edge Function secrets; never in repo, client, or logs.
- `privacy_class` is stamped at ingestion and routes the lane: `public` → cloud models permitted; `sensitive` → (future) local lane only; free-tier cloud is **prohibited** for sensitive documents because free-tier inputs may be used for model training.
- Production tables are written by exactly one path (`commit-extraction`), on explicit user action, transactionally, idempotently.

## 6. Known Debt & Follow-ups

1. **Migrations drift (high, scheduled for Gate 2):** extraction tables/policies/bucket exist in the live DB but not in `supabase/migrations/` — a fresh environment cannot rebuild. Fix: `supabase db diff` capture on the feature branch.
2. **Grounding exemption list is implementation judgment** (Opus's defaults, documented in D1 code comments) — validate against 20-brochure eval before GA.
3. **`geminiProvider.ts` lives under `parseBrochurePrizesV2/`** but is imported by two functions; belongs in `_shared/`. Deferred: moving it forces a live-function redeploy; do during Gate 2 with tests green.
4. **Pre-existing unrelated test failures (3)** in `conflict-utils` and `martech-metrics` — fail identically without extraction changes; tracked, out of scope.

## 7. Phase-2 Architecture Notes (design-for, don't build)

- **MCP server** on the same Edge Functions runtime exposing `extract_document`, `get_extraction`, `query_documents` — turns the engine into an agent-callable tool (Claude, n8n, Cursor) with the same RLS + JWT model.
- **doc_type expansion**: adding `invoice` = new schema version + new criteria/invariants module (e.g., line-items × price = total) + zero changes to orchestration.
- **Semantic layer**: pgvector embeddings over `ocr_text` for cross-document search ("which tournaments offered Under-8 cash prizes in Rajasthan?").
- **Sensitive lane**: n8n-orchestrated local processing (Docling or Stirling-PDF OCR) writing to the same tables with `ocr_provider='local'`.
