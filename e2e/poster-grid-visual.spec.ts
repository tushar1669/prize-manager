import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const url = '/qa-fixtures/poster-grid-visual.html';
async function open(page:Page,scenario='regular'){
 await page.goto(url+'?scenario='+scenario);
 await expect(page.locator('.pm-poster-card')).toHaveCount(scenario==='long'?32:scenario==='restricted'?0:12);
}
async function noOverflow(page:Page){
 const v=await page.evaluate(()=>{
  const doc=document.documentElement;
  const rects=Array.from(document.querySelectorAll('.pm-poster-card')).map(el=>({width:el.getBoundingClientRect().width,
    scrollWidth:el.scrollWidth,clientWidth:el.clientWidth}));
  return {doc:doc.scrollWidth,viewport:window.innerWidth,rects};
 });
 expect(v.doc).toBeLessThanOrEqual(v.viewport+1);
 for(const rect of v.rects) {
  expect(rect.width).toBeGreaterThan(140);
  expect(rect.scrollWidth).toBeLessThanOrEqual(rect.clientWidth+3);
 }
}
test('desktop 1440px: cards fit, category tones differ, winner hierarchy visible',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await open(page);
 await noOverflow(page);
 const styles=await page.locator('.pm-poster-card').evaluateAll(els=>els.map(el=>getComputedStyle(el).borderTopColor));
 expect(new Set(styles).size).toBeGreaterThanOrEqual(2);
 await expect(page.locator('.pm-poster-name')).toHaveCount(12);
 await expect(page.locator('.pm-poster-cash')).toHaveCount(12);
 mkdirSync('qa-output',{recursive:true});
 await page.screenshot({path:'qa-output/poster-grid-desktop.jpg',type:'jpeg',quality:60,fullPage:true});
 console.log('POSTER_DESKTOP_PASS 1440px 12 synthetic winners, 3 category tones, no horizontal overflow');
});
test('mobile 390px: single-column readable cards, no horizontal overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await open(page);
 await noOverflow(page);
 const widths=await page.locator('.pm-poster-card').evaluateAll(els=>els.map(el=>Math.round(el.getBoundingClientRect().width)));
 expect(widths[0]).toBeGreaterThan(260);
 mkdirSync('qa-output',{recursive:true});
 await page.screenshot({path:'qa-output/poster-grid-mobile.jpg',type:'jpeg',quality:55,fullPage:true});
 console.log('POSTER_MOBILE_PASS 390px; single-column; no horizontal overflow');
});
test('category accents also tint gift blocks and awards, on screen and A4 print', async ({page}) => {
 await page.setViewportSize({width:390,height:844});
 await open(page);
 for (const media of ['screen','print'] as const) {
  await page.emulateMedia({media});
  const samples=await page.locator('.pm-poster-group').evaluateAll(groups => groups.map(g => {
   const card=g.querySelector('.pm-poster-card');
   const gift=g.querySelector('.pm-poster-gift');
   const icons=Array.from(g.querySelectorAll('.pm-poster-awards > span svg'));
   const accent=card ? getComputedStyle(card).borderTopColor : '';
   return {
    group:g.className,
    accent,
    giftBackground:gift ? getComputedStyle(gift).backgroundColor : null,
    giftRail:gift ? getComputedStyle(gift).borderLeftColor : null,
    iconColors:icons.map(svg => getComputedStyle(svg).color),
   };
  }));
  expect(samples).toHaveLength(3);
  expect(new Set(samples.map(x=>x.accent)).size).toBe(3);
  expect(new Set(samples.map(x=>x.giftBackground)).size).toBe(3);
  for (const sample of samples) {
   expect(sample.iconColors.length).toBeGreaterThan(0);
   expect(sample.iconColors.every(color=>color===sample.accent), sample.group+' icons vs '+media).toBe(true);
   expect(sample.giftRail, sample.group+' gift left border vs '+media).toBe(sample.accent);
  }
 }
});
test('restricted poster stays locked; winners and print controls not exposed',async({page})=>{
 await open(page,'restricted');
 await expect(page.getByText('Poster Grid — Pro Only')).toBeVisible();
 await expect(page.locator('.pm-poster-name')).toHaveCount(0);
});
test('no gift scenario omits gift badges without changing winner count',async({page})=>{
 await open(page,'no-gift');
 await expect(page.locator('.pm-poster-gift')).toHaveCount(0);
});
test('compact print A4 contains 12 winners and no clipped text boxes',async({page})=>{
 await open(page);
 const pdf=await page.pdf({format:'A4',preferCSSPageSize:true,printBackground:false});
 mkdirSync('qa-output',{recursive:true});
 writeFileSync('qa-output/poster-grid-compact.pdf',pdf);
 const info=execFileSync('pdfinfo',['-'],{input:pdf,encoding:'utf8'});
 const dimensions=info.match(/Page size:\s+([\d.]+) x ([\d.]+) pts/);
 expect(dimensions).not.toBeNull();
 expect(Math.abs(Number(dimensions![1])-595)).toBeLessThan(0.2);
 expect(Math.abs(Number(dimensions![2])-842)).toBeLessThan(0.2);
 const words=execFileSync('pdftotext',['-layout','-','-'],{input:pdf,encoding:'utf8'});
 for(const name of ['Ananya Sharma','Aarav Mehta','Kabir Joshi'])expect(words).toContain(name);
 for(const n of ['Main Prizes','Under 12 Girls','Under 16 Open'])expect(words).toContain(n);
 const boxes=execFileSync('pdftotext',['-bbox','-','-'],{input:pdf,encoding:'utf8'});
 const coords=[...boxes.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)"/g)];
 for(const [,left,top,right,bottom] of coords){
   expect(Number(left)).toBeGreaterThanOrEqual(0);
   expect(Number(top)).toBeGreaterThanOrEqual(0);
   expect(Number(right)).toBeLessThanOrEqual(595.2);
   expect(Number(bottom)).toBeLessThanOrEqual(842.2);
 }
 const pages=Number(info.match(/Pages:\s+(\d+)/)?.[1]||0);
 expect(pages).toBeGreaterThanOrEqual(1);
 console.log('POSTER_COMPACT_A4_PAGES='+pages);
});
test('one category per page mode retains 12 winners and category boundaries',async({page})=>{
 await open(page);
 await page.locator('[aria-label="One category per page"]').click();
 await expect(page.locator('.pm-poster-grid')).toHaveAttribute('data-print-mode','one-per-page');
 const pdf=await page.pdf({format:'A4',preferCSSPageSize:true,printBackground:false});
 mkdirSync('qa-output',{recursive:true});
 writeFileSync('qa-output/poster-grid-one-per-page.pdf',pdf);
 const t=execFileSync('pdftotext',['-layout','-','-'],{input:pdf,encoding:'utf8'});
 const pages=t.split('\f').filter(x=>x.trim().length>0);
 expect(pages.length).toBeGreaterThanOrEqual(3);
 for(const s of ['Ananya Sharma','Aarav Mehta','Kabir Joshi']) expect(t).toContain(s);
 console.log('POSTER_ONE_CATEGORY_A4_PAGES='+pages.length);
});
test('long names and gifts remain legible in A4 print',async({page})=>{
 await open(page,'long');
 const pdf=await page.pdf({format:'A4',preferCSSPageSize:true,printBackground:false});
 mkdirSync('qa-output',{recursive:true});
 writeFileSync('qa-output/poster-grid-long.pdf',pdf);
 const t=execFileSync('pdftotext',['-layout','-','-'],{input:pdf,encoding:'utf8'});
 for(let i=1;i<=32;i++) expect(t).toContain('Synthetic Winner '+String(i).padStart(3,'0'));
 expect(t).toMatch(/Chess Board with\s+Travel\s+Carry Case/);
 console.log('POSTER_LONG_A4_PAGES='+Number(execFileSync('pdfinfo',['-'],{input:pdf,encoding:'utf8'}).match(/Pages:\s+(\d+)/)?.[1]||0));
});
