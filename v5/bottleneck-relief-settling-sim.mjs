// 이슈 #18: settling time 재실험. 이번엔 실제 병목을 확인한 뒤 그 병목을 해소하는
// 확장만 테스트하고, 지표별로 따로 settling time을 잰다(쌍차 방법론 그대로 적용).
//
// 먼저 native(스케일 없음) 설정에서 병목 분포를 실측했다(1000시드): stock 34.6%,
// demand 28.4%, intake 17.0%, supply 9.3%, ship 6.2%, policy 4.1%. 게임에서 실제로 살 수
// 있는 capacity는 sales뿐이다(FF.C.step/cost에 sales만 있다 - "증설은 판매 한도만 산다").
// sales capacity가 직접 해소하는 병목은 "ship"(판매capacity가 꽉 찼는데 수요가 더 있음)
// 하나뿐이라 이번엔 day1~9에 ship 병목을 실제로 겪은 seed만 골라(사전관측 가능한 신호,
// #9와 합치) 그 부분집합에서만 day10에 capacity를 사서 반응한 경우를 대조군과 비교한다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 1000);
const TTL = FF.C.ttl;
const EXPAND_DAY = 10;
const N_BUYS = 2; // cap.sales 42->46, 관측된 핀치 규모(평균 1.84일/9일)에 맞춘 절제된 확장
const WINDOW = 5;
const BAND = 0.15;

function runSeed(seed, doExpand) {
  FF.reset(seed);
  const cashByDay = [], relByDay = [];
  for (let day = FF.run().day; day <= FF.C.days; day++) {
    if (FF.isOver()) break;
    if (doExpand && day >= EXPAND_DAY && day < EXPAND_DAY + N_BUYS) {
      FF.stepDay(FF.Cmd.buy('sales')); // 하루 한 번(다른 명령과 같은 슬롯)만 살 수 있다 - 매입은 다음날에 반영된다
    } else {
      FF.stepDay(FF.Cmd.wait());
    }
    cashByDay.push(FF.ledger().cash);
    const rel = FF.relOf(); relByDay.push(rel.reduce((a, b) => a + b, 0) / rel.length);
  }
  return { hist: FF.histOf(), cashByDay, relByDay, netWorth: FF.netWorth(FF.toKernelState()), bust: FF.isBust() };
}

function rollingWeightedAge(hist, endIdx, window) {
  const from = Math.max(0, endIdx - window + 1);
  let sw = 0, su = 0;
  for (let i = from; i <= endIdx; i++) {
    const day = hist[i];
    (day.ageMix || []).forEach(({ a, q }) => { sw += a * q; su += q; });
    sw += TTL * day.wT; su += day.wT;
  }
  return su > 0 ? sw / su : null;
}
function rollingSum(arr, endIdx, window) {
  const from = Math.max(0, endIdx - window + 1);
  let s = 0; for (let i = from; i <= endIdx; i++) s += arr[i];
  return s;
}
function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function pctile(a, p) { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; }

// 1) 병목 사전관측: 대조군(확장 없음) day1~9에 ship 병목을 겪었는가로 대상 seed를 고른다.
//    확장 여부는 커널 RNG 소비 순서에 영향을 안 주므로(명령은 배분·정책만 바꾼다) 대조군의
//    day1~9 이력은 처치군과 동일하다 - 대조군만 스캔해도 된다.
const eligibleSeeds = [];
for (let seed = 1; seed <= N_SEEDS; seed++) {
  FF.reset(seed);
  let sawShip = false;
  for (let day = 1; day <= 9; day++) {
    if (FF.isOver()) break;
    FF.stepDay(FF.Cmd.wait());
    if (FF.today().b === 'ship') sawShip = true;
  }
  if (sawShip) eligibleSeeds.push(seed);
}
console.log(`day1~9 ship 병목을 겪은 seed: ${eligibleSeeds.length}/${N_SEEDS} (${(100 * eligibleSeeds.length / N_SEEDS).toFixed(1)}%)`);

