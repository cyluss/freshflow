// 초기 집하 한도 18/19/20 스윕. 같은 시드와 같은 난수열.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||500);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const clone=o=>JSON.parse(JSON.stringify(o));
const val=(sd,p,R)=>FF.finalValue(FF.runScenario(sd,p,null,R).state,true,R);
const pct=x=>(x*100).toFixed(0)+'%';
const EPS=0.05;

// 판매 전략: 재고 8t 이상이면 판매 한도 늘리기
const salesStrat=s=>{
  if(s.pend)return FF.Cmd.wait();
  if(s.buys.sales===0&&FF.view.stock(s)>=8)return FF.Cmd.buy('sales');
  return FF.Cmd.wait();
};

function evaluate(R,label){
  const base=seeds.map(sd=>val(sd,{},R));
  const stat=p=>{let d=0,w=0;seeds.forEach((sd,i)=>{const v=val(sd,p,R);d+=v-base[i];if(v>base[i])w++});
    return {mean:Math.round(d/N),win:w/N}};
  const I=stat({2:'intake'}), S=stat({2:'sales'}), B=stat({2:'intake',4:'sales'});
  const ST=stat(salesStrat);

  // 사후 최선 분포
  const C=[{n:'무투자',p:{}},{n:'집하만',p:{2:'intake'}},{n:'집하만',p:{6:'intake'}},
           {n:'판매만',p:{2:'sales'}},{n:'판매만',p:{6:'sales'}},
           {n:'둘다',p:{2:'intake',4:'sales'}},{n:'둘다',p:{2:'sales',4:'intake'}}];
  const best={}; let gap=0;
  seeds.forEach((sd,i)=>{
    let bv=-Infinity,bn=null;
    C.forEach(c=>{const v=val(sd,c.p,R);if(v>bv){bv=v;bn=c.n}});
    best[bn]=(best[bn]||0)+1; gap+=bv-base[i];
  });

  // 병목 분포
  const bc={};let n2=0;
  for(const sd of seeds.slice(0,200))
    FF.runScenario(sd,{},null,R).days.forEach(d=>{bc[d.result.b]=(bc[d.result.b]||0)+1;n2++});

  // 집하 여력 사용률과 회수율
  let addAcc=0,cap=0,recov=0,cnt=0;
  for(const sd of seeds.slice(0,250)){
    const A=FF.runScenario(sd,{},null,R), Bx=FF.runScenario(sd,{4:'intake'},null,R);
    const days=Math.min(A.days.length,Bx.days.length);
    let a=0;
    for(let i=4;i<days;i++)a+=Bx.days[i].result.acc-A.days[i].result.acc;
    addAcc+=a; cap+=(days-4)*R.step.intake; cnt++;
    if(FF.finalValue(Bx.state,true,R)>FF.finalValue(A.state,true,R))recov++;
  }
  console.log(`| ${label} | ${I.mean} (${pct(I.win)}) | ${S.mean} (${pct(S.win)}) | ${B.mean} (${pct(B.win)}) | ${ST.mean} (${pct(ST.win)}) | ${pct((best['무투자']||0)/N)} | ${pct((best['집하만']||0)/N)} | ${pct((best['판매만']||0)/N)} | ${pct((best['둘다']||0)/N)} | ${pct((bc.intake||0)/n2)} | ${pct(addAcc/cap)} | ${pct(recov/cnt)} | ${Math.round(gap/N)} |`);
}

console.log(`시드 ${N}\n`);
console.log('| 초기 집하 한도 | 2일 집하 | 2일 판매 | 2일 둘다 | 재고8t 전략 | 무투자최선 | 집하만 | 판매만 | 둘다 | intake병목 | 여력사용률 | 집하회수율 | 판단여지 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for(const c of [20,19.5,19.2,19]){
  const R=clone(FF.C); R.cap={intake:c,storage:30,sales:21};
  evaluate(R, c+'t');
}
