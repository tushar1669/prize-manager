# QA Report: Rating eligibility combinations

**Report Generated:** 2025-01-15
**Status:** ✅ VERIFIED
**QA Lead:** Backend QA
**Environment:** Local (npm)

---

## 📌 Summary
Coverage mirrors current allocator behavior for rating and unrated handling, including legacy fallbacks and veteran/age-only flows.

---

## ✅ Checklist (aligned with tests)
- ✅ **Unrated-only categories** exclude rated players, allow unrated, and skip min/max checks.【F:supabase/functions/allocatePrizes/index.ts†L773-L809】【F:tests/allocation/allocation.spec.ts†L386-L463】
- ✅ **include_unrated=true** admits unrated alongside rated bound checks; **include_unrated=false** blocks unrated even if the global rule allows them.【F:supabase/functions/allocatePrizes/index.ts†L741-L809】【F:tests/allocation/allocation.spec.ts†L468-L568】
- ✅ **Legacy fallback when include_unrated is unset**: min+max bands follow `allow_unrated_in_rating`, while max-only bands admit unrated by default.【F:supabase/functions/allocatePrizes/index.ts†L725-L775】【F:tests/allocation/allocation.spec.ts†L571-L644】
- ✅ **Age-only / veteran categories**: without rating bounds, rating is ignored for both rated and unrated; when paired with `unrated_only`, age must match and unrated status is required.【F:supabase/functions/allocatePrizes/index.ts†L690-L809】【F:tests/allocation/allocation.spec.ts†L424-L678】

---

## 🧪 Notes
Documentation refreshed to reflect the confirmed decision tree; allocator logic and tests remain unchanged.
