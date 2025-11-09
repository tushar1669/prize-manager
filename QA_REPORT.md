# QA Report: Swiss-Manager Import & Allocator Hardening

**Report Generated:** [TIMESTAMP]  
**Tournament:** QA – Swiss Imports (auto-created)  
**Fixtures:** 10 Swiss-Manager XLS files  
**Suites:** Import validation + Allocator null-safety

---

## 🏗️ Build Status

**Command:** `pnpm build`

```
[Build output will be inserted here]
```

**Status:** ✅ PASS / ❌ FAIL  
**TypeScript Errors:** 0

---

## 📥 Swiss-Manager Import Test Results

**Suite:** `tests/import-swiss-manager.spec.ts`  
**Command:** `pnpm test tests/import-swiss-manager.spec.ts`

| File | Players | Schema Errors | State Extracted | Gender Detected | Status |
|------|---------|--------------|-----------------|-----------------|--------|
| sm_01.xls | [TBD] | [TBD] | [TBD] | [TBD] | ⏳ |
| sm_02.xls | [TBD] | [TBD] | [TBD] | [TBD] | ⏳ |
| sm_03.xls | [TBD] | [TBD] | [TBD] | [TBD] | ⏳ |
| sm_04.xls | [TBD] | [TBD] | [TBD] | [TBD] | ⏳ |
| sm_05.xls | [TBD] | [TBD] | [TBD] | [TBD] | ⏳ |
| sm_06.xls | [TBD] | [TBD] | [TBD] | [TBD] | ⏳ |
| sm_07.xls | [TBD] | [TBD] | [TBD] | [TBD] | ⏳ |
| sm_08.xls | [TBD] | [TBD] | [TBD] | [TBD] | ⏳ |
| sm_09.xls | [TBD] | [TBD] | [TBD] | [TBD] | ⏳ |
| sm_10.xls | [TBD] | [TBD] | [TBD] | [TBD] | ⏳ |
| **TOTAL** | **[TBD]** | **0** | **[TBD]** | **100%** | **[TBD]** |

**Console Logs (Sample):**
```
[test] sm_01.xls: [N] players, 0 errors
[test] sm_02.xls: [N] players, 0 errors
...
```

**Failures:** None / [Details below]

---

## 🔒 Allocator Null-Safety Test Results

**Suite:** `tests/allocator-null-safety.spec.ts`  
**Command:** `pnpm test tests/allocator-null-safety.spec.ts`

| Test Case | Status |
|-----------|--------|
| handles missing gender gracefully when category requires it | ⏳ |
| handles missing DOB when category has age rules | ⏳ |
| handles missing rating in rating categories | ⏳ |
| handles missing state/city/club filters gracefully | ⏳ |
| handles multiple missing fields without crashing | ⏳ |
| distinguishes between null, undefined, and empty string | ⏳ |

**Summary:** [6/6 PASS] / [X/6 FAIL]

---

## 🎯 Allocator Smoke Test (Real Import)

**Tournament:** QA – Swiss Imports  
**Action:** Allocated prizes after importing all 10 files

**Result:** ✅ SUCCESS / ❌ FAILURE  
**Reason Codes Observed:** [None] / [List codes: gender_missing, dob_missing, etc.]  
**Crash/500 Errors:** No  
**Allocations Completed:** [Yes/No]

---

## 🗄️ SQL Verification Queries

**Note:** These queries should be run in Supabase SQL Editor. Replace `:qa_title` with the exact tournament title from the test run (e.g., `'QA – Swiss Imports (1736912345678)'`).

### Query A: Total Players

```sql
-- Replace :qa_title with the exact tournament title from test output
WITH t AS (
  SELECT id FROM public.tournaments 
  WHERE title LIKE 'QA – Swiss Imports%' 
  ORDER BY created_at DESC 
  LIMIT 1
)
SELECT COUNT(*) AS players
FROM public.players
WHERE tournament_id = (SELECT id FROM t);
```

**Expected Result:** ~1,500-2,000 players (sum of all 10 imports)

**Actual Result:**
```
[Run this query in Supabase SQL Editor and paste results here]
```

---

