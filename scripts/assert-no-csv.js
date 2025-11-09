#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const targets = ['src', 'app', 'public'];
const binaryPattern = /\.(png|jpe?g|gif|webp|ico|svg|woff2?|ttf|otf|mp4|mp3|webm)$/i;
const banned = /csv/i;
const violations = [];

function walk(dir) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!entry.isFile()) continue;
    if (binaryPattern.test(entry.name)) continue;

    let content;
    try {
      content = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }

    if (!banned.test(content)) continue;

    const relativePath = path.relative(rootDir, fullPath);
    const lines = content.split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (banned.test(line)) {
        violations.push({ file: relativePath, line: idx + 1, snippet: line.trim() });
      }
    });
  }
}

for (const target of targets) {
  const resolved = path.join(rootDir, target);
  if (fs.existsSync(resolved)) {
    walk(resolved);
  }
}

if (violations.length > 0) {
  console.error('❌ Found forbidden CSV references in product code:');
  violations.forEach(({ file, line, snippet }) => {
    console.error(` - ${file}:${line} → ${snippet}`);
  });
  process.exit(1);
}

console.log('✅ CSV purge assertion passed. No CSV references found.');
