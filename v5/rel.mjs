// 관계 축적: 프랜차이즈 납품을 지키면 조건이 좋아지고 어기면 나빠진다.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||400);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const R=FF.C, D=R.days, TTL=R.ttl, pct=x=>(x*100).toFixed(0)+'%';
// 프랜차이즈: 매일 QUOTA 를 채우면 신뢰가 오르고 단가가 오른다. 어기면 떨어진다.
const QUOTA=+(process.env.Q||5);
const CH=[
 {n:'온라인', cap:8,  settle:0,  p:[1250,1150,500,0,0]},
 {n:'프랜차이즈', cap:9, settle:14, p:[900,900,860,700,0]},
 {n:'도매',   cap:25, settle:3,  p:[780,760,740,700,650]}
];
const TRUST=[0.85,1.0,1.15,1.30];    // 신뢰 단계별 단가 배수
function run(seed,policy){
  const W=FF.World(seed,R); const rng=new FF.Rng(seed^0x5f3a);
  let cash=R.cash; const ar=[]; let lots=[]; let trust=1;   // 0~3
  let miss=0, keep=0;
  for(let t=0;t<D;t++){
    const day=t+1;
    while(ar.length&&ar[0].at<=day)cash+=ar.shift().amt;
    const w=W.next();
    const got=Math.min(w.production,R.cap.intake);
    lots.push({q:got,a:0});
    cash-=got*R.farm+R.fixed;
    const dm=CH.map(c=>Math.max(0,Math.min(c.cap,w.demand*(c.cap/40)*(0.7+rng.next()*0.6))));
    dm[1]=CH[1].cap;                       // 프랜차이즈는 언제나 받는다
    const plan=policy(lots,dm,trust);
    let toFr=0;
    plan.forEach(x=>{
      const c=CH[x.ch];
      const mult=(x.ch===1)?TRUST[trust]:1;
      const amt=x.q*c.p[Math.min(x.a,TTL-1)]*mult;
      if(x.ch===1)toFr+=x.q;
      if(c.settle===0)cash+=amt; else ar.push({at:day+c.settle,amt});
    });
    plan.forEach(x=>{
      for(const l of lots) if(l.a===x.a && l.q>0){const take=Math.min(l.q,x.q);l.q-=take;break}
    });
    // 관계 갱신
    if(toFr>=QUOTA-0.01){trust=Math.min(3,trust+ (day%3===0?1:0)); keep++}
    else {trust=Math.max(0,trust-1); miss++}
    lots=lots.filter(l=>l.q>0.01);
    lots.forEach(l=>l.a++);
    lots=lots.filter(l=>l.a<TTL);
    ar.sort((a,b)=>a.at-b.at);
  }
  ar.forEach(a=>cash+=a.amt);
  return {cash,keep,miss,trust};
}
const fill=(lots,dm,order)=>{
  const left=dm.slice(), out=[];
  [...lots].sort((a,b)=>a.a-b.a).forEach(l=>{
    let rem=l.q;
    order.forEach(ci=>{const take=Math.min(rem,left[ci]);
      if(take>0.01){out.push({ch:ci,a:l.a,q:take});left[ci]-=take;rem-=take}});
  });
  return out;
};
const P={
 '최고가 우선': (lots,dm,tr)=>{
   const cells=[];
   lots.forEach(l=>CH.forEach((c,ci)=>cells.push({ch:ci,a:l.a,q:l.q,
     p:c.p[Math.min(l.a,TTL-1)]*(ci===1?TRUST[tr]:1)})));
   cells.sort((x,y)=>y.p-x.p);
   const left=dm.slice(), used={}, out=[];
   cells.forEach(x=>{const avail=x.q-(used[x.a]||0);
     const take=Math.min(avail,left[x.ch]);
     if(take>0.01){out.push({ch:x.ch,a:x.a,q:take});left[x.ch]-=take;used[x.a]=(used[x.a]||0)+take}});
   return out;
 },
 '프랜차이즈 우선': (lots,dm)=>fill(lots,dm,[1,0,2]),
 '쿼터만 지키고 최고가': (lots,dm,tr)=>{
   const out=[]; const left=dm.slice();
   let need=QUOTA;
   [...lots].sort((a,b)=>b.a-a.a).forEach(l=>{      // 오래된 것으로 쿼터를 채운다
     if(need<=0.01)return;
     const take=Math.min(l.q,need,left[1]);
     if(take>0.01){out.push({ch:1,a:l.a,q:take});left[1]-=take;need-=take;l._used=(l._used||0)+take}
   });
   [...lots].sort((a,b)=>a.a-b.a).forEach(l=>{
     let rem=l.q-(l._used||0); delete l._used;
     [0,2].forEach(ci=>{const take=Math.min(rem,left[ci]);
       if(take>0.01){out.push({ch:ci,a:l.a,q:take});left[ci]-=take;rem-=take}});
   });
   return out;
 },
 '온라인만': (lots,dm)=>fill(lots,dm,[0,2])
};
const V={},K={};
for(const [n,f] of Object.entries(P)){
  const rs=seeds.map(sd=>run(sd,f));
  V[n]=rs.map(r=>r.cash); K[n]=rs;
}
const m=a=>Math.round(a.reduce((x,y)=>x+y,0)/a.length);
const names=Object.keys(P), best={};
seeds.forEach((sd,i)=>{let bv=-Infinity,bn=null;
  names.forEach(n=>{if(V[n][i]>bv){bv=V[n][i];bn=n}});best[bn]=(best[bn]||0)+1});
console.log(`시드 ${N} · 쿼터 ${QUOTA}t · 신뢰 배수 ${TRUST.join('/')}\n`);
console.log('| 정책 | 평균 | 최선인 판 | 쿼터 지킨 날 | 최종 신뢰 |');
console.log('|---|---|---|---|---|');
names.forEach(n=>console.log(`| ${n} | ${m(V[n]).toLocaleString('ko-KR')} | ${pct((best[n]||0)/N)} | ${pct(m(K[n].map(r=>r.keep))/D)} | ${(K[n].reduce((a,r)=>a+r.trust,0)/N).toFixed(1)} |`));
