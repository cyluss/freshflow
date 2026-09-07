// 병목 지속시간 분포. 세계가 며칠 동안 같은 문제를 붙잡고 있는가.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||800);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const pct=x=>(x*100).toFixed(0)+'%';
const q=(a,p)=>{const b=[...a].sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.floor(b.length*p))]};
const runs={};      // 병목 → 연속 길이 배열
let total=0;
for(const sd of seeds){
  const r=FF.runScenario(sd,{});
  let cur=null, len=0;
  r.days.forEach(d=>{
    const b=d.result.b;
    if(b===cur)len++;
    else{ if(cur){(runs[cur]=runs[cur]||[]).push(len)} cur=b; len=1 }
    total++;
  });
  if(cur)(runs[cur]=runs[cur]||[]).push(len);
}
console.log(`시드 ${N} · 무투자 · ${total}일 관측\n`);
console.log('| 병목 | 점유 | 구간 수 | 중앙 | p75 | p90 | 3일 이상 | 1일짜리 |');
console.log('|---|---|---|---|---|---|---|---|');
Object.entries(runs).sort((a,b)=>{
  const sa=a[1].reduce((x,y)=>x+y,0), sb=b[1].reduce((x,y)=>x+y,0);
  return sb-sa;
}).forEach(([k,a])=>{
  const days=a.reduce((x,y)=>x+y,0);
  console.log(`| ${k} | ${pct(days/total)} | ${(a.length/N).toFixed(1)}/판 | ${q(a,0.5)}일 | ${q(a,0.75)}일 | ${q(a,0.9)}일 | ${pct(a.filter(x=>x>=3).length/a.length)} | ${pct(a.filter(x=>x===1).length/a.length)} |`);
});
// 재고 부족 상태의 지속 (병목 라벨과 별개로 재고 수준으로)
const lowRuns=[];
for(const sd of seeds.slice(0,400)){
  const r=FF.runScenario(sd,{});
  let len=0;
  r.days.forEach(d=>{
    if(d.result.end<3)len++;
    else{ if(len)lowRuns.push(len); len=0 }
  });
  if(len)lowRuns.push(len);
}
console.log(`\n재고 3t 미만 구간: 판당 ${(lowRuns.length/400).toFixed(1)}회 · 중앙 ${q(lowRuns,0.5)}일 · p90 ${q(lowRuns,0.9)}일 · 3일 이상 ${pct(lowRuns.filter(x=>x>=3).length/lowRuns.length)}`);
