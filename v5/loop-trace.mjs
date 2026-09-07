// V2 피드백 루프 검증. UI 설계 전에 커널 데이터로만 인과를 확인한다.
//   관측 -> 판단/행동 -> 당일 결과 -> 누적 결과 -> 보상 -> 다음 턴
// 커널의 transition 은 toCh(판로별 판매량)를 내부에서만 쓰고 결과에 담지 않는다.
// 이 스크립트만 그 값을 노출하도록 소스 텍스트를 patch 해서 쓴다. src-kernel.js 원본은 그대로다.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const src=DOMAIN.map(f=>{
  let t=fs.readFileSync(f,'utf8');
  if(f==='src-kernel.js'){
    const old='return {prod:prod,dem:demTotal,acc:stored,refused:refused,sold:sold,missed:Math.max(0,demTotal-sold),\n  ageMix:ageMix,wI:wI,wIcap:byCap,wIstore:byStore,wIneed:byNeed,wS:wS,wT:wT,\n  end:end,profit:profit,sellable:sellable};';
    const patched='return {prod:prod,dem:demTotal,acc:stored,refused:refused,sold:sold,missed:Math.max(0,demTotal-sold),\n  ageMix:ageMix,wI:wI,wIcap:byCap,wIstore:byStore,wIneed:byNeed,wS:wS,wT:wT,\n  end:end,profit:profit,sellable:sellable,toCh:toCh.slice()};';
    if(!t.includes(old))throw new Error('kernel 소스 모양이 바뀌어 patch 지점을 못 찾았다');
    t=t.replace(old,patched);
  }
  return t;
}).join('\n');
const FF=new Function('var FF={},FV={};'+src+'\nreturn FF;')();

const R=FF.C, CH=R.channels;
const SEED=30699, N=10;

// 배분 정책: 프랜차이즈를 의도적으로 굶겼다 먹여서 관계 상승/하락을 둘 다 만든다.
// day 1-3: 프랜차이즈 0        -> 하락을 기대한다
// day 4-7: 프랜차이즈 몰아주기 -> 4일 주기 상승 판정을 기대한다
// day 8-10: 균등              -> 관계가 유지되는지 본다
function policy(day){
 if(day<=3)return [1,0,1];       // 온라인, 프랜차이즈, 도매
 if(day<=7)return [0.5,3,0.5];
 return [1,1,1];
}

FF.reset(SEED);
console.log('# V2 피드백 루프 추적 · 시드 '+SEED+' · '+N+'일\n');
console.log('판로 순서: 온라인 · 프랜차이즈 · 도매\n');

for(let day=1;day<=N;day++){
 const s0=FF.toKernelState();
 const stockBefore=s0.lots.reduce((a,l)=>a+l.q,0);
 const oldQty=s0.lots.filter(l=>l.a>=2).reduce((a,l)=>a+l.q,0);
 const oldShare=stockBefore>0?oldQty/stockBefore:0;
 const relBefore=s0.rel.slice();
 const rows=CH.map((c,i)=>({
  key:c.key,
  price:Math.round(c.price[0]*R.rel.price[relBefore[i]]),
  cap:Math.round(c.cap*R.rel.cap[relBefore[i]]*10)/10,
  floor:c.key==='fran'?Math.round(c.quota*R.rel.floor[relBefore[i]]*10)/10:0,
  quota:c.quota
 }));

 console.log('## '+day+'일');
 console.log('관측  재고 '+stockBefore.toFixed(1)+'t · 오래된 비중 '+(oldShare*100).toFixed(0)+'%');
 console.log('      조건  '+rows.map(r=>r.key+' '+r.price+'원/최대'+r.cap+'t'+(r.floor>0?('/보장'+r.floor+'t'):'')).join(' · '));
 console.log('      관계  '+relBefore.join(','));

 const w=policy(day);
 console.log('판단  배분 가중치 '+w.join(':'));

 const world=FF.world().next();
 const send=FF.Cmd.sell(w);
 const out=FF.transition(s0,send,world);
 const r=out.result;
 FF.applyKernelState(s0,r,null);
 FF.recordDay(r,out.events);
 FF.advanceDay(s0);
 FF.commit();

 const relAfter=FF.relOf().slice();
 const changed=relAfter.map((v,i)=>v-relBefore[i]);

 console.log('당일  전체 판매 '+r.sold.toFixed(1)+'t · 판로별 '+r.toCh.map((v,i)=>rows[i].key+' '+v.toFixed(1)+'t').join(' · '));
 console.log('      못 판 '+r.missed.toFixed(1)+'t · 손익 '+Math.round(r.profit).toLocaleString('ko-KR')+'원');
 console.log('누적  재고 노화 다음날 이월 '+FF.inventory().toFixed(1)+'t');
 console.log('보상  관계 변화 '+changed.map((c,i)=>rows[i].key+(c>0?' ▲':c<0?' ▼':' -')).join(' · ')+
   ' → 다음날 관계 '+relAfter.join(','));
 console.log('');
}
