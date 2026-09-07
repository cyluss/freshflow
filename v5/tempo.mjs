// 템포 측정: 최적 정책이 며칠마다 바뀌는가
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||150);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const CV=FF.C.policy.map(o=>o.v);
const pct=x=>(x*100).toFixed(0)+'%';
const D=FF.C.days;
// 정책 열을 그대로 실행
function run(seed,seq){            // seq[day] = cover
  const W=FF.World(seed); const s=FF.initialState(W);
  for(let t=0;t<D;t++){
    const c=seq[s.day];
    const cmd=(c!==undefined&&c!==s.cover)?FF.Cmd.policy(c):FF.Cmd.wait();
    FF.transition(s,cmd,W.next());
    if(s.cash<=0)break;
  }
  return FF.finalValue(s,true);
}
// 탐욕적 개선: 각 날의 정책을 하나씩 바꿔보며 수렴시킨다
function optimize(seed){
  let seq={}; for(let d=1;d<=D;d++)seq[d]=FF.C.cover;
  let cur=run(seed,seq);
  for(let pass=0;pass<3;pass++){
    let moved=false;
    for(let d=1;d<=D;d++){
      const old=seq[d];
      for(const c of CV){
        if(c===old)continue;
        seq[d]=c;
        const v=run(seed,seq);
        if(v>cur+1){cur=v;moved=true}
        else seq[d]=old;
      }
    }
    if(!moved)break;
  }
  return {seq,v:cur};
}
const changes=[], gaps=[], firsts=[], runsLen=[];
let zero=0, baseSum=0, optSum=0;
for(const sd of seeds){
  let flat={}; for(let d=1;d<=D;d++)flat[d]=FF.C.cover;
  const base=run(sd,flat);
  const o=optimize(sd);
  baseSum+=base; optSum+=o.v;
  // 변경 지점
  const days=[]; let prev=o.seq[1];
  for(let d=2;d<=D;d++){ if(o.seq[d]!==prev){days.push(d);prev=o.seq[d]} }
  changes.push(days.length);
  if(!days.length)zero++;
  if(days.length)firsts.push(days[0]);
  for(let i=1;i<days.length;i++)gaps.push(days[i]-days[i-1]);
  // 한 정책이 유지되는 길이
  let last=1;
  days.concat([D+1]).forEach(d=>{runsLen.push(d-last);last=d});
}
const med=a=>{if(!a.length)return null;const b=[...a].sort((x,y)=>x-y);return b[b.length>>1]};
const m=a=>a.length?(a.reduce((x,y)=>x+y,0)/a.length):0;
console.log(`시드 ${N} · 정책 ${CV.join('/')} · ${D}일\n`);
console.log('| 지표 | 값 |');
console.log('|---|---|');
console.log(`| 한 판 최적 변경 횟수 평균 | ${m(changes).toFixed(1)}회 |`);
console.log(`| 중앙 | ${med(changes)}회 |`);
console.log(`| 변경 0회 (관전) | ${pct(zero/N)} |`);
console.log(`| 첫 변경 일차 중앙 | ${med(firsts)||'-'}일 |`);
console.log(`| 변경 사이 간격 중앙 | ${med(gaps)||'-'}일 |`);
console.log(`| 한 정책 유지 길이 중앙 | ${med(runsLen)}일 |`);
console.log(`| 최적화 이득 | +${Math.round((optSum-baseSum)/N)} |`);
const hist={};
changes.forEach(c=>{const k=c>=6?'6+':String(c);hist[k]=(hist[k]||0)+1});
console.log('\n변경 횟수 분포: ' + Object.entries(hist).sort().map(([k,c])=>`${k}회 ${pct(c/N)}`).join(' · '));
