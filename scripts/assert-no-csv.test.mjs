import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const guard = fileURLToPath(new URL('./assert-no-csv.mjs', import.meta.url));

function check(files) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pm-guard-'));
  try {
    for (const [relativePath, contents] of Object.entries(files)) {
      const absolute = path.join(root, relativePath);
      mkdirSync(path.dirname(absolute), { recursive: true });
      writeFileSync(absolute, contents);
    }
    const result = spawnSync(process.execPath, [guard], {
      cwd: root,
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(result.error, undefined);
    return { code: result.status, output: result.stdout + result.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const policyLine = "- NO CSV anywhere (import/export)";
const pinnedDocument = Array(42).fill('').concat(policyLine).join('\n');

test('ordinary source without prohibited references passes', () => {
  assert.equal(check({ 'src/example.ts': 'export const safe = true;' }).code, 0);
});

test('unchanged, exactly pinned policy statement is not a product feature', () => {
  assert.equal(check({ 'docs/PRD_V2.md': pinnedDocument }).code, 0);
});

test('new .csv files are always rejected', () => {
  const result = check({ 'fixtures/export.csv': 'a,b\n1,2' });
  assert.equal(result.code, 1);
  assert.match(result.output, /CSV files are not allowed/);
});

test('new source CSV import/export references are rejected', () => {
  const result = check({ 'src/upload.ts': 'export function importCSV() {}' });
  assert.equal(result.code, 1);
  assert.match(result.output, /src\/upload.ts/);
});

test('new documentation CSV references are still rejected', () => {
  const result = check({ 'docs/new-plan.md': 'New CSV export planned' });
  assert.equal(result.code, 1);
  assert.match(result.output, /docs\/new-plan.md/);
});

test('modified pinned statement is rejected', () => {
  const changed = pinnedDocument.replace(policyLine, policyLine + ' extra');
  assert.equal(check({ 'docs/PRD_V2.md': changed }).code, 1);
});

test('second occurrence next to pinned line is rejected', () => {
  const result = check({ 'docs/PRD_V2.md': pinnedDocument + '\n' + policyLine });
  assert.equal(result.code, 1);
});

test('a shifted pinned line is rejected', () => {
  const result = check({ 'docs/PRD_V2.md': '\n' + pinnedDocument });
  assert.equal(result.code, 1);
});

const contextDocumentLines = Array(419).fill('');
contextDocumentLines[143] = '### 8.1 NO CSV anywhere';
contextDocumentLines[330] = '- no CSV support';
contextDocumentLines[418] = '- whether CSV is supported';
const pinnedContextDocument = contextDocumentLines.join('\n');

test('all three original locked-PRD statements stay independently pinned', () => {
  assert.equal(check({ 'docs/PRD_V2_1_CONTEXT_LOCKED.md': pinnedContextDocument }).code, 0);
});

test('changing a secondary pinned locked-PRD statement is rejected', () => {
  const changed = pinnedContextDocument.replace('- no CSV support', '- CSV import is supported');
  assert.equal(check({ 'docs/PRD_V2_1_CONTEXT_LOCKED.md': changed }).code, 1);
});

test('shifting a later pinned locked-PRD statement is rejected', () => {
  const shifted = pinnedContextDocument.replace('- whether CSV is supported', '\n- whether CSV is supported');
  assert.equal(check({ 'docs/PRD_V2_1_CONTEXT_LOCKED.md': shifted }).code, 1);
});
