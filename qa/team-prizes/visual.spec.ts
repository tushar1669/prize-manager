import {expect,test} from '@playwright/test';
import {mkdirSync} from 'node:fs';
mkdirSync('artifacts/team-a4',{recursive:true});
for(const size of ['short','long'] as const){
 test(`A4 Team Prizes source-based ${size}`,async({page})=>{
   const n=size==='long'?9:3;
   await page.goto(`/qa/team-prizes/?size=${size}`);
   await expect(page.locator('.pm-team-prize-group')).toHaveCount(n);
   await expect(page.locator('.pm-team-prize-group tbody tr')).toHaveCount(n*4);
   await page.emulateMedia({media:'print'});
   const backgrounds=await page.locator('.pm-team-prize-group').evaluateAll(groups=>
     groups.slice(0,3).map(group=>getComputedStyle(group.querySelector('tbody td')!).backgroundColor));
   expect(new Set(backgrounds).size).toBe(3);
   const borders=await page.locator('.pm-team-prize-group').first().locator('tbody td').first().evaluate(cell=>getComputedStyle(cell).borderRightWidth);
   expect(parseFloat(borders)).toBeGreaterThan(0);
   await page.pdf({path:`artifacts/team-a4/team-${size}.pdf`,format:'A4',printBackground:true});
 });
}
test('restricted print hides the first prize, preserving permitted remaining rows',async({page})=>{
 await page.goto('/qa/team-prizes/?access=restricted');
 await expect(page.locator('.pm-team-prize-group')).toHaveCount(3);
 await expect(page.getByText('Locked — upgrade to Pro to reveal this placing',{exact:false})).toHaveCount(3);
 await expect(page.getByText('Synthetic International Academy of Chess and Sports Club 1 / 1',{exact:true})).toHaveCount(0);
 await expect(page.getByText('Synthetic International Academy of Chess and Sports Club 1 / 2',{exact:true})).toHaveCount(1);
});
