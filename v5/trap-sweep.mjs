// trap.mjs 가 이론으로 찾은 함정이 실제 플레이에서 얼마나 자주 발동하는지 잰다.
// 배분 없이(커널 기본, 단가순 자동) 30일을 돌려 각 판로가 0에 떨어진 뒤 못 벗어나는 빈도를 센다.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(function(f){return fs.readFileSync(f,'utf8')}).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||300), R=FF.C;
const names=R.channels.map(function(c){return c.key});
const everZero=names.map(function(){return 0}), stillZeroAtEnd=names.map(function(){return 0});
var trapped=0;
for(var i=1;i<=N;i++){
 var seed=i*13+5;
 FF.reset(seed);
 var hitZero=names.map(function(){return false});
 for(var day=1;day<=R.days;day++){
  FF.stepDay(FF.Cmd.wait());
  var rel=FF.relOf();
  rel.forEach(function(v,ci){ if(v===0)hitZero[ci]=true });
  if(FF.isOver())break;
 }
 var rel2=FF.relOf(), anyTrap=false;
 hitZero.forEach(function(h,ci){
  if(h)everZero[ci]++;
  if(h&&rel2[ci]===0){ stillZeroAtEnd[ci]++; anyTrap=true; }
 });
 if(anyTrap)trapped++;
}
console.log('시드 '+N+'개 · 자동(단가순) 배분 · 30일\n');
console.log('| 판로 | 한 번이라도 0 도달 | 0 도달 뒤 끝까지 못 벗어남 |');
console.log('|---|---|---|');
names.forEach(function(n,i){
 console.log('| '+n+' | '+Math.round(everZero[i]/N*100)+'% | '+Math.round(stillZeroAtEnd[i]/N*100)+'% |');
});
console.log('\n한 판로라도 갇힌 판 비율: '+Math.round(trapped/N*100)+'%');