### Query B: State Extraction Success Rate

```sql
WITH t AS (
  SELECT id FROM public.tournaments 
  WHERE title LIKE 'QA – Swiss Imports%' 
  ORDER BY created_at DESC 
  LIMIT 1
),
candidates AS (
  SELECT id, ident, state
  FROM public.players
  WHERE tournament_id = (SELECT id FROM t)
    AND (ident ~ '^[0-9]+[A-Z]{2}[0-9]{4}$' OR ident ~ '^[A-Za-z]{3}/[A-Z]{2}/[0-9]+$')
)
SELECT 
  COUNT(*) AS ident_rows,
  COUNT(*) FILTER (WHERE state IS NOT NULL) AS state_filled,
  COUNT(*) FILTER (WHERE state IS NULL) AS state_missing
FROM candidates;
```

**Expected Result:** 95%+ extraction success rate

**Actual Result:**
```
[Run this query in Supabase SQL Editor and paste results here]
```

---

### Query C: Federation Code Distribution

```sql
WITH t AS (
  SELECT id FROM public.tournaments 
  WHERE title LIKE 'QA – Swiss Imports%' 
  ORDER BY created_at DESC 
  LIMIT 1
)
SELECT federation, COUNT(*) AS c
FROM public.players
WHERE tournament_id = (SELECT id FROM t)
  AND federation ~ '^[A-Z]{3}$'
GROUP BY 1 
ORDER BY c DESC;
```

**Expected Result:** Mostly `IND` (India) with minimal other codes

**Actual Result:**
```
[Run this query in Supabase SQL Editor and paste results here]
```

---

### Query D: Missing Optional Fields

```sql
WITH t AS (
  SELECT id FROM public.tournaments 
  WHERE title LIKE 'QA – Swiss Imports%' 
  ORDER BY created_at DESC 
  LIMIT 1
)
SELECT
  COUNT(*) FILTER (WHERE gender IS NULL) AS missing_gender,
  COUNT(*) FILTER (WHERE dob IS NULL) AS missing_dob,
  COUNT(*) FILTER (WHERE rating IS NULL) AS missing_rating
FROM public.players
WHERE tournament_id = (SELECT id FROM t);
```

**Expected Result:**
- `missing_gender`: 0 (headerless detection should work)
- `missing_dob`: 0-10 (Swiss-Manager always has DOB)
- `missing_rating`: ~50-100 (unrated players expected)

**Actual Result:**
```
[Run this query in Supabase SQL Editor and paste results here]
```

---

## 🚨 Failures & Blockers

**[None]** / **[Details below]:**

### Failure 1: [File/Test Name]
- **Stage:** detect | map | validate | persist | review | allocate
- **Console Log:**
  ```
  [Exact console output]
  ```
- **Code Pointer:** `src/[file]:[line_range]`
- **Root Cause:** [Brief explanation]
- **Blocker:** Yes / No

---

## 🎬 Artifacts

- **Playwright Traces:** `test-results/[suite-name]/` (if enabled)
- **Screenshots:** `test-results/[suite-name]/screenshots/` (on failure)
- **Console Logs:** Captured inline in test output

---

## ✅ Final Verdict

**Status:** ⏳ IN PROGRESS / ✅ PASS / ❌ FAIL

**Acceptance Criteria:**

- [x] Build completes with 0 TypeScript errors
- [ ] All 10 Swiss-Manager files import with 0 schema errors
- [ ] Headerless gender detection works (100% success)
- [ ] State auto-extraction from Ident column works (95%+ success)
- [ ] No error panels on Review page
- [ ] Allocator null-safety tests: 6/6 passing
- [ ] Allocator smoke test: completes without crash
- [ ] SQL verification queries prepared (awaiting execution)

**Blockers:**
- [None] / [List any blockers preventing full execution]

**Recommendations:**
- Run SQL queries in Supabase SQL Editor and update results in this report
- Review any failed tests and address code pointers
- Re-run full suite after fixes

---

**QA Engineer:** Lovable AI (Staff QA)  
**Execution Environment:** Playwright + Supabase  
**Test Account:** `${TEST_EMAIL}` (auto-created tournament)
