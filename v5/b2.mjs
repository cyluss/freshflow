// 실험 2: payoff 가 실제 초과생산에 걸리는가
// 실험 3: 생산 전망이 그것을 사전에 읽는가
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||600);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const clone=o=>JSON.parse(JSON.stringify(o));
const pct=x=>(x*100).toFixed(0)+'%';
const mean=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length):0;
const R0=FF.C, X=2, PRICE=750, BUY=6;

function run(seed,buyDay){
  const W=FF.World(seed); const s=FF.initialState(W);
  let have=false,spent=0,fired=0,extra=0,over=0,glut=0;
  for(let t=0;t<R0.days;t++){
    const day=s.day;
    if(buyDay&&day===buyDay&&s.cash>=PRICE){have=true;s.cash-=PRICE;spent+=PRICE}
    const w=W.next();
    if(day>=buyDay){ const o=Math.max(0,w.production-s.cap.intake); if(o>0.05){over+=o;glut++} }
    const before=s.cap.intake;
    const acc0=Math.min(w.production,before);
    if(have)s.cap.intake=before+X;
    const out=FF.transition(s,FF.Cmd.wait(),w,R0);
    if(have){ s.cap.intake=before;
      if(out.result.acc>acc0+0.05){fired++;extra+=out.result.acc-acc0} }
    if(s.cash<=0)break;
  }
  s.spent=spent;
  return {v:FF.finalValue(s,true),fired,extra,over,glut};
}
// 구매 시점의 생산 전망
function outlookAt(seed,day){
  const W=FF.World(seed); const s=FF.initialState(W);
  for(let t=0;t<day-1;t++)FF.transition(s,FF.Cmd.wait(),W.next(),R0);
  const p=FF.pct(FF.blur(FF.hor(s.si,1,7,R0),R0));
  return {p,gap:p[2]-p[0],phase:s.si};
}
const rows=seeds.map(sd=>{
  const a=run(sd,0), b=run(sd,BUY), o=outlookAt(sd,BUY);
  return {gain:b.v-a.v, over:b.over, glut:b.glut, fired:b.fired, extra:b.extra, ...o};
});
function by(key,label,bins){
  console.log(`## ${label}`);
  console.log('| 구간 | 판수 | B 평균가치 | 양수비율 | 초과생산 총량 |');
  console.log('|---|---|---|---|---|');
  for(const [lo,hi,name] of bins){
    const g=rows.filter(r=>r[key]>=lo&&r[key]<hi);
    console.log(`| ${name} | ${g.length} | ${mean(g.map(r=>r.gain))} | ${pct(g.filter(r=>r.gain>0).length/(g.length||1))} | ${(g.reduce((a,r)=>a+r.over,0)/(g.length||1)).toFixed(0)}t |`);
  }
  console.log('');
}
console.log(`시드 ${N} · X=${X}t · 가격 ${PRICE} · ${BUY}일 구매\n`);
by('over','실제 남은 기간 초과생산 총량',[[0,20,'~20t'],[20,40,'20~40t'],[40,70,'40~70t'],[70,999,'70t+']]);
by('glut','초과생산 발생 일수',[[0,5,'~4일'],[5,10,'5~9일'],[10,15,'10~14일'],[15,99,'15일+']]);
by('gap','구매 시점 생산 전망 gap',[[-100,-15,'강한 감소'],[-15,0,'약한 감소'],[0,15,'약한 증가'],[15,100,'강한 증가']]);
by('phase','구매 시점 생산 국면',[[0,1,'부족'],[1,2,'평년'],[2,3,'풍작']]);
// 상관
const corr=(a,b)=>{const ma=a.reduce((x,y)=>x+y,0)/a.length,mb=b.reduce((x,y)=>x+y,0)/b.length;
 let n=0,da=0,db=0;for(let i=0;i<a.length;i++){n+=(a[i]-ma)*(b[i]-mb);da+=(a[i]-ma)**2;db+=(b[i]-mb)**2}
 return n/Math.sqrt(da*db)};
console.log('## 상관계수');
console.log('| 짝 | r |');console.log('|---|---|');
console.log(`| 초과생산 총량 vs B 가치 | ${corr(rows.map(r=>r.over),rows.map(r=>r.gain)).toFixed(2)} |`);
console.log(`| 전망 gap vs 초과생산 총량 | ${corr(rows.map(r=>r.gap),rows.map(r=>r.over)).toFixed(2)} |`);
console.log(`| 전망 gap vs B 가치 | ${corr(rows.map(r=>r.gap),rows.map(r=>r.gain)).toFixed(2)} |`);
console.log(`| 추가매입량 vs B 가치 | ${corr(rows.map(r=>r.extra),rows.map(r=>r.gain)).toFixed(2)} |`);
