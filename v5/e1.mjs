// E1. 잠재수요 대비 재고충족률로 계약 가치가 갈리는가
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||600);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const pct=x=>(x*100).toFixed(0)+'%';
const mean=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length):0;
const R0=FF.C, X=2, PRICE=750, BUY=6;

function run(seed,buyDay){
  const W=FF.World(seed); const s=FF.initialState(W);
  let have=false,spent=0,missedAfter=0,soldAfter=0,demAfter=0,over=0,extra=0;
  for(let t=0;t<R0.days;t++){
    const day=s.day;
    if(buyDay&&day===buyDay&&s.cash>=PRICE){have=true;s.cash-=PRICE;spent+=PRICE}
    const w=W.next();
    const before=s.cap.intake;
    const acc0=Math.min(w.production,before);
    if(have)s.cap.intake=before+X;
    const out=FF.transition(s,FF.Cmd.wait(),w,R0);
    if(have){s.cap.intake=before; if(out.result.acc>acc0+0.05)extra+=out.result.acc-acc0}
    if(day>=buyDay){
      missedAfter+=out.result.missed; soldAfter+=out.result.sold; demAfter+=out.result.dem;
      over+=Math.max(0,out.result.prod-before);
    }
    if(s.cash<=0)break;
  }
  s.spent=spent;
  return {v:FF.finalValue(s,true),missed:missedAfter,sold:soldAfter,dem:demAfter,over,extra};
}
const rows=seeds.map(sd=>{
  const a=run(sd,0), b=run(sd,BUY);
  return {gain:b.v-a.v,
    missRate:a.missed/(a.dem||1),            // 잠재수요 대비 못 판 비율 (기준선)
    stockShort:a.missed,                      // 재고 부족으로 놓친 총량
    over:a.over, extra:b.extra};
});
function by(key,label,bins){
  console.log(`## ${label}`);
  console.log('| 구간 | 판수 | B 평균가치 | 양수비율 |');
  console.log('|---|---|---|---|');
  for(const [lo,hi,name] of bins){
    const g=rows.filter(r=>r[key]>=lo&&r[key]<hi);
    console.log(`| ${name} | ${g.length} | ${mean(g.map(r=>r.gain))} | ${pct(g.filter(r=>r.gain>0).length/(g.length||1))} |`);
  }
  console.log('');
}
console.log(`시드 ${N} · X=${X}t · 가격 ${PRICE} · ${BUY}일 구매\n`);
by('missRate','기준선의 못 판 수요 비율',[[0,0.1,'~10%'],[0.1,0.2,'10~20%'],[0.2,0.3,'20~30%'],[0.3,1,'30%+']]);
by('stockShort','기준선이 놓친 수요 총량',[[0,40,'~40t'],[40,80,'40~80t'],[80,120,'80~120t'],[120,999,'120t+']]);

// 2차원: 초과생산 x 못 판 수요
console.log('## 초과생산 × 못 판 수요');
const OV=[[0,40,'초과생산 ~40t'],[40,70,'40~70t'],[70,999,'70t+']];
const MS=[[0,0.15,'못판 ~15%'],[0.15,0.25,'15~25%'],[0.25,1,'25%+']];
console.log('| | ' + MS.map(m=>m[2]).join(' | ') + ' |');
console.log('|---|' + MS.map(()=>'---|').join(''));
for(const [olo,ohi,on] of OV){
  const cells=MS.map(([mlo,mhi])=>{
    const g=rows.filter(r=>r.over>=olo&&r.over<ohi&&r.missRate>=mlo&&r.missRate<mhi);
    return g.length<25?'-':`${mean(g.map(r=>r.gain))} (${pct(g.filter(r=>r.gain>0).length/g.length)}) n${g.length}`;
  });
  console.log(`| ${on} | ${cells.join(' | ')} |`);
}
const corr=(a,b)=>{const ma=a.reduce((x,y)=>x+y,0)/a.length,mb=b.reduce((x,y)=>x+y,0)/b.length;
 let n=0,da=0,db=0;for(let i=0;i<a.length;i++){n+=(a[i]-ma)*(b[i]-mb);da+=(a[i]-ma)**2;db+=(b[i]-mb)**2}
 return n/Math.sqrt(da*db)};
console.log('\n## 상관계수');
console.log(`| 못 판 수요 비율 vs B 가치 | ${corr(rows.map(r=>r.missRate),rows.map(r=>r.gain)).toFixed(2)} |`);
console.log(`| 놓친 수요 총량 vs B 가치 | ${corr(rows.map(r=>r.stockShort),rows.map(r=>r.gain)).toFixed(2)} |`);
console.log(`| 초과생산 vs B 가치 | ${corr(rows.map(r=>r.over),rows.map(r=>r.gain)).toFixed(2)} |`);
