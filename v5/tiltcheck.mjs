// 성향과 실제 30일 국면 비중의 상관
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||3000);
const pct=x=>(x*100).toFixed(1)+'%';
const rows=[];
for(let i=1;i<=N;i++){
  const seed=i*7+3;
  const W=FF.World(seed), T=W.tilt();
  let d=[0,0,0], s=[0,0,0], dem=0, prod=0;
  for(let t=0;t<FF.C.days;t++){
    const w=W.next();
    d[w.demandPhase]++; s[w.supplyPhase]++;
    dem+=w.demand; prod+=w.production;
  }
  rows.push({td:T.demand, ts:T.supply, dLow:d[0]/30, dHigh:d[2]/30,
             sLow:s[0]/30, sHigh:s[2]/30, dem:dem/30, prod:prod/30});
}
const g=(k,v)=>rows.filter(r=>r[k]===v);
console.log(`시드 ${N}\n`);
console.log('| 수요 성향 | 판수 | 침체일 | 호황일 | 평균 수요 |');
console.log('|---|---|---|---|---|');
[0,1,2].forEach(v=>{
  const x=g('td',v), a=k=>x.reduce((p,r)=>p+r[k],0)/x.length;
  console.log(`| ${['침체','평년','호황'][v]} | ${x.length} (${pct(x.length/N)}) | ${pct(a('dLow'))} | ${pct(a('dHigh'))} | ${a('dem').toFixed(1)}t |`);
});
console.log('\n| 생산 성향 | 판수 | 부족일 | 풍작일 | 평균 생산 |');
console.log('|---|---|---|---|---|');
[0,1,2].forEach(v=>{
  const x=g('ts',v), a=k=>x.reduce((p,r)=>p+r[k],0)/x.length;
  console.log(`| ${['부족','평년','풍작'][v]} | ${x.length} (${pct(x.length/N)}) | ${pct(a('sLow'))} | ${pct(a('sHigh'))} | ${a('prod').toFixed(1)}t |`);
});
const corr=(a,b)=>{const ma=a.reduce((x,y)=>x+y,0)/a.length,mb=b.reduce((x,y)=>x+y,0)/b.length;
 let n=0,da=0,db=0;for(let i=0;i<a.length;i++){n+=(a[i]-ma)*(b[i]-mb);da+=(a[i]-ma)**2;db+=(b[i]-mb)**2}
 return n/Math.sqrt(da*db)};
console.log(`\n수요 성향 vs 평균 수요 r=${corr(rows.map(r=>r.td),rows.map(r=>r.dem)).toFixed(2)}`);
console.log(`생산 성향 vs 평균 생산 r=${corr(rows.map(r=>r.ts),rows.map(r=>r.prod)).toFixed(2)}`);
