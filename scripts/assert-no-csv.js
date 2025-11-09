#!/usr/bin/env node
/**
 * Fails if any CSV import/export usage leaks into runtime or tests.
 * Allowed: docs/**, QA_REPORT.md, explicit rejection copy in parser.
 */
import fs from 'node:fs';
import path from 'node:path';

const roots = ['src', 'app', 'tests', 'public'];
const allowPaths = [
  /^docs\//,
  /^QA_REPORT\.md$/,
];
const allowSubstrings = [
  // Explicit rejection copy in parser is allowed:
  'CSV files are not supported',
];

const isBinary = (p) => /\.(png|jpg|jpeg|gif|webp|ico|pdf|woff2?|ttf|eot|mp4|mov|zip)$/i.test(p);

const findings = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const fp = path.join(dir, entry);
    const rel = fp.replace(/^\.\/?/, '');
    const stat = fs.statSync(fp);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'playwright-report') continue;
      walk(fp);
    } else {
      if (isBinary(fp)) continue;

      // filename ban
      if (/\.csv$/i.test(fp)) {
        // allowlist by path?
        if (!allowPaths.some(rx => rx.test(rel))) {
          findings.push({ rel, why: 'filename .csv' });
          continue;
        }
      }

      // content scan
      const text = fs.readFileSync(fp, 'utf8');
      const hit = /(text\/csv|\.csv\b|accept=.*csv)/i.test(text);
      if (hit) {
        // allowlist checks
        if (allowPaths.some(rx => rx.test(rel))) continue;
        if (allowSubstrings.some(s => text.includes(s))) continue;

        findings.push({ rel, why: 'content mentions csv/text/csv' });
      }
    }
  }
}

for (const r of roots) {
  if (fs.existsSync(r)) walk(r);
}

if (findings.length) {
  console.error('❌ CSV guard failed. Found forbidden CSV references:\n');
  findings.forEach((f) => console.error(`- ${f.rel}  [${f.why}]`));
  process.exit(1);
}
console.log('✅ CSV purge verification PASSED. No CSV references.');
