// 외상매입이 게임 가치를 갖는가
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||300);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const clone=o=>JSON.parse(JSON.stringify(o));
const pct=x=>(x*100).toFixed(0)+'%';
const q=(a,p)=>{if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.floor(b.length*p))]};
function trial(seed,R){
  const W=FF.World(seed,R); const s=FF.initialState(W,R);
  let used=0, shortDays=0, mn=s.cash, bust=false, apPeak=0;
  for(let t=0;t<R.days;t++){
    const before=(s.ap||[]).reduce((a,x)=>a+x.amt,0);
    const out=FF.transition(s,FF.Cmd.wait(),W.next(),R);
    const after=(s.ap||[]).reduce((a,x)=>a+x.amt,0);
    if(after>before+0.05)used++;
    if(after>apPeak)apPeak=after;
    if(out.result.wS>0.05&&out.result.end<R.cap.storage-1)shortDays++;
    if(s.cash<mn)mn=s.cash;
    if(s.cash<=0){bust=true;break}
  }
  return {v:FF.finalValue(s,true,R),used,shortDays,mn,bust,apPeak};
}
console.log(`시드 ${N} · 정산 7일 · 입고 30t · 창고 40t · 금리 ${FF.C.creditRate*100}% · 기한 ${FF.C.creditTerm}일\n`);
console.log('| 현금 | 한도 | 파산 | 외상 쓴 판 | 쓴 일수 | 매입축소 판 | 채무 최대 중앙 | 순자산 중앙 | 무신용 대비 |');
console.log('|---|---|---|---|---|---|---|---|---|');
for(const cash0 of [50000,70000,90000]) for(const cr of [0,30000,60000,100000]){
  const R=clone(FF.C); R.cap={intake:30,storage:40,sales:21}; R.settle=7; R.cash=cash0; R.credit=cr;
  const R0=clone(R); R0.credit=0;
  let bust=0, usedRuns=0, usedDays=0, shortRuns=0, totDays=0, gain=0;
  const peaks=[], ends=[];
  for(const sd of seeds){
    const a=trial(sd,R), b=trial(sd,R0);
    if(a.bust)bust++;
    if(a.used){usedRuns++;usedDays+=a.used}
    if(a.shortDays)shortRuns++;
    totDays+=R.days;
    peaks.push(a.apPeak); ends.push(a.v); gain+=a.v-b.v;
  }
  console.log(`| ${cash0/1000}k | ${cr/1000}k | ${pct(bust/N)} | ${pct(usedRuns/N)} | ${pct(usedDays/totDays)} | ${pct(shortRuns/N)} | ${Math.round(q(peaks,0.5)).toLocaleString('ko-KR')} | ${Math.round(q(ends,0.5)).toLocaleString('ko-KR')} | ${cr?('+'+Math.round(gain/N).toLocaleString('ko-KR')):'-'} |`);
}
