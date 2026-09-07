// 관계의 판 중 동학. 오르내리는가, 언제 갈리는가, 보장이 침체기에 작동하는가.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||400);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const R=FF.C, D=+(process.env.D||R.days), TTL=R.ttl, pct=x=>(x*100).toFixed(0)+'%';
const CH=[
 {n:'온라인',cap0:6,settle:0,quota:4,base:[1150,1050,450,0,0]},
 {n:'프랜차이즈',cap0:6,settle:14,quota:5,base:[900,900,850,650,0]},
 {n:'도매',cap0:14,settle:3,quota:6,base:[760,745,730,690,640]}
];
(function(){const avg=CH.reduce((a,c)=>a+c.base[0],0)/CH.length;
 CH.forEach(c=>{c.base=c.base.map((p,i)=>{if(p===0)return 0;
  const ref=avg*(c.base[i]/c.base[0]);return Math.round(ref+(p-ref)*0.5)})})})();
const TOP=1.6, MULT=[1-(TOP-1)*0.6,1,1+(TOP-1)*0.5,TOP];
const CAPM=[0.6,1,1.4,1.8], FLOOR=[0,0.5,1,1.5];
function run(seed,policy,track){
  const W=FF.World(seed,R); const rng=new FF.Rng(seed^0x5f3a);
  let cash=R.cash; const ar=[]; let lots=[]; let rel=[1,1,1];
  const hist=[]; let floorUsed=0, lowDays=0;
  for(let t=0;t<D;t++){
    const day=t+1;
    while(ar.length&&ar[0].at<=day)cash+=ar.shift().amt;
    const w=W.next();
    const got=Math.min(w.production,R.cap.intake);
    lots.push({q:got,a:0}); cash-=got*R.farm+R.fixed;
    const dm=CH.map((c,i)=>{
      const cap=c.cap0*CAPM[rel[i]];
      const noise=(i===2)?(0.8+rng.next()*0.4):(0.6+rng.next()*0.8);
      const raw=Math.max(0,Math.min(cap,w.demand*(cap/26)*noise));
      if(i===1){const fl=c.quota*FLOOR[rel[i]];
        if(fl>raw+0.01){floorUsed++}
        return Math.max(raw,fl)}
      return raw;
    });
    if(w.demand<16)lowDays++;
    const price=(ci,a)=>CH[ci].base[Math.min(a,TTL-1)]*MULT[rel[ci]];
    const plan=policy(lots,dm,rel,price);
    const to=[0,0,0];
    plan.forEach(x=>{to[x.ch]+=x.q;
      const amt=x.q*price(x.ch,x.a);
      if(CH[x.ch].settle===0)cash+=amt; else ar.push({at:day+CH[x.ch].settle,amt})});
    plan.forEach(x=>{for(const l of lots)if(l.a===x.a&&l.q>0){const k=Math.min(l.q,x.q);l.q-=k;break}});
    CH.forEach((c,i)=>{
      if(to[i]>=c.quota-0.01){if(day%4===0)rel[i]=Math.min(3,rel[i]+1)}
      else if(to[i]<c.quota*0.5)rel[i]=Math.max(0,rel[i]-1);
    });
    if(track)hist.push(rel.slice());
    lots=lots.filter(l=>l.q>0.01); lots.forEach(l=>l.a++); lots=lots.filter(l=>l.a<TTL);
    ar.sort((a,b)=>a.at-b.at);
  }
  ar.forEach(a=>cash+=a.amt);
  return {cash,rel,hist,floorUsed,lowDays};
}
const greedy=(lots,dm,rel,price)=>{
  const cells=[]; lots.forEach(l=>[0,1,2].forEach(ci=>cells.push({ch:ci,a:l.a,q:l.q,p:price(ci,l.a)})));
  cells.sort((x,y)=>y.p-x.p);
  const left=dm.slice(),used={},out=[];
  cells.forEach(x=>{const av=x.q-(used[x.a]||0);const take=Math.min(av,left[x.ch]);
    if(take>0.01){out.push({ch:x.ch,a:x.a,q:take});left[x.ch]-=take;used[x.a]=(used[x.a]||0)+take}});
  return out;
};
// 동학
let changes=[[],[],[]], floors=0, lows=0, ends={};
for(const sd of seeds){
  const r=run(sd,greedy,true);
  [0,1,2].forEach(i=>{
    let c=0;
    for(let d=1;d<r.hist.length;d++)if(r.hist[d][i]!==r.hist[d-1][i])c++;
    changes[i].push(c);
  });
  floors+=r.floorUsed; lows+=r.lowDays;
  const key=r.rel.join('');
  ends[key]=(ends[key]||0)+1;
}
const m=a=>(a.reduce((x,y)=>x+y,0)/a.length);
console.log(`시드 ${N} · ${D}일`);
const tot=[0,1,2].reduce((a,i)=>a+m(changes[i]),0);
const top=Object.entries(ends).sort((a,b)=>b[1]-a[1]);
const distinct=Object.keys(ends).length;
const maxShare=top[0][1]/N;
console.log(`  변동 ${tot.toFixed(1)}회 · 10일당 ${(tot/D*10).toFixed(1)}회 · 보장 ${(floors/N).toFixed(1)}일 · 조합 ${distinct}가지 · 최다 ${top[0][0]} ${pct(maxShare)}`);
