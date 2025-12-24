import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

describe('poster grid print styles', () => {
  it('targets the pm-poster-grid wrapper in print CSS', () => {
    const cssPath = resolve(process.cwd(), 'src', 'index.css');
    const css = readFileSync(cssPath, 'utf8');

    expect(css).toContain('.pm-poster-grid');
    expect(css).toMatch(/@media print[\s\S]*\.pm-poster-grid/);
  });
});
