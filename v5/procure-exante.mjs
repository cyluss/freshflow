// 이슈 #9(ex-ante identifiability)를 이슈 #5의 조달계약 실험에 적용한다.
// 질문: prepaid/option이 N일 전에 내는 예약(Q)이 결국 잘 맞을지 아닐지를, 그 주문 시점에
// 이미 관측 가능한 신호(FF.blurredPhase의 쏠림 정도)로 미리 어느 정도 구별할 수 있는가?
// 구별할 수 없다면 시드마다 최적 정책이 갈리는 것은 전략이 아니라 추첨에 가깝다(#9 실패).
//
// 신호: confidence = max(FF.blurredPhase(si, N, N, FF.C, ts)). 세 국면 중 하나로 확률이
// 쏠릴수록 1에 가깝다. 이 값은 FF.monthOutlook()의 pct 출력과 같은 분포에서 나오므로
// 플레이어가 화면에서 보는 것과 같은 정보다(이슈 #6/#7과 동일한 소스).
//
// 두 가지를 본다.
//  1) confidence와 |Q-실제부족|(예측오차)의 상관: 신호가 오차를 예측하는가.
//  2) 문턱값 규칙(confidence가 낮으면 그 주문을 포기하고 cash로 대체)이 순수 prepaid보다
//     나은 문턱값이 존재하는가: 신호가 실제로 "더 나은 선택"을 만드는가.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_LEAD = 5, PREPAID_DISCOUNT = 0.05, N_SEEDS = Number(process.argv[2] || 150);

function confidenceAt(leadDays) {
  const M = FF.marketOf();
  const ts = FF.tiltOf().supply;
  const dist = FF.blurredPhase(M.si, leadDays, leadDays, FF.C, ts);
  return { dist, confidence: Math.max(...dist) };
}
function computeExtra(leadDays) {
  const cap = FF.capsOf();
  const M = FF.marketOf();
  const need = FF.intakeNeed(M.di, cap.sales, FF.coverOf(), FF.inventory(), FF.C);
  const prod = leadDays > 0 ? expectedProdAt(leadDays) : FF.prodOf();
  const baseAcc = Math.min(prod, cap.intake, need);
  const shortfall = Math.max(0, need - baseAcc);
  const headroom = Math.max(0, cap.intake - prod);
  return Math.min(shortfall, headroom);
}
function expectedProdAt(leadDays) {
  const M = FF.marketOf();
  const ts = FF.tiltOf().supply;
  const dist = FF.blurredPhase(M.si, leadDays, leadDays, FF.C, ts);
  let mean = 0;
  for (let k = 0; k < 3; k++) mean += dist[k] * FF.C.sm[k];
  return Math.round(mean * 2);
}

// 1) 이벤트 로그 수집: (confidence, error) 쌍. 순수 prepaid를 그대로 재생하면서 매 주문마다 기록한다.
function collectEvents(seed) {
  FF.reset(seed);
  let deliveries = [];
  const events = [];
  for (let day = 1; day <= FF.C.days; day++) {
    if (FF.isOver()) break;
    const prod = FF.prodOf();
    const unitCost = FF.C.farm;
    let boost = 0, refundBase = 0;
    const realNeed = computeExtra(0);

    if (day + N_LEAD <= FF.C.days) {
      const { confidence } = confidenceAt(N_LEAD);
      const Q = computeExtra(N_LEAD);
      if (Q > 0) {
        FF.addCash(-Q * unitCost * (1 - PREPAID_DISCOUNT));
        deliveries.push({ day: day + N_LEAD, qty: Q, confidence });
      }
    }
    const due = deliveries.find(x => x.day === day);
    if (due) {
      refundBase = due.qty;
      boost = Math.max(due.qty, realNeed);
      events.push({ confidence: due.confidence, error: Math.abs(due.qty - realNeed) });
    }
    if (boost > 0) FF.setProd(prod + boost);
    FF.stepDay(FF.Cmd.wait());
    if (refundBase > 0) FF.addCash(refundBase * unitCost);
  }
  return events;
}

let allEvents = [];
for (let seed = 1; seed <= N_SEEDS; seed++) allEvents = allEvents.concat(collectEvents(seed));

