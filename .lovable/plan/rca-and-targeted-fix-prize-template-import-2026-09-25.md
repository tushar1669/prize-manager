# RCA and Targeted Fix — Prize Template Import

## Confirmed root cause

The attached workbook contains one worksheet named **`Sheet1`** with 84 data rows and the correct v2 headers.

The v2 parser reads only a worksheet named exactly **`Prizes`**:
- `src/utils/prizeTemplateParser.ts:80-84` returns no rows when the requested sheet is absent.
- `src/utils/prizeTemplateParser.ts:263-265` requests `getSheetRows(workbook, "Prizes")`.
- With this workbook, parsing therefore produces zero categories and zero prizes without a validation error.
- `src/components/prizes/PrizeTemplateImportDialog.tsx:37-48` then disables **Apply Import** because no importable content was found and displays: **“No importable categories or prizes were found. Fix the spreadsheet and re-upload.”**

This is a sheet-name compatibility failure, not bad prize data.

## Workbook validation findings

- File type: `.xlsx` — accepted.
- Worksheet: `Sheet1` — incompatible with the parser's exact `Prizes` lookup.
- Headers: all nine expected v2 headers are present and correctly spelled.
- Rows: 84 prize rows across 21 categories.
- Boolean values: all valid (`Yes`, `yes`, `no`, or blank).
- Places: numeric and parseable.
- Duplicate category/place pairs: none.
- Cash values: numeric or blank; blanks intentionally become zero.
- Trophy/medal values: valid.
- Gift fields: blank and valid.
- `Under 7` starts at places 2 and 3. The current parser does **not** require place 1 or contiguous places, so this is not the import error; it merits a non-blocking user review only.
- Category names such as `Under 7 Girls`, `Best Female`, `Best Veteran`, and rating bands do not automatically create eligibility rules in v2. The current UI explicitly requires those rules to be configured after import. Importing the names alone is valid but does not make allocation honor the implied meaning.

## Targeted implementation

1. Update `src/utils/prizeTemplateParser.ts` so v2 parsing:
   - Preferentially reads the exact `Prizes` worksheet.
   - If `Prizes` is absent, inspects worksheets for the required v2 header signature (`Category` and `Place`).
   - Automatically uses the single unambiguous matching sheet, such as this workbook's `Sheet1`.
   - Emits a non-blocking warning naming the fallback sheet used.
   - Emits a clear blocking workbook-level error when no sheet matches.
   - Emits a clear blocking ambiguity error when multiple sheets match, rather than guessing.
   - Leaves legacy v1 detection and parsing unchanged.

2. Improve `src/components/prizes/PrizeTemplateImportDialog.tsx` only as needed to present the parser's sheet-level error/warning clearly; preserve the existing add-only apply flow.

3. Add focused tests in `tests/prize-template-parser.spec.ts` for:
   - exact `Prizes` sheet remains preferred;
   - one generic sheet with v2 headers imports successfully and warns;
   - no matching sheet returns a clear blocking error;
   - multiple matching sheets return an ambiguity error;
   - non-contiguous places such as `Under 7` places 2 and 3 remain accepted.

4. Add an uploaded-workbook regression fixture test or construct its exact relevant shape in-memory: `Sheet1`, standard v2 headers, repeated categories, blank cash cells, and mixed-case valid booleans.

## Scope boundaries

- No allocation-engine changes.
- No category-rule inference from names.
- No database, RLS, migration, storage, authentication, payment, or publication changes.
- No automatic renumbering of prizes.
- No mutation of the uploaded workbook.

## Verification

- Run the targeted prize-template parser tests.
- Run `npm run lint` and `npm run test:unit`.
- Manually upload the attached workbook in the existing **Import Prizes from Template** dialog and confirm the preview reports 21 categories and 84 prizes, with **Apply Import** enabled; do not apply it to production data during verification.
