// 이슈 #5 2단계: 조달 4개(cash/credit/prepaid/option) x 판로 태도 3개(기본/프랜차이즈 우선/
// 도매 우선) 4x3 교차 검증. 커널 파일은 건드리지 않는다. FF.reset/FF.stepDay/FF.transition을
// 그대로 쓰고, 매일 stepDay 전에 FF.setProd로 확정 생산량을 개입시키는 방식과 stepDay 뒤에
// FF.addCash로 결제 시점만 되돌리는 방식으로만 오버레이한다.
//
// FALLBACK=false(순수 정책, 1차 결과): prepaid/option이 예측을 낮게 잡아 실제 부족이 예약량
// (Q)을 넘어도 그날 cash로 보충하지 않는다. 이 결과 cash가 판로 태도와 무관하게 압도했고,
// discount를 5%->50%까지 올려도 격차가 거의 줄지 않아 순수 정책 자체의 실패로 판정했다.
//
// FALLBACK=true(2차, 기본값): 순수 전략을 구제하는 밸런싱이 아니라 예측의 정보가치를
// 분리해서 재는 실험이다. prepaid는 과소예측 위험만 없앤다(부족분을 그날 cash로 보충하되
// 과다예약분은 그대로 보관비를 문다). option은 과소예측 위험도 없애고 과다예측 위험도
// 옵션료로만 가격화한다(행사는 실제 필요분까지만 하므로 물리적 과잉재고가 안 생긴다).
// cash/credit은 애초에 예약 상한이 없어 이 구분과 무관하다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

// 튜닝 대상 상수. node procure-sim2.mjs [nLead] [creditFee] [creditLag] [prepaidDiscount] [optionPremium] [optionDiscount] [seeds]
const N_LEAD = process.argv[2] !== undefined ? Number(process.argv[2]) : 5;
const CREDIT_FEE = process.argv[3] !== undefined ? Number(process.argv[3]) : 0.03;
const CREDIT_LAG = process.argv[4] !== undefined ? Number(process.argv[4]) : 7;
const PREPAID_DISCOUNT = process.argv[5] !== undefined ? Number(process.argv[5]) : 0.05;
const OPTION_PREMIUM_RATE = process.argv[6] !== undefined ? Number(process.argv[6]) : 0.02;
const OPTION_EXERCISE_DISCOUNT = process.argv[7] !== undefined ? Number(process.argv[7]) : 0.02;
const N_SEEDS = process.argv[8] !== undefined ? Number(process.argv[8]) : 300;
const FALLBACK = process.argv[9] !== undefined ? process.argv[9] !== 'false' : true;

console.log('파라미터: nLead=' + N_LEAD, 'creditFee=' + CREDIT_FEE, 'creditLag=' + CREDIT_LAG,
  'prepaidDiscount=' + PREPAID_DISCOUNT, 'optionPremium=' + OPTION_PREMIUM_RATE,
  'optionDiscount=' + OPTION_EXERCISE_DISCOUNT, 'seeds=' + N_SEEDS, 'fallback=' + FALLBACK);

const STANCES = {
  base: null,          // 기본: 태도 명령 없음(단가 순 배분)
  franchise: [1, 2, 1], // 프랜차이즈 우선
  wholesale: [1, 1, 2], // 도매 우선
};
const STANCE_KEYS = Object.keys(STANCES);
const POLICIES = ['cash', 'credit', 'prepaid', 'option'];

// 공급 국면(si)은 하루 단위로 안 고정되어 있다. FF.mvSeq가 성향(tilt)이 정한 전이행렬을
// 따라 매일 마르코프 전이한다(성향 자체는 판 내내 고정). 그래서 leadDays일 뒤 기대 생산은
// 오늘 국면의 평균이 아니라, 오늘 국면에서 leadDays번 전이한 뒤의 국면 분포로 가중평균해야
// 한다. 커널이 수요 전망(FF.expD)에 쓰는 것과 같은 FF.hor/FF.M을 그대로 재사용한다.
function expectedProdAt(leadDays) {
  const M = FF.marketOf();
  const ts = FF.tiltOf().supply;
  const dist = FF.hor(M.si, leadDays, leadDays, FF.C, ts);
  let mean = 0;
  for (let k = 0; k < 3; k++) mean += dist[k] * FF.C.sm[k];
  return Math.round(mean * 2);
}

// 오늘 부족분 계산. leadDays=0이면 오늘 실제 생산(prod)을 쓰고(cash/credit의 반응형 판단),
// leadDays>0이면 그만큼 뒤의 마르코프 전이 기대 생산을 써서 오늘 노이즈와 무관한 기대
// 부족을 낸다(prepaid/option이 leadDays일 전에 쓰는 미래 전망).
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

