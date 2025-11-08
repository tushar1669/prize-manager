#!/usr/bin/env node
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const patterns = [
  '\\.csv["\']',
  'text/csv',
  'application/csv',
  'sheet_to_csv',
  'toCSV',
  'csvStringify',
  'PapaParse',
  'papaparse',
  'downloadConflictsCsv',
  'downloadCsv',
  'CSV Export',
  'Download CSV',
  'csvHeaders'
];

const excludes = [
  'node_modules',
  '.git',
  'assert-no-csv.js',
  'dist',
  'build',
  '.next',
  'coverage'
];

let failed = false;

console.log('🔍 Searching for CSV references...\n');

for (const pattern of patterns) {
  try {
    const excludeArgs = excludes.map(e => `--exclude-dir=${e}`).join(' ');
    const cmd = `cd "${rootDir}" && grep -r ${excludeArgs} -i "${pattern}" src/ supabase/ tests/ 2>/dev/null || true`;
    const result = execSync(cmd, { encoding: 'utf8' });
    
    if (result.trim()) {
      console.error(`❌ Found CSV reference: "${pattern}"`);
      console.error(result);
      failed = true;
    }
  } catch (err) {
    // grep returns non-zero if no match, which is what we want
  }
}

if (failed) {
  console.error('\n❌ CSV purge verification FAILED. Remove all CSV references.');
  process.exit(1);
} else {
  console.log('✅ CSV purge verification PASSED. No CSV references found.');
  process.exit(0);
}
