// 행동 유발률. 플레이어가 실제로 살 이유를 만나는가.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||600);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const pct=x=>(x*100).toFixed(1)+'%';
const val=(sd,p)=>FF.finalValue(FF.runScenario(sd,p).state,true);
const CAP=FF.C.cap.sales, COST=FF.C.cost.sales;

let hitAny=0, run2=0, run3=0;
let firstDays=[], strongPerRun=[], posPerRun=[], hitDays=[];
const base=seeds.map(sd=>val(sd,{}));
seeds.forEach((sd,i)=>{
  const r=FF.runScenario(sd,{});
  let streak=0,maxStreak=0,hits=0,first=null;
  r.days.forEach(d=>{
    const x=d.result;
    const at=(x.sold>=CAP-0.05 && x.dem>x.sold+0.05);
    if(at){hits++;streak++;if(streak>maxStreak)maxStreak=streak;if(first===null)first=d.day}
    else streak=0;
  });
  if(hits)hitAny++;
  if(maxStreak>=2)run2++;
  if(maxStreak>=3)run3++;
  hitDays.push(hits);
  if(first!==null)firstDays.push(first);
  // 그날 사면 얼마인가
  let pos=0,strong=0;
  for(let d=2;d<=FF.C.days-3;d++){
    const g=val(sd,{[d]:'sales'})-base[i];
    if(g>0)pos++;
    if(g>=COST*2)strong++;      // 비용의 두 배 이상
  }
  posPerRun.push(pos); strongPerRun.push(strong);
});
const m=a=>a.length?(a.reduce((x,y)=>x+y,0)/a.length):0;
console.log(`시드 ${N} · 무투자 기준선 · 판매 한도 ${CAP}t · 증설 ${COST}원\n`);
console.log('| 지표 | 값 |');
console.log('|---|---|');
console.log(`| 한 번이라도 판매 한도 도달 | ${pct(hitAny/N)} |`);
console.log(`| 2일 연속 도달 | ${pct(run2/N)} |`);
console.log(`| 3일 연속 도달 | ${pct(run3/N)} |`);
console.log(`| 한 판 평균 도달 일수 | ${m(hitDays).toFixed(1)}일 / 30일 |`);
console.log(`| 첫 도달 일차 중앙 | ${firstDays.sort((a,b)=>a-b)[firstDays.length>>1]||'-'}일 |`);
console.log(`| 한 판 평균 양수 구매일 | ${m(posPerRun).toFixed(1)}일 |`);
console.log(`| 한 판 평균 강한 기회 | ${m(strongPerRun).toFixed(1)}일 |`);
console.log(`| 강한 기회 0 인 판 | ${pct(strongPerRun.filter(x=>x===0).length/N)} |`);
console.log(`| 양수 구매일 0 인 판 | ${pct(posPerRun.filter(x=>x===0).length/N)} |`);
// 병목 분포
const bc={};let n2=0;
for(const sd of seeds.slice(0,300))
  FF.runScenario(sd,{}).days.forEach(d=>{bc[d.result.b]=(bc[d.result.b]||0)+1;n2++});
console.log('\n병목 ' + Object.entries(bc).sort((a,b)=>b[1]-a[1])
  .map(([k,v])=>`${k} ${(v/n2*100).toFixed(0)}%`).join(' · '));
