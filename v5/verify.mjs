// 밸런스 후보 A/B 검증. 1000 seed.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();

const N=+(process.env.N||1000);
const seeds=[]; for(let i=1;i<=N;i++) seeds.push(i*13+5);
const clone=o=>JSON.parse(JSON.stringify(o));
const val=(sd,plan,R)=>FF.finalValue(FF.runScenario(sd,plan,null,R).state,true,R);
const pct=x=>(x*100).toFixed(0)+'%';

// 예보를 읽는 전략. hor/blur 로 앞으로의 국면 기울기를 본다.
function outlookGapAt(state,axis){
  const v=FF.blur(FF.hor(axis==='supply'?state.si:state.di,1,5));
  const p=FF.pct(v);
  return p[2]-p[0];              // 높음 확률 - 낮음 확률
}
const stratForecast = R => s => {
  if(s.pend) return FF.Cmd.wait();
  const gs=outlookGapAt(s,'supply'), gd=outlookGapAt(s,'demand');
  if(s.buys.sales===0 && gd>=15 && s.cash>=R.cost.sales) return FF.Cmd.buy('sales');
  if(s.buys.intake===0 && gs>=15 && s.cash>=R.cost.intake) return FF.Cmd.buy('intake');
  return FF.Cmd.wait();
};
const stratBottleneck = R => s => {
  if(s.pend) return FF.Cmd.wait();
  const stock=FF.view.stock(s);
  if(s.buys.sales===0 && stock>12) return FF.Cmd.buy('sales');
  if(s.buys.intake===0 && stock<6 && s.day>2) return FF.Cmd.buy('intake');
  return FF.Cmd.wait();
};
const stratBoth = R => s => {
  if(s.pend) return FF.Cmd.wait();
  const stock=FF.view.stock(s);
  const gs=outlookGapAt(s,'supply'), gd=outlookGapAt(s,'demand');
  if(s.buys.sales===0 && (stock>12 || gd>=15)) return FF.Cmd.buy('sales');
  if(s.buys.intake===0 && (stock<6 && gs>=10) && s.day>2) return FF.Cmd.buy('intake');
  return FF.Cmd.wait();
};

function run(R,label){
  const base=seeds.map(sd=>val(sd,{},R));
  const stat=(plan)=>{
    let d=0,w=0;
    seeds.forEach((sd,i)=>{const v=val(sd, typeof plan==='function'?plan(R):plan, R);
      d+=v-base[i]; if(v>base[i])w++});
    return {mean:Math.round(d/seeds.length), win:w/seeds.length};
  };
  const fixed={
    '집하':stat({2:'intake'}), '판매':stat({2:'sales'}), '둘다':stat({2:'intake',4:'sales'})
  };
  const cond={
    '재고조건':stat(stratBottleneck), '예보조건':stat(stratForecast), '병목+예보':stat(stratBoth)
  };

  // 사후 최선 행동 분포
  const CANDS=[
    {n:'무투자',p:{}},
    {n:'집하만',p:{2:'intake'}}, {n:'집하만',p:{5:'intake'}}, {n:'집하만',p:{9:'intake'}},
    {n:'판매만',p:{2:'sales'}}, {n:'판매만',p:{5:'sales'}}, {n:'판매만',p:{9:'sales'}},
    {n:'둘다',p:{2:'intake',4:'sales'}}, {n:'둘다',p:{2:'sales',4:'intake'}},
    {n:'둘다',p:{6:'intake',8:'sales'}}
  ];
  const bestBy={}, dayHist={};
  let gap=0;
  seeds.forEach((sd,i)=>{
    let best=-Infinity, bn=null, bp=null;
    CANDS.forEach(c=>{const v=val(sd,c.p,R); if(v>best){best=v;bn=c.n;bp=c.p}});
    bestBy[bn]=(bestBy[bn]||0)+1;
    gap+=best-base[i];
    Object.keys(bp).forEach(d=>{dayHist[d]=(dayHist[d]||0)+1});
  });

  // 병목 분포
  const bc={}; let n=0;
  for(const sd of seeds.slice(0,200))
    FF.runScenario(sd,{},null,R).days.forEach(d=>{bc[d.result.b]=(bc[d.result.b]||0)+1;n++});
  const bsorted=Object.entries(bc).sort((a,b)=>b[1]-a[1]);

  console.log(`\n## ${label}`);
  console.log('| 전략 | 평균 | 승률 |'); console.log('|---|---|---|');
  for(const [k,v] of Object.entries(fixed)) console.log(`| ${k} | ${v.mean} | ${pct(v.win)} |`);
  for(const [k,v] of Object.entries(cond))  console.log(`| ${k} | ${v.mean} | ${pct(v.win)} |`);
  console.log('\n| 사후 최선 | 비율 |'); console.log('|---|---|');
  ['무투자','집하만','판매만','둘다'].forEach(k=>console.log(`| ${k} | ${pct((bestBy[k]||0)/N)} |`));
  console.log(`\n판단 여지 ${Math.round(gap/N)} · 최대병목 ${bsorted[0][0]} ${pct(bsorted[0][1]/n)}`);
  console.log('병목 ' + bsorted.map(([k,v])=>`${k} ${pct(v/n)}`).join(' · '));
  const dsum=Object.values(dayHist).reduce((a,b)=>a+b,0);
  console.log('최선 투자일 ' + Object.entries(dayHist).sort((a,b)=>a[0]-b[0])
    .map(([d,v])=>`${d}일 ${pct(v/dsum)}`).join(' · '));
  return {fixed,cond,bestBy,gap:Math.round(gap/N),top:bsorted[0]};
}

run(clone(FF.C),'현행 v2');

const D=clone(FF.C); D.salvage=0.6; D.maint={intake:34,storage:8,sales:43};
run(D,'D: 처분 60% + 유지비 1.3배 더');
