// 성향 전환일 스윕. 정책 판단 빈도가 늘어나는가.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||150);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const CV=FF.C.policy.map(o=>o.v);
const D=FF.C.days, pct=x=>(x*100).toFixed(0)+'%';
const R=FF.C;

// 전환일 shift 에서 성향을 새로 뽑는 세계
function makeWorld(seed,shift){
  const rng=new FF.Rng(seed);
  const pick=()=>{const r=rng.next(),p=R.tiltP;return r<p[0]?0:(r<p[0]+p[1]?1:2)};
  let ts=pick(), td=pick();
  let ts2=null, td2=null;
  if(shift){ts2=pick();td2=pick()}
  let si=FF.mvSeq(rng,1,R,ts), di=FF.mvSeq(rng,1,R,td), day=0;
  return {
    tilt:()=>({supply:ts,demand:td}),
    phase:()=>({supply:si,demand:di}),
    next:function(){
      day++;
      if(shift&&day===shift){ts=ts2;td=td2}
      const input={production:Math.max(0,rng.norm(R.sm[si],R.sd)),
                   demand:Math.max(0,rng.norm(R.dm[di],R.dd)),
                   supplyPhase:si,demandPhase:di};
      si=FF.mvSeq(rng,si,R,ts); di=FF.mvSeq(rng,di,R,td);
      input.nextSupplyPhase=si; input.nextDemandPhase=di;
      return input;
    }
  };
}
function run(seed,shift,seq){
  const W=makeWorld(seed,shift); const s=FF.initialState(W);
  for(let t=0;t<D;t++){
    const c=seq[s.day];
    FF.transition(s,(c!==undefined&&c!==s.cover)?FF.Cmd.policy(c):FF.Cmd.wait(),W.next());
    if(s.cash<=0)break;
  }
  return FF.finalValue(s,true);
}
// 구간별 최적 정책 (5일 블록) 을 전수 탐색하지 않고 블록 단위 탐욕
const BLK=5;
function optimize(seed,shift){
  const nb=Math.ceil(D/BLK);
  let blk=new Array(nb).fill(R.cover);
  const seqOf=b=>{const s={};for(let d=1;d<=D;d++)s[d]=b[Math.floor((d-1)/BLK)];return s};
  let cur=run(seed,shift,seqOf(blk));
  for(let pass=0;pass<3;pass++){
    let moved=false;
    for(let i=0;i<nb;i++){
      const old=blk[i];
      for(const c of CV){
        if(c===old)continue;
        blk[i]=c;
        const v=run(seed,shift,seqOf(blk));
        if(v>cur+1){cur=v;moved=true}else blk[i]=old;
      }
    }
    if(!moved)break;
  }
  return {blk,v:cur};
}
console.log(`시드 ${N} · 블록 ${BLK}일 · 정책 ${CV.join('/')}\n`);
console.log('| 전환일 | 변경 횟수 | 0회 판 | 간격 중앙 | 정책 최선 1/1.5/2 | 판매 6일 | 최적화 이득 |');
console.log('|---|---|---|---|---|---|---|');
for(const shift of [0,10,15,20]){
  const ch=[], gaps=[]; let zero=0, gain=0;
  const use={};
  for(const sd of seeds){
    const flat={}; for(let d=1;d<=D;d++)flat[d]=R.cover;
    const base=run(sd,shift,flat);
    const o=optimize(sd,shift);
    gain+=o.v-base;
    const days=[];
    for(let i=1;i<o.blk.length;i++)if(o.blk[i]!==o.blk[i-1])days.push(i*BLK+1);
    ch.push(days.length); if(!days.length)zero++;
    for(let i=1;i<days.length;i++)gaps.push(days[i]-days[i-1]);
    o.blk.forEach(c=>use[c]=(use[c]||0)+1);
  }
  // 판매 증설
  let sm=0;
  for(const sd of seeds){
    const flat={}; for(let d=1;d<=D;d++)flat[d]=R.cover;
    const W=makeWorld(sd,shift); const s=FF.initialState(W);
    const W2=makeWorld(sd,shift); const s2=FF.initialState(W2);
    for(let t=0;t<D;t++){FF.transition(s,FF.Cmd.wait(),W.next())}
    for(let t=0;t<D;t++){FF.transition(s2,s2.day===6?FF.Cmd.buy('sales'):FF.Cmd.wait(),W2.next())}
    sm+=FF.finalValue(s2,true)-FF.finalValue(s,true);
  }
  const m=a=>a.length?(a.reduce((x,y)=>x+y,0)/a.length):0;
  const med=a=>{if(!a.length)return '-';const b=[...a].sort((x,y)=>x-y);return b[b.length>>1]};
  const tot=Object.values(use).reduce((a,b)=>a+b,0);
  console.log(`| ${shift||'없음'} | ${m(ch).toFixed(1)} | ${pct(zero/N)} | ${med(gaps)}일 | ${CV.map(c=>pct((use[c]||0)/tot)).join(' / ')} | ${Math.round(sm/N)} | +${Math.round(gain/N)} |`);
}
