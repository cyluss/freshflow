// E2. 구매 시점까지의 관측이 이후를 예측하는가
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||600);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const pct=x=>(x*100).toFixed(0)+'%';
const mean=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length):0;
const meanF=a=>a.length?(a.reduce((x,y)=>x+y,0)/a.length):0;
const R0=FF.C, X=2, PRICE=750, BUY=6;

function run(seed,buyDay){
  const W=FF.World(seed); const s=FF.initialState(W);
  let have=false,spent=0;
  const past={missed:0,dem:0,ship:0,stock:0,m3:0,d3:0};
  const fut={missed:0,dem:0,ship:0,stock:0};
  const rows=[];
  for(let t=0;t<R0.days;t++){
    const day=s.day;
    if(buyDay&&day===buyDay&&s.cash>=PRICE){have=true;s.cash-=PRICE;spent+=PRICE}
    const w=W.next();
    const before=s.cap.intake;
    if(have)s.cap.intake=before+X;
    const out=FF.transition(s,FF.Cmd.wait(),w,R0);
    if(have)s.cap.intake=before;
    const r=out.result;
    const isShip=(r.b==='ship'), isStock=(r.b==='stock');
    if(day<buyDay||buyDay===0&&day<=5){
      past.missed+=r.missed; past.dem+=r.dem;
      if(isShip)past.ship+=r.missed; if(isStock)past.stock+=r.missed;
      if(day>=buyDay-3){past.m3+=r.missed;past.d3+=r.dem}
    } else if(day>buyDay||buyDay===0&&day>6){
      fut.missed+=r.missed; fut.dem+=r.dem;
      if(isShip)fut.ship+=r.missed; if(isStock)fut.stock+=r.missed;
    }
    rows.push(r);
    if(s.cash<=0)break;
  }
  s.spent=spent;
  return {v:FF.finalValue(s,true),past,fut};
}
const rows=seeds.map(sd=>{
  const a=run(sd,0), b=run(sd,BUY);
  return {
    gain:b.v-a.v,
    pMiss:a.past.missed, pRate:a.past.missed/(a.past.dem||1),
    pStock:a.past.stock, pStockRate:a.past.stock/(a.past.dem||1),
    p3:a.past.m3/(a.past.d3||1),
    fMiss:a.fut.missed, fRate:a.fut.missed/(a.fut.dem||1),
    fStock:a.fut.stock, fStockRate:a.fut.stock/(a.fut.dem||1)
  };
});
function by(key,label,bins){
  console.log(`## ${label}`);
  console.log('| 구간 | 판수 | 미래 못판비율 | 미래 재고부족비율 | B 평균가치 | B 양수비율 |');
  console.log('|---|---|---|---|---|---|');
  for(const [lo,hi,name] of bins){
    const g=rows.filter(r=>r[key]>=lo&&r[key]<hi);
    if(!g.length){console.log(`| ${name} | 0 | - | - | - | - |`);continue}
    console.log(`| ${name} | ${g.length} | ${pct(meanF(g.map(r=>r.fRate)))} | ${pct(meanF(g.map(r=>r.fStockRate)))} | ${mean(g.map(r=>r.gain))} | ${pct(g.filter(r=>r.gain>0).length/g.length)} |`);
  }
  console.log('');
}
console.log(`시드 ${N} · 1~5일 관측 → 7~30일 · X=${X}t 가격 ${PRICE} ${BUY}일 구매\n`);
by('pRate','1~5일 못 판 수요 비율',[[0,0.1,'~10%'],[0.1,0.2,'10~20%'],[0.2,0.3,'20~30%'],[0.3,1,'30%+']]);
by('pStockRate','1~5일 재고부족으로 놓친 비율',[[0,0.05,'~5%'],[0.05,0.15,'5~15%'],[0.15,0.3,'15~30%'],[0.3,1,'30%+']]);
by('p3','최근 3일 못 판 비율',[[0,0.1,'~10%'],[0.1,0.25,'10~25%'],[0.25,0.4,'25~40%'],[0.4,1,'40%+']]);

const corr=(a,b)=>{const ma=meanF(a),mb=meanF(b);let n=0,da=0,db=0;
 for(let i=0;i<a.length;i++){n+=(a[i]-ma)*(b[i]-mb);da+=(a[i]-ma)**2;db+=(b[i]-mb)**2}
 return n/Math.sqrt(da*db)};
const C=(x,y)=>corr(rows.map(r=>r[x]),rows.map(r=>r[y])).toFixed(2);
console.log('## 상관계수');
console.log('| 짝 | r |');console.log('|---|---|');
console.log(`| 과거 못판비율 vs 미래 못판비율 | ${C('pRate','fRate')} |`);
console.log(`| 과거 재고부족비율 vs 미래 재고부족비율 | ${C('pStockRate','fStockRate')} |`);
console.log(`| 과거 못판비율 vs B 가치 | ${C('pRate','gain')} |`);
console.log(`| 과거 재고부족비율 vs B 가치 | ${C('pStockRate','gain')} |`);
console.log(`| 미래 못판비율 vs B 가치 | ${C('fRate','gain')} |`);
console.log(`| 미래 재고부족비율 vs B 가치 | ${C('fStockRate','gain')} |`);
