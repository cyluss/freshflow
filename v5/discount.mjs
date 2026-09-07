// 하류 레버 후보: 할인 판매. 마진을 깎아 수요를 늘린다.
// 판마다 최적 할인이 갈리는지, 즉 판단할 값이 있는지만 본다.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||400);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const clone=o=>JSON.parse(JSON.stringify(o));
const pct=x=>(x*100).toFixed(0)+'%';
// 할인 d 면 판가 (1-d), 수요 (1+E*d). E 는 탄력성.
const E=+(process.env.E||2);
const DS=[0,0.05,0.10,0.15];
const val=(sd,R)=>FF.finalValue(FF.runScenario(sd,{},null,R).state,true,R);
console.log(`시드 ${N} · 탄력성 ${E}\n`);
console.log('| 할인 | 판가 | 수요배 | 평균 | 무할인 대비 | 최선인 판 |');
console.log('|---|---|---|---|---|---|');
const V={};
for(const d of DS){
  const R=clone(FF.C);
  R.price=Math.round(FF.C.price*(1-d));
  R.dm=FF.C.dm.map(x=>x*(1+E*d));
  V[d]=seeds.map(sd=>val(sd,R));
}
const b=V[0];
const m=a=>Math.round(a.reduce((x,y)=>x+y,0)/a.length);
const best={}; let gap=0;
seeds.forEach((sd,i)=>{
  let bv=-Infinity,bd=null;
  DS.forEach(d=>{if(V[d][i]>bv){bv=V[d][i];bd=d}});
  best[bd]=(best[bd]||0)+1; gap+=bv-b[i];
});
DS.forEach(d=>console.log(`| ${pct(d)} | ${Math.round(FF.C.price*(1-d))} | ${(1+E*d).toFixed(2)} | ${m(V[d])} | ${m(V[d].map((v,i)=>v-b[i]))} | ${pct((best[d]||0)/N)} |`));
console.log(`\n판마다 최적 할인을 고르면 +${Math.round(gap/N)}`);
