// E3a. 최근 3일 못 판 비율 × 현재 재고
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||1200);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const pct=x=>(x*100).toFixed(0)+'%';
const mean=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length):0;
const R0=FF.C, X=2, PRICE=750, BUY=6;

// buy=false 면 무투자. 관측은 항상 BUY 일 시점에서 취한다.
function run(seed,buy){
  const W=FF.World(seed); const s=FF.initialState(W);
  let have=false,spent=0; let m3=0,d3=0,stockAt=0;
  for(let t=0;t<R0.days;t++){
    const day=s.day;
    if(day===BUY){ stockAt=FF.view.stock(s);
      if(buy&&s.cash>=PRICE){have=true;s.cash-=PRICE;spent+=PRICE} }
    const w=W.next();
    const before=s.cap.intake;
    if(have)s.cap.intake=before+X;
    const out=FF.transition(s,FF.Cmd.wait(),w,R0);
    if(have)s.cap.intake=before;
    if(day>=BUY-3&&day<BUY){m3+=out.result.missed;d3+=out.result.dem}
    if(s.cash<=0)break;
  }
  s.spent=spent;
  return {v:FF.finalValue(s,true),m3rate:m3/(d3||1),stock:stockAt};
}
const rows=seeds.map(sd=>{
  const a=run(sd,false), b=run(sd,true);
  return {gain:b.v-a.v, m3:a.m3rate, stock:a.stock};
});
// 관측 시점 값은 무투자 경로에서 취한다(구매 전이므로 동일)
const MISS=[[0,0.10,'못판 <10%'],[0.10,0.25,'10~25%'],[0.25,0.40,'25~40%'],[0.40,0.55,'40~55%'],[0.55,1,'55%+']];
const STOCK=[[0,0.5,'재고 ~0.5t'],[0.5,3,'0.5~3t'],[3,99,'3t+']];
console.log(`시드 ${N} · X=${X}t 가격 ${PRICE} ${BUY}일 구매\n`);
console.log('## 양수비율 (건수)');
console.log('| | ' + MISS.map(m=>m[2]).join(' | ') + ' | 행 전체 |');
console.log('|---|' + MISS.map(()=>'---|').join('') + '---|');
for(const [slo,shi,sn] of STOCK){
  const rowAll=rows.filter(r=>r.stock>=slo&&r.stock<shi);
  const cells=MISS.map(([mlo,mhi])=>{
    const g=rowAll.filter(r=>r.m3>=mlo&&r.m3<mhi);
    return g.length<20?`- (${g.length})`:`${pct(g.filter(r=>r.gain>0).length/g.length)} (${g.length})`;
  });
  const ra=rowAll.length?`${pct(rowAll.filter(r=>r.gain>0).length/rowAll.length)} (${rowAll.length})`:'-';
  console.log(`| ${sn} | ${cells.join(' | ')} | ${ra} |`);
}
const colAll=MISS.map(([lo,hi])=>{
  const g=rows.filter(r=>r.m3>=lo&&r.m3<hi);
  return g.length?`${pct(g.filter(r=>r.gain>0).length/g.length)} (${g.length})`:'-';
});
console.log(`| 열 전체 | ${colAll.join(' | ')} | ${pct(rows.filter(r=>r.gain>0).length/N)} (${N}) |`);

console.log('\n## 평균가치');
console.log('| | ' + MISS.map(m=>m[2]).join(' | ') + ' |');
console.log('|---|' + MISS.map(()=>'---|').join(''));
for(const [slo,shi,sn] of STOCK){
  const cells=MISS.map(([mlo,mhi])=>{
    const g=rows.filter(r=>r.stock>=slo&&r.stock<shi&&r.m3>=mlo&&r.m3<mhi);
    return g.length<20?'-':`${mean(g.map(r=>r.gain))}`;
  });
  console.log(`| ${sn} | ${cells.join(' | ')} |`);
}
