// 이슈 #18: 30일을 60~90일로 늘리기 전에 먼저 "확장 한 번이 안정되는 데 며칠 걸리는가"를
// 잰다. 기존 커널의 실제 확장 레버(FF.Cmd.buy('sales'), cap.sales를 R.step.sales=2씩
// 올린다)를 그대로 쓴다 - 새 성장 시스템을 먼저 설계하지 않고 지금 있는 유일한 확장
// 행동으로 settling time부터 관측한다.
// 지정한 날에 판매capacity를 N번 연속 매입해(한 번에 42->42+2N) 뚜렷한 확장 충격을 만들고,
// 그 뒤 rolling(5일) DIO가 게임 후반 안정값의 ±15% 안에 3일 연속 들어오는 첫 날까지의
// 경과일을 "안정화 소요일"로 정의한다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 300);
const TTL = FF.C.ttl;
const EXPAND_DAY = 10;
const N_BUYS = 5; // cap.sales 42 -> 52 (판로 3개 합 cap과 비슷한 수준으로 점프)
const WINDOW = 5;
const BAND = 0.15;

function rollingDIO(hist, endIdx, window) {
  // hist[0..endIdx] 중 최근 window일. 그 구간에 팔리거나(ageMix) 폐기된(wT) 단위의 가중평균 나이.
  const from = Math.max(0, endIdx - window + 1);
  let sw = 0, su = 0;
  for (let i = from; i <= endIdx; i++) {
    const day = hist[i];
    (day.ageMix || []).forEach(({ a, q }) => { sw += a * q; su += q; });
    sw += TTL * day.wT; su += day.wT;
  }
  return su > 0 ? sw / su : null;
}

function runSeed(seed, doExpand) {
  FF.reset(seed);
  for (let day = FF.run().day; day <= FF.C.days; day++) {
    if (FF.isOver()) break;
    if (doExpand && day === EXPAND_DAY) {
      for (let k = 0; k < N_BUYS; k++) FF.stepDay(FF.Cmd.buy('sales'));
    } else {
      FF.stepDay(FF.Cmd.wait());
    }
  }
  return { hist: FF.histOf(), netWorth: FF.netWorth(FF.toKernelState()), bust: FF.isBust() };
}

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function pctile(a, p) { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; }

const settlingDays = [];
const neverSettled = [];
const rollingByDay = []; // 확장 조건의 seed별 rolling DIO 시계열(관측용 평균 곡선)
const rollingByDayBase = []; // 대조군(확장 없음)의 같은 곡선 - 초반 자연 warm-up과 분리하기 위해
const diffByDay = []; // 같은 seed의 (확장 - 대조군) 쌍차. 자연 warm-up을 상쇄하고 순수 확장효과만 본다.
const baselineNetWorth = [], expandNetWorth = [];

for (let seed = 1; seed <= N_SEEDS; seed++) {
  const base = runSeed(seed, false);
  const exp = runSeed(seed, true);
  baselineNetWorth.push(base.netWorth); expandNetWorth.push(exp.netWorth);

  let baseSeries = null;
  if (base.hist.length >= FF.C.days) {
    baseSeries = base.hist.map((_, i) => rollingDIO(base.hist, i, WINDOW));
    rollingByDayBase.push(baseSeries);
  }

  const h = exp.hist;
  if (h.length < FF.C.days) continue; // bust로 조기종료한 seed는 안정화 여부를 판단할 후반 구간이 없다
  const series = h.map((_, i) => rollingDIO(h, i, WINDOW));
  rollingByDay.push(series);
  if (baseSeries) diffByDay.push(series.map((v, i) => (v !== null && baseSeries[i] !== null) ? v - baseSeries[i] : null));

  // 후반 안정값: 마지막 5일 rolling DIO 평균(그 자체가 null이면 스킵)
  const tail = series.slice(-WINDOW).filter(x => x !== null);
  if (!tail.length) continue;
  const steady = avg(tail);
  const lo = steady * (1 - BAND), hi = steady * (1 + BAND);

  let settleIdx = null, streak = 0;
  for (let i = EXPAND_DAY; i < series.length; i++) {
    const v = series[i];
    if (v !== null && v >= lo && v <= hi) { streak++; if (streak >= 3) { settleIdx = i - 2; break; } }
    else streak = 0;
  }
  if (settleIdx !== null) settlingDays.push(settleIdx - (EXPAND_DAY - 1) + 1); // 확장일(EXPAND_DAY, 1-based)로부터 경과일
  else neverSettled.push(seed);
}

