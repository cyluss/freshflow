// 구매일별 가치 곡선. 같은 증설을 한 번만 사되 구매일만 바꾼다.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();

const N=+(process.env.N||1000);
const seeds=[]; for(let i=1;i<=N;i++) seeds.push(i*13+5);
const val=(sd,plan)=>FF.finalValue(FF.runScenario(sd,plan).state,true);
const DAYS=[];
for(let d=2;d<=20;d++) DAYS.push(d);

const base=seeds.map(sd=>val(sd,{}));
function curve(kind){
  return DAYS.map(d=>{
    let sum=0,win=0;
    seeds.forEach((sd,i)=>{const v=val(sd,{[d]:kind}); sum+=v-base[i]; if(v>base[i])win++});
    return {day:d, mean:Math.round(sum/N), win:win/N};
  });
}
const bar=(v,max)=>{
  const w=Math.round(Math.abs(v)/max*24);
  return (v>=0?' ':'-')+'█'.repeat(Math.max(0,w));
};

console.log(`시드 ${N}판 · 같은 증설을 한 번만, 구매일만 바꾼다\n`);
for(const kind of ['intake','sales']){
  const c=curve(kind);
  const max=Math.max(...c.map(x=>Math.abs(x.mean)));
  console.log(`## ${kind==='intake'?'집하 한도':'판매 한도'}`);
  console.log('| 구매일 | 무투자 대비 | 승률 | |');
  console.log('|---|---|---|---|');
  c.forEach(x=>console.log(`| ${x.day}일 | ${x.mean} | ${(x.win*100).toFixed(0)}% | ${bar(x.mean,max)} |`));
  const best=c.reduce((a,b)=>b.mean>a.mean?b:a);
  const mono=c.every((x,i)=>i===0||x.mean<=c[i-1].mean+1);
  console.log(`\n최고 ${best.day}일 (${best.mean}) · 단조감소 ${mono?'예':'아니오'}\n`);
}
