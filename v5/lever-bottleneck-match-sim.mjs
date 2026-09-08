// 이슈 #19 1단계: capacity 투자가 "현재 병목과 정확히 일치할 때만" 경제적 가치를
// 만드는지 대각선 매트릭스로 검증한다. storage/intake는 헤드리스 임시 레버(#18과 동일
// 가격표)다. 병목 조건(stock/intake/ship)은 day1~9 사전관측(#9: 결정 시점에 이미 관측
// 가능)으로 골라낸 부분집합이고, 투자는 day10에 정확히 한 번(#18에서 확정한 날짜정렬
// 원칙 - 같은 날 여러 번 사면 달력이 밀린다)만 한다. payback은 #18과 같은 90일 지평,
// 같은 seed 무투자 대조군 쌍차로 잰다.
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
FF.C.cost = Object.assign({}, ORIGINAL_COST, { storage: 300, intake: 490 });
FF.C.step = Object.assign({}, ORIGINAL_STEP, { storage: 4, intake: 2 });

const EXPAND_DAY = 10;
const BOTTLENECKS = ['stock', 'intake', 'ship'];
const LEVERS = ['storage', 'intake', 'sales', 'none'];
const CHECKPOINTS = [30, 45, 60, 90];

function dailyNetWorth() { return FF.ledger().cash + FF.sumAmt(FF.arOf()) - FF.sumAmt(FF.apOf()); }

function prepEngine() {
  FF.ENGINE.value.phase.storage = { dir: 0, n: 0 };
  FF.ENGINE.value.lastBuy.storage = 0;
}

// 사전관측: day1~9(9일)에 특정 병목이 "가장 흔한 병목"이었던 seed를 각 조건별로 고른다.
// 투자 여부는 이후 RNG 소비 순서에 영향을 안 주므로(명령은 배분·정책·pend만 바꾼다)
// 이 사전관측은 모든 처치 조건에 공통으로 쓸 수 있다.
const eligible = { stock: [], intake: [], ship: [] };
for (let seed = 1; seed <= N_SEEDS; seed++) {
  FF.reset(seed);
  const counts = {};
  for (let day = 1; day <= 9; day++) {
    if (FF.isOver()) break;
    FF.stepDay(FF.Cmd.wait());
    const b = FF.today().b; counts[b] = (counts[b] || 0) + 1;
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (top && BOTTLENECKS.includes(top[0])) eligible[top[0]].push(seed);
}
for (const bn of BOTTLENECKS) console.log(`병목=${bn}가 day1~9 최다병목이었던 seed: ${eligible[bn].length}/${N_SEEDS}`);

function runSeed(seed, lever) {
  FF.reset(seed);
  if (lever === 'storage') prepEngine();
  const nw = [];
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    const cmd = (day === EXPAND_DAY && lever !== 'none') ? FF.Cmd.buy(lever) : FF.Cmd.wait();
    FF.stepDay(cmd);
    nw.push(dailyNetWorth());
  }
  return nw;
}

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }

for (const bn of BOTTLENECKS) {
  console.log(`\n========== 병목 조건: ${bn} (n=${eligible[bn].length}) ==========`);
  const byLever = {};
  for (const lever of LEVERS) {
    const rows = [];
    for (const seed of eligible[bn]) rows.push(runSeed(seed, lever));
    byLever[lever] = rows;
  }
  const noneRows = byLever.none;
  for (const lever of LEVERS) {
    if (lever === 'none') continue;
    const rows = byLever[lever];
    const diffSeries = [];
    for (let i = 0; i < rows.length; i++) {
      const len = Math.min(rows[i].length, noneRows[i].length);
      if (len < HORIZON) continue;
      diffSeries.push(rows[i].slice(0, len).map((v, d) => v - noneRows[i][d]));
    }
    const cpStr = CHECKPOINTS.map(cp => {
      const vals = diffSeries.map(s => s[cp - 1]);
      return `day${cp}:avg=${avg(vals).toFixed(0)}(양수${(100 * vals.filter(v => v > 0).length / vals.length).toFixed(0)}%)`;
    }).join(' ');
    let paybackN = 0;
    for (const s of diffSeries) if (s[s.length - 1] > 0 && s.slice(-10).every(v => v > 0)) paybackN++;
    console.log(`  레버=${lever.padEnd(8)} 완주n=${diffSeries.length} ${cpStr} 90일말 지속양수=${(100 * paybackN / diffSeries.length).toFixed(0)}%`);
  }
}

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP; FF.C.days = 30;
