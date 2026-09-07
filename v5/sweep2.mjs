import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||300);
const seeds=[]; for(let i=1;i<=N;i++) seeds.push(i*7+3);
const clone=o=>JSON.parse(JSON.stringify(o));
const val=(sd,plan,R)=>FF.finalValue(FF.runScenario(sd,plan,null,R).state,true,R);
const condBoth=[
 {when:[{read:'stock',op:'>',value:12},{read:'buysSales',op:'==',value:0}],then:{buy:'sales'}},
 {when:[{read:'stock',op:'<',value:6},{read:'buysIntake',op:'==',value:0}],then:{buy:'intake'}},
 {then:{wait:true}}];
function evaluate(R){
 const base=seeds.map(sd=>val(sd,{},R));
 const stat=p=>{let d=0,w=0;seeds.forEach((sd,i)=>{const v=val(sd,p,R);d+=v-base[i];if(v>base[i])w++});
   return {mean:Math.round(d/seeds.length),win:w/seeds.length}};
 const cands=[{},{2:'intake'},{2:'sales'},{2:'intake',4:'sales'},{2:'intake',4:'intake'},{2:'sales',4:'sales'}];
 let gap=0,idle=0;
 seeds.forEach((sd,i)=>{const vs=cands.map(p=>val(sd,p,R));const b=Math.max(...vs);gap+=b-vs[0];if(b===vs[0])idle++});
 const bc={};let n=0;
 for(const sd of seeds.slice(0,120)) FF.runScenario(sd,{},null,R).days.forEach(d=>{bc[d.result.b]=(bc[d.result.b]||0)+1;n++});
 const top=Object.entries(bc).sort((a,b)=>b[1]-a[1])[0];
 return {i:stat({2:'intake'}),s:stat({2:'sales'}),b:stat({2:'intake',4:'sales'}),
         c:stat(condBoth),gap:Math.round(gap/seeds.length),idle:idle/seeds.length,
         top:top[0],share:top[1]/n};
}
const pct=x=>(x*100).toFixed(0)+'%';
console.log(`시드 ${N}판 · 분산 sd2.5 dd3 고정`);
console.log('| 가격 | 유지비 | 집하 | 판매 | 둘다 | 조건둘다 | 여지 | 무투자최선 | 최대병목 |');
console.log('|---|---|---|---|---|---|---|---|---|');
for(const pf of [1,0.85,0.75]) for(const mf of [1.3,1.5,1.7]){
 const R=clone(FF.C);
 R.cost={intake:Math.round(1500*pf),sales:Math.round(412*pf)};
 R.maint={intake:Math.round(20*mf),storage:8,sales:Math.round(25*mf)};
 R.dd=3; R.sd=2.5;
 const e=evaluate(R);
 const c=x=>`${x.mean} (${pct(x.win)})`;
 console.log(`| ${(pf*100).toFixed(0)}% | x${mf} | ${c(e.i)} | ${c(e.s)} | ${c(e.b)} | ${c(e.c)} | ${e.gap} | ${pct(e.idle)} | ${e.top} ${pct(e.share)} |`);
}
