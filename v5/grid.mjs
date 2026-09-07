// 전략 격자. 재고만 vs 재고+역방향 예보를 분리해 예보의 한계효용을 본다.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||500);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const val=(sd,p)=>FF.finalValue(FF.runScenario(sd,p).state,true);
const base=seeds.map(sd=>val(sd,{}));
const pct=x=>(x*100).toFixed(0)+'%';
const gapOf=(s,axis)=>{const v=FF.pct(FF.blur(FF.hor(axis==='s'?s.si:s.di,1,5)));return v[2]-v[0]};

function stat(mk){
  let d=0,w=0;
  seeds.forEach((sd,i)=>{const v=val(sd,mk); d+=v-base[i]; if(v>base[i])w++});
  return {mean:Math.round(d/N),win:w/N};
}
const line=(name,r)=>console.log(`| ${name} | ${r.mean} | ${pct(r.win)} |`);

console.log(`시드 ${N}\n## 기준\n| 전략 | 평균 | 승률 |`);
console.log('|---|---|---|');
line('2일 집하',stat({2:'intake'}));
line('2일 판매',stat({2:'sales'}));
line('2일 둘다',stat({2:'intake',4:'sales'}));

// 1단계: 예보 없이
console.log('\n## 1단계 예보 없이 · 집하 day<=N, 판매 재고>=X');
console.log('| 집하마감 | 재고임계 | 평균 | 승률 |');
console.log('|---|---|---|---|');
const g1={};
for(const dl of [3,5,7]) for(const th of [8,12,15]){
  const r=stat(s=>{
    if(s.pend)return FF.Cmd.wait();
    if(s.buys.sales===0&&FF.view.stock(s)>=th)return FF.Cmd.buy('sales');
    if(s.buys.intake===0&&s.day<=dl)return FF.Cmd.buy('intake');
    return FF.Cmd.wait();
  });
  g1[dl+'/'+th]=r;
  console.log(`| ${dl}일 | ${th}t | ${r.mean} | ${pct(r.win)} |`);
}

// 2단계: 판매에 역방향 예보를 더한다
console.log('\n## 2단계 재고 + 수요 감소 전망일 때만 판매');
console.log('| 집하마감 | 재고임계 | 평균 | 승률 | 1단계 대비 |');
console.log('|---|---|---|---|---|');
for(const dl of [3,5,7]) for(const th of [8,12,15]){
  const r=stat(s=>{
    if(s.pend)return FF.Cmd.wait();
    if(s.buys.sales===0&&FF.view.stock(s)>=th&&gapOf(s,'d')<=0)return FF.Cmd.buy('sales');
    if(s.buys.intake===0&&s.day<=dl)return FF.Cmd.buy('intake');
    return FF.Cmd.wait();
  });
  const d=r.mean-g1[dl+'/'+th].mean;
  console.log(`| ${dl}일 | ${th}t | ${r.mean} | ${pct(r.win)} | ${d>=0?'+':''}${d} |`);
}
