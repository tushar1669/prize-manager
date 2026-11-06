import { readFileSync } from 'node:fs';
import postcss, { type AtRule, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

// Owner decision, 4 Nov 2026: on Finalize and Final Prize (inside .pm-print-surface) the
// screen shows the 28 Oct design, print keeps the approved 30 Oct A4 design, and public
// pages keep the 30 Oct design on screen (Poster Grid / Arbiter Sheet; since 6 Nov 2026 the
// public Category Cards show the 28 Oct cards on screen, see category-cards-canonical.spec). So no rule in these stylesheets may apply in
// every medium: each one sits in a print block, and Poster Grid / Arbiter Sheet repeat it
// in the screen block right after, filtered to stay off .pm-print-surface.
const FILTER = ':where(:not(.pm-print-surface *))';
const parse = (file: string) => postcss.parse(readFileSync(`src/components/final-prize/${file}`, 'utf8'));
const rulesOf = (at: AtRule) => (at.nodes ?? []).filter((n): n is Rule => n.type === 'rule');
const decls = (r: Rule) => r.nodes.filter(n => n.type === 'decl').map(n => n.toString().replace(/\s+/g, ' ')).join('; ');
// Split a selector list on top-level commas only (not the ones inside :is(th, td)).
const selectorList = (selector: string) => {
  const out: string[] = []; let depth = 0, cur = '';
  for (const ch of selector) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  return [...out, cur.trim()];
};
const organizerOnly = (r: Rule) => selectorList(r.selector).every(s => s.startsWith('.pm-print-surface '));

describe('Final Prize view stylesheets: print design in print, 28 Oct look on organizer screens', () => {
  for (const file of ['PosterGridView.css', 'ArbiterSheetView.css', 'TeamPrizesTabView.css']) {
    it(`${file}: no rule outside a print or screen media block`, () => {
      const root = parse(file);
      expect(root.nodes.filter((n): n is Rule => n.type === 'rule').map(r => r.selector)).toEqual([]);
      root.walkAtRules(at => {
        expect(at.name).toBe('media');
        expect(at.params).toMatch(/^(print|screen)( and \(.+\))?$/);
      });
    });
  }

  it('TeamPrizesTabView.css: print rules plus one organizer-screen block (the tab renders only inside .pm-print-surface)', () => {
    let organizerBlocks = 0;
    parse('TeamPrizesTabView.css').each(node => {
      if (node.type !== 'atrule' || node.params.startsWith('print')) return;
      expect(node.params).toBe('screen');
      expect(rulesOf(node).every(organizerOnly)).toBe(true);
      organizerBlocks++;
    });
    expect(organizerBlocks).toBe(1);
  });

  for (const file of ['PosterGridView.css', 'ArbiterSheetView.css']) {
    it(`${file}: every public screen copy equals the print copy before it; the rest is organizer-scoped`, () => {
      let pairs = 0, organizerBlocks = 0;
      parse(file).each(node => {
        if (node.type !== 'atrule' || !node.params.startsWith('screen')) return;
        const rules = rulesOf(node);
        if (rules.every(organizerOnly)) { organizerBlocks++; return; }
        const prev = node.prev();
        expect(prev?.type).toBe('atrule');
        const print = prev as AtRule;
        expect(print.params).toBe(node.params.replace(/^screen/, 'print'));
        const printRules = rulesOf(print);
        expect(rules.length).toBe(printRules.length);
        rules.forEach((r, i) => {
          expect(selectorList(r.selector).every(s => s.includes(FILTER))).toBe(true);
          expect(r.selector.split(FILTER).join('')).toBe(printRules[i].selector);
          expect(decls(r)).toBe(decls(printRules[i]));
        });
        pairs += rules.length;
      });
      expect(pairs).toBeGreaterThan(20);
      expect(organizerBlocks).toBe(1);
    });
  }
});
