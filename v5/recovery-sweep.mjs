// 관계 0에서 실제로 회복되는지, 며칠 걸리는지, 끝내 못 벗어난 판이 남는지 잰다.
// 정책: 평소엔 자동(단가순), 어느 판로든 0으로 떨어지면 그날부터 그 판로에
// 몰아준다(플레이어가 비용을 치르는 선택). 회복하면 다시 자동으로 돌아간다.
// 판마다 헤아린다: 0을 겪었는가, 그 중 한 번이라도 벗어났는가, 게임이 끝날 때도 0인가.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(function(f){return fs.readFileSync(f,'utf8')}).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||300), R=FF.C;
const names=R.channels.map(function(c){return c.key});

const everZero=names.map(function(){return 0});          // 판 수: 한 번이라도 0을 겪었다
const recoveredGame=names.map(function(){return 0});     // 판 수: 겪은 뒤 한 번이라도 벗어났다
const stillZeroAtEnd=names.map(function(){return 0});    // 판 수: 겪었고 끝까지 0
const recoverDays=names.map(function(){return []});      // 회복 사건마다 걸린 일수

for(let i=1;i<=N;i++){
 const seed=i*13+5;
 FF.reset(seed);
 const fellDay=names.map(function(){return null});
 const sawZero=names.map(function(){return false});
 const gotBack=names.map(function(){return false});
 for(let day=1;day<=R.days;day++){
  const rel=FF.relOf();
  const zeroIdx=rel.map(function(v,ci){return v===0?ci:-1}).filter(function(x){return x>=0});
  const cmd=zeroIdx.length
    ? FF.Cmd.sell(rel.map(function(v,ci){return zeroIdx.includes(ci)?5:1}))
    : FF.Cmd.wait();
  FF.stepDay(cmd);
  const rel2=FF.relOf();
  rel2.forEach(function(v,ci){
   if(v===0){ sawZero[ci]=true; if(fellDay[ci]===null)fellDay[ci]=day; }
   else if(fellDay[ci]!==null){
    recoverDays[ci].push(day-fellDay[ci]);
    gotBack[ci]=true; fellDay[ci]=null;
   }
  });
  if(FF.isOver())break;
 }
 const relEnd=FF.relOf();
 names.forEach(function(n,ci){
  if(!sawZero[ci])return;
  everZero[ci]++;
  if(gotBack[ci])recoveredGame[ci]++;
  if(relEnd[ci]===0)stillZeroAtEnd[ci]++;
 });
}

console.log('시드 '+N+'개 · 0으로 떨어지면 그 판로에 몰아주는 정책 · 30일');
console.log('(0을 한 번도 안 겪은 판은 분모에서 뺀다)\n');
console.log('| 판로 | 0 도달 판 수 | 회복률(판 기준) | 평균 회복일 | 끝까지 0에 남은 판 비율 |');
console.log('|---|---|---|---|---|');
names.forEach(function(n,i){
 const ez=everZero[i], days=recoverDays[i];
 const avg=days.length?Math.round(days.reduce(function(a,b){return a+b},0)/days.length*10)/10:null;
 console.log('| '+n+' | '+ez+' | '+(ez?Math.round(recoveredGame[i]/ez*100)+'%':'-')+
   ' | '+(avg===null?'-':avg+'일')+' | '+(ez?Math.round(stillZeroAtEnd[i]/ez*100)+'%':'-')+' |');
});
