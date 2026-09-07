// 1일차에 볼 수 있는 정보가 계약 가치를 예측하는가
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||1000);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const val=(sd,st)=>FF.finalValue(FF.runScenario(sd,st).state,true);
const pct=x=>(x*100).toFixed(1)+'%';
const at1=s=>(s.day===1&&s.buys.contract===0)?FF.Cmd.contract():FF.Cmd.wait();
const base=seeds.map(sd=>val(sd,{}));
const rows=seeds.map((sd,i)=>{
  const W=FF.World(sd), s=FF.initialState(W);
  const sv=FF.pct(FF.blur(FF.hor(s.si,1,10))), dv=FF.pct(FF.blur(FF.hor(s.di,1,10)));
  return {gain:val(sd,at1)-base[i], si:s.si, di:s.di,
    sup:sv[2]-sv[0], dem:dv[2]-dv[0]};
});
const mean=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length):0;
function by(key,label,bins){
  console.log(`\n## ${label}`);
  console.log('| 구간 | 판수 | 평균 | 양수비율 |');
  console.log('|---|---|---|---|');
  for(const [lo,hi,name] of bins){
    const g=rows.filter(r=>r[key]>=lo&&r[key]<hi);
    if(g.length<20){console.log(`| ${name} | ${g.length} | - | - |`);continue}
    console.log(`| ${name} | ${g.length} | ${mean(g.map(r=>r.gain))} | ${pct(g.filter(r=>r.gain>0).length/g.length)} |`);
  }
}
console.log(`시드 ${N} · 1일차 계약 고정\n전체 평균 ${mean(rows.map(r=>r.gain))} · 승률 ${pct(rows.filter(r=>r.gain>0).length/N)}`);
by('si','시작 생산 국면',[[0,1,'부족'],[1,2,'평년'],[2,3,'풍작']]);
by('di','시작 수요 국면',[[0,1,'침체'],[1,2,'정상'],[2,3,'호황']]);
by('dem','수요 전망 gap',[[-100,-10,'감소'],[-10,10,'중립'],[10,100,'증가']]);
// 두 국면 조합
console.log('\n## 생산 × 수요 국면 (양수비율)');
console.log('| | 침체 | 정상 | 호황 |');
console.log('|---|---|---|---|');
for(const si of [0,1,2]){
  const cells=[0,1,2].map(di=>{
    const g=rows.filter(r=>r.si===si&&r.di===di);
    return g.length<20?`- (${g.length})`:`${pct(g.filter(r=>r.gain>0).length/g.length)} (${g.length})`;
  });
  console.log(`| ${['부족','평년','풍작'][si]} | ${cells.join(' | ')} |`);
}
