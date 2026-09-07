// 규칙 기반 정책이 고정 전략을 이기는가
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||400);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const pct=x=>(x*100).toFixed(0)+'%';
const stock=s=>{let t=0;for(const l of s.lots)t+=l.q;return t};
const miss=s=>FF.view.missRate(s);
// 개장 전망 판정 (성향 기반)
function outlook(seed){
  const W=FF.World(seed);
  return W.tilt();       // {supply, demand} 0 침체 1 평년 2 호황
}
function run(seed,strategy){
  const W=FF.World(seed); const s=FF.initialState(W);
  s.tiltInfo=W.tilt();
  for(let t=0;t<FF.C.days;t++){
    FF.transition(s,strategy(s),W.next());
    if(s.cash<=0)break;
  }
  return FF.finalValue(s,true);
}
const CV=FF.C.policy.map(o=>o.v);
const S={
  '무투자': s=>FF.Cmd.wait(),
  '계약1t+판매6일': s=>{
    if(s.day===1&&s.buys.contract===0)return FF.Cmd.contract(1);
    if(s.day===6&&s.buys.sales===0)return FF.Cmd.buy('sales');
    return FF.Cmd.wait();
  },
  '규칙 재고만': s=>{
    if(s.pend)return FF.Cmd.wait();
    if(s.day===1&&s.buys.contract===0)return FF.Cmd.contract(1);
    if(s.buys.sales===0&&stock(s)>=8)return FF.Cmd.buy('sales');
    return FF.Cmd.wait();
  },
  '규칙 전망+신호': s=>{
    if(s.pend)return FF.Cmd.wait();
    if(s.day===1&&s.buys.contract===0){
      const d=s.tiltInfo.demand;
      return FF.Cmd.contract(d===2?1.5:(d===0?0:1));
    }
    if(s.buys.sales===0&&stock(s)>=8)return FF.Cmd.buy('sales');
    if(miss(s)>=0.25&&s.cover!==2)return FF.Cmd.policy(2);
    if(stock(s)>=15&&s.cover!==1)return FF.Cmd.policy(1);
    return FF.Cmd.wait();
  },
  '규칙 정책만': s=>{
    if(miss(s)>=0.25&&s.cover!==2)return FF.Cmd.policy(2);
    if(stock(s)>=15&&s.cover!==1)return FF.Cmd.policy(1);
    return FF.Cmd.wait();
  }
};
const base=seeds.map(sd=>run(sd,S['무투자']));
console.log(`시드 ${N}\n`);
console.log('| 전략 | 평균 | 승률 | 최선인 판 |');
console.log('|---|---|---|---|');
const V={};
for(const k of Object.keys(S)) V[k]=seeds.map(sd=>run(sd,S[k]));
const names=Object.keys(S);
const best={};
seeds.forEach((sd,i)=>{
  let bv=-Infinity,bn=null;
  names.forEach(n=>{if(V[n][i]>bv){bv=V[n][i];bn=n}});
  best[bn]=(best[bn]||0)+1;
});
const m=a=>Math.round(a.reduce((x,y)=>x+y,0)/a.length);
names.forEach(n=>{
  const d=V[n].map((v,i)=>v-base[i]);
  console.log(`| ${n} | ${m(d)} | ${pct(d.filter(x=>x>0).length/N)} | ${pct((best[n]||0)/N)} |`);
});
