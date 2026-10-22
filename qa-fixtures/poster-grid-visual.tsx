import React from 'react';
import { createRoot } from 'react-dom/client';
import { PosterGridView } from '../src/components/final-prize/PosterGridView';
import type { FinalPrizeWinnerRow } from '../src/hooks/useFinalPrizeData';
import '../src/index.css';

const params = new URLSearchParams(window.location.search);
const scenario = params.get('scenario') ?? 'regular';
const allowed = scenario !== 'restricted';
const long = scenario === 'long';
const noGift = scenario === 'no-gift';
const names = [
  'Ananya Sharma', 'Aarav Mehta', 'Diya Kapoor', 'Rohan Iyer',
  'Kavya Nair', 'Ishaan Gupta', 'Meera Verma', 'Arjun Singh',
  'Sana Khan', 'Dev Patel', 'Aditi Rao', 'Kabir Joshi',
];
const groups = long ? [
  {id:'main',name:'MAIN PRIZES – CHAMPIONSHIP OPEN CATEGORY WITH A LONG CATEGORY TITLE',main:true,count:22},
  {id:'u12',name:'Under 12 Girls',main:false,count:10},
] : [
  {id:'main',name:'Main Prizes',main:true,count:4},
  {id:'girls',name:'Under 12 Girls',main:false,count:4},
  {id:'open',name:'Under 16 Open',main:false,count:4},
];
let offset = 0;
const winners:FinalPrizeWinnerRow[]=groups.flatMap((group)=>{
  return Array.from({length:group.count},(_,i)=>{
    offset++;
    return {
      prizeId:group.id+'-prize-'+i,playerId:group.id+'-player-'+i,
      categoryId:group.id,categoryName:group.name,categoryOrder:0,isMain:group.main,
      place:i+1,amount:i===0?15000:3200+i*221,
      hasTrophy:i===0,hasMedal:i<=2,
      hasGift:!noGift&&i===0,
      giftItems:!noGift&&i===0?[{name:'Chess Board with Travel Carry Case',qty:2}]:[],
      playerName:long
        ? 'Synthetic Winner '+String(offset).padStart(3,'0')+' Internationally Recognized Long Multiword Player Name'
        : names[offset-1]||('Synthetic Winner '+String(offset).padStart(3,'0')),
      rank:offset,club:'Fixture Chess Academy',state:'TEST',
    };
  });
});
createRoot(document.getElementById('root')!).render(
  <div className="pm-print-surface">
    <PosterGridView winners={winners} tournamentId="11111111-1111-4111-8111-111111111111" hasFullAccess={allowed} freePlayerThreshold={150}/>
  </div>
);
