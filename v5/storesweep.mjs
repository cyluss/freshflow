// 창고 용량 스윕. 집하 한도 20t 고정. 기존 구조의 마지막 독립 파라미터 검사.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||400);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const clone=o=>JSON.parse(JSON.stringify(o));
const val=(sd,p,R)=>FF.finalValue(FF.runScenario(sd,p,null,R).state,true,R);
const pct=x=>(x*100).toFixed(0)+'%';
const EPS=0.05;
const salesStrat=s=>{
  if(s.pend)return FF.Cmd.wait();
  if(s.buys.sales===0&&FF.view.stock(s)>=8)return FF.Cmd.buy('sales');
  return FF.Cmd.wait();
};
function evaluate(R,label){
  const base=seeds.map(sd=>val(sd,{},R));
  const stat=p=>{let d=0,w=0;seeds.forEach((sd,i)=>{const v=val(sd,p,R);d+=v-base[i];if(v>base[i])w++});
    return {mean:Math.round(d/N),win:w/N}};
  const I=stat({2:'intake'}), S=stat({2:'sales'}), B=stat({2:'intake',4:'sales'}), ST=stat(salesStrat);
  const C=[{n:'무투자',p:{}},{n:'집하만',p:{2:'intake'}},{n:'집하만',p:{6:'intake'}},
           {n:'판매만',p:{2:'sales'}},{n:'판매만',p:{6:'sales'}},
           {n:'둘다',p:{2:'intake',4:'sales'}},{n:'둘다',p:{2:'sales',4:'intake'}}];
  const best={};
  seeds.forEach(sd=>{let bv=-Infinity,bn=null;
    C.forEach(c=>{const v=val(sd,c.p,R);if(v>bv){bv=v;bn=c.n}});best[bn]=(best[bn]||0)+1});
  // 병목과 재고 상태
  const bc={};let n2=0,hi8=0,dayN=0;
  for(const sd of seeds.slice(0,200)){
    let stock=0;
    FF.runScenario(sd,{},null,R).days.forEach(d=>{
      bc[d.result.b]=(bc[d.result.b]||0)+1;n2++;
      if(d.result.end>=8)hi8++; dayN++;
    });
  }
  // 집하 추가물량과 창고 차단
  let addAcc=0,cap=0,blocked=0,recov=0,cnt=0;
  for(const sd of seeds.slice(0,250)){
    const A=FF.runScenario(sd,{},null,R), Bx=FF.runScenario(sd,{4:'intake'},null,R);
    const days=Math.min(A.days.length,Bx.days.length);
    let a=0,bl=0;
    for(let i=4;i<days;i++){
      a+=Bx.days[i].result.acc-A.days[i].result.acc;
      bl+=Math.max(0,(Bx.days[i].result.wIstore+Bx.days[i].result.wS)-(A.days[i].result.wIstore+A.days[i].result.wS));
    }
    addAcc+=a; blocked+=bl; cap+=(days-4)*R.step.intake; cnt++;
    if(FF.finalValue(Bx.state,true,R)>FF.finalValue(A.state,true,R))recov++;
  }
  console.log(`| ${label} | ${I.mean} (${pct(I.win)}) | ${S.mean} (${pct(S.win)}) | ${B.mean} (${pct(B.win)}) | ${ST.mean} (${pct(ST.win)}) | ${pct((best['무투자']||0)/N)} | ${pct((best['집하만']||0)/N)} | ${pct((best['판매만']||0)/N)} | ${pct((bc.store||0)/n2)} | ${pct(hi8/dayN)} | ${pct(addAcc/cap)} | ${pct(blocked/(addAcc+blocked||1))} | ${pct(recov/cnt)} |`);
}
console.log(`시드 ${N} · 집하 한도 20t 고정\n`);
console.log('| 창고 | 2일 집하 | 2일 판매 | 2일 둘다 | 재고8t 전략 | 무투자최선 | 집하만 | 판매만 | 창고병목 | 재고8t+ 일수 | 여력사용률 | 창고차단율 | 집하회수율 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for(const st of [30,27,24,21]){
  const R=clone(FF.C); R.cap={intake:20,storage:st,sales:21};
  evaluate(R, st+'t');
}
