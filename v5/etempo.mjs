// 세계가 만드는 사건의 템포. 정책과 무관하게 상태가 얼마나 자주 뒤집히는가.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||600);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const D=FF.C.days, pct=x=>(x*100).toFixed(0)+'%';
const med=a=>{if(!a.length)return '-';const b=[...a].sort((x,y)=>x-y);return b[b.length>>1]};
const m=a=>a.length?(a.reduce((x,y)=>x+y,0)/a.length):0;

const rows=[];
for(const sd of seeds){
  const W=FF.World(sd); const st=FF.initialState(W); const rows2=[];
  for(let t=0;t<D;t++){const w=W.next();const o=FF.transition(st,FF.Cmd.wait(),w);
    rows2.push({day:st.day-1,...o.result,si:w.supplyPhase,di:w.demandPhase});}
  const r={days:rows2.map(x=>({day:x.day,result:x}))};
  let bChg=[], phChg=[], stockCross=[], missCross=[];
  let prevB=null, prevSi=null, prevDi=null, prevLow=null, prevMiss=null;
  r.days.forEach(d=>{
    const x=d.result;
    if(prevB!==null&&x.b!==prevB)bChg.push(d.day);
    prevB=x.b;
    if(prevSi!==null&&(x.si!==prevSi||x.di!==prevDi))phChg.push(d.day);
    prevSi=x.si; prevDi=x.di;
    const low=x.end<3;                       // 재고 바닥
    if(prevLow!==null&&low!==prevLow)stockCross.push(d.day);
    prevLow=low;
    const miss=x.missed>1;                   // 주문 놓침
    if(prevMiss!==null&&miss!==prevMiss)missCross.push(d.day);
    prevMiss=miss;
  });
  const gaps=a=>{const g=[];for(let i=1;i<a.length;i++)g.push(a[i]-a[i-1]);return g};
  rows.push({b:bChg.length, ph:phChg.length, st:stockCross.length, ms:missCross.length,
             bg:gaps(bChg), sg:gaps(stockCross)});
}
console.log(`시드 ${N} · ${D}일 · 무투자 기준선\n`);
console.log('| 사건 | 판당 횟수 | 간격 중앙 | 0회 판 |');
console.log('|---|---|---|---|');
const line=(name,k,gk)=>{
  const c=rows.map(r=>r[k]);
  const g=gk?[].concat(...rows.map(r=>r[gk])):null;
  console.log(`| ${name} | ${m(c).toFixed(1)} | ${g?med(g)+'일':'-'} | ${pct(c.filter(x=>x===0).length/N)} |`);
};
line('병목 종류 바뀜','b','bg');
line('국면 전이','ph');
line('재고 3t 선 통과','st','sg');
line('주문 놓침 시작/끝','ms');
// 하루 변화폭
let dStock=[], dCash=[];
for(const sd of seeds.slice(0,200)){
  const W=FF.World(sd); const st=FF.initialState(W); const rows2=[];
  for(let t=0;t<D;t++){const w=W.next();const o=FF.transition(st,FF.Cmd.wait(),w);
    rows2.push({day:st.day-1,...o.result,si:w.supplyPhase,di:w.demandPhase});}
  const r={days:rows2.map(x=>({day:x.day,result:x}))};
  for(let i=1;i<r.days.length;i++){
    dStock.push(Math.abs(r.days[i].result.end-r.days[i-1].result.end));
    dCash.push(Math.abs(r.days[i].result.profit-r.days[i-1].result.profit));
  }
}
console.log(`\n하루 재고 변화 중앙 ${med(dStock).toFixed(1)}t · 하루 손익 변화 중앙 ${Math.round(med(dCash))}원`);
