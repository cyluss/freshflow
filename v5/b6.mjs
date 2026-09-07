// X와 가격 동시 스윕 + 초가산 비율
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||500);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const clone=o=>JSON.parse(JSON.stringify(o));
const pct=x=>(x*100).toFixed(0)+'%';
const stock=s=>{var t=0;for(var i=0;i<s.lots.length;i++)t+=s.lots[i].q;return t};
const P={
  c:    s=>(s.day===2&&s.buys.contract===0)?FF.Cmd.contract():FF.Cmd.wait(),
  sale: {4:'sales'},
  both: s=>{if(s.day===2&&s.buys.contract===0)return FF.Cmd.contract();
            if(s.day===4&&s.buys.sales===0)return FF.Cmd.buy('sales');return FF.Cmd.wait()},
  stk:  s=>(!s.pend&&s.buys.sales===0&&stock(s)>=8)?FF.Cmd.buy('sales'):FF.Cmd.wait(),
  cstk: s=>{if(s.pend)return FF.Cmd.wait();
            if(s.day===2&&s.buys.contract===0)return FF.Cmd.contract();
            if(s.buys.sales===0&&stock(s)>=8)return FF.Cmd.buy('sales');return FF.Cmd.wait()}
};
const CAND=[{n:'무투자',p:{}},{n:'계약만',p:P.c},{n:'판매만',p:{2:'sales'}},
            {n:'집하만',p:{2:'intake'}},{n:'조합',p:P.both}];
console.log(`시드 ${N}\n`);
console.log('| X | 가격 | 계약 | 판매 | 조합고정 | 계약+재고8t | 초가산 | 비율 | 무투자최선 | 조합최선 |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for(const [X,price] of [[1,1500],[1,1750],[1,2000],[0.5,750],[0.5,1000],[0.5,1250]]){
  const R=clone(FF.C); R.contract={limit:X,price:price,max:1};
  const val=(sd,st)=>FF.finalValue(FF.runScenario(sd,st,null,R).state,true,R);
  const base=seeds.map(sd=>val(sd,{}));
  const stat=st=>{let d=0,w=0;seeds.forEach((sd,i)=>{const v=val(sd,st);d+=v-base[i];if(v>base[i])w++});
    return {m:Math.round(d/N),w:w/N}};
  const c=stat(P.c), s2=stat(P.sale), b=stat(P.both), cs=stat(P.cstk);
  const syn=b.m-c.m-s2.m;
  const best={};
  seeds.forEach((sd,i)=>{let bv=-Infinity,bn=null;
    CAND.forEach(x=>{const v=val(sd,x.p);if(v>bv){bv=v;bn=x.n}});best[bn]=(best[bn]||0)+1});
  console.log(`| ${X}t | ${price} | ${c.m} (${pct(c.w)}) | ${s2.m} (${pct(s2.w)}) | ${b.m} (${pct(b.w)}) | ${cs.m} (${pct(cs.w)}) | ${syn} | ${pct(syn/b.m)} | ${pct((best['무투자']||0)/N)} | ${pct((best['조합']||0)/N)} |`);
}
