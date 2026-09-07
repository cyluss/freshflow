// 외상매입이 값을 가지려면 현금이 제약이어야 한다. 지금 제약인가.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||600);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const pct=x=>(x*100).toFixed(1)+'%';
const q=(a,p)=>{const b=[...a].sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.floor(b.length*p))]};
let minCash=[], endCash=[], bust=0, dayCost=[];
let cantAfford=0, tight=0;
for(const sd of seeds){
  const W=FF.World(sd); const s=FF.initialState(W);
  let mn=s.cash, prev=s.cash;
  for(let t=0;t<FF.C.days;t++){
    const before=s.cash;
    FF.transition(s,FF.Cmd.wait(),W.next());
    dayCost.push(before-s.cash);
    if(s.cash<mn)mn=s.cash;
    if(s.cash<FF.C.cost.sales)cantAfford++;
    if(s.cash<FF.C.cash*0.3)tight++;
    if(s.cash<=0){bust++;break}
  }
  minCash.push(mn); endCash.push(s.cash);
}
const m=a=>Math.round(a.reduce((x,y)=>x+y,0)/a.length);
console.log(`시드 ${N} · 시작 현금 ${FF.C.cash} · 무투자\n`);
console.log('| 지표 | 값 |');
console.log('|---|---|');
console.log(`| 최저 현금 중앙 | ${q(minCash,0.5).toLocaleString('ko-KR')} |`);
console.log(`| 최저 현금 p10 | ${q(minCash,0.1).toLocaleString('ko-KR')} |`);
console.log(`| 최저 현금 최소 | ${Math.round(Math.min(...minCash)).toLocaleString('ko-KR')} |`);
console.log(`| 종료 현금 중앙 | ${q(endCash,0.5).toLocaleString('ko-KR')} |`);
console.log(`| 파산 | ${pct(bust/N)} |`);
console.log(`| 현금이 판매증설가 미만인 날 | ${pct(cantAfford/(N*FF.C.days))} |`);
console.log(`| 현금이 시작의 30% 미만인 날 | ${pct(tight/(N*FF.C.days))} |`);
console.log(`| 하루 순지출 중앙 | ${q(dayCost,0.5).toFixed(0)}원 |`);
console.log(`| 하루 순지출 p90 | ${q(dayCost,0.9).toFixed(0)}원 |`);
// 최대 투자 규모 대비
const maxSpend=FF.C.contract.options[3].price+FF.C.cost.sales*5;
console.log(`\n최대 투자 지출 ${maxSpend.toLocaleString('ko-KR')} · 시작 현금의 ${pct(maxSpend/FF.C.cash)}`);
