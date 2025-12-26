import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const ignoreDirs = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.git',
  'coverage',
  'playwright-report',
]);
const ignoreFiles = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'npm-shrinkwrap.json',
]);
const ignorePaths = new Set([
  '.github/workflows/ci.yml',
  'docs/OPERATIONS_RELEASE_TESTING.md',
  'package.json',
  'scripts/assert-no-csv.mjs',
]);

const matches = [];

const shouldIgnoreDir = (dirPath, dirName) => {
  if (ignoreDirs.has(dirName)) {
    return true;
  }
  const relPath = path.relative(rootDir, dirPath);
  if (relPath === 'supabase' && dirName === '.branches') {
    return true;
  }
  return false;
};

const shouldIgnoreFile = (filePath, fileName) => {
  if (ignoreFiles.has(fileName)) {
    return true;
  }
  if (fileName.endsWith('.lock')) {
    return true;
  }
  const relPath = path.relative(rootDir, filePath).replaceAll(path.sep, '/');
  return ignorePaths.has(relPath);
};

const scanFile = async (filePath) => {
  let contents;
  try {
    contents = await fs.readFile(filePath, 'utf8');
  } catch {
    return;
  }

  const lines = contents.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/csv/i.test(line)) {
      matches.push({
        file: path.relative(rootDir, filePath),
        lineNumber: index + 1,
        line,
      });
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

if (matches.length > 0) {
  for (const match of matches) {
    const snippet = match.line.trim();
    console.log(`${match.file}:${match.lineNumber}: ${snippet}`);
  }
  console.error(`Found ${matches.length} matching line(s) containing "csv".`);
  process.exit(1);
}

console.log('No "csv" references found.');
