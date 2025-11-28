# QA Report: Rating eligibility defaults (allowUnrated fallback)

**Report Generated:** 2025-01-15
**Status:** ✅ **VERIFIED**
**QA Lead:** Backend QA
**Environment:** Local (npm)

---

## 📌 Summary
A regression concern around unrated handling has been retested after the new `allowUnrated` fallback logic. Behaviour now matches the intended decision tree:
- `criteria_json.include_unrated` still controls unrated explicitly (`true` allows, `false` blocks).【F:supabase/functions/allocatePrizes/index.ts†L741-L758】
- When `include_unrated` is **unset**, unrated admission falls back to `rules.allow_unrated_in_rating` **or** a max-only band (has `max_rating` without `min_rating`).【F:supabase/functions/allocatePrizes/index.ts†L727-L758】
- `criteria_json.unrated_only` overrides the above by forcing unrated-only behaviour and skipping min/max checks.【F:supabase/functions/allocatePrizes/index.ts†L720-L809】

---

## ✅ Checklist (all green)
- ✅ **Unset `include_unrated` uses legacy fallback** (rule flag or max-only) instead of defaulting to true.【F:supabase/functions/allocatePrizes/index.ts†L727-L758】
- ✅ **Explicit include**: `include_unrated: true` allows unrated alongside rated checks.【F:supabase/functions/allocatePrizes/index.ts†L741-L809】
- ✅ **Explicit exclude**: `include_unrated: false` blocks unrated; rated players still validated against min/max.【F:supabase/functions/allocatePrizes/index.ts†L741-L809】
- ✅ **Unrated-only categories**: `unrated_only: true` ignores min/max, rejects rated players, and allows unrated.【F:supabase/functions/allocatePrizes/index.ts†L720-L809】
- ✅ **Non-rating categories**: Absence of rating bounds and `unrated_only` skips rating logic entirely; age/gender/etc. continue to apply.【F:supabase/functions/allocatePrizes/index.ts†L690-L809】

---

## 🧪 Notes
No allocator code changes were required; documentation was updated to mirror the confirmed behaviour. No outstanding warnings remain for `include_unrated` defaults.
