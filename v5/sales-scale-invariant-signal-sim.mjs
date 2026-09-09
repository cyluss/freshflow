// 이슈 #21: Sales exposure contract 최종 판정. 노출률을 5~10%에 맞추는 threshold 튜닝은
// 하지 않는다 - 그건 예외 UI를 만들기 위한 튜닝이지 decision value 검증이 아니다. 대신
// 세 관문만 본다: (1) scale invariance - 사업 규모가 커져도 비슷한 심각도에서 발동하는가,
// (2) decision value - 신호 ON 집단에서 Sales 투자 한계가치가 실제로 높은가, (3) specificity -
// 신호 OFF 집단에서는 Sales 투자 가치가 충분히 낮은가. 2/3이 핵심이다 - 이전 실험
// (sales-growth-marginal-value-sim.mjs)에서 ship_cap 진단군조차 intake 대비 sales 투자가
// 우위를 못 보였다. 새 신호가 이걸 못 가르면 노출률이 예뻐도 실패다.
//
// 후보 신호 셋 다 절대 비율(스케일 불변)로 정의한다 - 절대 카운트(missed>=2) 대신 비율을 쓰면
// 사업이 커져도 같은 심각도가 같은 값으로 나온다는 게 이 실험의 첫 가설이다.
//   A. missedRatio   = 최근14일 누적missed / 최근14일 누적demand
//   B. shortfallRatio = 최근14일 누적shipShortfall / 최근14일 누적capS
//   C. combined      = 최근14일 평균(sold/capS)>=0.95 AND shortfallRatio>0(포화+손실 동시)
//
// 배경 정책은 이미 검증된 Intake 롤링재투자(physical)로 고정한다 - Sales 투자 여부만
// day100(중간규모)과 day250(성장 후 큰 규모) 두 시점에서 갈라 한계가치를 잰다. 같은
// 절대 threshold가 두 시점 모두에서 비슷한 ON비율/판별력을 보이면 scale invariance다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 1000);
const HORIZON = 365;
FF.C.days = HORIZON;
const ORIGINAL_COST = Object.assign({}, FF.C.cost);
const ORIGINAL_STEP = Object.assign({}, FF.C.step);
FF.C.cost = Object.assign({}, ORIGINAL_COST, { intake: 490 });
FF.C.step = Object.assign({}, ORIGINAL_STEP, { intake: 2 });

const EPS = 1;
const DIAG_WINDOW = 9; // intake 자체 진단창(기존과 동일)
const COOLDOWN = 60;
const SIG_WINDOW = 14; // 후보 신호의 관측창
const EVAL_DAYS = [100, 250]; // 초중반/후반 두 시점 - scale invariance 비교
const HOLD = 90; // 평가 후 한계가치를 잴 지평

// 절대 비율 threshold(고정 - 노출률에 맞춰 튜닝하지 않는다)
const TH_MISSED_RATIO = 0.15;
const TH_SHORTFALL_RATIO = 0.10;
const TH_SATURATION = 0.95;

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function dailyNetWorth() { return FF.ledger().cash + FF.sumAmt(FF.arOf()) - FF.sumAmt(FF.apOf()); }
function prepEngine() { FF.ENGINE.value.phase.storage = FF.ENGINE.value.phase.storage || { dir: 0, n: 0 }; }
function shipShortfall(d) { return (d.sold >= d.capS - FF.C.ui.eps && d.dem > d.sold + FF.C.ui.eps) ? (d.dem - d.sold) : 0; }

function diagnoseAt(day, hist) {
  let sumCap = 0, sumStore = 0, sumCash = 0, sumShip = 0;
  const from = Math.max(1, day - DIAG_WINDOW);
  for (let i = 0; i < hist.length; i++) {
    const d = hist[i];
    if (d.day < from || d.day >= day) continue;
    sumCap += d.wIcap; sumStore += d.wIstore; sumCash += d.wS; sumShip += shipShortfall(d);
  }
  const maxV = Math.max(sumCap, sumStore, sumCash, sumShip);
  if (maxV <= EPS) return 'none';
  if (sumCap === maxV) return 'intake_cap';
  return 'other';
}

