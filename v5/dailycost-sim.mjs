// 이슈 #10: 일일 운영비(고정비) 단독 실험. 초기자본은 50000으로 고정하고 운영비만
// 1.0/1.25/1.5/1.75/2.0배로 올린다. AP/AR은 넣지 않는다. 창고 임대료(별도 축)도 안 건드린다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 300);
const BASE_CASH = FF.C.cash, BASE_FIXED = FF.C.fixed;
const CASH_50K = Math.round(BASE_CASH * 50000 / 60000);

const SCENARIOS = {
  '기준(x1.0)': 1.0, 'O1(x1.25)': 1.25, 'O2(x1.5)': 1.5, 'O3(x1.75)': 1.75, 'O4(x2.0)': 2.0,
};
const STYLES = {
  '소극적(cover=1)': { cover: 1, stance: null },
  '기본(cover=1.5)': { cover: null, stance: null },
  '적극적매입(cover=2)': { cover: 2, stance: null },
  '프랜차이즈우선': { cover: null, stance: [1, 2, 1] },
  '도매우선': { cover: null, stance: [1, 1, 2] },
};
const RUNWAY_N = 5;

function desiredStored() {
  const cap = FF.capsOf(), M = FF.marketOf();
  const need = FF.intakeNeed(M.di, cap.sales, FF.coverOf(), FF.inventory(), FF.C);
  const prod = FF.prodOf();
  const baseAcc = Math.min(prod, cap.intake, need);
  const freeNow = Math.max(0, cap.storage - FF.inventory());
  return Math.min(baseAcc, freeNow);
}

function runFull(seed, style) {
  FF.reset(seed);
  let day1cmd = FF.Cmd.wait();
  if (style.cover !== null) day1cmd = FF.Cmd.policy(style.cover);
  else if (style.stance) day1cmd = FF.Cmd.stance(style.stance);
  FF.stepDay(day1cmd);
  if (style.cover !== null && style.stance) FF.stepDay(FF.Cmd.stance(style.stance));

  const days = [];
  let minCash = FF.ledger().cash, forgoneValue = 0, desiredValue = 0, bust = false;
  const recentDesired = [];
  for (let day = FF.run().day; day <= FF.C.days; day++) {
    if (FF.isOver()) break;
    const cashBefore = FF.ledger().cash;
    const budget = Math.max(0, cashBefore - FF.C.fixed);
    const payable = FF.C.farm > 0 ? Math.floor(budget / FF.C.farm) : Infinity;
    const want = desiredStored();
    const forgone = Math.max(0, want - Math.min(want, payable));
    forgoneValue += forgone * FF.C.farm; desiredValue += want * FF.C.farm;
    recentDesired.push(want * FF.C.farm); if (recentDesired.length > 3) recentDesired.shift();
    const avgRecentDesired = recentDesired.reduce((a, b) => a + b, 0) / recentDesired.length;

    const arList = FF.arOf() || [];
    const arBalance = arList.reduce((a, x) => a + x.amt, 0);
    const arDueSoon = arList.filter(x => x.at <= day + RUNWAY_N).reduce((a, x) => a + x.amt, 0);
    const arMaturesToday = arList.some(x => x.at === day);
    const runway = cashBefore + arDueSoon - RUNWAY_N * FF.C.fixed - RUNWAY_N * avgRecentDesired;

    FF.stepDay(FF.Cmd.wait());
    minCash = Math.min(minCash, FF.ledger().cash);
    if (FF.isBust()) bust = true;
    days.push({ day, forgone: forgone > 0, arBalance, arMaturesToday, runway });
  }
  const relAvg = FF.relOf().reduce((a, b) => a + b, 0) / FF.relOf().length;
  return { days, minCash, forgoneValue, desiredValue, bust, netWorth: FF.netWorth(FF.toKernelState()), relAvg, inventory: FF.inventory() };
}

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function pct(a, p) { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length * p)] : NaN; }

