// 1000시드 재검증. 정식 커널 경로.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||1000);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const pct=x=>(x*100).toFixed(1)+'%';
const XS=FF.C.contract.options.map(o=>o.x);
const stock=s=>{var t=0;for(var i=0;i<s.lots.length;i++)t+=s.lots[i].q;return t};
const at1=x=>s=>(s.day===1&&s.buys.contract===0)?FF.Cmd.contract(x):FF.Cmd.wait();
const withSales=x=>s=>{
  if(s.day===1&&s.buys.contract===0)return FF.Cmd.contract(x);
  if(!s.pend&&s.buys.sales===0&&stock(s)>=8)return FF.Cmd.buy('sales');
  return FF.Cmd.wait();
};
const val=(sd,st)=>FF.finalValue(FF.runScenario(sd,st).state,true);
const base=seeds.map(sd=>val(sd,{}));
const V={},W={};
for(const x of XS){
  V[x]=seeds.map((sd,i)=>x===0?0:val(sd,at1(x))-base[i]);
  W[x]=seeds.map((sd,i)=>val(sd,withSales(x))-base[i]);
}
const m=a=>Math.round(a.reduce((p,q)=>p+q,0)/a.length);
console.log(`시드 ${N} · 정식 커널\n`);
console.log('| X | 가격 | 평균 | 승률 | 판매 결합 | 결합 승률 |');
console.log('|---|---|---|---|---|---|');
for(const x of XS){
  const o=FF.contractOption(x);
  console.log(`| ${x}t | ${o.price} | ${m(V[x])} | ${x===0?'-':pct(V[x].filter(v=>v>0).length/N)} | ${m(W[x])} | ${pct(W[x].filter(v=>v>0).length/N)} |`);
}
const best={},bestW={};
const info=seeds.map(sd=>{const W=FF.World(sd);const T=W.tilt();return {si:T.supply,di:T.demand}});
seeds.forEach((sd,i)=>{
  let bv=-Infinity,bx=null; XS.forEach(x=>{if(V[x][i]>bv){bv=V[x][i];bx=x}}); best[bx]=(best[bx]||0)+1;
  let cv=-Infinity,cx=null; XS.forEach(x=>{if(W[x][i]>cv){cv=W[x][i];cx=x}}); bestW[cx]=(bestW[cx]||0)+1;
});
console.log('\n| 최선 X | 계약만 | 판매 결합 |');console.log('|---|---|---|');
XS.forEach(x=>console.log(`| ${x}t | ${pct((best[x]||0)/N)} | ${pct((bestW[x]||0)/N)} |`));
console.log('\n## 수요 성향별 최적 X');
console.log('| 국면 | 판수 | ' + XS.map(x=>x+'t').join(' | ') + ' |');
console.log('|---|---|' + XS.map(()=>'---|').join(''));
['침체','평년','호황'].forEach((n,g)=>{
  const idx=seeds.map((_,i)=>i).filter(i=>info[i].di===g);
  const c={};
  idx.forEach(i=>{let bv=-Infinity,bx=null;XS.forEach(x=>{if(V[x][i]>bv){bv=V[x][i];bx=x}});c[bx]=(c[bx]||0)+1});
  console.log(`| ${n} | ${idx.length} | ${XS.map(x=>pct((c[x]||0)/idx.length)).join(' | ')} |`);
});
