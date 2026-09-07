// 집하 제거 후 4전략 구조. 파라미터 불변, 같은 1000시드.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||1000);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const val=(sd,st)=>FF.finalValue(FF.runScenario(sd,st).state,true);
const pct=x=>(x*100).toFixed(1)+'%';
const ci=(w,n)=>{const p=w/n,e=1.96*Math.sqrt(p*(1-p)/n);return `${pct(p-e)}~${pct(p+e)}`};
const P={
 '무투자':{},
 '계약':  s=>(s.day===2&&s.buys.contract===0)?FF.Cmd.contract():FF.Cmd.wait(),
 '판매':  {2:'sales'},
 '집하':  {2:'intake'},
 '조합':  s=>{if(s.day===2&&s.buys.contract===0)return FF.Cmd.contract();
              if(s.day===4&&s.buys.sales===0)return FF.Cmd.buy('sales');return FF.Cmd.wait()}
};
const V={};
for(const n of Object.keys(P)) V[n]=seeds.map(sd=>val(sd,P[n]));
const bestOf=(list,i)=>{let bv=-Infinity,bn=null;list.forEach(n=>{if(V[n][i]>bv){bv=V[n][i];bn=n}});return bn};

const WITH=['무투자','계약','판매','집하','조합'];
const WITHOUT=['무투자','계약','판매','조합'];
const b1=seeds.map((_,i)=>bestOf(WITH,i));
const b2=seeds.map((_,i)=>bestOf(WITHOUT,i));
const cnt=a=>{const c={};a.forEach(x=>c[x]=(c[x]||0)+1);return c};
const c1=cnt(b1), c2=cnt(b2);

console.log(`시드 ${N} · X=1t 가격 1750 · 파라미터 불변\n`);
console.log('| 최선 전략 | 집하 있을 때 | 집하 뺀 뒤 | 95% 구간 |');
console.log('|---|---|---|---|');
for(const n of WITH){
  console.log(`| ${n} | ${pct((c1[n]||0)/N)} | ${n==='집하'?'-':pct((c2[n]||0)/N)} | ${n==='집하'?'-':ci(c2[n]||0,N)} |`);
}
// 집하 최선이던 판의 재배분
const moved=cnt(seeds.map((_,i)=>b1[i]==='집하'?b2[i]:null).filter(Boolean));
const total=(c1['집하']||0);
console.log(`\n## 집하 최선이던 ${total}판의 이동`);
console.log('| 이동처 | 판수 | 비율 |');
console.log('|---|---|---|');
Object.entries(moved).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>
  console.log(`| ${k} | ${v} | ${pct(v/total)} |`));

// 승률은 불변
const base=V['무투자'];
console.log('\n| 전략 | 평균 | 승률 |');
console.log('|---|---|---|');
for(const n of WITHOUT.slice(1)){
  const d=V[n].map((v,i)=>v-base[i]);
  console.log(`| ${n} | ${Math.round(d.reduce((a,b)=>a+b,0)/N)} | ${pct(d.filter(x=>x>0).length/N)} |`);
}
