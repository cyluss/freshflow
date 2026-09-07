// V1 최종 경제 검증. 확정 사양으로 지표 세트를 한 번 기록한다.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||1000);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const val=(sd,st)=>FF.finalValue(FF.runScenario(sd,st).state,true);
const pct=x=>(x*100).toFixed(1)+'%';
const ci=(w,n)=>{const p=w/n,e=1.96*Math.sqrt(p*(1-p)/n);return `${pct(p-e)}~${pct(p+e)}`};
const stock=s=>{var t=0;for(var i=0;i<s.lots.length;i++)t+=s.lots[i].q;return t};
const atC=d=>s=>(s.day===d&&s.buys.contract===0)?FF.Cmd.contract():FF.Cmd.wait();

console.log(`# V1 최종 경제 검증\n`);
console.log(`시드 ${N} · 계약 X=${FF.C.contract.limit}t 가격 ${FF.C.contract.price} 유지비 0 1회 한정`);
console.log(`판매 증설 +${FF.C.step.sales} 가격 ${FF.C.cost.sales} 유지비 ${FF.C.maint.sales}\n`);

const P={
 '계약 2일':atC(2), '계약 6일':atC(6),
 '판매 2일':{2:'sales'}, '판매 재고8t':s=>(!s.pend&&s.buys.sales===0&&stock(s)>=8)?FF.Cmd.buy('sales'):FF.Cmd.wait(),
 '계약+판매':s=>{if(s.day===2&&s.buys.contract===0)return FF.Cmd.contract();
                if(s.day===4&&s.buys.sales===0)return FF.Cmd.buy('sales');return FF.Cmd.wait()},
 '계약+재고8t':s=>{if(s.pend)return FF.Cmd.wait();
                  if(s.day===2&&s.buys.contract===0)return FF.Cmd.contract();
                  if(s.buys.sales===0&&stock(s)>=8)return FF.Cmd.buy('sales');return FF.Cmd.wait()}
};
const base=seeds.map(sd=>val(sd,{}));
const V={}; for(const [n,st] of Object.entries(P)) V[n]=seeds.map((sd,i)=>val(sd,st)-base[i]);

console.log('## 1. 전략별 성과');
console.log('| 전략 | 평균 | 승률 | 95% 구간 | 표준편차 | p10 | p90 |');
console.log('|---|---|---|---|---|---|---|');
for(const n of Object.keys(P)){
  const v=V[n], m=v.reduce((a,b)=>a+b,0)/N;
  const sd=Math.sqrt(v.reduce((a,b)=>a+(b-m)*(b-m),0)/N);
  const s=[...v].sort((a,b)=>a-b), w=v.filter(x=>x>0).length;
  console.log(`| ${n} | ${Math.round(m)} | ${pct(w/N)} | ${ci(w,N)} | ${Math.round(sd)} | ${Math.round(s[Math.floor(N*.1)])} | ${Math.round(s[Math.floor(N*.9)])} |`);
}
const m=n=>V[n].reduce((a,b)=>a+b,0)/N;
console.log(`\n## 2. 초가산 효과`);
console.log(`| 항목 | 값 |`);console.log('|---|---|');
console.log(`| 계약 단독 | ${Math.round(m('계약 2일'))} |`);
console.log(`| 판매 단독 | ${Math.round(m('판매 2일'))} |`);
console.log(`| 조합 | ${Math.round(m('계약+판매'))} |`);
console.log(`| 초가산 | ${Math.round(m('계약+판매')-m('계약 2일')-m('판매 2일'))} |`);

// 3. 판단 여지와 병목
const CAND=[{n:'무투자',p:{}},{n:'계약',p:atC(2)},{n:'계약 6일',p:atC(6)},
 {n:'판매',p:{2:'sales'}},{n:'판매 6일',p:{6:'sales'}},{n:'조합',p:P['계약+판매']}];
const best={}; let gap=0;
seeds.forEach((sd,i)=>{
  let bv=-Infinity,bn=null;
  CAND.forEach(c=>{const v=val(sd,c.p);if(v>bv){bv=v;bn=c.n}});
  best[bn]=(best[bn]||0)+1; gap+=bv-base[i];
});
console.log(`\n## 3. 판단 여지와 최선 분포`);
console.log(`판단 여지 ${Math.round(gap/N)}\n`);
console.log('| 최선 전략 | 비율 | 95% 구간 |');console.log('|---|---|---|');
CAND.forEach(c=>console.log(`| ${c.n} | ${pct((best[c.n]||0)/N)} | ${ci(best[c.n]||0,N)} |`));
const bc={};let n2=0;
for(const sd of seeds.slice(0,300))
  FF.runScenario(sd,{}).days.forEach(d=>{bc[d.result.b]=(bc[d.result.b]||0)+1;n2++});
console.log('\n병목 ' + Object.entries(bc).sort((a,b)=>b[1]-a[1])
  .map(([k,v])=>`${k} ${(v/n2*100).toFixed(0)}%`).join(' · '));

// 4. 계약 신호별 성과
console.log(`\n## 4. 계약 신호별 성과 (6일 구매)`);
const rows=seeds.map((sd,i)=>{
  const W=FF.World(sd); const s=FF.initialState(W);
  let m3=0,d3=0,st=0;
  for(let t=0;t<5;t++){const w=W.next();const o=FF.transition(s,FF.Cmd.wait(),w);
    if(t>=2){m3+=o.result.missed;d3+=o.result.dem}}
  st=stock(s);
  return {rate:d3>0?m3/d3:0, stock:st, gain:val(sd,atC(6))-base[i]};
});
console.log('| 신호 | 판수 | 발생 빈도 | 평균 | 양수비율 |');
console.log('|---|---|---|---|---|');
const sig=[
 ['전체',()=>true],
 ['못판 25% 이상',r=>r.rate>=0.25],
 ['못판 40% 이상',r=>r.rate>=0.40],
 ['못판 40% + 재고 0.5t 미만',r=>r.rate>=0.40&&r.stock<0.5]
];
for(const [name,f] of sig){
  const g=rows.filter(f);
  const mm=g.length?g.reduce((a,r)=>a+r.gain,0)/g.length:0;
  console.log(`| ${name} | ${g.length} | ${pct(g.length/N)} | ${Math.round(mm)} | ${pct(g.filter(r=>r.gain>0).length/(g.length||1))} |`);
}

// 5. 판매 투자 가치 유지 (V0 v2 대비)
console.log(`\n## 5. 판매 투자 가치`);
console.log('| 전략 | 평균 | 승률 | 참고 V0 v2 |');
console.log('|---|---|---|---|');
const s2=V['판매 2일'], s8=V['판매 재고8t'];
const wr=v=>pct(v.filter(x=>x>0).length/N);
console.log(`| 판매 2일 | ${Math.round(m('판매 2일'))} | ${wr(s2)} | 140 (40.4%) |`);
console.log(`| 판매 재고8t | ${Math.round(m('판매 재고8t'))} | ${wr(s8)} | 347 (40.2%) |`);
