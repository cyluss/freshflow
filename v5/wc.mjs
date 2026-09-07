// 입고 한도 x 시작 현금 격자. 주 제약이 언제 현금으로 옮겨지는가.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||300);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const clone=o=>JSON.parse(JSON.stringify(o));
const pct=x=>(x*100).toFixed(0)+'%';
const q=(a,p)=>{const b=[...a].sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.floor(b.length*p))]};

console.log(`시드 ${N} · 무투자 기준선\n`);
console.log('| 입고 | 현금 | 파산 | 현금부족일 | 최저현금/시작 | 매입한계 | intake병목 | 종료현금 중앙 |');
console.log('|---|---|---|---|---|---|---|---|');
for(const cap of [20,30,50]) for(const cash of [60000,20000,8000,4000]){
  const R=clone(FF.C); R.cap={intake:cap,storage:40,sales:21}; R.cash=cash;
  let bust=0, shortDays=0, totDays=0, mins=[], ends=[], capped=0;
  const bc={}; let nb=0;
  for(const sd of seeds){
    const W=FF.World(sd,R); const s=FF.initialState(W,R);
    let mn=s.cash;
    for(let t=0;t<R.days;t++){
      const canBuy=s.cash;                     // 오늘 살 수 있는 최대 매입비
      const out=FF.transition(s,FF.Cmd.wait(),W.next(),R);
      bc[out.result.b]=(bc[out.result.b]||0)+1; nb++;
      totDays++;
      // 현금이 부족해 못 산 물량이 있었나: 매입비 상한 추정
      if(canBuy < out.result.prod*R.farm)  { shortDays++; capped++ }
      if(s.cash<mn)mn=s.cash;
      if(s.cash<=0){bust++;break}
    }
    mins.push(mn); ends.push(s.cash);
  }
  console.log(`| ${cap}t | ${cash.toLocaleString('ko-KR')} | ${pct(bust/N)} | ${pct(shortDays/totDays)} | ${(q(mins,0.5)/cash).toFixed(2)} | ${pct(capped/totDays)} | ${pct((bc.intake||0)/nb)} | ${Math.round(q(ends,0.5)).toLocaleString('ko-KR')} |`);
}
