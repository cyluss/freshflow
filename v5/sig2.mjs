// 관측 가능한 신호만 쓰는 계약 전략 재측정
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||500);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const clone=o=>JSON.parse(JSON.stringify(o));
const pct=x=>(x*100).toFixed(1)+'%';
const at=d=>s=>(s.day===d&&s.buys.contract===0)?FF.Cmd.contract():FF.Cmd.wait();
// 신호 전략: 화면에서 읽는 값만 쓴다
const sig=(rate,st)=>s=>{
  if(s.buys.contract>0||s.day<4)return FF.Cmd.wait();
  if(FF.view.missRate(s)>=rate && FF.view.stock(s)<=st)return FF.Cmd.contract();
  return FF.Cmd.wait();
};
console.log(`시드 ${N}\n`);
console.log('| fixed | 계약1일 | 신호 25%/8t | 신호 25%/3t | 신호 40%/3t | 신호 40%/0.5t |');
console.log('|---|---|---|---|---|---|');
for(const fixed of [0,600,900,1200,1750]){
  const R=clone(FF.C); R.contract={limit:1,price:1750,max:1,fixed:fixed};
  const val=(sd,x)=>FF.finalValue(FF.runScenario(sd,x,null,R).state,true,R);
  const base=seeds.map(sd=>val(sd,{}));
  const st=x=>{let d=0,w=0;seeds.forEach((sd,i)=>{const v=val(sd,x)-base[i];d+=v;if(v>0)w++});
    return `${Math.round(d/N)} (${pct(w/N)})`};
  console.log(`| ${fixed} | ${st(at(1))} | ${st(sig(0.25,8))} | ${st(sig(0.25,3))} | ${st(sig(0.40,3))} | ${st(sig(0.40,0.5))} |`);
}
// fixed 1200 에서 Day20+ 최적 판 분해
console.log('\n## fixed 1200 · Day20 이후가 최적인 판의 성질');
{
  const R=clone(FF.C); R.contract={limit:1,price:1750,max:1,fixed:1200};
  const val=(sd,x)=>FF.finalValue(FF.runScenario(sd,x,null,R).state,true,R);
  const base=seeds.map(sd=>val(sd,{}));
  let late=[],early=[],mid=[];
  seeds.forEach((sd,i)=>{
    let bv=-Infinity,bd=null;
    for(let d=1;d<=28;d++){const v=val(sd,at(d))-base[i];if(v>bv){bv=v;bd=d}}
    const rec={sd,bd,bv};
    if(bd>=20)late.push(rec); else if(bd<=4)early.push(rec); else mid.push(rec);
  });
  const sum=(a,f)=>a.length?a.reduce((x,r)=>x+f(r),0)/a.length:0;
  console.log('| 구간 | 판수 | 최적 가치 평균 | 양수 비율 |');
  console.log('|---|---|---|---|');
  for(const [n,g] of [['Day1~4',early],['Day5~19',mid],['Day20+',late]]){
    console.log(`| ${n} | ${g.length} | ${Math.round(sum(g,r=>r.bv))} | ${pct(g.filter(r=>r.bv>0).length/(g.length||1))} |`);
  }
}
