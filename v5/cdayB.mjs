// B안: 기간비례 가격에서 계약일 스윕
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||600);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const clone=o=>JSON.parse(JSON.stringify(o));
const pct=x=>(x*100).toFixed(1)+'%';
const at=d=>s=>(s.day===d&&s.buys.contract===0)?FF.Cmd.contract():FF.Cmd.wait();
const stock=s=>{var t=0;for(var i=0;i<s.lots.length;i++)t+=s.lots[i].q;return t};
// 신호 전략: 최근 3일 못판 비율이 임계 이상이면 계약
const sig=th=>s=>{
  if(s.buys.contract>0)return FF.Cmd.wait();
  return FF.Cmd.wait();
};
function run(R,label){
  const val=(sd,st)=>FF.finalValue(FF.runScenario(sd,st,null,R).state,true,R);
  const base=seeds.map(sd=>val(sd,{}));
  const DAYS=[1,2,4,6,8,10,15,20,25];
  console.log(`\n## ${label}`);
  console.log('| 계약일 | 가격 | 평균 | 승률 |');
  console.log('|---|---|---|---|');
  const V={};
  for(const d of DAYS){
    const v=seeds.map((sd,i)=>val(sd,at(d))-base[i]); V[d]=v;
    const price=FF.contractPrice({day:d},R);
    console.log(`| ${d}일 | ${price} | ${Math.round(v.reduce((a,b)=>a+b,0)/N)} | ${pct(v.filter(x=>x>0).length/N)} |`);
  }
  // 최적 계약일 분포
  const hist={}; let better=0, gain=0;
  seeds.forEach((sd,i)=>{
    let bv=-Infinity,bd=null;
    for(let d=1;d<=28;d++){const v=val(sd,at(d))-base[i];if(v>bv){bv=v;bd=d}}
    hist[bd]=(hist[bd]||0)+1;
    const d1=val(sd,at(1))-base[i];
    if(bv>d1+1)better++;
    gain+=bv-d1;
  });
  const top=Object.entries(hist).sort((a,b)=>b[1]-a[1]).slice(0,6);
  console.log(`\n최적일 상위: ${top.map(([d,c])=>`${d}일 ${pct(c/N)}`).join(' · ')}`);
  console.log(`Day1 보다 나은 판 ${pct(better/N)} · 타이밍 가치 ${Math.round(gain/N)}`);
  // 전략 비교
  const both=s=>{if(s.day===2&&s.buys.contract===0)return FF.Cmd.contract();
    if(s.day===4&&s.buys.sales===0)return FF.Cmd.buy('sales');return FF.Cmd.wait()};
  const stk=s=>(!s.pend&&s.buys.sales===0&&stock(s)>=8)?FF.Cmd.buy('sales'):FF.Cmd.wait();
  const st=x=>{let d=0,w=0;seeds.forEach((sd,i)=>{const v=val(sd,x)-base[i];d+=v;if(v>0)w++});
    return `${Math.round(d/N)} (${pct(w/N)})`};
  const CAND=[{n:'무투자',p:{}},{n:'계약1일',p:at(1)},{n:'계약10일',p:at(10)},
    {n:'계약20일',p:at(20)},{n:'판매',p:{6:'sales'}},{n:'조합',p:both}];
  const best={};
  seeds.forEach(sd=>{let bv=-Infinity,bn=null;
    CAND.forEach(c=>{const v=val(sd,c.p);if(v>bv){bv=v;bn=c.n}});best[bn]=(best[bn]||0)+1});
  console.log(`판매 ${st({6:'sales'})} · 조합 ${st(both)} · 재고8t ${st(stk)}`);
  console.log('최선 분포: ' + CAND.map(c=>`${c.n} ${pct((best[c.n]||0)/N)}`).join(' · '));
}
const B=clone(FF.C); B.contract={limit:1,price:1750,max:1};
run(B,'B 기간비례 (fixed 0)');
