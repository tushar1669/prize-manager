import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guard test for docs/design/UI_CONVENTIONS.md.
 *
 * Prize Manager is permanently dark (§1): nothing ever adds a `dark` class to <html>
 * and there is no `.dark` block in src/index.css. Two consequences drive this file:
 *
 *   - every `dark:` variant is dead code — it can never match (§3);
 *   - every raw numbered-shade palette utility renders literally, painting a
 *     light-mode colour onto a near-black page (§1, §3).
 *
 * The single bounded exception is the category criteria chips (§6), which encode a
 * category rather than a status and are restricted to one exact shape.
 *
 * Where this test and the document disagree, the document wins — fix the test.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

/**
 * §6: "This exception applies to src/components/prizes/CategoryCriteriaChips.tsx only."
 * Adding a second entry must require editing this test, so that the justification
 * ("the colour must encode a category, never a status") gets discussed first.
 */
const PALETTE_EXCEPTION_FILES = ['src/components/prizes/CategoryCriteriaChips.tsx'] as const;

/** Utility prefixes that can carry a palette colour. */
const PREFIXES = [
  'bg', 'text', 'border', 'ring', 'from', 'to', 'via', 'fill', 'stroke',
  'shadow', 'decoration', 'outline', 'divide', 'placeholder', 'accent', 'caret',
].join('|');

/** Every numbered Tailwind hue. `white` / `black` are deliberately absent — see §5. */
const HUES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow',
  'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet',
  'purple', 'fuchsia', 'pink', 'rose',
].join('|');

/** Longest-first so `500` never matches as `50` followed by a stray digit. */
const SHADES = ['950', '900', '800', '700', '600', '500', '400', '300', '200', '100', '50'].join('|');

/** Shades dark enough to be invisible on the near-black page (§6). */
const DARK_SHADES = ['600', '700', '800', '900', '950'].join('|');

/** Hues permitted inside the §6 exception. */
const EXCEPTION_HUES = ['violet', 'amber', 'blue', 'pink', 'sky', 'emerald', 'orange', 'teal', 'indigo'];

/** Any raw numbered-shade palette utility, with optional `/<alpha>`. */
const paletteRe = () =>
  new RegExp(`(?<![\\w-])(?:${PREFIXES})-(?:${HUES})-(?:${SHADES})(?:\\/\\d+)?(?![\\w-])`, 'g');

/**
 * A `dark:` variant. The lookahead is "any non-whitespace" rather than "a letter"
 * because that is what actually separates a Tailwind variant from a TypeScript object
 * key: a variant never has a space after the colon, and a formatted object key always
 * does. Restricting it to letters (and `[`) silently missed shapes Tailwind permits —
 * `dark:-mt-2` (negative value) and `dark:!bg-red-500` (important modifier) — while
 * buying no extra precision.
 *
 * Known residual: an object key written without the space, `{ dark:".dark" }`, would
 * false-positive. That is the correct direction of failure for a guard — it fails loud
 * rather than letting dead code through — and Prettier inserts the space anyway.
 */
const darkVariantRe = () => /\bdark:(?=\S)/g;

/** Dark text on a dark background — the original bug (§6). */
const darkTextRe = () =>
  new RegExp(`(?<![\\w-])text-(?:${HUES})-(?:${DARK_SHADES})(?:\\/\\d+)?(?![\\w-])`, 'g');

/** The one shape §6 permits, verbatim: bg-<hue>-500/15, text-<hue>-300, border-<hue>-500/30. */
const permittedExceptionShapeRe = () => {
  const hues = EXCEPTION_HUES.join('|');
  return new RegExp(`^(?:bg-(?:${hues})-500\\/15|text-(?:${hues})-300|border-(?:${hues})-500\\/30)$`);
};

interface Violation {
  file: string;
  line: number;
  token: string;
}