function runPolicy(seed, policyKey, stanceKey) {
  FF.reset(seed);
  const stanceArr = STANCES[stanceKey];
  let ap = [];          // credit: {due,amt} 외상매입금(외부 오버레이)
  let deliveries = [];  // prepaid: {day,qty} N일 뒤 무조건 도착
  let options = [];     // option: {day,qty} N일 뒤 행사 가능 상한

  let apBeforeArCount = 0;   // credit: AP 만기 때 AR이 아직 안 들어온 횟수
  let forecastOver = 0, forecastUnder = 0, forecastEvents = 0; // prepaid/option: 예측-실제 괴리
  let emergencyDays = 0;     // 실제 부족(반응형 기준)이 있었던 날수(정책 무관, 세계 자체의 성질)
  let exercisedTotal = 0, reservedTotal = 0; // option: 예약 대비 실제 행사 비율

  for (let day = 1; day <= FF.C.days; day++) {
    if (FF.isOver()) break;
    const prod = FF.prodOf();
    const unitCost = FF.C.farm;
    let boost = 0;
    let prepaidRefundBase = 0, optionRefundBase = 0; // 이미 선불/행사대금으로 낸 부분만 자연청구를 취소한다

    const realNeed = computeExtra(0);
    if (realNeed > 0) emergencyDays++;

    if (policyKey === 'cash') {
      if (realNeed > 0) boost = realNeed; // 커널의 자연 charge(전액 unitCost)를 그대로 둔다
    } else if (policyKey === 'credit') {
      if (realNeed > 0) {
        boost = realNeed;
        FF.addCash(realNeed * unitCost); // 오늘 자동 charge를 먼저 상쇄해 오늘의 현금 압박을 없앤다
        ap.push({ due: day + CREDIT_LAG, amt: Math.round(realNeed * unitCost * (1 + CREDIT_FEE)) });
      }
    } else if (policyKey === 'prepaid') {
      if (day + N_LEAD <= FF.C.days) { // 판이 끝나기 전에 도착 못 할 주문은 애초에 넣지 않는다
        const Q = computeExtra(N_LEAD);
        if (Q > 0) {
          FF.addCash(-Q * unitCost * (1 - PREPAID_DISCOUNT));
          deliveries.push({ day: day + N_LEAD, qty: Q });
        }
      }
      const due = deliveries.find(x => x.day === day);
      if (due) {
        forecastEvents++;
        const gap = due.qty - realNeed;
        if (gap > 0) forecastOver += gap; else forecastUnder += -gap;
        // 순수 정책: 예약한 Q만 온다(과소예약이면 그날 부족이 그대로 남는다).
        // 폴백: 실제 부족이 Q를 넘으면 초과분만 그날 cash로 보충한다. 과다예약(Q>실제부족)
        // 비용은 그대로 남긴다 - 이게 prepaid가 계속 지는 "과대예측 위험"이다.
        prepaidRefundBase = due.qty;
        boost = FALLBACK ? Math.max(due.qty, realNeed) : due.qty;
      }
    } else if (policyKey === 'option') {
      if (day + N_LEAD <= FF.C.days) {
        const Q = computeExtra(N_LEAD);
        if (Q > 0) {
          FF.addCash(-Q * unitCost * OPTION_PREMIUM_RATE); // 옵션료는 행사 여부와 무관하게 지금 낸다
          options.push({ day: day + N_LEAD, qty: Q });
        }
      }
      const opt = options.find(x => x.day === day);
      if (opt) {
        const exercised = Math.min(realNeed, opt.qty);
        reservedTotal += opt.qty; exercisedTotal += exercised;
        forecastEvents++;
        const gap = opt.qty - realNeed;
        if (gap > 0) forecastOver += gap; else forecastUnder += -gap;
        if (exercised > 0) FF.addCash(-exercised * unitCost * (1 - OPTION_EXERCISE_DISCOUNT)); // 행사대금(할인가) 지금 지급
        optionRefundBase = exercised;
        // 순수 정책: Q를 넘는 실제 부족은 그냥 미달로 남긴다.
        // 폴백: Q를 넘는 초과분만 그날 cash로 보충한다. 옵션료는 이미 냈으니 그 손실만 남는다.
        boost = FALLBACK ? Math.max(exercised, realNeed) : exercised;
      }
    }

    if (boost > 0) FF.setProd(prod + boost);

    // 만기 도달한 외상매입금을 오늘 갚는다. AR이 아직 안 들어왔으면 유동성 위험이 실현된 것으로 센다.
    ap = ap.filter(x => {
      if (x.due <= day) {
        const arOutstanding = (FF.arOf() || []).some(a => a.at > day);
        if (arOutstanding) apBeforeArCount++;
        FF.addCash(-x.amt);
        return false;
      }
      return true;
    });

    if (day === 1 && stanceArr) FF.stepDay(FF.Cmd.stance(stanceArr));
    else FF.stepDay(FF.Cmd.wait());

    // 사후 정산: 커널은 boost분을 오늘 자동으로 unitCost 전액 청구했다(stored*farm).
    // cash는 그 청구가 곧 의도한 가격이라 그대로 둔다. credit은 이미 선지급으로 상쇄했다.
    // prepaid/option은 예약분(refundBase)만 이미 선불/행사대금으로 냈으므로 그만큼만 오늘
    // 자동 청구를 취소한다. 폴백으로 추가된 초과분은 cash와 똑같이 오늘 자연 청구가 곧
    // 의도한 가격이라 그대로 둔다.
    if (prepaidRefundBase > 0) FF.addCash(prepaidRefundBase * unitCost);
    if (optionRefundBase > 0) FF.addCash(optionRefundBase * unitCost);
  }

  const outstandingAP = ap.reduce((s, x) => s + x.amt, 0);
  const s = FF.toKernelState();
  return {
    netWorth: FF.netWorth(s) - outstandingAP,
    cash: FF.ledger().cash,
    inventory: FF.inventory(),
    relAvg: FF.relOf().reduce((a, b) => a + b, 0) / FF.relOf().length,
    outstandingAP,
    apBeforeArCount,
    forecastOver, forecastUnder, forecastEvents,
    exercisedTotal, reservedTotal,
    emergencyDays,
    bust: FF.isBust(),
  };
}

