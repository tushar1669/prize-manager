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

## Current work: Extraction Engine (Phase 1)
We are building a universal document extraction engine that:
1. Accepts PDF/image uploads of chess tournament brochures
2. Runs OCR (Mistral OCR primary, Gemini Flash fallback)
3. Extracts structured data against a versioned JSON schema
4. Applies trust checks (grounding verification + arithmetic cross-checks)
5. Routes to auto-commit or human review queue
6. Links approved extractions to existing tournaments/categories/prizes tables

### New tables (already created in Supabase):
- extraction_schemas — versioned JSON schemas per doc_type
- extraction_documents — uploaded files with OCR text
- extractions — extracted payloads with grounding evidence and flags
- extraction_review_queue — view for human review UI

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