console.log(`n=${N_SEEDS}, 확장일=day${EXPAND_DAY}(판매capacity ${N_BUYS}회 연속매입, 42->${42 + 2 * N_BUYS}), window=${WINDOW}일, 안정판정 밴드=±${(BAND * 100).toFixed(0)}%`);
console.log(`안정화까지 걸린 일수: 판정 가능 seed=${settlingDays.length + neverSettled.length}, 안정화 성공=${settlingDays.length}`);
console.log(`  평균=${avg(settlingDays).toFixed(2)}일, median=${pctile(settlingDays, 0.5)}일, p90=${pctile(settlingDays, 0.9)}일, 끝까지 밴드 안 못 들어온 seed=${neverSettled.length}개(${(100 * neverSettled.length / (settlingDays.length + neverSettled.length)).toFixed(1)}%)`);

console.log(`\nnetWorth: baseline(확장 없음) avg=${avg(baselineNetWorth).toFixed(0)}, 확장(구매비용 ${N_BUYS}x618=${N_BUYS * 618} 지출 포함) avg=${avg(expandNetWorth).toFixed(0)},` +
  ` 차이=${(avg(expandNetWorth) - avg(baselineNetWorth)).toFixed(0)}`);

// 일자별 평균 rolling DIO 곡선(전 seed 평균) - 확장 충격이 실제로 어떤 모양인지 눈으로 본다.
console.log('\n일자별 평균 rolling(5일) DIO (확장일=' + EXPAND_DAY + '):');
const byDay = [];
for (let d = 0; d < FF.C.days; d++) {
  const vals = rollingByDay.map(s => s[d]).filter(x => x !== null);
  byDay.push(vals.length ? avg(vals) : null);
}
console.log(byDay.map((v, i) => `d${i + 1}:${v === null ? '-' : v.toFixed(2)}`).join(' '));

console.log('\n일자별 평균 rolling(5일) DIO - 대조군(확장 없음, 자연 warm-up 확인용):');
const byDayBase = [];
for (let d = 0; d < FF.C.days; d++) {
  const vals = rollingByDayBase.map(s => s[d]).filter(x => x !== null);
  byDayBase.push(vals.length ? avg(vals) : null);
}
console.log(byDayBase.map((v, i) => `d${i + 1}:${v === null ? '-' : v.toFixed(2)}`).join(' '));

console.log('\n같은 seed 쌍차(확장 - 대조군) - 자연 warm-up을 상쇄한 순수 확장효과:');
const byDayDiff = [];
for (let d = 0; d < FF.C.days; d++) {
  const vals = diffByDay.map(s => s[d]).filter(x => x !== null);
  byDayDiff.push(vals.length ? avg(vals) : null);
}
console.log(byDayDiff.map((v, i) => `d${i + 1}:${v === null ? '-' : v.toFixed(3)}`).join(' '));
console.log(`확장일(day${EXPAND_DAY}) 이후 쌍차 절대값 평균=${avg(byDayDiff.slice(EXPAND_DAY - 1).filter(x=>x!==null).map(Math.abs)).toFixed(3)}` +
  ` (참고: 확장 전 구간 쌍차 절대값 평균=${avg(byDayDiff.slice(0, EXPAND_DAY - 1).filter(x=>x!==null).map(Math.abs)).toFixed(3)}, 0이어야 정상)`);
