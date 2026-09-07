// 세 판로 모두 관계를 갖고 서로 경쟁한다. GTA2 세력 호감도 구조.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||400);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const R=FF.C, D=R.days, TTL=R.ttl, pct=x=>(x*100).toFixed(0)+'%';
// 세 판로. 관계가 오르면 단가와 주문량이 함께 오른다.
const CH=[
 {n:'온라인',   base:[1150,1050,450,0,0], cap0:6,  settle:0,  quota:4},
 {n:'프랜차이즈',base:[ 900, 900,850,650,0], cap0:6, settle:14, quota:5},
 {n:'도매',     base:[ 760, 745,730,690,640], cap0:14, settle:3, quota:6}
];
const TOP=+(process.env.MULT||1.25);          // 관계 최대 단가 배수
const SPREAD=+(process.env.SPREAD||1);        // 판로 간 기본 가격차 배율
const MULT=[1-(TOP-1)*0.6,1.00,1+(TOP-1)*0.5,TOP];
const CAPM=[0.6,1.0,1.4,1.8];
// 관계가 오르면 정산이 빨라진다. 프랜차이즈가 가장 크게 줄어든다.
const SETTLEM=(process.env.SETTLEM||'1,0.7,0.4,0.15').split(',').map(Number);
function settleOf(ci,r){ return Math.round(CH[ci].settle*SETTLEM[r]); }
// 기본 가격차를 좁힌다. 세 판로 평균으로 수렴시킨다.
(function(){
  const avg=CH.reduce((a,c)=>a+c.base[0],0)/CH.length;
  CH.forEach(c=>{ c.base=c.base.map((p,i)=>{
    if(p===0)return 0;
    const ref=avg*(c.base[i]/c.base[0]);
    return Math.round(ref+(p-ref)*SPREAD);
  })});
})();
function run(seed,policy){
  const W=FF.World(seed,R); const rng=new FF.Rng(seed^0x5f3a);
  let cash=R.cash; const ar=[]; let lots=[];
  let rel=[1,1,1];
  const kept=[0,0,0];
  for(let t=0;t<D;t++){
    const day=t+1;
    while(ar.length&&ar[0].at<=day)cash+=ar.shift().amt;
    const w=W.next();
    const got=Math.min(w.production,R.cap.intake);
    lots.push({q:got,a:0});
    cash-=got*R.farm+R.fixed;
    const FLOOR=(process.env.FLOOR||'0,0,0,0').split(',').map(Number);
    const dm=CH.map((c,i)=>{
      const cap=c.cap0*CAPM[rel[i]];
      const noise=(i===2)?(0.8+rng.next()*0.4):(0.6+rng.next()*0.8);
      const raw=Math.max(0,Math.min(cap, w.demand*(cap/26)*noise));
      // 관계가 오르면 최소 주문을 보장한다. 프랜차이즈만 해당한다.
      return (i===1)?Math.max(raw, c.quota*FLOOR[rel[i]]) : raw;
    });
    const price=(ci,a)=>CH[ci].base[Math.min(a,TTL-1)]*MULT[rel[ci]];
    const plan=policy(lots,dm,rel,price);
    const to=[0,0,0];
    plan.forEach(x=>{
      to[x.ch]+=x.q;
      const amt=x.q*price(x.ch,x.a);
      const lag=settleOf(x.ch,rel[x.ch]);
      if(lag===0)cash+=amt; else ar.push({at:day+lag,amt});
    });
    plan.forEach(x=>{for(const l of lots) if(l.a===x.a&&l.q>0){const k=Math.min(l.q,x.q);l.q-=k;break}});
    // 관계 갱신: 쿼터를 채우면 오르고 못 채우면 내린다
    CH.forEach((c,i)=>{
      if(to[i]>=c.quota-0.01){kept[i]++; if(day%4===0)rel[i]=Math.min(3,rel[i]+1)}
      else if(to[i]<c.quota*0.5) rel[i]=Math.max(0,rel[i]-1);
    });
    lots=lots.filter(l=>l.q>0.01);
    lots.forEach(l=>l.a++);
    lots=lots.filter(l=>l.a<TTL);
    ar.sort((a,b)=>a.at-b.at);
  }
  ar.forEach(a=>cash+=a.amt);
  return {cash,rel:rel.slice(),kept};
}
const greedy=(lots,dm,rel,price)=>{
  const cells=[];
  lots.forEach(l=>[0,1,2].forEach(ci=>cells.push({ch:ci,a:l.a,q:l.q,p:price(ci,l.a)})));
  cells.sort((x,y)=>y.p-x.p);
  const left=dm.slice(), used={}, out=[];
  cells.forEach(x=>{const avail=x.q-(used[x.a]||0);const take=Math.min(avail,left[x.ch]);
    if(take>0.01){out.push({ch:x.ch,a:x.a,q:take});left[x.ch]-=take;used[x.a]=(used[x.a]||0)+take}});
  return out;
};
const focus=ci=>(lots,dm,rel,price)=>{
  const order=[ci].concat([0,1,2].filter(i=>i!==ci).sort((a,b)=>price(b,0)-price(a,0)));
  const left=dm.slice(), out=[];
  [...lots].sort((a,b)=>a.a-b.a).forEach(l=>{let rem=l.q;
    order.forEach(c2=>{const take=Math.min(rem,left[c2]);
      if(take>0.01){out.push({ch:c2,a:l.a,q:take});left[c2]-=take;rem-=take}})});
  return out;
};
const quotaFirst=(lots,dm,rel,price)=>{   // 세 쿼터를 먼저 채우고 남으면 최고가
  const left=dm.slice(), out=[]; const need=CH.map(c=>c.quota);
  const pool=[...lots].sort((a,b)=>b.a-a.a);
  [2,1,0].forEach(ci=>{                    // 싼 곳은 오래된 것으로
    pool.forEach(l=>{
      const rem=l.q-(l._u||0); if(rem<=0.01||need[ci]<=0.01)return;
      const take=Math.min(rem,need[ci],left[ci]);
      if(take>0.01){out.push({ch:ci,a:l.a,q:take});left[ci]-=take;need[ci]-=take;l._u=(l._u||0)+take}
    });
  });
  [...lots].sort((a,b)=>a.a-b.a).forEach(l=>{
    let rem=l.q-(l._u||0); delete l._u;
    [0,1,2].sort((a,b)=>price(b,l.a)-price(a,l.a)).forEach(ci=>{
      const take=Math.min(rem,left[ci]);
      if(take>0.01){out.push({ch:ci,a:l.a,q:take});left[ci]-=take;rem-=take}});
  });
  return out;
};
const P={'최고가 우선':greedy,'온라인 집중':focus(0),'프랜차이즈 집중':focus(1),
         '도매 집중':focus(2),'세 관계 유지':quotaFirst};
const V={},K={};
for(const [n,f] of Object.entries(P)){const rs=seeds.map(sd=>run(sd,f));V[n]=rs.map(r=>r.cash);K[n]=rs}
const m=a=>Math.round(a.reduce((x,y)=>x+y,0)/a.length);
const names=Object.keys(P), best={};
seeds.forEach((sd,i)=>{let bv=-Infinity,bn=null;
  names.forEach(n=>{if(V[n][i]>bv){bv=V[n][i];bn=n}});best[bn]=(best[bn]||0)+1});
console.log(`시드 ${N} · 배수 ${TOP} · 가격차 ${SPREAD}`);
console.log('  ' + names.map(n=>`${n} ${pct((best[n]||0)/N)}`).join(' · '));
