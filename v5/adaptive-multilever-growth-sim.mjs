// 이슈 #18 3단계: storage/intake capacity를 headless 전용 임시 레버로 열어서
// 가설A(대응 레버 부족)와 가설B(투자 회수기간이 30일보다 김)를 분리한다.
// FF.C.cost/FF.C.step에 storage/intake 항목을 추가하기만 하면(기존 FF.Cmd.buy/transition의
// 범용 pend 메커니즘이 그대로 처리한다 - 커널 코드는 안 바꾼다) FF.Cmd.buy('storage')/
// buy('intake')가 그대로 동작한다.
// 정책은 완전 반응형이다: 매일 "어제" 기록된 병목(FF.today().b, 결정 시점에 이미 관측
// 가능한 값이라 #9를 지킨다)을 보고 ship->sales, stock->storage, intake->intake를 산다.
// 그 외 병목(demand/supply/policy/none)은 살 수 있는 capacity가 없으므로 그냥 기다린다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 500);
const ORIGINAL_SM = FF.C.sm.slice();
const ORIGINAL_COST = Object.assign({}, FF.C.cost);
const ORIGINAL_STEP = Object.assign({}, FF.C.step);

// 임시 headless 가격표. maint 대비 sales의 원래 비율(cost/step/maint ≈ 9.36)을 그대로 맞췄다.
FF.C.cost = Object.assign({}, ORIGINAL_COST, { storage: 300, intake: 490 });
FF.C.step = Object.assign({}, ORIGINAL_STEP, { storage: 4, intake: 2 });

const BOTTLENECK_TO_LEVER = { ship: 'sales', stock: 'storage', intake: 'intake' };

const SM_SCHEDULES = {
  '무성장(대조)': { 1: 1.0 },
  '무성장+반응형매입': { 1: 1.0 },
  '균형성장+반응형매입': { 1: 0.8, 11: 1.0, 21: 1.2 },
  '공급선행+반응형매입': { 1: 0.8, 11: 1.4 },
};
const ADAPTIVE = { '무성장(대조)': false, '무성장+반응형매입': true, '균형성장+반응형매입': true, '공급선행+반응형매입': true };

function smAt(day, schedule) {
  const days = Object.keys(schedule).map(Number).sort((a, b) => a - b);
  let v = schedule[days[0]];
  for (const d of days) if (day >= d) v = schedule[d];
  return v;
}

function runSeed(seed, schedule, adaptive) {
  FF.reset(seed);
  // ENGINE 상태는 원래 intake/sales만 알고 있다(storage 매입은 원래 게임에 없던 레버라
  // resetEngineState가 그 슬롯을 안 만든다) - recordPurchase가 죽지 않도록 headless로 채운다.
  FF.ENGINE.value.phase.storage = { dir: 0, n: 0 };
  FF.ENGINE.value.lastBuy.storage = 0;
  const buyCounts = { sales: 0, storage: 0, intake: 0 };
  for (let day = FF.run().day; day <= FF.C.days; day++) {
    if (FF.isOver()) break;
    FF.C.sm = ORIGINAL_SM.map(v => v * smAt(day, schedule));
    let cmd = FF.Cmd.wait();
    if (adaptive && day > 1) {
      const lastB = FF.today() ? FF.today().b : null;
      const lever = BOTTLENECK_TO_LEVER[lastB];
      if (lever) { cmd = FF.Cmd.buy(lever); buyCounts[lever]++; }
    }
    FF.stepDay(cmd);
  }
  FF.C.sm = ORIGINAL_SM;
  return { hist: FF.histOf(), rel: FF.relOf().slice(), netWorth: FF.netWorth(FF.toKernelState()), cash: FF.ledger().cash, bust: FF.isBust(), buyCounts };
}

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }

const PHASES = [{ name: '초반(1-10)', from: 1, to: 10 }, { name: '중반(11-20)', from: 11, to: 20 }, { name: '후반(21-30)', from: 21, to: 30 }];

for (const [name, schedule] of Object.entries(SM_SCHEDULES)) {
  const adaptive = ADAPTIVE[name];
  console.log(`\n========== ${name} (n=${N_SEEDS}) ==========`);
  const runs = [];
  for (let seed = 1; seed <= N_SEEDS; seed++) runs.push(runSeed(seed, schedule, adaptive));

  for (const phase of PHASES) {
    const counts = {}; let total = 0;
    for (const run of runs) {
      for (let d = phase.from; d <= Math.min(phase.to, run.hist.length); d++) {
        const b = run.hist[d - 1].b; counts[b] = (counts[b] || 0) + 1; total++;
      }
    }
    const top3 = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}:${(100 * v / total).toFixed(1)}%`).join(' ');
    console.log(`  ${phase.name.padEnd(10)} 주요 병목: ${top3}`);
  }

  console.log(`  netWorth=${avg(runs.map(r => r.netWorth)).toFixed(0)} cash=${avg(runs.map(r => r.cash)).toFixed(0)}` +
    ` 평균관계=${avg(runs.map(r => avg(r.rel))).toFixed(2)} bust=${(100 * runs.filter(r => r.bust).length / N_SEEDS).toFixed(1)}%`);
  if (adaptive) {
    console.log(`  매입횟수 평균: sales=${avg(runs.map(r => r.buyCounts.sales)).toFixed(2)}` +
      ` storage=${avg(runs.map(r => r.buyCounts.storage)).toFixed(2)} intake=${avg(runs.map(r => r.buyCounts.intake)).toFixed(2)}`);
  }
}

FF.C.cost = ORIGINAL_COST; FF.C.step = ORIGINAL_STEP;
