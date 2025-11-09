# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/ee2c255e-4041-44cb-8cca-2353ed6c5c8d

## Documentation

- [Prize Allocation Algorithm Specification](./docs/allocator/README.md) — Technical specification for the prize allocation engine
- [Organizer Guide: How Prizes Are Decided](./docs/allocator/organizer-guide.md) — Plain-English guide for tournament organizers
- [State Code Auto-Extraction](./docs/import-state-extraction.md) — Automatic extraction of state codes from Swiss-Manager Ident column

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/ee2c255e-4041-44cb-8cca-2353ed6c5c8d) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/ee2c255e-4041-44cb-8cca-2353ed6c5c8d) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Testing

This project includes comprehensive Playwright integration tests to ensure reliability.

### Running Tests

```bash
# Run all tests
npm run test

# Run specific test suite
npm run test tests/allocator-null-safety.spec.ts

# Run tests in UI mode (interactive)
npm run test:ui

# Run tests in headed mode (see browser)
npm run test -- --headed
```

### Test Suites

**Import & Data Quality:**
- `import-swiss-manager.spec.ts` - Swiss-Manager Excel import validation
- `import-dedup.spec.ts` - Duplicate detection and fuzzy matching
- `import-conflicts.spec.ts` - Conflict review and resolution
- `import-error-xlsx.spec.ts` - Error export validation
- `import-logs.spec.ts` - Import history tracking
- `import-server-fallback.spec.ts` - Large file server-side parsing

**Allocator Engine:**
- `allocate-flow.spec.ts` - End-to-end allocation workflow
- `allocator-tie-break.spec.ts` - Deterministic tie-breaking rules
- `allocator-null-safety.spec.ts` - **Missing optional field handling**
- `category-rules.spec.ts` - Category eligibility rules
- `main-prizes.spec.ts` - Main prize priority logic

**Export & Publish:**
- `export-print.spec.ts` - PDF/Excel generation and printing

### Null-Safety Tests

The `allocator-null-safety.spec.ts` suite verifies graceful handling of missing data:

- ✅ Missing gender when category requires it → `gender_missing` reason code
- ✅ Missing DOB when category has age rules → `dob_missing` reason code
- ✅ Missing rating in rating categories → `unrated_excluded` reason code
- ✅ Missing state/city/club filters → `state_excluded`, `city_excluded`, `club_excluded`
- ✅ Multiple missing fields → multiple reason codes, no crashes
- ✅ Null vs empty string vs undefined handling

**Critical guarantee:** The allocator never crashes on missing optional fields. It gracefully excludes ineligible players and provides actionable reason codes.

## Environment configuration

Add these flags to your local `.env` file as needed:

- `PUBLIC_DOB_MASKING=true` keeps public exports masked to the `yyyy-mm` format.
- `VITE_ENABLE_REACT_PDF=false` leaves the experimental React-PDF export disabled (recommended default). Set to `true` only when the `@react-pdf/renderer` package is installed locally and you want to try the beta export.

## Code Quality & Verification

### CSV Purge Verification

This project enforces **Excel-only** (`.xlsx` and `.xls`) for all imports and exports. CSV is completely banned.

**Run verification:**
```bash
node scripts/assert-no-csv.js
```

**Expected output:**
```
✅ CSV purge verification PASSED. No CSV references found.
```

**To integrate into build pipeline** (optional), manually add to `package.json`:
```json
"scripts": {
  "verify:no-csv": "node scripts/assert-no-csv.js",
  "build": "npm run verify:no-csv && vite build"
}
```

See [CSV Purge Verification Report](./docs/csv-purge-verification.md) for complete details.
