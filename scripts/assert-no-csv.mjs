import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const ignoreDirs = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.next',
  '.vercel',
  'playwright-report',
]);
const ignoreFiles = new Set(['package-lock.json']);
const ignorePaths = new Set(['package.json', 'scripts/assert-no-csv.mjs']);
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
    if (/csv/i.test(line)) {
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
