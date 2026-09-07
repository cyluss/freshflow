// 5일차까지 관측 가능한 정보로 집하 유리 판을 구분할 수 있는가
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||600);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const val=(sd,p)=>FF.finalValue(FF.runScenario(sd,p).state,true);
const pct=x=>(x*100).toFixed(0)+'%';
const mean=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length):0;

// 5일까지 관망하며 관측치를 모은다
function probe(seed){
  const W=FF.World(seed); let s=FF.initialState(W); const h=[];
  for(let t=0;t<5;t++){ const w=W.next(); h.push(FF.transition(s,FF.Cmd.wait(),w).result) }
  const sum=k=>h.reduce((a,x)=>a+x[k],0);
  return {
    prod5:sum('prod')/5, dem5:sum('dem')/5,
    acc5:sum('acc')/5, sold5:sum('sold')/5,
    waste5:h.reduce((a,x)=>a+x.wI+x.wS+x.wT,0)/5,
    missed5:sum('missed')/5,
    stock:FF.view.stock(s),
    capHit:h.filter(x=>x.acc>=s.cap.intake-0.05).length,
    profit5:sum('profit')/5,
    si:s.si, di:s.di
  };
}
const rows=seeds.map(sd=>{
  const p=probe(sd), b=val(sd,{});
  return {...p, gainI:val(sd,{6:'intake'})-b, gainS:val(sd,{6:'sales'})-b};
});
function by(key,label,bins){
  console.log(`## ${label}`);
  console.log('| 구간 | 판수 | 집하 6일 평균 | 양수비율 | 판매 6일 평균 | 양수비율 |');
  console.log('|---|---|---|---|---|---|');
  for(const [lo,hi,name] of bins){
    const g=rows.filter(r=>r[key]>=lo&&r[key]<hi);
    const gi=g.map(r=>r.gainI), gs=g.map(r=>r.gainS);
    console.log(`| ${name} | ${g.length} | ${mean(gi)} | ${pct(gi.filter(x=>x>0).length/(gi.length||1))} | ${mean(gs)} | ${pct(gs.filter(x=>x>0).length/(gs.length||1))} |`);
  }
  console.log('');
}
console.log(`시드 ${N} · 1~5일 관측으로 6일 구매의 사후가치를 가른다\n`);
by('capHit','5일 중 집하 한도 도달 횟수',[[0,1,'0회'],[1,3,'1~2회'],[3,5,'3~4회'],[5,9,'5회']]);
by('waste5','5일 평균 버린 물량',[[0,0.5,'0~0.5t'],[0.5,2,'0.5~2t'],[2,5,'2~5t'],[5,99,'5t+']]);
by('missed5','5일 평균 못 판 수요',[[0,0.5,'0~0.5t'],[0.5,3,'0.5~3t'],[3,8,'3~8t'],[8,99,'8t+']]);
by('prod5','5일 평균 생산',[[0,16,'~16t'],[16,20,'16~20t'],[20,24,'20~24t'],[24,99,'24t+']]);
by('stock','5일차 재고',[[0,1,'0~1t'],[1,6,'1~6t'],[6,14,'6~14t'],[14,99,'14t+']]);
by('profit5','5일 평균 손익',[[-9e9,4000,'~4000'],[4000,6000,'4~6천'],[6000,8000,'6~8천'],[8000,9e9,'8천+']]);
