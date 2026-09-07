import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||300);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const clone=o=>JSON.parse(JSON.stringify(o));
const pct=x=>(x*100).toFixed(0)+'%';
const q=(a,p)=>{if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.floor(b.length*p))]};
const PLANS={
 '즉시':[], '절반':[{d:0,r:0.5},{d:7,r:0.5}],
 '분할':[{d:0,r:0.2},{d:3,r:0.3},{d:7,r:0.5}],
 '후불':[{d:7,r:1}]
};
console.log(`시드 ${N} · 시작현금 ${(60000).toLocaleString('ko-KR')} · 입고 30t\n`);
console.log('| 정산 | 파산 | 매입축소 판 | 축소 일수 | 축소 물량/판 | 최저현금 중앙 | 채권 중앙 | 순자산 중앙 |');
console.log('|---|---|---|---|---|---|---|---|');
for(const [name,plan] of Object.entries(PLANS)){
  const R=clone(FF.C); R.cap={intake:30,storage:40,sales:21}; R.settlePlan=plan;
  let bust=0, shortRuns=0, shortDays=0, tot=0, cut=0;
  const mins=[], ars=[], ends=[];
  for(const sd of seeds){
    const W=FF.World(sd,R); const s=FF.initialState(W,R);
    let mn=s.cash, sc=0;
    for(let t=0;t<R.days;t++){
      const o=FF.transition(s,FF.Cmd.wait(),W.next(),R);
      tot++;
      if(o.result.wS>0.05&&o.result.end<R.cap.storage-1){shortDays++;sc++;cut+=o.result.wS}
      if(s.cash<mn)mn=s.cash;
      if(s.cash<=0){bust++;break}
    }
    if(sc)shortRuns++;
    mins.push(mn); ends.push(FF.netWorth(s));
    ars.push((s.ar||[]).reduce((a,x)=>a+x.amt,0));
  }
  console.log(`| ${name} | ${pct(bust/N)} | ${pct(shortRuns/N)} | ${pct(shortDays/tot)} | ${(cut/N).toFixed(1)}t | ${Math.round(q(mins,0.5)).toLocaleString('ko-KR')} | ${Math.round(q(ars,0.5)).toLocaleString('ko-KR')} | ${Math.round(q(ends,0.5)).toLocaleString('ko-KR')} |`);
}
