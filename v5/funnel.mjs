// 집하 증설 1회의 물량 추적. 같은 시드로 두 갈래를 돌려 차분을 본다.
import fs from 'fs';
const DOMAIN=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const FF=new Function('var FF={},FV={};'+DOMAIN.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nreturn FF;')();
const N=+(process.env.N||400);
const BUYDAY=+(process.env.D||4);
const seeds=[];for(let i=1;i<=N;i++)seeds.push(i*13+5);
const pct=x=>(x*100).toFixed(0)+'%';
const EPS=0.05;

function trace(seed,plan){
  const W=FF.World(seed); let s=FF.initialState(W); const rows=[];
  for(let t=0;t<FF.C.days;t++){
    const day=s.day;
    const w=W.next();
    const out=FF.transition(s, plan[day]?FF.Cmd.buy(plan[day]):FF.Cmd.wait(), w);
    rows.push({day, ...out.result, cap:s.cap.intake, room:s.cap.storage});
    if(s.cash<=0)break;
  }
  return {rows, state:s};
}

const R=FF.C;
let n=0;
const cnt={need:0, gotMore:0, stored:0, sold:0, paid:0};
const stop={supply:0, policy:0, store:0, unsold:0, noProfit:0};
const lag={d01:0,d23:0,d4:0,waste:0,left:0};
let lagTot=0;

for(const seed of seeds){
  const A=trace(seed,{});                    // 무구매
  const B=trace(seed,{[BUYDAY]:'intake'});   // 집하 1회
  const days=Math.min(A.rows.length,B.rows.length);
  n++;

  // 1. 추가 한도가 필요했던 상황이 있었나: 무구매에서 집하가 한도에 걸린 날
  const needed = A.rows.slice(BUYDAY).some(r=>r.wIcap>EPS);
  if(needed)cnt.need++;

  // 2~4. 차분
  let dAcc=0,dSold=0,dStore=0,dWasteS=0,dWasteT=0,dNeed=0,dCap=0;
  for(let i=BUYDAY;i<days;i++){
    dAcc  += B.rows[i].acc - A.rows[i].acc;      // 추가 저장량(실제 창고 투입)
    dSold += B.rows[i].sold - A.rows[i].sold;
    dNeed += B.rows[i].wIneed - A.rows[i].wIneed;
    dCap  += B.rows[i].wIcap - A.rows[i].wIcap;
    dWasteS += B.rows[i].wS - A.rows[i].wS;
    dWasteT += B.rows[i].wT - A.rows[i].wT;
  }
  if(dAcc>EPS)cnt.gotMore++;
  if(dAcc>EPS)cnt.stored++;
  if(dSold>EPS)cnt.sold++;

  const valA=FF.finalValue(A.state,true), valB=FF.finalValue(B.state,true);
  if(valB>valA)cnt.paid++;

  // 중단 지점
  if(!needed){
    // 한도가 애초에 안 걸림: 생산 부족인가 정책인가
    const prodShort = A.rows.slice(BUYDAY).every(r=>r.prod < r.cap - EPS);
    if(prodShort)stop.supply++; else stop.policy++;
  } else if(dAcc<=EPS){
    if(dNeed>EPS)stop.policy++; else stop.store++;
  } else if(dSold<=EPS){
    stop.unsold++;
  } else if(valB<=valA){
    stop.noProfit++;
  }

  // 추가 물량이 팔리기까지
  if(dAcc>EPS){
    lagTot++;
    if(dWasteT>EPS)lag.waste++;
    else if(dSold<=EPS)lag.left++;
    else {
      // 추가 판매가 몇 일 안에 일어났는지: 구매 다음날부터 누적
      let acc=0,hit=null;
      for(let i=BUYDAY+1;i<days;i++){
        acc += B.rows[i].sold - A.rows[i].sold;
        if(acc>dSold*0.5){hit=i-(BUYDAY+1);break}
      }
      if(hit===null)lag.d4++;
      else if(hit<=1)lag.d01++;
      else if(hit<=3)lag.d23++;
      else lag.d4++;
    }
  }
}

console.log(`시드 ${N} · ${BUYDAY}일에 집하 한도 늘리기 1회\n`);
console.log('## 단계별 도달');
console.log('| 단계 | 비율 |');
console.log('|---|---|');
console.log(`| 추가 한도가 필요했던 판 | ${pct(cnt.need/n)} |`);
console.log(`| 실제로 더 받은 판 | ${pct(cnt.gotMore/n)} |`);
console.log(`| 추가 재고가 생긴 판 | ${pct(cnt.stored/n)} |`);
console.log(`| 추가 판매가 생긴 판 | ${pct(cnt.sold/n)} |`);
console.log(`| 비용까지 회수한 판 | ${pct(cnt.paid/n)} |`);
console.log('\n## 중단 지점');
console.log('| 지점 | 비율 |');
console.log('|---|---|');
console.log(`| 농가 물량 부족 | ${pct(stop.supply/n)} |`);
console.log(`| 목표재고 정책 | ${pct(stop.policy/n)} |`);
console.log(`| 창고 공간 부족 | ${pct(stop.store/n)} |`);
console.log(`| 받았지만 안 팔림 | ${pct(stop.unsold/n)} |`);
console.log(`| 팔렸지만 비용 미회수 | ${pct(stop.noProfit/n)} |`);
if(lagTot){
  console.log('\n## 추가 물량이 팔리기까지 (추가 집하가 생긴 판 기준)');
  console.log('| 기간 | 비율 |');
  console.log('|---|---|');
  console.log(`| 1일 안 | ${pct(lag.d01/lagTot)} |`);
  console.log(`| 2~3일 | ${pct(lag.d23/lagTot)} |`);
  console.log(`| 4일 이상 | ${pct(lag.d4/lagTot)} |`);
  console.log(`| 상해서 폐기 | ${pct(lag.waste/lagTot)} |`);
  console.log(`| 끝까지 미판매 | ${pct(lag.left/lagTot)} |`);
}

// 물량과 금액 규모: 추가 2t 한도가 실제로 얼마나 흘렀나
{
  let addAcc=0,addSold=0,addRev=0,addCost=0,cnt2=0;
  for(const seed of seeds){
    const A=trace(seed,{}), B=trace(seed,{[BUYDAY]:'intake'});
    const days=Math.min(A.rows.length,B.rows.length);
    let a=0,s2=0;
    for(let i=BUYDAY;i<days;i++){a+=B.rows[i].acc-A.rows[i].acc; s2+=B.rows[i].sold-A.rows[i].sold}
    addAcc+=a; addSold+=s2; cnt2++;
    const days2=days-BUYDAY;
    addCost += R.cost.intake + days2*R.step.intake*R.maint.intake;
    addRev  += s2*R.price - a*R.farm;
  }
  const per=x=>Math.round(x/cnt2);
  console.log('\n## 판당 평균 규모');
  console.log('| 항목 | 값 |');
  console.log('|---|---|');
  console.log(`| 추가 집하 | ${(addAcc/cnt2).toFixed(1)}t |`);
  console.log(`| 추가 판매 | ${(addSold/cnt2).toFixed(1)}t |`);
  console.log(`| 한도 여력 (26일 x 2t) | 52t |`);
  console.log(`| 여력 사용률 | ${pct(addAcc/cnt2/52)} |`);
  console.log(`| 추가 매출 - 매입 | ${per(addRev)} |`);
  console.log(`| 증설비 + 유지비 | ${per(addCost)} |`);
}
