import { describe, expect, it } from 'vitest';
import { verifyTeamV2ReviewPrizeInventory as check } from '../../supabase/functions/_shared/teamV2ReviewPrizeInventory';
const groups = [{id:'school'},{id:'city'}];
const prizes = [
{id:'gold',group_id:'school',place:1,cash_amount:500,has_trophy:true,has_medal:false},
{id:'silver',group_id:'school',place:2,cash_amount:200,has_trophy:false,has_medal:true},
{id:'city-gold',group_id:'city',place:1,cash_amount:100,has_trophy:true,has_medal:false},
];
const preview = groups.map(g=>({group_id:g.id,prizes:prizes.filter(p=>p.group_id===g.id).map(p=>({...p,is_active:true}))}));
describe('Team v2 read-only complete prize metadata inventory',()=>{
it('accepts exact inventory in any order and an empty-prize group',()=>{
expect(check(groups,prizes,preview)).toBe(true);
expect(check(groups,prizes,[...preview].reverse())).toBe(true);
expect(check([...groups,{id:'empty'}],prizes,[...preview,{group_id:'empty',prizes:[]}])).toBe(true);
});
it('rejects missing/duplicate/foreign groups and prizes',()=>{
expect(check(groups,prizes,preview.slice(0,1))).toBe(false);
expect(check(groups,prizes,[...preview,preview[0]])).toBe(false);
expect(check([...groups,groups[0]],prizes,preview)).toBe(false);
expect(check(groups,prizes,[{...preview[0],prizes:preview[0].prizes.slice(0,1)},preview[1]])).toBe(false);
expect(check(groups,prizes,[{...preview[0],prizes:[preview[0].prizes[0],preview[0].prizes[0]]},preview[1]])).toBe(false);
expect(check(groups,[...prizes,{...prizes[0],id:'extra'}],preview)).toBe(false);
});
it('rejects mismatched place, cash, trophy, medal, inactive or missing metadata',()=>{
for(const bad of [{place:2},{cash_amount:700},{has_trophy:false},{has_medal:true},{is_active:false},{cash_amount:null}]){
const copy=[{...preview[0],prizes:[{...preview[0].prizes[0],...bad},preview[0].prizes[1]]},preview[1]];
expect(check(groups,prizes,copy)).toBe(false);
}
});
it('rejects malformed or contradictory database inventory',()=>{
expect(check(groups,[...prizes,prizes[0]],preview)).toBe(false);
expect(check(groups,[...prizes,{...prizes[0],id:'extra',place:1}],preview)).toBe(false);
expect(check(groups,[...prizes,{...prizes[0],id:'extra',group_id:'foreign'}],preview)).toBe(false);
expect(check([],[],[])).toBe(false);
});
});