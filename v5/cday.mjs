// 계약일 스윕. 타이밍 게임이 존재하는가.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||1000);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const val=(sd,st)=>FF.finalValue(FF.runScenario(sd,st).state,true);
const pct=x=>(x*100).toFixed(1)+'%';
const at=d=>s=>(s.day===d&&s.buys.contract===0)?FF.Cmd.contract():FF.Cmd.wait();
const base=seeds.map(sd=>val(sd,{}));
const DAYS=[1,2,4,6,8,10,15,20];
const V={};
for(const d of DAYS) V[d]=seeds.map((sd,i)=>val(sd,at(d))-base[i]);

console.log(`시드 ${N} · 계약 X=${FF.C.contract.limit}t 가격 ${FF.C.contract.price}\n`);
console.log('| 계약일 | 평균 | 승률 | 중앙 | Day1 대비 |');
console.log('|---|---|---|---|---|');
const m=d=>V[d].reduce((a,b)=>a+b,0)/N;
for(const d of DAYS){
  const v=V[d], s=[...v].sort((a,b)=>a-b);
  console.log(`| ${d}일 | ${Math.round(m(d))} | ${pct(v.filter(x=>x>0).length/N)} | ${Math.round(s[N>>1])} | ${Math.round(m(d)-m(1))} |`);
}
// 시드별 최적 계약일
let better=0, equal=0, worse=0, gainSum=0;
const bestDayHist={};
seeds.forEach((sd,i)=>{
  let bv=-Infinity,bd=null;
  for(let d=1;d<=25;d++){const v=val(sd,at(d))-base[i]; if(v>bv){bv=v;bd=d}}
  bestDayHist[bd]=(bestDayHist[bd]||0)+1;
  const d1=V[1][i];
  gainSum+=bv-d1;
  if(bv>d1+1)better++; else if(bv<d1-1)worse++; else equal++;
});
console.log(`\n## 최적일 대비 Day 1`);
console.log(`| 항목 | 값 |`);console.log('|---|---|');
console.log(`| 최적일이 Day1 보다 나음 | ${pct(better/N)} |`);
console.log(`| 같음 | ${pct(equal/N)} |`);
console.log(`| 타이밍 가치 평균 | ${Math.round(gainSum/N)} |`);
const top=Object.entries(bestDayHist).sort((a,b)=>b[1]-a[1]).slice(0,8);
console.log(`\n최적 계약일 상위: ` + top.map(([d,c])=>`${d}일 ${pct(c/N)}`).join(' · '));
// 계약이 이득인 판만 따로
const useful=seeds.map((sd,i)=>{
  let bv=-Infinity;for(let d=1;d<=25;d++){const v=val(sd,at(d))-base[i];if(v>bv)bv=v}
  return {i,bv,d1:V[1][i]};
}).filter(r=>r.bv>0);
console.log(`\n## 계약이 이득인 판 ${useful.length} (${pct(useful.length/N)})`);
console.log(`| Day1 도 이득 | ${pct(useful.filter(r=>r.d1>0).length/useful.length)} |`);
console.log(`| Day1 대비 평균 손실 | ${Math.round(useful.reduce((a,r)=>a+(r.bv-r.d1),0)/useful.length)} |`);
