// 가격 스윕 + 조합 상호작용
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||600);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const clone=o=>JSON.parse(JSON.stringify(o));
const val=(sd,st,R)=>FF.finalValue(FF.runScenario(sd,st,null,R).state,true,R);
const pct=x=>(x*100).toFixed(0)+'%';
const stock=s=>{var t=0;for(var i=0;i<s.lots.length;i++)t+=s.lots[i].q;return t};

const S={
 '계약2일':   s=>(s.day===2&&s.buys.contract===0)?FF.Cmd.contract():FF.Cmd.wait(),
 '판매2일':   {2:'sales'},
 '계약+판매고정': s=>{
   if(s.day===2&&s.buys.contract===0)return FF.Cmd.contract();
   if(s.day===4&&s.buys.sales===0)return FF.Cmd.buy('sales');
   return FF.Cmd.wait();
 },
 '판매재고8t': s=>(!s.pend&&s.buys.sales===0&&stock(s)>=8)?FF.Cmd.buy('sales'):FF.Cmd.wait(),
 '계약+재고8t': s=>{
   if(s.pend)return FF.Cmd.wait();
   if(s.day===2&&s.buys.contract===0)return FF.Cmd.contract();
   if(s.buys.sales===0&&stock(s)>=8)return FF.Cmd.buy('sales');
   return FF.Cmd.wait();
 }
};
const CAND=[{n:'무투자',p:{}},{n:'계약만',p:s=>(s.day===2&&s.buys.contract===0)?FF.Cmd.contract():FF.Cmd.wait()},
 {n:'판매만',p:{2:'sales'}},{n:'집하만',p:{2:'intake'}},
 {n:'조합',p:s=>{if(s.day===2&&s.buys.contract===0)return FF.Cmd.contract();
   if(s.day===4&&s.buys.sales===0)return FF.Cmd.buy('sales');return FF.Cmd.wait()}}];

console.log(`시드 ${N} · X=2t\n`);
console.log('| 가격 | 계약2일 | 판매2일 | 계약+판매고정 | 판매재고8t | 계약+재고8t | 무투자최선 | 최다최선 | 여지 |');
console.log('|---|---|---|---|---|---|---|---|---|');
for(const price of [1250,1500,1750,2000,2250,2500]){
  const R=clone(FF.C); R.contract={limit:2,price:price,max:1};
  const base=seeds.map(sd=>val(sd,{},R));
  const stat=st=>{let d=0,w=0;seeds.forEach((sd,i)=>{const v=val(sd,st,R);d+=v-base[i];if(v>base[i])w++});
    return `${Math.round(d/N)} (${pct(w/N)})`};
  const best={};let gap=0;
  seeds.forEach((sd,i)=>{let bv=-Infinity,bn=null;
    CAND.forEach(c=>{const v=val(sd,c.p,R);if(v>bv){bv=v;bn=c.n}});best[bn]=(best[bn]||0)+1;gap+=bv-base[i]});
  const top=Object.entries(best).sort((a,b)=>b[1]-a[1])[0];
  console.log(`| ${price} | ${stat(S['계약2일'])} | ${stat(S['판매2일'])} | ${stat(S['계약+판매고정'])} | ${stat(S['판매재고8t'])} | ${stat(S['계약+재고8t'])} | ${pct((best['무투자']||0)/N)} | ${top[0]} ${pct(top[1]/N)} | ${Math.round(gap/N)} |`);
}
