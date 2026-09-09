// 이슈 #19: intake 투자 이후 실제로 "다음 병목"이 등장하고, 그것을 다시 진단해서
// 재투자하면 두 번째 회수 사이클이 발생하는지 본다(#19 성공조건: 사이클이 한 판에서
// 여러 번 재현돼야 한다). 첫 투자(day10) 뒤 day21~30 창에서 wIcap/wIstore/wS를 다시
// 진단해 intake가 여전히(또는 다시) 지배적이면 day31에 두 번째 intake를 산다 - 날짜를
// 미리 정해서 사는 게 아니라 관측 기반으로 재투자한다(#9).
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 2000);
const HORIZON = 90;
FF.C.days = HORIZON;
const ORIGINAL_COST = Object.assign({}, FF.C.cost);
const ORIGINAL_STEP = Object.assign({}, FF.C.step);
FF.C.cost = Object.assign({}, ORIGINAL_COST, { intake: 490 });
FF.C.step = Object.assign({}, ORIGINAL_STEP, { intake: 2 });

const EPS = 1;
function dailyNetWorth() { return FF.ledger().cash + FF.sumAmt(FF.arOf()) - FF.sumAmt(FF.apOf()); }

// 1단계 스크립트와 같은 방식으로 intake_cap 진단군을 다시 골라낸다(day1~9).
const seeds = [];
for (let seed = 1; seed <= N_SEEDS; seed++) {
  FF.reset(seed);
  let sumCap = 0, sumStore = 0, sumCash = 0, sumWI = 0;
  for (let day = 1; day <= 9; day++) {
    if (FF.isOver()) break;
    FF.stepDay(FF.Cmd.wait());
    const d = FF.today();
    sumCap += d.wIcap; sumStore += d.wIstore; sumCash += d.wS; sumWI += d.wI;
  }
  if (sumWI <= EPS) continue;
  const maxV = Math.max(sumCap, sumStore, sumCash);
  if (maxV > EPS && sumCap === maxV) seeds.push(seed);
}
console.log(`intake_cap 진단군: ${seeds.length}/${N_SEEDS}`);

// mode: 'none' | 'once'(day10 1회) | 'reactive'(day10 1회 + day21~30 재진단 후 day31 재투자)
function runSeed(seed, mode) {
  FF.reset(seed);
  let secondBuy = false, day21to30Cap = 0, day21to30Store = 0, day21to30Cash = 0, day21to30WI = 0;
  const nw = [];
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    let cmd = FF.Cmd.wait();
    if (mode !== 'none' && day === 10) cmd = FF.Cmd.buy('intake');
    if (mode === 'reactive' && day === 31 && secondBuy) cmd = FF.Cmd.buy('intake');
    FF.stepDay(cmd);
    const d = FF.today();
    if (mode === 'reactive' && day >= 21 && day <= 30) {
      day21to30Cap += d.wIcap; day21to30Store += d.wIstore; day21to30Cash += d.wS; day21to30WI += d.wI;
      if (day === 30) {
        const maxV = Math.max(day21to30Cap, day21to30Store, day21to30Cash);
        secondBuy = day21to30WI > EPS && maxV > EPS && day21to30Cap === maxV;
      }
    }
    nw.push(dailyNetWorth());
  }
  return { nw, bust: FF.isBust(), secondBuy };
}

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
const CHECKPOINTS = [30, 45, 60, 90];

const results = {};
for (const mode of ['none', 'once', 'reactive']) {
  results[mode] = seeds.map(seed => runSeed(seed, mode));
}
const reactiveSecondBuyPct = 100 * results.reactive.filter(r => r.secondBuy).length / seeds.length;
console.log(`재진단(day21~30) 후 2차 intake 재투자를 실행한 비율: ${reactiveSecondBuyPct.toFixed(1)}%`);

function diffReport(label, arm) {
  const diffSeries = [];
  for (let i = 0; i < seeds.length; i++) {
    const a = results[arm][i].nw, b = results.none[i].nw;
    const len = Math.min(a.length, b.length);
    if (len < HORIZON) continue;
    diffSeries.push(a.slice(0, len).map((v, d) => v - b[d]));
  }
  console.log(`\n[${label}] 완주 n=${diffSeries.length}/${seeds.length}`);
  for (const cp of CHECKPOINTS) {
    const vals = diffSeries.map(s => s[cp - 1]);
    console.log(`  day${cp}: avg=${avg(vals).toFixed(0)} (양수 ${(100 * vals.filter(v => v > 0).length / vals.length).toFixed(0)}%)`);
  }
  return diffSeries;
}

const onceSeries = diffReport('once vs none (1회 투자만)', 'once');
const reactiveSeries = diffReport('reactive vs none (1회+재진단 재투자)', 'reactive');

// once와 reactive를 직접 비교: 재투자가 1회 투자보다 day90에 더 나은가.
const headToHead = [];
for (let i = 0; i < seeds.length; i++) {
  const r = results.reactive[i].nw, o = results.once[i].nw;
  const len = Math.min(r.length, o.length);
  if (len < HORIZON) continue;
  headToHead.push(r[len - 1] - o[len - 1]);
}
console.log(`\nreactive - once (day90, 재투자 실행한 seed만): ` +
  `avg=${avg(headToHead.filter((_, i) => results.reactive[i] && results.reactive[i].secondBuy)).toFixed(0)}` +
  ` n=${headToHead.filter((_, i) => results.reactive[i] && results.reactive[i].secondBuy).length}`);

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP; FF.C.days = 30;
