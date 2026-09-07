// 판로 x 재고 나이 가격표. 최고가 우선이 깨지는가.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||400);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const R=FF.C, D=R.days, TTL=R.ttl, pct=x=>(x*100).toFixed(0)+'%';
// 나이별 단가. 온라인은 신선할 때만 비싸고 금방 죽는다.
const CH=[
 {n:'온라인', cap:8,  settle:0,  p:[1250,1150, 500, 0, 0]},
 {n:'프랜차이즈', cap:7,  settle:14, p:[ 950, 950, 900,700, 0]},
 {n:'도매',   cap:25, settle:3,  p:[ 780, 760, 740,700,650]}
];
function run(seed,policy){
  const W=FF.World(seed,R); const rng=new FF.Rng(seed^0x5f3a);
  let cash=R.cash; const ar=[]; let lots=[];
  for(let t=0;t<D;t++){
    const day=t+1;
    while(ar.length&&ar[0].at<=day)cash+=ar.shift().amt;
    const w=W.next();
    const got=Math.min(w.production,R.cap.intake);
    lots.push({q:got,a:0});
    cash-=got*R.farm+R.fixed;
    // 판로별 오늘 수요
    const dm=CH.map(c=>Math.max(0,Math.min(c.cap,w.demand*(c.cap/40)*(0.7+rng.next()*0.6))));
    // 정책이 lot 를 판로에 배분한다
    const plan=policy(lots,dm);
    plan.forEach(x=>{
      const c=CH[x.ch], price=c.p[Math.min(x.a,TTL-1)];
      const amt=x.q*price;
      if(c.settle===0)cash+=amt; else ar.push({at:day+c.settle,amt});
    });
    // 팔린 만큼 차감
    plan.forEach(x=>{
      for(const l of lots) if(l.a===x.a && l.q>0){ const take=Math.min(l.q,x.q); l.q-=take; break }
    });
    lots=lots.filter(l=>l.q>0.01);
    lots.forEach(l=>l.a++);
    lots=lots.filter(l=>l.a<TTL);
    ar.sort((a,b)=>a.at-b.at);
  }
  ar.forEach(a=>cash+=a.amt);
  lots=[];
  return cash;
}
// 정책들
const byPrice=(lots,dm)=>{           // 가장 비싼 조합부터 채운다
  const cells=[];
  lots.forEach(l=>CH.forEach((c,ci)=>cells.push({ch:ci,a:l.a,q:l.q,p:c.p[Math.min(l.a,TTL-1)]})));
  cells.sort((x,y)=>y.p-x.p);
  const left=dm.slice(), used={}, out=[];
  cells.forEach(x=>{
    const key=x.a; const avail=x.q-(used[key]||0);
    const take=Math.min(avail,left[x.ch]);
    if(take>0.01){out.push({ch:x.ch,a:x.a,q:take});left[x.ch]-=take;used[key]=(used[key]||0)+take}
  });
  return out;
};
const oldFirst=(lots,dm)=>{          // 오래된 것부터 아무 데나
  const sorted=[...lots].sort((a,b)=>b.a-a.a);
  const left=dm.slice(), out=[];
  sorted.forEach(l=>{
    let rem=l.q;
    [2,1,0].forEach(ci=>{            // 도매 먼저
      const take=Math.min(rem,left[ci]);
      if(take>0.01){out.push({ch:ci,a:l.a,q:take});left[ci]-=take;rem-=take}
    });
  });
  return out;
};
const onlineFresh=(lots,dm)=>{       // 신선품은 온라인, 나머지는 도매
  const left=dm.slice(), out=[];
  [...lots].sort((a,b)=>a.a-b.a).forEach(l=>{
    let rem=l.q;
    const order=(l.a<=1)?[0,1,2]:[2,1,0];
    order.forEach(ci=>{
      const take=Math.min(rem,left[ci]);
      if(take>0.01){out.push({ch:ci,a:l.a,q:take});left[ci]-=take;rem-=take}
    });
  });
  return out;
};
const P={'최고가 우선':byPrice,'오래된 것 먼저':oldFirst,'신선품 온라인':onlineFresh};
const V={};
for(const [n,f] of Object.entries(P)) V[n]=seeds.map(sd=>run(sd,f));
const m=a=>Math.round(a.reduce((x,y)=>x+y,0)/a.length);
const names=Object.keys(P), best={};
seeds.forEach((sd,i)=>{
  let bv=-Infinity,bn=null;
  names.forEach(n=>{if(V[n][i]>bv){bv=V[n][i];bn=n}});
  best[bn]=(best[bn]||0)+1;
});
console.log(`시드 ${N} · 판로 x 나이 가격표\n`);
console.log('| 정책 | 평균 | 최선인 판 |');
console.log('|---|---|---|');
names.forEach(n=>console.log(`| ${n} | ${m(V[n]).toLocaleString('ko-KR')} | ${pct((best[n]||0)/N)} |`));