console.log('=== 일일 운영비 스윕 (초기자본 50000 고정, n=' + N_SEEDS + ') ===\n');
for (const [name, mult] of Object.entries(SCENARIOS)) {
  FF.C.cash = CASH_50K; FF.C.fixed = Math.round(BASE_FIXED * mult);
  const all = [];
  for (const style of Object.values(STYLES)) for (let seed = 1; seed <= N_SEEDS; seed++) all.push(runFull(seed, style));

  const forgoneRatio = all.map(r => r.desiredValue > 0 ? r.forgoneValue / r.desiredValue : 0);
  const minCashes = all.map(r => r.minCash);
  const firsts = [], lasts = [], runs = [], recoverFracs = [];
  const bucket = { early: 0, mid: 0, late: 0 };
  let arPosConstraintDays = 0, resolutions = 0, arDrivenResolutions = 0;
  const runwaySoon = [], runwayOther = [];
  for (const r of all) {
    const cdays = r.days.filter(d => d.forgone).map(d => d.day);
    if (cdays.length) { firsts.push(cdays[0]); lasts.push(cdays[cdays.length - 1]); }
    for (const d of cdays) { if (d <= 10) bucket.early++; else if (d <= 20) bucket.mid++; else bucket.late++; }
    let curRun = 0, maxRun = 0;
    for (const d of r.days) { if (d.forgone) { curRun++; maxRun = Math.max(maxRun, curRun); } else curRun = 0; }
    if (maxRun > 0) runs.push(maxRun);
    let recTotal = 0, recOk = 0;
    for (let i = 0; i < r.days.length - 1; i++) {
      if (r.days[i].forgone) {
        recTotal++; if (!r.days[i + 1].forgone) { recOk++; resolutions++; if (r.days[i].arMaturesToday || r.days[i + 1].arMaturesToday) arDrivenResolutions++; }
        if (r.days[i].arBalance > 0) arPosConstraintDays++;
      }
    }
    if (recTotal > 0) recoverFracs.push(recOk / recTotal);
    for (let i = 0; i < r.days.length; i++) {
      const soon = r.days.slice(i + 1, i + 6).some(d => d.forgone);
      (soon ? runwaySoon : runwayOther).push(r.days[i].runway);
    }
  }
  console.log('--- ' + name + ' (fixed=' + FF.C.fixed + ') ---');
  console.log('포기비율=' + (100 * avg(forgoneRatio)).toFixed(2) + '%',
    'bust율=' + (100 * all.filter(r => r.bust).length / all.length).toFixed(1) + '%',
    '최저현금p10=' + pct(minCashes, 0.1).toFixed(0),
    'netWorth avg=' + avg(all.map(r => r.netWorth)).toFixed(0),
    'relAvg=' + avg(all.map(r => r.relAvg)).toFixed(2),
    'inv avg=' + avg(all.map(r => r.inventory)).toFixed(1));
  console.log('첫제약일=' + avg(firsts).toFixed(1), '마지막제약일=' + avg(lasts).toFixed(1),
    '분포(초/중/후)=' + bucket.early + '/' + bucket.mid + '/' + bucket.late,
    '최장연속=' + avg(runs).toFixed(2), '회복률=' + (100 * avg(recoverFracs)).toFixed(1) + '%');
  console.log('AR>0&&제약 발생 건수=' + arPosConstraintDays, '해소 건수=' + resolutions,
    'AR성숙과 겹친 해소=' + arDrivenResolutions, '(' + (100 * arDrivenResolutions / Math.max(1, resolutions)).toFixed(1) + '%)');
  console.log('runway(곧 제약)=' + avg(runwaySoon).toFixed(0), 'runway(그 외)=' + avg(runwayOther).toFixed(0));
  console.log('');
}
FF.C.cash = BASE_CASH; FF.C.fixed = BASE_FIXED;