function corr(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxy / Math.sqrt(sxx * syy);
}

console.log('이벤트 수=' + allEvents.length + ' (시드 ' + N_SEEDS + '개, base 판로)');
const cs = allEvents.map(e => e.confidence), es = allEvents.map(e => e.error);
console.log('confidence 범위: min=' + Math.min(...cs).toFixed(3) + ' max=' + Math.max(...cs).toFixed(3) + ' 평균=' + (cs.reduce((a, b) => a + b, 0) / cs.length).toFixed(3));
console.log('error 평균=' + (es.reduce((a, b) => a + b, 0) / es.length).toFixed(2));
console.log('상관계수(confidence, error) = ' + corr(cs, es).toFixed(4) + ' (음수면 확신도가 높을수록 오차가 작다는 뜻)');

// confidence를 3분위로 나눠 각 구간의 평균 오차를 직접 비교(선형 상관이 약해도 구간 효과가 있을 수 있다)
const sorted = allEvents.slice().sort((a, b) => a.confidence - b.confidence);
const third = Math.floor(sorted.length / 3);
const low = sorted.slice(0, third), mid = sorted.slice(third, 2 * third), high = sorted.slice(2 * third);
function avgErr(a) { return a.reduce((s, e) => s + e.error, 0) / a.length; }
console.log('confidence 하위 1/3 평균오차=' + avgErr(low).toFixed(2) + ' (범위 ' + low[0].confidence.toFixed(3) + '~' + low[low.length - 1].confidence.toFixed(3) + ')');
console.log('confidence 중위 1/3 평균오차=' + avgErr(mid).toFixed(2) + ' (범위 ' + mid[0].confidence.toFixed(3) + '~' + mid[mid.length - 1].confidence.toFixed(3) + ')');
console.log('confidence 상위 1/3 평균오차=' + avgErr(high).toFixed(2) + ' (범위 ' + high[0].confidence.toFixed(3) + '~' + high[high.length - 1].confidence.toFixed(3) + ')');

// 2) 문턱값 규칙: confidence < threshold인 주문은 포기(그날은 cash로 대체), 아니면 그대로 prepaid.
// 순수 prepaid(threshold=0, 전부 포기 안 함)와 순수 cash에 가까운 것(threshold=1, 전부 포기)의
// 중간에서, 최종 순자산을 최대화하는 threshold가 0과 1 사이에 있는지를 본다.
function runWithThreshold(seed, threshold) {
  FF.reset(seed);
  let deliveries = [];
  for (let day = 1; day <= FF.C.days; day++) {
    if (FF.isOver()) break;
    const prod = FF.prodOf();
    const unitCost = FF.C.farm;
    let boost = 0, refundBase = 0, cashExtra = 0;
    const realNeed = computeExtra(0);

    if (day + N_LEAD <= FF.C.days) {
      const { confidence } = confidenceAt(N_LEAD);
      const Q = computeExtra(N_LEAD);
      if (Q > 0 && confidence >= threshold) {
        FF.addCash(-Q * unitCost * (1 - PREPAID_DISCOUNT));
        deliveries.push({ day: day + N_LEAD, qty: Q });
      } else if (Q > 0) {
        cashExtra = realNeed; // 포기한 주문은 그날 cash 반응형으로 대체(정보를 버리지 않고 활용)
      }
    }
    const due = deliveries.find(x => x.day === day);
    if (due) { refundBase = due.qty; boost = Math.max(due.qty, realNeed); }
    else if (cashExtra > 0) { boost = cashExtra; }

    if (boost > 0) FF.setProd(prod + boost);
    FF.stepDay(FF.Cmd.wait());
    if (refundBase > 0) FF.addCash(refundBase * unitCost);
  }
  return FF.netWorth(FF.toKernelState());
}

console.log('\n=== 문턱값 규칙 vs 순수 prepaid (' + N_SEEDS + '시드 평균 순자산) ===');
for (const th of [0, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 1.01]) {
  let sum = 0;
  for (let seed = 1; seed <= N_SEEDS; seed++) sum += runWithThreshold(seed, th);
  console.log('threshold=' + th.toFixed(2) + ' 평균순자산=' + (sum / N_SEEDS).toFixed(0));
}
