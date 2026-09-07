// 정산 시차 스윕. 매출이 며칠 뒤 들어오면 현금이 제약이 되는가.
// 커널을 건드리지 않고 하루 손익에서 매출분을 떼어 지연 입금으로 재계산한다.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||400);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const clone=o=>JSON.parse(JSON.stringify(o));
const pct=x=>(x*100).toFixed(0)+'%';
const q=(a,p)=>{const b=[...a].sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.floor(b.length*p))]};
const R0=clone(FF.C); R0.cap={intake:30,storage:40,sales:21};

// 하루 매출과 지출을 분리해 지연 입금으로 현금 궤적을 다시 만든다
function trace(seed,cash0,lag){
  const W=FF.World(seed,R0); const s=FF.initialState(W,R0);
  let cash=cash0; const pend=[]; let mn=cash0, short=0, bust=false;
  const days=[];
  for(let t=0;t<R0.days;t++){
    const day=s.day;
    const out=FF.transition(s,FF.Cmd.wait(),W.next(),R0);
    const r=out.result;
    const revenue=r.sold*R0.price;
    const stored=r.acc-r.wS;
    const outflow=stored*R0.farm + r.end*R0.hold
      + (r.wS+r.wT)*R0.waste + R0.fixed;
    // 오늘 들어올 과거 매출
    while(pend.length&&pend[0].at<=day){cash+=pend.shift().amt}
    cash-=outflow;
    if(lag>0)pend.push({at:day+lag,amt:revenue}); else cash+=revenue;
    if(cash<mn)mn=cash;
    if(cash<R0.farm*10)short++;
    if(cash<0){bust=true;break}
    days.push(cash);
  }
  // 남은 매출채권은 판 끝에 회수
  pend.forEach(p=>cash+=p.amt);
  return {cash,mn,short,bust};
}
console.log(`시드 ${N} · 입고 30t · 창고 40t\n`);
console.log('| 정산 | 시작현금 | 파산 | 현금부족일 | 최저현금 중앙 | 최저/시작 | 종료현금 중앙 |');
console.log('|---|---|---|---|---|---|---|');
for(const lag of [0,7,14,21,30]) for(const cash0 of [60000,20000,8000]){
  let bust=0, short=0, tot=0; const mins=[], ends=[];
  for(const sd of seeds){
    const r=trace(sd,cash0,lag);
    if(r.bust)bust++;
    short+=r.short; tot+=R0.days;
    mins.push(r.mn); ends.push(r.cash);
  }
  console.log(`| ${lag||'당일'}일 | ${cash0.toLocaleString('ko-KR')} | ${pct(bust/N)} | ${pct(short/tot)} | ${Math.round(q(mins,0.5)).toLocaleString('ko-KR')} | ${(q(mins,0.5)/cash0).toFixed(2)} | ${Math.round(q(ends,0.5)).toLocaleString('ko-KR')} |`);
}
