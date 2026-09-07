// 1000시드 검증. 신뢰구간과 최선 전략 분포 중심.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||1000);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const clone=o=>JSON.parse(JSON.stringify(o));
const pct=x=>(x*100).toFixed(1)+'%';
const stock=s=>{var t=0;for(var i=0;i<s.lots.length;i++)t+=s.lots[i].q;return t};
const R=clone(FF.C); R.contract={limit:1,price:1750,max:1};
const val=(sd,st)=>FF.finalValue(FF.runScenario(sd,st,null,R).state,true,R);

const P={
 '무투자':{},
 '계약 2일':   s=>(s.day===2&&s.buys.contract===0)?FF.Cmd.contract():FF.Cmd.wait(),
 '계약 6일':   s=>(s.day===6&&s.buys.contract===0)?FF.Cmd.contract():FF.Cmd.wait(),
 '판매 2일':   {2:'sales'},
 '집하 2일':   {2:'intake'},
 '판매 재고8t':s=>(!s.pend&&s.buys.sales===0&&stock(s)>=8)?FF.Cmd.buy('sales'):FF.Cmd.wait(),
 '계약+판매':  s=>{if(s.day===2&&s.buys.contract===0)return FF.Cmd.contract();
                  if(s.day===4&&s.buys.sales===0)return FF.Cmd.buy('sales');return FF.Cmd.wait()},
 '계약+재고8t':s=>{if(s.pend)return FF.Cmd.wait();
                  if(s.day===2&&s.buys.contract===0)return FF.Cmd.contract();
                  if(s.buys.sales===0&&stock(s)>=8)return FF.Cmd.buy('sales');return FF.Cmd.wait()}
};
const base=seeds.map(sd=>val(sd,{}));
// 승률의 95% 신뢰구간 (정규근사)
const ci=(w,n)=>{const p=w/n,e=1.96*Math.sqrt(p*(1-p)/n);return [p-e,p+e]};
console.log(`시드 ${N} · X=1t · 가격 1750 · 유지비 없음 · 1회 한정\n`);
console.log('| 전략 | 평균 | 승률 | 95% 구간 | 중앙 | p10 | p90 |');
console.log('|---|---|---|---|---|---|---|');
const V={};
for(const [n,st] of Object.entries(P)){
  const v=seeds.map((sd,i)=>val(sd,st)-base[i]);
  V[n]=v;
  const w=v.filter(x=>x>0).length;
  const s=[...v].sort((a,b)=>a-b);
  const [lo,hi]=ci(w,N);
  console.log(`| ${n} | ${Math.round(v.reduce((a,b)=>a+b,0)/N)} | ${pct(w/N)} | ${pct(lo)}~${pct(hi)} | ${Math.round(s[N>>1])} | ${Math.round(s[Math.floor(N*.1)])} | ${Math.round(s[Math.floor(N*.9)])} |`);
}
const m=n=>V[n].reduce((a,b)=>a+b,0)/N;
console.log(`\n초가산 절대량 ${Math.round(m('계약+판매')-m('계약 2일')-m('판매 2일'))}`);

// 최선 전략 분포
const CAND=['무투자','계약 2일','계약 6일','판매 2일','집하 2일','계약+판매'];
const best={};
seeds.forEach((sd,i)=>{
  let bv=-Infinity,bn=null;
  CAND.forEach(n=>{const v=V[n][i];if(v>bv){bv=v;bn=n}});
  best[bn]=(best[bn]||0)+1;
});
console.log('\n| 최선 전략 | 판 비율 | 95% 구간 |');
console.log('|---|---|---|');
CAND.forEach(n=>{const c=best[n]||0;const [lo,hi]=ci(c,N);
  console.log(`| ${n} | ${pct(c/N)} | ${pct(lo)}~${pct(hi)} |`)});

// 병목과 계약 발동
let bc={},n2=0,fired=0,cnt=0;
for(const sd of seeds.slice(0,300)){
  const r=FF.runScenario(sd,P['계약 2일'],null,R);
  r.days.forEach(d=>{bc[d.result.b]=(bc[d.result.b]||0)+1;n2++});
  const a=FF.runScenario(sd,{},null,R);
  let f=0;
  for(let i=0;i<r.days.length;i++)if(r.days[i].result.acc>a.days[i].result.acc+0.05)f++;
  fired+=f;cnt++;
}
console.log(`\n계약 발동일 평균 ${(fired/cnt).toFixed(1)}일`);
console.log('병목 ' + Object.entries(bc).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${(v/n2*100).toFixed(0)}%`).join(' · '));
