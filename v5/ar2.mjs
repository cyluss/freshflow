// 정산 시차 x 시작 현금. 현금이 제약이면서도 회복 가능한 지점을 찾는다.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||300);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const clone=o=>JSON.parse(JSON.stringify(o));
const pct=x=>(x*100).toFixed(0)+'%';
const q=(a,p)=>{if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.floor(b.length*p))]};
const R0=clone(FF.C); R0.cap={intake:30,storage:40,sales:21};

// 현금이 모자라면 그날 매입을 줄인다. 줄인 양을 센다.
function trace(seed,cash0,lag){
  const W=FF.World(seed,R0); const s=FF.initialState(W,R0);
  let cash=cash0; const pend=[];
  let mn=cash0, skipped=0, wanted=0, firstShort=null, arSum=0, bust=false, day0=0;
  for(let t=0;t<R0.days;t++){
    const day=s.day;
    while(pend.length&&pend[0].at<=day){cash+=pend.shift().amt}
    // 오늘 살 수 있는 최대 물량
    const budget=Math.max(0,cash-R0.fixed);
    const capT=Math.floor(budget/R0.farm*100)/100;
    const before=s.cap.intake;
    const out=FF.transition(s,FF.Cmd.wait(),W.next(),R0);
    const r=out.result;
    const stored=r.acc-r.wS;
    const affordable=Math.min(stored,capT);
    if(stored>capT+0.05){skipped+=stored-capT; if(firstShort===null)firstShort=day}
    wanted+=stored;
    const outflow=affordable*R0.farm + r.end*R0.hold + (r.wS+r.wT)*R0.waste + R0.fixed;
    cash-=outflow;
    const revenue=r.sold*R0.price;
    if(lag>0)pend.push({at:day+lag,amt:revenue}); else cash+=revenue;
    arSum+=pend.reduce((a,p)=>a+p.amt,0);
    if(cash<mn)mn=cash;
    if(cash<0){bust=true;break}
    day0++;
  }
  return {mn,skipped,wanted,firstShort,ar:arSum/Math.max(1,day0),bust};
}
console.log(`시드 ${N} · 입고 30t · 창고 40t\n`);
console.log('| 시차 | 현금 | 파산 | 최저현금 중앙 | 매입 포기율 | 포기한 판 | 첫 부족일 중앙 | 매출채권 평균 |');
console.log('|---|---|---|---|---|---|---|---|');
for(const lag of [5,7]) for(const cash0 of [70000,80000,90000,100000]){
  let bust=0, skip=0, want=0, hadShort=0; const mins=[], firsts=[], ars=[];
  for(const sd of seeds){
    const r=trace(sd,cash0,lag);
    if(r.bust)bust++;
    skip+=r.skipped; want+=r.wanted;
    if(r.firstShort!==null){hadShort++;firsts.push(r.firstShort)}
    mins.push(r.mn); ars.push(r.ar);
  }
  console.log(`| ${lag}일 | ${(cash0/1000)}k | ${pct(bust/N)} | ${Math.round(q(mins,0.5)).toLocaleString('ko-KR')} | ${pct(skip/want)} | ${pct(hadShort/N)} | ${q(firsts,0.5)||'-'}일 | ${Math.round(q(ars,0.5)).toLocaleString('ko-KR')} |`);
}
