// 밸런스 2차원 스윕. 게임 규칙은 인자로만 바꾼다.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();

const N=+(process.env.N||300);
const seeds=[]; for(let i=1;i<=N;i++) seeds.push(i*7+3);
const clone=o=>JSON.parse(JSON.stringify(o));
const val=(sd,plan,R)=>FF.finalValue(FF.runScenario(sd,plan,null,R).state,true,R);

// 조건부 전략: 예보와 관측을 읽고 산다
const condIntake = [
  {when:[{read:'day',op:'<',value:12},{read:'buysIntake',op:'==',value:0},
         {read:'stock',op:'<',value:6}], then:{buy:'intake'}},
  {then:{wait:true}}
];
const condSales = [
  {when:[{read:'day',op:'<',value:12},{read:'buysSales',op:'==',value:0},
         {read:'stock',op:'>',value:12}], then:{buy:'sales'}},
  {then:{wait:true}}
];
const condBoth = [
  {when:[{read:'stock',op:'>',value:12},{read:'buysSales',op:'==',value:0}], then:{buy:'sales'}},
  {when:[{read:'stock',op:'<',value:6},{read:'buysIntake',op:'==',value:0}], then:{buy:'intake'}},
  {then:{wait:true}}
];

const FIXED = { '집하':{2:'intake'}, '판매':{2:'sales'}, '둘다':{2:'intake',4:'sales'} };
const COND  = { '조건집하':condIntake, '조건판매':condSales, '조건둘다':condBoth };

function evaluate(R){
  const base = seeds.map(sd=>val(sd,{},R));
  const stat = plan => {
    let d=0,win=0;
    seeds.forEach((sd,i)=>{ const v=val(sd,plan,R); d+=v-base[i]; if(v>base[i])win++ });
    return {mean:Math.round(d/seeds.length), win:win/seeds.length};
  };
  const res={};
  for(const [k,p] of Object.entries(FIXED)) res[k]=stat(p);
  for(const [k,p] of Object.entries(COND))  res[k]=stat(p);

  // 사후 최선과 무투자가 최선인 판 비율
  const cands=[{},{2:'intake'},{2:'sales'},{2:'intake',4:'sales'},
               {2:'intake',4:'intake'},{2:'sales',4:'sales'},{5:'intake'},{5:'sales'}];
  let gap=0, idleBest=0;
  seeds.forEach((sd,i)=>{
    const vs=cands.map(p=>val(sd,p,R));
    const best=Math.max(...vs);
    gap += best-vs[0];
    if(best===vs[0]) idleBest++;
  });

  // 병목 분포
  const b={}; let n=0;
  for(const sd of seeds.slice(0,120)){
    FF.runScenario(sd,{},null,R).days.forEach(d=>{b[d.result.b]=(b[d.result.b]||0)+1;n++});
  }
  const top=Object.entries(b).sort((x,y)=>y[1]-x[1])[0];
  return {res, gap:Math.round(gap/seeds.length), idleBest:idleBest/seeds.length,
          topB:top[0], topShare:top[1]/n};
}

const PRICES=[{k:'100%',f:1},{k:'75%',f:0.75},{k:'50%',f:0.5}];
const DEMANDS=[{k:'10/20/32',v:[10,20,32]},{k:'11/22/34',v:[11,22,34]},{k:'12/23/36',v:[12,23,36]}];
const pct=x=>(x*100).toFixed(0)+'%';

console.log(`시드 ${N}판`);
console.log('| 가격 | 수요 | 집하 | 판매 | 둘다 | 조건집하 | 조건판매 | 조건둘다 | 여지 | 무투자최선 | 최대병목 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
const table=[];
for(const p of PRICES) for(const d of DEMANDS){
  const R=clone(FF.C);
  R.cost={intake:Math.round(1500*p.f), sales:Math.round(412*p.f)};
  R.dm=d.v;
  const e=evaluate(R);
  const c=k=>`${e.res[k].mean} (${pct(e.res[k].win)})`;
  console.log(`| ${p.k} | ${d.k} | ${c('집하')} | ${c('판매')} | ${c('둘다')} | ${c('조건집하')} | ${c('조건판매')} | ${c('조건둘다')} | ${e.gap} | ${pct(e.idleBest)} | ${e.topB} ${pct(e.topShare)} |`);
  table.push({price:p.k,dem:d.k,e});
}
fs.writeFileSync('/tmp/sweep.json', JSON.stringify(table));
