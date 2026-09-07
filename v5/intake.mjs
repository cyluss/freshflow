// 집하 구매가치의 2차원 조건 분해. 파라미터는 v2 고정.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||600);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const val=(sd,p)=>FF.finalValue(FF.runScenario(sd,p).state,true);
const pct=x=>(x*100).toFixed(0)+'%';
const mean=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length):0;

// 매일의 관측치와 그날 집하를 산 사후가치를 짝짓는다
const data=[];
for(const sd of seeds){
  const base=val(sd,{});
  const W=FF.World(sd); let s=FF.initialState(W); const h=[];
  for(let t=0;t<16;t++){
    const day=s.day;
    if(day>=2){
      const last5=h.slice(-5);
      const room=s.cap.storage-FF.view.stock(s);
      data.push({
        day, room, stock:FF.view.stock(s),
        prod5:last5.length?last5.reduce((a,x)=>a+x.prod,0)/last5.length:0,
        unacc5:last5.length?last5.reduce((a,x)=>a+x.wI,0)/last5.length:0,   // 미집하
        capHit:last5.filter(x=>x.acc>=s.cap.intake-0.05).length,
        gain:val(sd,{[day]:'intake'})-base
      });
    }
    const w=W.next(); h.push(FF.transition(s,FF.Cmd.wait(),w).result);
    if(s.cash<=0)break;
  }
}
console.log(`시드 ${N} · 관측 ${data.length}건\n`);

const ROOM=[[0,5,'여유<5t'],[5,15,'여유 5~15t'],[15,99,'여유>15t']];
function cross(key,label,bins){
  console.log(`## 창고 여유 × ${label}`);
  console.log('| | ' + bins.map(b=>b[2]).join(' | ') + ' |');
  console.log('|---|' + bins.map(()=>'---|').join(''));
  for(const [rlo,rhi,rname] of ROOM){
    const cells=bins.map(([lo,hi])=>{
      const g=data.filter(d=>d.room>=rlo&&d.room<rhi&&d[key]>=lo&&d[key]<hi).map(d=>d.gain);
      return g.length<30?'-':`${mean(g)} (${pct(g.filter(x=>x>0).length/g.length)}) n${g.length}`;
    });
    console.log(`| ${rname} | ${cells.join(' | ')} |`);
  }
  console.log('');
}
cross('unacc5','최근 미집하',[[0,0.5,'0~0.5t'],[0.5,3,'0.5~3t'],[3,99,'3t+']]);
cross('prod5','최근 생산',[[0,18,'~18t'],[18,22,'18~22t'],[22,99,'22t+']]);
cross('stock','현재 재고',[[0,3,'0~3t'],[3,10,'3~10t'],[10,99,'10t+']]);
cross('capHit','최근 집하 한도 도달',[[0,1,'0회'],[1,3,'1~2회'],[3,9,'3회+']]);

// 최고 조합 탐색
console.log('## 양수 비율 상위 조합 (n>=100)');
const best=[];
for(const [rlo,rhi,rn] of ROOM)
 for(const [ulo,uhi,un] of [[0,0.5,'미집하 0~0.5'],[0.5,3,'미집하 0.5~3'],[3,99,'미집하 3+']])
  for(const [dlo,dhi,dn] of [[2,7,'2~6일'],[7,12,'7~11일'],[12,17,'12~16일']]){
   const g=data.filter(d=>d.room>=rlo&&d.room<rhi&&d.unacc5>=ulo&&d.unacc5<uhi&&d.day>=dlo&&d.day<dhi).map(d=>d.gain);
   if(g.length>=100) best.push([rn+' · '+un+' · '+dn, mean(g), g.filter(x=>x>0).length/g.length, g.length]);
  }
best.sort((a,b)=>b[2]-a[2]).slice(0,8).forEach(b=>console.log(`| ${b[0]} | ${b[1]} | ${pct(b[2])} | n${b[3]} |`));