const seeds = Array.from({ length: N_SEEDS }, (_, i) => i + 1);
function avg(a) { return a.reduce((x, y) => x + y, 0) / a.length; }

// rows[stance][policy] = array of results (시드 순서 고정)
const rows = {};
for (const st of STANCE_KEYS) { rows[st] = {}; for (const p of POLICIES) rows[st][p] = []; }
for (const seed of seeds) {
  for (const st of STANCE_KEYS) {
    for (const p of POLICIES) rows[st][p].push(runPolicy(seed, p, st));
  }
}

console.log('\n=== 4x3 요약: 셀별 순자산 평균 / 그 안에서의 승률 ===');
console.log('(행: 조달 방식, 열: 판로 태도. 승률은 같은 태도 안에서 4개 조달 방식끼리 비교)');
const cellWinner = {}; // stance -> policy -> wins
for (const st of STANCE_KEYS) cellWinner[st] = Object.fromEntries(POLICIES.map(p => [p, 0]));
for (let i = 0; i < seeds.length; i++) {
  for (const st of STANCE_KEYS) {
    let best = null, bestNw = -Infinity;
    for (const p of POLICIES) {
      const nw = rows[st][p][i].netWorth;
      if (nw > bestNw) { bestNw = nw; best = p; }
    }
    cellWinner[st][best]++;
  }
}
for (const p of POLICIES) {
  const line = [p.padEnd(8)];
  for (const st of STANCE_KEYS) {
    const nw = avg(rows[st][p].map(r => r.netWorth));
    const win = cellWinner[st][p];
    line.push(st.padEnd(11) + '순자산=' + nw.toFixed(0).padStart(7) + ' 승률=' + (100 * win / N_SEEDS).toFixed(1).padStart(5) + '%');
  }
  console.log(line.join('  |  '));
}

console.log('\n=== 태도별 최다승 조달 방식(상호작용 확인) ===');
for (const st of STANCE_KEYS) {
  const best = POLICIES.reduce((a, b) => cellWinner[st][a] >= cellWinner[st][b] ? a : b);
  console.log(st.padEnd(11), '최다승=' + best, JSON.stringify(cellWinner[st]));
}

console.log('\n=== 인과 지표 ===');
for (const st of STANCE_KEYS) {
  const cr = rows[st].credit;
  const apRate = 100 * cr.filter(r => r.apBeforeArCount > 0).length / N_SEEDS;
  console.log(st.padEnd(11), 'credit: AP가 AR보다 먼저 만기된 시드 비율=' + apRate.toFixed(1) + '%',
    '평균 apBeforeArCount=' + avg(cr.map(r => r.apBeforeArCount)).toFixed(2));
}
for (const st of STANCE_KEYS) {
  const pr = rows[st].prepaid, op = rows[st].option;
  console.log(st.padEnd(11),
    'prepaid 평균 과다예약=' + avg(pr.map(r => r.forecastOver)).toFixed(1),
    '평균 과소예약=' + avg(pr.map(r => r.forecastUnder)).toFixed(1),
    '| option 예약대비행사율=' + (100 * avg(op.map(r => r.exercisedTotal)) / Math.max(1, avg(op.map(r => r.reservedTotal)))).toFixed(1) + '%');
}
console.log('세계 자체의 긴급부족 발생일수(정책 무관, base 기준) 평균=' + avg(rows.base.cash.map(r => r.emergencyDays)).toFixed(2));

console.log('\n=== bust 발생 ===');
for (const st of STANCE_KEYS) {
  for (const p of POLICIES) {
    const b = rows[st][p].filter(r => r.bust).length;
    if (b > 0) console.log(st, p, 'bust=' + b);
  }
}
