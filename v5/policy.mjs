// 목표재고 계수를 플레이어가 정한다면 판단할 값이 있는가
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||400);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const clone=o=>JSON.parse(JSON.stringify(o));
const pct=x=>(x*100).toFixed(0)+'%';
const COVERS=[0.5,0.75,1,1.25,1.5,2];
const val=(sd,R)=>FF.finalValue(FF.runScenario(sd,{},null,R).state,true,R);
const V={};
for(const c of COVERS){
  const R=clone(FF.C); R.cover=c;
  V[c]=seeds.map(sd=>val(sd,R));
}
const R0=clone(FF.C);
const b=seeds.map(sd=>val(sd,R0));
const m=a=>Math.round(a.reduce((x,y)=>x+y,0)/a.length);
console.log(`시드 ${N} · 목표재고 계수 고정 (기본 ${FF.C.cover})\n`);
console.log('| cover | 평균 | 기본 대비 | 최선인 판 |');
console.log('|---|---|---|---|');
const best={};
seeds.forEach((sd,i)=>{
  let bv=-Infinity,bc=null;
  COVERS.forEach(c=>{if(V[c][i]>bv){bv=V[c][i];bc=c}});
  best[bc]=(best[bc]||0)+1;
});
COVERS.forEach(c=>console.log(`| ${c} | ${m(V[c])} | ${m(V[c].map((v,i)=>v-b[i]))} | ${pct((best[c]||0)/N)} |`));
// 사후 최적 cover 와 고정 최선의 차이
let gap=0;
seeds.forEach((sd,i)=>{
  let bv=-Infinity; COVERS.forEach(c=>{if(V[c][i]>bv)bv=V[c][i]});
  gap+=bv-b[i];
});
console.log(`\n판마다 최적 cover 를 골랐을 때 기본 대비 +${Math.round(gap/N)}`);
// 재고 부족 병목이 줄어드는가
for(const c of [0.5,1,1.5,2]){
  const R=clone(FF.C); R.cover=c;
  const bc={};let n2=0,waste=0,prod=0;
  for(const sd of seeds.slice(0,200)){
    FF.runScenario(sd,{},null,R).days.forEach(d=>{bc[d.result.b]=(bc[d.result.b]||0)+1;n2++;
      waste+=d.result.wI+d.result.wS+d.result.wT; prod+=d.result.prod});
  }
  console.log(`cover ${c}: ` + Object.entries(bc).sort((a,b2)=>b2[1]-a[1])
    .map(([k,v])=>`${k} ${pct(v/n2)}`).join(' · ') + ` · 로스 ${pct(waste/prod)}`);
}
