// 후보 B 초과물량 계약. 커널과 기준선은 그대로 두고 규칙 주입으로만 실험한다.
// B 의 효과: 생산이 기존 한도를 넘는 날에만 최대 X t 를 추가로 받는다.
//   baseAcc = min(prod, cap, need)
//   take    = min(prod-cap, X, 남은 need)  → stepState 에 cap+X 를 넘기면 동일하다
//   목표재고와 창고는 그대로 적용된다.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||1000);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const clone=o=>JSON.parse(JSON.stringify(o));
const pct=x=>(x*100).toFixed(0)+'%';
const R0=FF.C;

// 계약 보유 상태로 하루를 돈다. 유지비는 붙이지 않는다.
export function runB(seed,{buyDay=0,X=2,price=0,strategy=null}={}){
  const W=FF.World(seed);
  const s=FF.initialState(W);
  let have=false, spent=0, fired=0, extraAcc=0, overflowTotal=0, rows=[];
  for(let t=0;t<R0.days;t++){
    const day=s.day;
    if(!have){
      const buy = strategy ? strategy(s) : (buyDay && day===buyDay);
      if(buy && s.cash>=price){ have=true; s.cash-=price; spent+=price }
    }
    const w=W.next();
    const over=Math.max(0,w.production-s.cap.intake);
    if(over>0.05)overflowTotal+=over;
    // 계약 보유일에는 초과분을 최대 X 까지 받을 수 있다
    const rules = have ? Object.assign(clone(R0)) : R0;
    const before=s.cap.intake;
    if(have)s.cap.intake=before+X;
    const acc0=Math.min(w.production,before);
    const out=FF.transition(s,FF.Cmd.wait(),w,rules);
    if(have){
      s.cap.intake=before;
      const extra=out.result.acc-Math.min(acc0,out.result.acc);
      if(out.result.prod>before+0.05 && out.result.acc>acc0+0.05){ fired++; extraAcc+=out.result.acc-acc0 }
    }
    rows.push(out.result);
    if(s.cash<=0)break;
  }
  s.spent=spent;
  return {state:s,rows,fired,extraAcc,overflowTotal,bought:have};
}
const finalOf=r=>FF.finalValue(r.state,true);
const base=seeds.map(sd=>finalOf(runB(sd,{buyDay:0})));

console.log(`시드 ${N} · 후보 B · 2일 구매 · 유지비 없음\n`);
console.log('| X | 가격 | 평균 | 승률 | 표준편차 | p10 | p50 | p90 | 발동일 | 추가매입 |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for(const X of [1,2,3]) for(const price of [500,750,1000,1250,1500]){
  const v=[],fired=[],extra=[];
  seeds.forEach((sd,i)=>{
    const r=runB(sd,{buyDay:2,X,price});
    v.push(finalOf(r)-base[i]); fired.push(r.fired); extra.push(r.extraAcc);
  });
  const m=v.reduce((a,b)=>a+b,0)/N;
  const sd2=Math.sqrt(v.reduce((a,b)=>a+(b-m)*(b-m),0)/N);
  const so=[...v].sort((a,b)=>a-b);
  console.log(`| ${X}t | ${price} | ${Math.round(m)} | ${pct(v.filter(x=>x>0).length/N)} | ${Math.round(sd2)} | ${Math.round(so[Math.floor(N*.1)])} | ${Math.round(so[Math.floor(N*.5)])} | ${Math.round(so[Math.floor(N*.9)])} | ${(fired.reduce((a,b)=>a+b,0)/N).toFixed(1)} | ${(extra.reduce((a,b)=>a+b,0)/N).toFixed(1)}t |`);
}
