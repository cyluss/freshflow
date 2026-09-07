// 판매 시작 한도 스윕. 증설 단위 +1t 고정.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||400);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const clone=o=>JSON.parse(JSON.stringify(o));
const pct=x=>(x*100).toFixed(0)+'%';
const XS=FF.C.contract.options.map(o=>o.x);
const at1=x=>s=>(s.day===1&&s.buys.contract===0)?FF.Cmd.contract(x):FF.Cmd.wait();

console.log(`시드 ${N} · 판매 증설 +1t 고정\n`);
console.log('| 한도 | 양수0 | 강한0 | 판매최선 | ship병목 | 계약 최선 0/0.5/1/1.5 | 무투자최선 |');
console.log('|---|---|---|---|---|---|---|');
for(const cap of [21,20.5,20,19.5,19]){
  const R=clone(FF.C); R.cap={intake:20,storage:30,sales:cap};
  const val=(sd,p)=>FF.finalValue(FF.runScenario(sd,p,null,R).state,true,R);
  const base=seeds.map(sd=>val(sd,{}));
  const COST=R.cost.sales;
  let pos0=0,strong0=0;
  const sellBest=[];
  seeds.forEach((sd,i)=>{
    let pos=0,strong=0,best=-Infinity;
    for(let d=2;d<=R.days-3;d++){
      const g=val(sd,{[d]:'sales'})-base[i];
      if(g>0)pos++; if(g>=COST*2)strong++;
      if(g>best)best=g;
    }
    if(pos===0)pos0++; if(strong===0)strong0++;
    sellBest.push(best);
  });
  // 최선 전략 분포
  const CAND=[{n:'무투자',p:{}},{n:'판매',p:{6:'sales'}},{n:'판매2',p:{3:'sales',10:'sales'}}]
    .concat(XS.filter(x=>x>0).map(x=>({n:'계약'+x,p:at1(x)})));
  const best={}; const xbest={};
  seeds.forEach((sd,i)=>{
    let bv=-Infinity,bn=null;
    CAND.forEach(c=>{const v=val(sd,c.p);if(v>bv){bv=v;bn=c.n}});
    best[bn]=(best[bn]||0)+1;
    let xv=-Infinity,xx=null;
    XS.forEach(x=>{const v=x===0?0:val(sd,at1(x))-base[i];if(v>xv){xv=v;xx=x}});
    xbest[xx]=(xbest[xx]||0)+1;
  });
  const sellShare=((best['판매']||0)+(best['판매2']||0))/N;
  const bc={};let n2=0;
  for(const sd of seeds.slice(0,200))
    FF.runScenario(sd,{},null,R).days.forEach(d=>{bc[d.result.b]=(bc[d.result.b]||0)+1;n2++});
  console.log(`| ${cap}t | ${pct(pos0/N)} | ${pct(strong0/N)} | ${pct(sellShare)} | ${pct((bc.ship||0)/n2)} | ${XS.map(x=>pct((xbest[x]||0)/N)).join(' / ')} | ${pct((best['무투자']||0)/N)} |`);
}