// 2) 그 부분집합에서만 대조군 vs 처치군(day10에 sales capacity 2회 매입) 쌍차를 낸다.
const METRICS = ['dio', 'missed5', 'cash', 'rel', 'sold5'];
const diffByDay = Object.fromEntries(METRICS.map(m => [m, []]));
const netWorthDiff = [];

for (const seed of eligibleSeeds) {
  const ctrl = runSeed(seed, false);
  const exp = runSeed(seed, true);
  if (ctrl.hist.length < FF.C.days || exp.hist.length < FF.C.days) continue; // bust로 조기종료하면 후반 비교 불가
  netWorthDiff.push(exp.netWorth - ctrl.netWorth);

  const seriesFor = (run, metric) => run.hist.map((_, i) => {
    if (metric === 'dio') return rollingWeightedAge(run.hist, i, WINDOW);
    if (metric === 'missed5') return rollingSum(run.hist.map(d => d.missed), i, WINDOW);
    if (metric === 'sold5') return rollingSum(run.hist.map(d => d.sold), i, WINDOW);
    if (metric === 'cash') return run.cashByDay[i];
    if (metric === 'rel') return run.relByDay[i];
  });

  for (const m of METRICS) {
    const cs = seriesFor(ctrl, m), es = seriesFor(exp, m);
    diffByDay[m].push(cs.map((v, i) => (v !== null && es[i] !== null) ? es[i] - v : null));
  }
}
console.log(`대조군·처치군 둘 다 30일 완주한 유효 seed: ${diffByDay.dio.length}`);
console.log(`netWorth 차이(처치-대조, 구매비용 ${N_BUYS}x618=${N_BUYS * 618} 포함) avg=${avg(netWorthDiff).toFixed(0)}`);

function settleDayFor(metric) {
  const rows = diffByDay[metric];
  const settleOffsets = [];
  let neverCount = 0;
  for (const series of rows) {
    const tail = series.slice(-WINDOW).filter(x => x !== null && !Number.isNaN(x));
    if (!tail.length) continue;
    const steady = avg(tail);
    const band = Math.max(Math.abs(steady) * BAND, 1e-6);
    const lo = steady - band, hi = steady + band;
    let settleIdx = null, streak = 0;
    for (let i = EXPAND_DAY - 1; i < series.length; i++) {
      const v = series[i];
      if (v !== null && v >= lo && v <= hi) { streak++; if (streak >= 3) { settleIdx = i - 2; break; } }
      else streak = 0;
    }
    if (settleIdx !== null) settleOffsets.push(settleIdx - (EXPAND_DAY - 1) + 1);
    else neverCount++;
  }
  return { settleOffsets, neverCount, total: rows.length };
}

console.log('\n지표별 settling time (처치-대조 쌍차가 후반 평균의 ±15% 밴드에 3일 연속 안착, 확장일=day' + EXPAND_DAY + '부터 경과일):');
for (const m of METRICS) {
  const { settleOffsets, neverCount, total } = settleDayFor(m);
  console.log(`  ${m.padEnd(8)} 평균=${avg(settleOffsets).toFixed(2)}일 median=${pctile(settleOffsets, 0.5)}일 p90=${pctile(settleOffsets, 0.9)}일` +
    ` 미안착=${neverCount}/${total}(${(100 * neverCount / total).toFixed(1)}%)`);
}

console.log('\n일자별 평균 쌍차(처치-대조) 곡선:');
for (const m of METRICS) {
  const byDay = [];
  for (let d = 0; d < FF.C.days; d++) {
    const vals = diffByDay[m].map(s => s[d]).filter(x => x !== null);
    byDay.push(vals.length ? avg(vals) : null);
  }
  console.log(`  ${m.padEnd(8)}: ` + byDay.map((v, i) => `d${i + 1}:${v === null ? '-' : v.toFixed(2)}`).join(' '));
}
