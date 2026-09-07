// 입고 한도 x cover 격자. 계약과 판매 증설도 함께 본다.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||300);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const clone=o=>JSON.parse(JSON.stringify(o));
const pct=x=>(x*100).toFixed(0)+'%';
const COVERS=[1,1.5,2,2.5,3];
const XS=FF.C.contract.options.map(o=>o.x);
const at1=x=>s=>(s.day===1&&s.buys.contract===0)?FF.Cmd.contract(x):FF.Cmd.wait();
const val=(sd,p,R)=>FF.finalValue(FF.runScenario(sd,p,null,R).state,true,R);

console.log(`시드 ${N}\n`);
console.log('| 입고 | cover 최선 분포 1/1.5/2/2.5/3 | cover 판단여지 | 계약 0/0.5/1/1.5 | 판매 6일 | ship |');
console.log('|---|---|---|---|---|---|');
for(const cap of [20,22,25,30]){
  const R0=clone(FF.C); R0.cap={intake:cap,storage:30,sales:21};
  const V={};
  for(const c of COVERS){const R=clone(R0);R.cover=c;V[c]=seeds.map(sd=>val(sd,{},R))}
  const bestC={}; let gap=0;
  seeds.forEach((sd,i)=>{
    let bv=-Infinity,bc=null;
    COVERS.forEach(c=>{if(V[c][i]>bv){bv=V[c][i];bc=c}});
    bestC[bc]=(bestC[bc]||0)+1; gap+=bv-V[2][i];
  });
  // 계약과 판매는 기본 cover 로 본다
  const base=V[2];
  const xb={};
  seeds.forEach((sd,i)=>{
    let xv=-Infinity,xx=null;
    XS.forEach(x=>{const v=x===0?0:val(sd,at1(x),R0)-base[i];if(v>xv){xv=v;xx=x}});
    xb[xx]=(xb[xx]||0)+1;
  });
  let sw=0,sm=0;
  seeds.forEach((sd,i)=>{const v=val(sd,{6:'sales'},R0)-base[i];sm+=v;if(v>0)sw++});
  const bc={};let n2=0;
  for(const sd of seeds.slice(0,150))
    FF.runScenario(sd,{},null,R0).days.forEach(d=>{bc[d.result.b]=(bc[d.result.b]||0)+1;n2++});
  console.log(`| ${cap}t | ${COVERS.map(c=>pct((bestC[c]||0)/N)).join(' / ')} | +${Math.round(gap/N)} | ${XS.map(x=>pct((xb[x]||0)/N)).join(' / ')} | ${Math.round(sm/N)} (${pct(sw/N)}) | ${pct((bc.ship||0)/n2)} |`);
}
