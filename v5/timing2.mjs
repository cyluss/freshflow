// 조건부 구매의 값: 신호가 뜬 날에 사면 고정일 구매보다 나은가
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||600);
const seeds=[]; for(let i=1;i<=N;i++) seeds.push(i*13+5);
const val=(sd,plan)=>FF.finalValue(FF.runScenario(sd,plan).state,true);
const base=seeds.map(sd=>val(sd,{}));
const pct=x=>(x*100).toFixed(0)+'%';

// 사후 최선 구매일 분포: 판마다 어느 날이 최선인가
function bestDay(kind){
  const hist={}; let sum=0, everPos=0;
  seeds.forEach((sd,i)=>{
    let best=-Infinity,bd=null;
    for(let d=2;d<=20;d++){const v=val(sd,{[d]:kind}); if(v>best){best=v;bd=d}}
    hist[bd]=(hist[bd]||0)+1; sum+=best-base[i];
    if(best>base[i])everPos++;
  });
  return {hist,mean:Math.round(sum/N),everPos:everPos/N};
}
for(const kind of ['intake','sales']){
  const r=bestDay(kind);
  const top=Object.entries(r.hist).sort((a,b)=>b[1]-a[1]).slice(0,6);
  console.log(`## ${kind==='intake'?'집하':'판매'} · 사후 최선일`);
  console.log('평균', r.mean, '· 언제든 이득인 판', pct(r.everPos));
  console.log('상위 일자', top.map(([d,n])=>`${d}일 ${pct(n/N)}`).join(' · '));
  const early=Object.entries(r.hist).filter(([d])=>+d<=5).reduce((a,[,n])=>a+n,0);
  const late=Object.entries(r.hist).filter(([d])=>+d>=12).reduce((a,[,n])=>a+n,0);
  console.log(`초반(2~5일) ${pct(early/N)} · 후반(12~20일) ${pct(late/N)}\n`);
}

// 완벽한 타이밍 대비 고정 2일의 손실
for(const kind of ['intake','sales']){
  let fixed=0, perfect=0;
  seeds.forEach((sd,i)=>{
    fixed+=val(sd,{2:kind})-base[i];
    let best=-Infinity;
    for(let d=2;d<=20;d++){const v=val(sd,{[d]:kind}); if(v>best)best=v}
    perfect+=best-base[i];
  });
  console.log(`${kind==='intake'?'집하':'판매'} · 고정2일 ${Math.round(fixed/N)} vs 완벽타이밍 ${Math.round(perfect/N)} · 타이밍 가치 ${Math.round((perfect-fixed)/N)}`);
}
