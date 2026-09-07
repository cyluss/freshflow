// B 재측정. 정식 커널 경로. 유지비 없는 계약이 사양이다.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||800);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const clone=o=>JSON.parse(JSON.stringify(o));
const val=(sd,st,R)=>FF.finalValue(FF.runScenario(sd,st,null,R).state,true,R);
const pct=x=>(x*100).toFixed(0)+'%';
const atDay=d=>s=>(s.day===d&&s.buys.contract===0)?FF.Cmd.contract():FF.Cmd.wait();

const base=seeds.map(sd=>val(sd,{}));
const stat=(st,R)=>{let d=0,w=0,v=[];seeds.forEach((sd,i)=>{const x=val(sd,st,R);d+=x-base[i];if(x>base[i])w++;v.push(x-base[i])});
 const m=d/N, sdv=Math.sqrt(v.reduce((a,b)=>a+(b-m)*(b-m),0)/N);
 return {mean:Math.round(m),win:w/N,sd:Math.round(sdv)}};

console.log(`시드 ${N} · 정식 커널\n`);
console.log('| X | 가격 | 2일 | 6일 | 12일 |');
console.log('|---|---|---|---|---|');
for(const X of [1,2]) for(const price of [750,1500,2500,3500]){
  const R=clone(FF.C); R.contract={limit:X,price:price,max:1};
  const c=[2,6,12].map(d=>{const r=stat(atDay(d),R);return `${r.mean} (${pct(r.win)})`});
  console.log(`| ${X}t | ${price} | ${c.join(' | ')} |`);
}
