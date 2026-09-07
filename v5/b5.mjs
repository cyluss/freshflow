// 조합 시너지 분해: 계약 추가매입이 판매 증설로 얼마나 더 소화되나
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||400);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const clone=o=>JSON.parse(JSON.stringify(o));
const R=clone(FF.C); R.contract={limit:2,price:1500,max:1};
const run=(sd,st)=>FF.runScenario(sd,st,null,R);
const fin=r=>FF.finalValue(r.state,true,R);
const P={
  none: {},
  c:    s=>(s.day===2&&s.buys.contract===0)?FF.Cmd.contract():FF.Cmd.wait(),
  sale: {4:'sales'},
  both: s=>{if(s.day===2&&s.buys.contract===0)return FF.Cmd.contract();
            if(s.day===4&&s.buys.sales===0)return FF.Cmd.buy('sales');return FF.Cmd.wait()}
};
let vc=0,vs=0,vb=0, accC=0, accB=0, soldC=0, soldB=0, wasteC=0, wasteB=0, endC=0, endB=0;
for(const sd of seeds){
  const a=run(sd,P.none), c=run(sd,P.c), s2=run(sd,P.sale), b=run(sd,P.both);
  const f0=fin(a);
  vc+=fin(c)-f0; vs+=fin(s2)-f0; vb+=fin(b)-f0;
  for(let i=0;i<a.days.length;i++){
    accC+=c.days[i].result.acc-a.days[i].result.acc;
    accB+=b.days[i].result.acc-s2.days[i].result.acc;      // 판매증설 있는 상태에서 계약의 추가매입
    soldC+=c.days[i].result.sold-a.days[i].result.sold;
    soldB+=b.days[i].result.sold-s2.days[i].result.sold;
    wasteC+=(c.days[i].result.wS+c.days[i].result.wT)-(a.days[i].result.wS+a.days[i].result.wT);
    wasteB+=(b.days[i].result.wS+b.days[i].result.wT)-(s2.days[i].result.wS+s2.days[i].result.wT);
  }
  endC+=c.days[c.days.length-1].result.end-a.days[a.days.length-1].result.end;
  endB+=b.days[b.days.length-1].result.end-s2.days[s2.days.length-1].result.end;
}
const p=x=>(x/N).toFixed(1);
const r=x=>Math.round(x/N);
console.log(`시드 ${N} · 가격 1500 · X=2t\n`);
console.log('| 항목 | 값 |');console.log('|---|---|');
console.log(`| 계약 단독 가치 | ${r(vc)} |`);
console.log(`| 판매 단독 가치 | ${r(vs)} |`);
console.log(`| 조합 가치 | ${r(vb)} |`);
console.log(`| 단순 합 | ${r(vc)+r(vs)} |`);
console.log(`| 초가산 효과 | ${r(vb)-r(vc)-r(vs)} |`);
console.log('');
console.log('| 계약의 효과 | 판매증설 없을 때 | 있을 때 |');console.log('|---|---|---|');
console.log(`| 추가 매입 | ${p(accC)}t | ${p(accB)}t |`);
console.log(`| 추가 판매 | ${p(soldC)}t | ${p(soldB)}t |`);
console.log(`| 추가 폐기 | ${p(wasteC)}t | ${p(wasteB)}t |`);
console.log(`| 소화율 | ${(soldC/accC*100).toFixed(0)}% | ${(soldB/accB*100).toFixed(0)}% |`);
