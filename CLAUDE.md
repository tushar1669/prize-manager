# Prize Manager — Project Context for Claude Code

## What this project is
Prize Manager (prize-manager.com) is a live SaaS tool for chess tournament organizers to manage prize allocation. Built with Lovable (React + Vite + TypeScript + Tailwind + shadcn/ui), backed by Supabase (Postgres, Auth, Storage, Edge Functions).

## Supabase project
- Project ID: nvjjifnzwrueutbirpde
- Region: ap-south-1 (Mumbai)
- Database: Postgres 17

## Architecture
- Frontend: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- Backend: Supabase Edge Functions (Deno/TypeScript)
- Auth: Supabase Auth (email/password)
- Storage: Supabase Storage
- Hosting: Lovable (preview) + custom domain

## Current work: Extraction Engine (Gate 2 — feature integration)
Gate 1 (engine validation) is complete: `/extract` runs two-pass Gemini extraction with a
deterministic trust layer, validated end-to-end on the Jaipur reference brochure (14 categories,
sum ₹11,50,000 exact, clean grounding audit). See `docs/extraction-engine/TESTING.md` for the
validation record, including the Delhi pdf-mode RECITATION limitation.

Gate 2 (this branch) builds the user path on top of it:
1. "Import from brochure" on the Dashboard (behind the `brochure_import` platform flag, default off)
2. Upload → `extraction-uploads/{uid}/` → `extraction_documents` row → `/extract` with session JWT
3. Review screen at `/import/brochure/:extractionId` — side-by-side PDF + editable fields, flags shown
4. Approve → `/commit-extraction` → `commit_extraction_transaction` RPC writes
   tournaments + categories + prizes in one transaction, idempotent via `linked_tournament_id`

### Extraction tables (in Supabase, captured in migrations):
- extraction_schemas — versioned JSON schemas per doc_type; **v3 active** (city criteria,
  rank_from/rank_to grouped ranks, event_code)
- extraction_documents — uploaded files with OCR text
- extractions — extracted payloads with grounding evidence and flags
- extraction_review_queue — view for human review UI

### Categories are committed STRUCTURE ONLY:
Brochure-committed categories carry name, is_main, order_idx and prize rows; `criteria_json` is
always `{}`, same as the manual creation flow. The extraction payload may carry criteria
(`age_min`/`state`/`gender:"female"`) for accuracy and review display, but they are never
written to the categories table — eligibility rules are configured by the organizer in the app.

## Do Not Touch
The allocation engine (allocations, rule_config, conflicts, the allocation algorithm, and
player-to-prize matching logic) must NEVER be read-modified or written to by any
extraction/brochure feature, and must not be touched by any future work unless the user
explicitly names it. The brochure feature writes ONLY to tournaments, categories, and prizes.

### Key design principles:
- "The model proposes, the document decides" — every extracted value must be grounded in OCR text
- Normalization-aware grounding (handles ₹1,00,000 vs 100000, date formats)
- Arithmetic cross-checks (prize breakdown must sum to total fund)
- Privacy routing: public docs → cloud API, sensitive docs → local processing

## Code conventions
- TypeScript strict mode
- Supabase client via @supabase/supabase-js
- Edge Functions use Deno runtime
- Use existing shadcn/ui components from the project
- All database access through RLS-enabled policies
