// 정식 커널로 정산 시차 x 시작 현금. 현금 부족이 매입 축소로 이어지는가.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||300);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const clone=o=>JSON.parse(JSON.stringify(o));
const pct=x=>(x*100).toFixed(0)+'%';
const q=(a,p)=>{if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.floor(b.length*p))]};
console.log(`시드 ${N} · 입고 30t · 창고 40t\n`);
console.log('| 시차 | 현금 | 파산 | 최저현금 중앙 | 매입 축소 판 | 축소 일수 | 채권 중앙 | 종료 순자산 중앙 |');
console.log('|---|---|---|---|---|---|---|---|');
for(const lag of [5,7]) for(const cash0 of [50000,70000,90000,110000]){
  const R=clone(FF.C); R.cap={intake:30,storage:40,sales:21}; R.settle=lag; R.cash=cash0;
  let bust=0, shortRuns=0, shortDays=0, totDays=0;
  const mins=[], ars=[], ends=[];
  for(const sd of seeds){
    const W=FF.World(sd,R); const s=FF.initialState(W,R);
    let mn=s.cash, sd2=0;
    for(let t=0;t<R.days;t++){
      const before=s.cash;
      const out=FF.transition(s,FF.Cmd.wait(),W.next(),R);
      totDays++;
      // 창고 여유가 있는데 못 받았으면 현금 부족이다
      if(out.result.wS>0.05 && out.result.end < R.cap.storage-1){shortDays++;sd2++}
      if(s.cash<mn)mn=s.cash;
      if(s.cash<=0){bust++;break}
    }
    if(sd2)shortRuns++;
    mins.push(mn); ends.push(FF.netWorth(s));
    ars.push((s.ar||[]).reduce((a,x)=>a+x.amt,0));
  }
  console.log(`| ${lag}일 | ${(cash0/1000)}k | ${pct(bust/N)} | ${Math.round(q(mins,0.5)).toLocaleString('ko-KR')} | ${pct(shortRuns/N)} | ${pct(shortDays/totDays)} | ${Math.round(q(ars,0.5)).toLocaleString('ko-KR')} | ${Math.round(q(ends,0.5)).toLocaleString('ko-KR')} |`);
}