// physical(Intake 롤링재투자) 정책을 evalDay+HOLD까지 실행하되, evalDay에 Sales 투자를
// 추가할지(branch) 여부로 갈라 같은 seed 쌍차를 잰다. 동시에 evalDay 시점의 세 신호값도 뽑는다.
function runToHorizon(seed, evalDay, buySalesAtEval) {
  FF.reset(seed);
  prepEngine();
  const hist = [];
  let lastIntakeBuy = -Infinity;
  const toDay = evalDay + HOLD;
  for (let day = FF.run().day; day <= Math.min(HORIZON, toDay); day++) {
    if (FF.isOver()) break;
    let cmd = FF.Cmd.wait();
    if (day >= 10) {
      const diag = diagnoseAt(day, hist);
      if (diag === 'intake_cap' && day - lastIntakeBuy >= COOLDOWN) { cmd = FF.Cmd.buy('intake'); lastIntakeBuy = day; }
    }
    if (day === evalDay && buySalesAtEval) cmd = FF.Cmd.buy('sales');
    FF.stepDay(cmd);
    hist.push(FF.today());
  }
  return { hist, bust: FF.isBust(), nw: dailyNetWorth() };
}

function signalsAt(hist, evalDay) {
  const from = Math.max(1, evalDay - SIG_WINDOW);
  let missed = 0, demand = 0, shortfall = 0, capSsum = 0, satDays = 0, n = 0;
  for (const d of hist) {
    if (d.day < from || d.day >= evalDay) continue;
    missed += d.missed; demand += d.dem; shortfall += shipShortfall(d); capSsum += d.capS;
    if (d.capS > 0 && d.sold / d.capS >= TH_SATURATION) satDays++;
    n++;
  }
  const missedRatio = demand > 0 ? missed / demand : 0;
  const shortfallRatio = capSsum > 0 ? shortfall / capSsum : 0;
  const satFrac = n > 0 ? satDays / n : 0;
  return {
    missedOn: missedRatio > TH_MISSED_RATIO,
    shortfallOn: shortfallRatio > TH_SHORTFALL_RATIO,
    combinedOn: satFrac >= 0.8 && shortfallRatio > 0, // 관측창의 80% 이상 포화 + 손실 동시
  };
}

for (const evalDay of EVAL_DAYS) {
  console.log(`\n========== 평가시점 day${evalDay} (평가지평 +${HOLD}일 = day${evalDay + HOLD}) ==========`);
  const rows = [];
  for (let seed = 1; seed <= N_SEEDS; seed++) {
    const ctrl = runToHorizon(seed, evalDay, false);
    const withSales = runToHorizon(seed, evalDay, true);
    if (ctrl.bust || withSales.bust) continue;
    const sig = signalsAt(ctrl.hist, evalDay);
    const mv = withSales.nw - ctrl.nw;
    rows.push({ seed, sig, mv });
  }
  console.log(`완주 n=${rows.length}/${N_SEEDS}`);

  for (const key of ['missedOn', 'shortfallOn', 'combinedOn']) {
    const on = rows.filter(r => r.sig[key]);
    const off = rows.filter(r => !r.sig[key]);
    const onRate = 100 * on.length / rows.length;
    console.log(`\n[신호=${key}] ON비율=${onRate.toFixed(1)}% (n_on=${on.length}, n_off=${off.length})`);
    if (on.length) console.log(`  ON  집단: Sales 한계가치 평균=${avg(on.map(r => r.mv)).toFixed(0)}  양수비율=${(100 * on.filter(r => r.mv > 0).length / on.length).toFixed(1)}%`);
    if (off.length) console.log(`  OFF 집단: Sales 한계가치 평균=${avg(off.map(r => r.mv)).toFixed(0)}  양수비율=${(100 * off.filter(r => r.mv > 0).length / off.length).toFixed(1)}%`);
  }
}

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP; FF.C.days = 30;
