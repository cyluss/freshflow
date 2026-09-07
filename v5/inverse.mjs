// 목표 압력에서 마진과 고정비를 역산한다.
// 목표: 분할 20/30/50 에서 현금제약 30~50%, 파산 5~10%
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||250);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const clone=o=>JSON.parse(JSON.stringify(o));
const pct=x=>(x*100).toFixed(0)+'%';
const q=(a,p)=>{if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.floor(b.length*p))]};
const PLAN=[{d:0,r:0.2},{d:3,r:0.3},{d:7,r:0.5}];
function trial(R){
  let bust=0, shortRuns=0, shortDays=0, tot=0;
  const mins=[], ends=[];
  for(const sd of seeds){
    const W=FF.World(sd,R); const s=FF.initialState(W,R);
    let mn=s.cash, sc=0;
    for(let t=0;t<R.days;t++){
      const o=FF.transition(s,FF.Cmd.wait(),W.next(),R);
      tot++;
      if(o.result.wS>0.05&&o.result.end<R.cap.storage-1){shortDays++;sc++}
      if(s.cash<mn)mn=s.cash;
      if(s.cash<=0){bust++;break}
    }
    if(sc)shortRuns++;
    mins.push(mn); ends.push(FF.netWorth(s));
  }
  return {bust:bust/N, short:shortRuns/N, sd:shortDays/tot,
          mn:q(mins,0.5), end:q(ends,0.5)};
}
console.log(`시드 ${N} · 분할 20/30/50 · 시작현금 60k · 입고 30t\n`);
console.log('| 판가 | 마진율 | 고정비 | 파산 | 현금제약 판 | 최저현금 중앙 | 순자산 중앙 |');
console.log('|---|---|---|---|---|---|---|');
for(const price of [900]) for(const fixed of [4200,4400,4600,4800]){
  const R=clone(FF.C);
  R.cap={intake:30,storage:40,sales:21}; R.settlePlan=PLAN;
  R.price=price; R.fixed=fixed;
  const r=trial(R);
  const margin=(price-FF.C.farm)/price;
  console.log(`| ${price} | ${pct(margin)} | ${fixed.toLocaleString('ko-KR')} | ${pct(r.bust)} | ${pct(r.short)} | ${Math.round(r.mn).toLocaleString('ko-KR')} | ${Math.round(r.end).toLocaleString('ko-KR')} |`);
}
