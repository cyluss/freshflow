// 판로 배분에 값이 있는가. 커널 밖 최소 모형으로 먼저 잰다.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||400);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const R=FF.C, D=R.days, pct=x=>(x*100).toFixed(0)+'%';
// 판로 셋. 가격 · 수요 몫 · 변동성 · 하루 소화 상한 · 정산일
const CH=[
 {n:'온라인', price:1100, share:0.30, vol:0.45, cap:8,  settle:0},
 {n:'도매',   price:820,  share:0.55, vol:0.15, cap:25, settle:3},
 {n:'프랜차이즈', price:950, share:0.15, vol:0.05, cap:6, settle:14, must:4}
];
// 하루 판로별 수요
function dayDemand(rng,dem){
  return CH.map(c=>{
    const base=dem*c.share;
    const noise=1+ (rng.next()*2-1)*c.vol;
    return Math.max(0,Math.min(c.cap, base*noise));
  });
}
// 배분 w (합 1) 로 하루 매출과 정산 일정
function sell(stock,dm,w){
  const out=CH.map((c,i)=>Math.min(stock*w[i], dm[i]));
  return out;
}
function run(seed,policy){
  const W=FF.World(seed,R); const rng=new FF.Rng(seed^0x5f3a);
  const s=FF.initialState(W,R);
  let cash=R.cash; const ar=[];
  let rev=0;
  for(let t=0;t<D;t++){
    const day=s.day;
    while(ar.length&&ar[0].at<=day)cash+=ar.shift().amt;
    const w0=W.next();
    // 재고는 기존 물리로 만든다 (판매는 우리가 대신 결정)
    const stock=Math.min(w0.production, R.cap.intake);
    const dm=dayDemand(rng,w0.demand);
    const w=policy(dm,stock,day);
    const sold=sell(stock,dm,w);
    CH.forEach((c,i)=>{
      const amt=sold[i]*c.price;
      rev+=amt;
      if(c.settle===0)cash+=amt; else ar.push({at:day+c.settle,amt});
    });
    cash-=stock*R.farm+R.fixed;
    ar.sort((a,b)=>a.at-b.at);
  }
  ar.forEach(a=>cash+=a.amt);
  return cash;
}
const FIX={
 '전량 온라인':()=>[1,0,0], '전량 도매':()=>[0,1,0], '전량 프랜차이즈':()=>[0,0,1],
 '균등':()=>[1/3,1/3,1/3], '온라인 우선':()=>[0.4,0.5,0.1]
};
const V={};
for(const [n,p] of Object.entries(FIX)) V[n]=seeds.map(sd=>run(sd,p));
// 매일 가격 높은 순으로 채우는 탐욕
const greedy=(dm,stock)=>{
  const idx=[0,1,2].sort((a,b)=>CH[b].price-CH[a].price);
  const w=[0,0,0]; let left=stock;
  idx.forEach(i=>{const take=Math.min(left,dm[i]);w[i]=stock?take/stock:0;left-=take});
  return w;
};
V['매일 최고가 우선']=seeds.map(sd=>run(sd,greedy));
const m=a=>Math.round(a.reduce((x,y)=>x+y,0)/a.length);
const names=Object.keys(V);
const best={};
seeds.forEach((sd,i)=>{
  let bv=-Infinity,bn=null;
  names.forEach(n=>{if(V[n][i]>bv){bv=V[n][i];bn=n}});
  best[bn]=(best[bn]||0)+1;
});
console.log(`시드 ${N} · 판로 셋\n`);
console.log('| 배분 | 평균 순자산 | 최선인 판 |');
console.log('|---|---|---|');
names.forEach(n=>console.log(`| ${n} | ${m(V[n]).toLocaleString('ko-KR')} | ${pct((best[n]||0)/N)} |`));
