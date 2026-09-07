// 각 전략이 최선인 대표 판을 뽑고 그 판의 성질을 본다
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||1000);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const val=(sd,st)=>FF.finalValue(FF.runScenario(sd,st).state,true);
const P={
 '무투자':{},
 '계약':   s=>(s.day===2&&s.buys.contract===0)?FF.Cmd.contract():FF.Cmd.wait(),
 '판매':   {2:'sales'},
 '집하':   {2:'intake'},
 '조합':   s=>{if(s.day===2&&s.buys.contract===0)return FF.Cmd.contract();
               if(s.day===4&&s.buys.sales===0)return FF.Cmd.buy('sales');return FF.Cmd.wait()}
};
const NAMES=Object.keys(P);
// 판의 성질을 요약한다 (무투자 기준선에서)
function profile(sd){
  const r=FF.runScenario(sd,{});
  let prod=0,dem=0,missed=0,over=0,waste=0,end=0,glut=0,drought=0;
  r.days.forEach(d=>{const x=d.result;
    prod+=x.prod;dem+=x.dem;missed+=x.missed;waste+=x.wI+x.wS+x.wT;end+=x.end;
    const o=Math.max(0,x.prod-20); if(o>0.05){over+=o;glut++}
    if(x.prod<16)drought++;
  });
  const n=r.days.length;
  return {prod:prod/n,dem:dem/n,missRate:missed/dem,over,glut,drought,
    stock:end/n,waste:waste/prod};
}
const rows=seeds.map(sd=>{
  const v={};NAMES.forEach(n=>v[n]=val(sd,P[n]));
  let bv=-Infinity,bn=null;NAMES.forEach(n=>{if(v[n]>bv){bv=v[n];bn=n}});
  return {sd,best:bn,margin:bv-v['무투자']};
});
const f1=x=>x.toFixed(1);
console.log(`시드 ${N} · X=1t 가격 1750\n`);
console.log('| 최선 | 판수 | 평균 생산 | 평균 수요 | 못판율 | 초과생산 | 풍작일 | 부족일 | 평균 재고 | 로스율 |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for(const n of NAMES){
  const g=rows.filter(r=>r.best===n);
  if(!g.length){console.log(`| ${n} | 0 | - | - | - | - | - | - | - | - |`);continue}
  const ps=g.map(r=>profile(r.sd));
  const avg=k=>ps.reduce((a,p)=>a+p[k],0)/ps.length;
  console.log(`| ${n} | ${g.length} | ${f1(avg('prod'))}t | ${f1(avg('dem'))}t | ${(avg('missRate')*100).toFixed(0)}% | ${f1(avg('over'))}t | ${f1(avg('glut'))}일 | ${f1(avg('drought'))}일 | ${f1(avg('stock'))}t | ${(avg('waste')*100).toFixed(0)}% |`);
}
// 대표 시드 하나씩
console.log('\n| 최선 | 대표 시드 | 우위 |');
console.log('|---|---|---|');
for(const n of NAMES){
  const g=rows.filter(r=>r.best===n).sort((a,b)=>b.margin-a.margin);
  if(g.length)console.log(`| ${n} | ${g[0].sd} | +${Math.round(g[0].margin)} |`);
}
