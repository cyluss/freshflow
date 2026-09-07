// 창고 확대에서 cover 선택 폭이 넓어지는가
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||400);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const clone=o=>JSON.parse(JSON.stringify(o));
const pct=x=>(x*100).toFixed(0)+'%';
const COVERS=[1,1.5,2,2.5];
const XS=FF.C.contract.options.map(o=>o.x);
const at1=x=>s=>(s.day===1&&s.buys.contract===0)?FF.Cmd.contract(x):FF.Cmd.wait();
const val=(sd,p,R)=>FF.finalValue(FF.runScenario(sd,p,null,R).state,true,R);
console.log(`시드 ${N}\n`);
console.log('| 창고 | cover 최선 ' + COVERS.join('/') + ' | 여지 | 계약 0/0.5/1/1.5 | 판매 6일 | 로스 |');
console.log('|---|---|---|---|---|---|');
for(const st of [40]){
  const R0=clone(FF.C); R0.cap={intake:20,storage:st,sales:21};
  const V={};
  for(const c of COVERS){const R=clone(R0);R.cover=c;V[c]=seeds.map(sd=>val(sd,{},R))}
  const best={}; let gap=0;
  seeds.forEach((sd,i)=>{
    let bv=-Infinity,bc=null;
    COVERS.forEach(c=>{if(V[c][i]>bv){bv=V[c][i];bc=c}});
    best[bc]=(best[bc]||0)+1; gap+=bv-V[2][i];
  });
  const base=V[2];
  const xb={};
  seeds.forEach((sd,i)=>{
    let xv=-Infinity,xx=null;
    XS.forEach(x=>{const v=x===0?0:val(sd,at1(x),R0)-base[i];if(v>xv){xv=v;xx=x}});
    xb[xx]=(xb[xx]||0)+1;
  });
  let sw=0,sm=0;
  seeds.forEach((sd,i)=>{const v=val(sd,{6:'sales'},R0)-base[i];sm+=v;if(v>0)sw++});
  let waste=0,prod=0;
  for(const sd of seeds.slice(0,200))
    FF.runScenario(sd,{},null,R0).days.forEach(d=>{waste+=d.result.wI+d.result.wS+d.result.wT;prod+=d.result.prod});
  console.log(`| ${st}t | ${COVERS.map(c=>pct((best[c]||0)/N)).join(' / ')} | +${Math.round(gap/N)} | ${XS.map(x=>pct((xb[x]||0)/N)).join(' / ')} | ${Math.round(sm/N)} (${pct(sw/N)}) | ${pct(waste/prod)} |`);
}
