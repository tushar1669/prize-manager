import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const ignoreDirs = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.github',
  '.next',
  '.vercel',
  'playwright-report',
]);
const ignoreFiles = new Set(['package-lock.json']);
const ignorePaths = new Set([
  'package.json',
  'scripts/assert-no-csv.mjs',
  'scripts/assert-no-csv.test.mjs',
  'docs/OPERATIONS_RELEASE_TESTING.md',
]);
// Exact, line-number-pinned, pre-existing NON-FUNCTIONAL occurrences only.
// Keep these visible: adding a new reference, copying a line, or editing one
// of these lines must fail the guard. Do not whitelist directories or files.
// docs/extraction-engine/PHASE2_PRD.md is a conflicting *planned* export,
// NOT an authorization to add import/export support. Locked V2 rule wins.
const knownInertBaselineHits = [
  ["bun.lock", { lineNumber: 394, line: "    \"@swc/core-darwin-x64\": [\"@swc/core-darwin-x64@1.13.2\", \"\", { \"os\": \"darwin\", \"cpu\": \"x64\" }, \"sha512-Lb9EZi7X2XDAVmuUlBm2UvVAgSCbD3qKqDCxSI4jEOddzVOpNCnyZ/xEampdngUIyDDhhJLYU9duC+Mcsv5Y+A==\"]," }],
  ["docs/DEPLOY_AND_PUBLISH.md", { lineNumber: 16, line: "CI also runs `test:swiss`, `test:alloc`, `test:ux`, and `assert:no-csv` (`.github/workflows/ci.yml`, `package.json`)." }],
  ["docs/PRD_V2.md", { lineNumber: 43, line: "- NO CSV anywhere (import/export)" }],
  ["docs/PRD_V2_1_CONTEXT_LOCKED.md", { lineNumber: 144, line: "### 8.1 NO CSV anywhere" }],
  ["docs/PRD_V2_1_CONTEXT_LOCKED.md", { lineNumber: 331, line: "- no CSV support" }],
  ["docs/PRD_V2_1_CONTEXT_LOCKED.md", { lineNumber: 419, line: "- whether CSV is supported" }],
  ["docs/extraction-engine/PHASE2_PRD.md", { lineNumber: 115, line: "- Bank statement upload → UTR matching → confirmed/missing/unmatched report with CSV export." }],
  ["src/utils/excel.ts", { lineNumber: 476, line: "    ['Use only .xlsx or .xls files. CSV is not supported.']," }],
];

const isKnownInertBaselineHit = (file, lineNumber, line) =>
  knownInertBaselineHits.some(
    ([pinnedFile, pinned]) =>
      pinnedFile === file && pinned.lineNumber === lineNumber && pinned.line === line
  );

const csvFiles = [];
const csvMatches = [];
const decoder = new TextDecoder('utf-8', { fatal: true });

const toRelative = (filePath) =>
  path.relative(rootDir, filePath).split(path.sep).join('/');

const shouldIgnoreDir = (dirPath, dirName) => {
  if (ignoreDirs.has(dirName)) {
    return true;
  }
  const relativeDir = toRelative(dirPath);
  if (relativeDir === 'supabase' && dirName === '.temp') {
    return true;
  }
  return false;
};

const shouldIgnoreFile = (filePath, fileName) => {
  if (ignoreFiles.has(fileName)) {
    return true;
  }
  return ignorePaths.has(toRelative(filePath));
};

const scanFile = async (filePath) => {
  if (path.extname(filePath).toLowerCase() === '.csv') {
    csvFiles.push(toRelative(filePath));
    return;
  }

  let contents;
  try {
    const buffer = await fs.readFile(filePath);
    contents = decoder.decode(buffer);
  } catch {
    return;
  }

  const lines = contents.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/csv/i.test(line) && !isKnownInertBaselineHit(toRelative(filePath), index + 1, line)) {
      csvMatches.push({
        file: toRelative(filePath),
        lineNumber: index + 1,
        line,
      });
      break;
    }
  }
};

const walkDir = async (dirPath) => {
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (shouldIgnoreDir(dirPath, entry.name)) {
        continue;
      }
      await walkDir(entryPath);
    } else if (entry.isFile()) {
      if (shouldIgnoreFile(entryPath, entry.name)) {
        continue;
      }
      await scanFile(entryPath);
    }
  }
};

await walkDir(rootDir);

if (csvFiles.length > 0) {
  console.error('CSV files are not allowed:');
  for (const file of csvFiles) {
    console.error(`- ${file}`);
  }
}

if (csvMatches.length > 0) {
  console.error('Found "csv" text in files:');
  for (const match of csvMatches) {
    const snippet = match.line.trim();
    console.error(`${match.file}:${match.lineNumber}: ${snippet}`);
  }
}

if (csvFiles.length > 0 || csvMatches.length > 0) {
  process.exit(1);
}

console.log('No "csv" files or references found.');
