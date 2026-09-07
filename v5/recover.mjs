// 재고 부족 구간에서 cover 상향의 회복 효과
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||400);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const D=FF.C.days, LOW=3;
const pct=x=>(x*100).toFixed(0)+'%';
const q=(a,p)=>{if(!a.length)return null;const b=[...a].sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.floor(b.length*p))]};
const m=a=>a.length?(a.reduce((x,y)=>x+y,0)/a.length):0;

// 기준 cover 로 돌리다 startDay 에 to 로 올린다. 회복까지 걸린 일수를 센다.
function trial(seed,from,to,startDay){
  const W=FF.World(seed); const s=FF.initialState(W); s.cover=from;
  let firstLow=null, rec=null, day=0;
  for(let t=0;t<D;t++){
    day=s.day;
    if(to!==null&&startDay!==null&&day===startDay&&s.cover!==to)FF.transition(s,FF.Cmd.policy(to),W.next());
    else FF.transition(s,FF.Cmd.wait(),W.next());
    const end=(function(){let x=0;for(const l of s.lots)x+=l.q;return x})();
    if(firstLow===null&&end<LOW&&day>=3)firstLow=day;
    if(firstLow!==null&&rec===null&&day>firstLow&&end>=LOW)rec=day-firstLow;
    if(s.cash<=0)break;
  }
  return {firstLow,rec};
}
console.log(`시드 ${N} · 재고 ${LOW}t 미만을 부족으로 본다\n`);
console.log('| 전환 | 표본 | 회복 중앙 | p75 | 무변경 대비 단축 | 회복 못한 판 |');
console.log('|---|---|---|---|---|---|');
for(const [from,to] of [[1,1],[1,1.5],[1,2],[1.5,1.5],[1.5,2]]){
  const recs=[], base=[], cut=[];
  let never=0;
  for(const sd of seeds){
    const b=trial(sd,from,null,null);
    if(b.firstLow===null)continue;
    const a=trial(sd,from,to,b.firstLow);
    if(a.rec===null){never++;continue}
    recs.push(a.rec);
    if(b.rec!==null){base.push(b.rec);cut.push(b.rec-a.rec)}
  }
  const label=(from===to)?`${from} 유지`:`${from} → ${to}`;
  console.log(`| ${label} | ${recs.length} | ${q(recs,0.5)}일 | ${q(recs,0.75)}일 | ${m(cut).toFixed(1)}일 | ${pct(never/(never+recs.length))} |`);
}