/** Every .ts/.tsx file under src/, walked recursively. Only node_modules is skipped. */
function sourceFiles(dir = SRC): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function relative(file: string): string {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

/** Collects every match in every file. Never throws — the whole list is wanted in one run. */
function scan(
  pattern: () => RegExp,
  filter: (rel: string) => boolean = () => true,
): Violation[] {
  const violations: Violation[] = [];
  for (const file of sourceFiles()) {
    const rel = relative(file);
    if (!filter(rel)) continue;
    fs.readFileSync(file, 'utf8').split('\n').forEach((text, index) => {
      for (const match of text.matchAll(pattern())) {
        violations.push({ file: rel, line: index + 1, token: match[0] });
      }
    });
  }
  return violations;
}

const MAX_LISTED = 20;

/**
 * Renders `path.tsx:<line> <token>` per violation so a developer can jump straight to
 * each one. Returns '' when clean, which is what the assertions compare against.
 */
function report(headline: string, violations: Violation[]): string {
  if (violations.length === 0) return '';
  const lines = violations.slice(0, MAX_LISTED).map((v) => `  ${v.file}:${v.line} ${v.token}`);
  if (violations.length > MAX_LISTED) {
    lines.push(`  ...and ${violations.length - MAX_LISTED} more`);
  }
  return [`${headline} (${violations.length} found)`, ...lines, ''].join('\n');
}

describe('UI conventions (docs/design/UI_CONVENTIONS.md)', () => {
  it('rule 1: no `dark:` variants anywhere in src/', () => {
    const violations = scan(darkVariantRe);
    expect(
      report(
        'A `dark:` variant can never match: nothing adds a `dark` class to <html> and there '
          + 'is no `.dark` block in src/index.css (§1, §3). Delete the variant — it changes '
          + 'nothing on screen — and make sure the remaining utility is a semantic token (§2).',
        violations,
      ),
    ).toBe('');
  });

  it('rule 2: no raw numbered-shade palette utilities outside the §6 exception', () => {
    const violations = scan(paletteRe, (rel) => !PALETTE_EXCEPTION_FILES.includes(rel as never));
    expect(
      report(
        'Raw Tailwind palette utilities are tuned for a light background this app does not '
          + 'have, so they render literally on a near-black page (§1, §3). Replace with the '
          + 'semantic tokens in §2 — bg-<token>/10, text-<token>, border-<token>/30 — or the '
          + 'neutral row when the colour carries no status meaning.',
        violations,
      ),
    ).toBe('');
  });

  it('rule 3: the §6 exception file uses only the permitted chip shape', () => {
    const shape = permittedExceptionShapeRe();
    const violations = scan(paletteRe, (rel) => PALETTE_EXCEPTION_FILES.includes(rel as never))
      .filter((v) => !shape.test(v.token));
    expect(
      report(
        'The category-colour exception (§6) is restricted to exactly bg-<hue>-500/15, '
          + `text-<hue>-300 and border-<hue>-500/30, with <hue> in: ${EXCEPTION_HUES.join(', ')}. `
          + 'A different shade, a different alpha or an unlisted hue is not covered by the '
          + 'exception.',
        violations,
      ),
    ).toBe('');
  });

  it('rule 4: no dark text shades — dark-on-dark was the original bug', () => {
    const violations = scan(darkTextRe);
    expect(
      report(
        '§6: "text-<hue>-700 is forbidden — it is dark text on a dark background, which was '
          + 'the original bug." Shades 600–950 are unreadable on this page. Use text-<token> '
          + '(§2), or text-<hue>-300 inside the category-chips exception (§6).',
        violations,
      ),
    ).toBe('');
  });

  it('rule 5: the palette exception covers exactly one file', () => {
    // §6: "Any new use requires the same justification: the colour must encode a category,
    // never a status." Widening this list is a deliberate edit to this test, not a default.
    expect(PALETTE_EXCEPTION_FILES).toHaveLength(1);
    expect(PALETTE_EXCEPTION_FILES[0]).toBe('src/components/prizes/CategoryCriteriaChips.tsx');
    expect(fs.existsSync(path.join(ROOT, PALETTE_EXCEPTION_FILES[0]))).toBe(true);
  });
});
