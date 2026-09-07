// V1 프로토타입 탐색: 집하 한도 +2 대신 매입단가 -N원/t
// 커널은 건드리지 않는다. 규칙 주입으로 등가 실험한다.
//   구매 전: farm 380
//   구매 후: farm 380-N  → 규칙을 갈아끼운 두 구간을 이어 붙여 계산한다
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||400);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const clone=o=>JSON.parse(JSON.stringify(o));
const pct=x=>(x*100).toFixed(0)+'%';

// 매입단가 투자를 직접 실행한다. buyDay 이후 farm 을 낮춘다.
function runFarmDeal(seed, buyDay, cut, price, R0){
  const R=R0||FF.C;
  const Rlow=clone(R); Rlow.farm=R.farm-cut;
  const W=FF.World(seed);
  let s=FF.initialState(W,R);
  let spent=0;
  const rows=[];
  for(let t=0;t<R.days;t++){
    const day=s.day;
    const use=(buyDay&&day>buyDay)?Rlow:R;      // 다음 날부터 적용
    if(buyDay&&day===buyDay){ s.cash-=price; spent+=price }
    const out=FF.transition(s,FF.Cmd.wait(),W.next(),use);
    rows.push(out.result);
    if(s.cash<=0)break;
  }
  s.spent=spent;
  return {state:s,rows};
}
const finalOf=r=>FF.finalValue(r.state,true);

console.log(`시드 ${N} · 매입단가 투자 프로토타입 (현행 farm ${FF.C.farm}원/t)\n`);
console.log('| 인하폭 | 가격 | 2일 구매 | 승률 | 6일 구매 | 승률 | 12일 구매 | 승률 |');
console.log('|---|---|---|---|---|---|---|---|');
const base=seeds.map(sd=>finalOf(runFarmDeal(sd,0,0,0)));
for(const cut of [10,20,30]) for(const price of [4000,6000,8000,10000]){
  const cells=[2,6,12].map(d=>{
    let sum=0,w=0;
    seeds.forEach((sd,i)=>{const v=finalOf(runFarmDeal(sd,d,cut,price)); sum+=v-base[i]; if(v>base[i])w++});
    return [Math.round(sum/N), w/N];
  });
  console.log(`| ${cut}원 | ${price} | ${cells[0][0]} | ${pct(cells[0][1])} | ${cells[1][0]} | ${pct(cells[1][1])} | ${cells[2][0]} | ${pct(cells[2][1])} |`);
}

// 판별력 검사: 이 투자의 가치가 판마다 얼마나 다른가
{
  const cut=20, price=8000, buyDay=6;
  const vals=seeds.map((sd,i)=>finalOf(runFarmDeal(sd,buyDay,cut,price))-base[i]);
  const m=vals.reduce((a,b)=>a+b,0)/N;
  const sd2=Math.sqrt(vals.reduce((a,b)=>a+(b-m)*(b-m),0)/N);
  const sorted=[...vals].sort((a,b)=>a-b);
  console.log(`\n## 인하 ${cut}원 · 가격 ${price} · ${buyDay}일 구매`);
  console.log(`평균 ${Math.round(m)} · 표준편차 ${Math.round(sd2)} · 변동계수 ${(sd2/Math.abs(m)).toFixed(2)}`);
  console.log(`하위10% ${Math.round(sorted[Math.floor(N*0.1)])} · 중앙 ${Math.round(sorted[Math.floor(N*0.5)])} · 상위10% ${Math.round(sorted[Math.floor(N*0.9)])}`);

  // 집하 총량의 분산이 곧 이 투자의 분산이다
  const tot=seeds.map(sd=>{
    const r=runFarmDeal(sd,0,0,0);
    return r.rows.reduce((a,x)=>a+x.acc,0);
  });
  const tm=tot.reduce((a,b)=>a+b,0)/N;
  const tsd=Math.sqrt(tot.reduce((a,b)=>a+(b-tm)*(b-tm),0)/N);
  console.log(`30일 총 집하량 평균 ${tm.toFixed(0)}t · 표준편차 ${tsd.toFixed(0)}t · 변동계수 ${(tsd/tm).toFixed(2)}`);

  // 비교: 판매 증설 가치의 분산
  const sv=seeds.map((sd,i)=>{
    const R=FF.C;
    return FF.finalValue(FF.runScenario(sd,{6:'sales'}).state,true)-base[i];
  });
  const sm=sv.reduce((a,b)=>a+b,0)/N;
  const ssd=Math.sqrt(sv.reduce((a,b)=>a+(b-sm)*(b-sm),0)/N);
  console.log(`비교) 판매 증설 6일: 평균 ${Math.round(sm)} · 표준편차 ${Math.round(ssd)}`);
}
