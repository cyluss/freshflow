// C안: 고정비 + 기간비례. 최적 계약일 분포 중심.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||500);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const clone=o=>JSON.parse(JSON.stringify(o));
const pct=x=>(x*100).toFixed(1)+'%';
const at=d=>s=>(s.day===d&&s.buys.contract===0)?FF.Cmd.contract():FF.Cmd.wait();
const stock=s=>{var t=0;for(var i=0;i<s.lots.length;i++)t+=s.lots[i].q;return t};

// 신호 기반: 최근 3일 못 판 비율이 25% 이상이면 계약
function sigStrategy(){
  var m3=[],d3=[];
  return function(s){
    if(s.buys.contract>0)return FF.Cmd.wait();
    // 상태에서 직접 못판 비율을 볼 수 없으므로 재고와 날짜로 근사한다
    if(s.day>=4&&stock(s)<1)return FF.Cmd.contract();
    return FF.Cmd.wait();
  };
}
console.log(`시드 ${N} · 가격 = fixed + (1750-fixed) × 남은기간/30\n`);
console.log('| fixed | Day1 최적 | Day20+ 최적 | Day5~19 최적 | 신호전략 | 계약1일 | 조합 | 무투자최선 |');
console.log('|---|---|---|---|---|---|---|---|');
for(const fixed of [0,600,900,1200,1750]){
  const R=clone(FF.C); R.contract={limit:1,price:1750,max:1,fixed:fixed};
  const val=(sd,st)=>FF.finalValue(FF.runScenario(sd,st,null,R).state,true,R);
  const base=seeds.map(sd=>val(sd,{}));
  const hist={};
  seeds.forEach((sd,i)=>{
    let bv=-Infinity,bd=null;
    for(let d=1;d<=28;d++){const v=val(sd,at(d))-base[i];if(v>bv){bv=v;bd=d}}
    hist[bd]=(hist[bd]||0)+1;
  });
  const inRange=(lo,hi)=>Object.entries(hist).filter(([d])=>+d>=lo&&+d<=hi)
    .reduce((a,[,c])=>a+c,0)/N;
  const st=x=>{let d=0,w=0;seeds.forEach((sd,i)=>{const v=val(sd,x)-base[i];d+=v;if(v>0)w++});
    return `${Math.round(d/N)} (${pct(w/N)})`};
  const both=s=>{if(s.day===2&&s.buys.contract===0)return FF.Cmd.contract();
    if(s.day===4&&s.buys.sales===0)return FF.Cmd.buy('sales');return FF.Cmd.wait()};
  const CAND=[{n:'무투자',p:{}},{n:'계약1',p:at(1)},{n:'계약10',p:at(10)},
    {n:'계약20',p:at(20)},{n:'판매',p:{6:'sales'}},{n:'조합',p:both}];
  const best={};
  seeds.forEach(sd=>{let bv=-Infinity,bn=null;
    CAND.forEach(c=>{const v=val(sd,c.p);if(v>bv){bv=v;bn=c.n}});best[bn]=(best[bn]||0)+1});
  console.log(`| ${fixed} | ${pct((hist[1]||0)/N)} | ${pct(inRange(20,28))} | ${pct(inRange(5,19))} | ${st(sigStrategy())} | ${st(at(1))} | ${st(both)} | ${pct((best['무투자']||0)/N)} |`);
}
