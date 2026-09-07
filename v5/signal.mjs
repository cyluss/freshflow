// 신호의 예측력 측정. 파라미터는 v2 고정, 관측만 한다.
// 각 시드의 각 구매 가능일에 사전 관측치와 사후 구매가치를 짝지어 저장한다.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();

const N=+(process.env.N||400);
const DAYS=[];for(let d=2;d<=20;d++)DAYS.push(d);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const val=(sd,plan)=>FF.finalValue(FF.runScenario(sd,plan).state,true);

// 하루 전진하며 그날의 관측치를 수집한다
function observe(seed){
  const W=FF.World(seed);
  let s=FF.initialState(W);
  s.decide=()=>FF.Cmd.wait(); s.dead=false;
  const rows=[]; const hist=[];
  for(let t=0;t<20;t++){
    const day=s.day;
    if(day>=2){
      const sv=FF.pct(FF.blur(FF.hor(s.si,1,5)));
      const dv=FF.pct(FF.blur(FF.hor(s.di,1,5)));
      const last5=hist.slice(-5);
      rows.push({
        day,
        stock:FF.view.stock(s),
        capI:s.cap.intake, capS:s.cap.sales,
        sp:sv, dp:dv,                       // 예보 원자료
        gapS:sv[2]-sv[0], gapD:dv[2]-dv[0], // 축약된 gap
        hitI:last5.filter(h=>h.acc>=s.cap.intake-0.05).length,
        hitA:last5.filter(h=>h.sold>=s.cap.sales-0.05&&h.dem>h.sold+0.05).length,  // 진짜 판매 한도 도달
        hitB:last5.filter(h=>h.b==='stock').length,                                 // 팔 재고 부족
        hitC:last5.filter(h=>h.b==='stock'||h.b==='ship').length,                   // 둘 다
        utilI:last5.length?last5.reduce((a,h)=>a+h.acc/s.cap.intake,0)/last5.length:0,
        utilS:last5.length?last5.reduce((a,h)=>a+h.sold/s.cap.sales,0)/last5.length:0,
        prod5:last5.length?last5.reduce((a,h)=>a+h.prod,0)/last5.length:0,
        dem5:last5.length?last5.reduce((a,h)=>a+h.dem,0)/last5.length:0
      });
    }
    const w=W.next();
    const out=FF.transition(s,FF.Cmd.wait(),w);
    hist.push(out.result);
    if(s.cash<=0)break;
  }
  return rows;
}

// 사후 가치: 그날 사면 무투자 대비 얼마인가, 최적일 대비 어떤가
const data=[];
for(const sd of seeds){
  const base=val(sd,{});
  const obs=observe(sd);
  const vi={}, vs={};
  DAYS.forEach(d=>{ vi[d]=val(sd,{[d]:'intake'})-base; vs[d]=val(sd,{[d]:'sales'})-base });
  const bestI=Math.max(...DAYS.map(d=>vi[d])), bestS=Math.max(...DAYS.map(d=>vs[d]));
  obs.forEach(o=>{
    if(vi[o.day]===undefined)return;
    data.push({...o, gainI:vi[o.day], gainS:vs[o.day],
      aheadI:bestI-vi[o.day], aheadS:bestS-vs[o.day]});
  });
}
console.log(`시드 ${N} · 관측 ${data.length}건\n`);

const pct=x=>(x*100).toFixed(0)+'%';
const mean=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length):0;
const posRate=a=>a.length?a.filter(x=>x>0).length/a.length:0;

// 질문 1: gap 이 클수록 구매가치가 커지는가
function byGap(gapKey,gainKey,label){
  const bins=[[-100,-20,'강한 감소'],[-20,-8,'약한 감소'],[-8,8,'중립'],[8,20,'약한 증가'],[20,100,'강한 증가']];
  console.log(`## ${label}`);
  console.log('| 신호 구간 | 건수 | 평균 사후가치 | 양수 비율 |');
  console.log('|---|---|---|---|');
  for(const [lo,hi,name] of bins){
    const g=data.filter(d=>d[gapKey]>=lo&&d[gapKey]<hi).map(d=>d[gainKey]);
    console.log(`| ${name} | ${g.length} | ${mean(g)} | ${pct(posRate(g))} |`);
  }
  console.log('');
}
byGap('gapS','gainI','집하 · 생산 전망 gap');
byGap('gapD','gainS','판매 · 수요 전망 gap');

// 질문 3: 관측값의 예측력
function byNum(key,gainKey,label,bins){
  console.log(`## ${label}`);
  console.log('| 구간 | 건수 | 평균 | 양수 비율 |');
  console.log('|---|---|---|---|');
  for(const [lo,hi,name] of bins){
    const g=data.filter(d=>d[key]>=lo&&d[key]<hi).map(d=>d[gainKey]);
    console.log(`| ${name} | ${g.length} | ${mean(g)} | ${pct(posRate(g))} |`);
  }
  console.log('');
}
byNum('stock','gainS','판매 · 현재 재고',[[0,3,'0~3t'],[3,8,'3~8t'],[8,15,'8~15t'],[15,99,'15t+']]);
byNum('stock','gainI','집하 · 현재 재고',[[0,3,'0~3t'],[3,8,'3~8t'],[8,15,'8~15t'],[15,99,'15t+']]);
byNum('hitI','gainI','집하 · 최근5일 집하 막힘',[[0,1,'0회'],[1,2,'1회'],[2,3,'2회'],[3,9,'3회+']]);
byNum('hitA','gainS','판매 · 최근5일 A 진짜 판매 한도 도달',[[0,1,'0회'],[1,2,'1회'],[2,3,'2회'],[3,9,'3회+']]);
byNum('hitB','gainS','판매 · 최근5일 B 팔 재고 부족',[[0,1,'0회'],[1,2,'1회'],[2,3,'2회'],[3,9,'3회+']]);
byNum('hitC','gainS','판매 · 최근5일 C 둘 다',[[0,1,'0회'],[1,2,'1회'],[2,3,'2회'],[3,9,'3회+']]);
byNum('day','gainI','집하 · 일차',[[2,6,'2~5일'],[6,11,'6~10일'],[11,16,'11~15일'],[16,21,'16~20일']]);
byNum('day','gainS','판매 · 일차',[[2,6,'2~5일'],[6,11,'6~10일'],[11,16,'11~15일'],[16,21,'16~20일']]);
