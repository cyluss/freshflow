// 이슈 #10: 초기자본만 독립변수로 움직여 현재 경제(약 5일 CCC)에 이미 있는 현금 공백이
// 실제 운전자본 제약으로 나타나는 지점을 찾는다. 고정비는 건드리지 않는다. AP가 유용해지는
// 값을 역산하지 않기 위해 경제 규모 기준(100/75/50/25%)을 먼저 선언한다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 300);
const BASE_CASH = FF.C.cash; // 120000(확정 도메인) = 실 60000원

// 사전 선언한 적정 자본화 판정 기준(결과를 보고 정하지 않는다):
//   포기비율 1~5%, bust<10%, 5개 스타일 전부 정상 영업(bust<10%), 관계/재고 성과 유지.
const CAPITAL_LEVELS = { '70%(42000)': 0.70, '65%(39000)': 0.65, '60%(36000)': 0.60, '55%(33000)': 0.55 };
const STYLES = {
  '소극적(cover=1)': { cover: 1, stance: null },
  '기본(cover=1.5)': { cover: null, stance: null },
  '적극적매입(cover=2)': { cover: 2, stance: null },
  '프랜차이즈우선': { cover: null, stance: [1, 2, 1] },
  '도매우선': { cover: null, stance: [1, 1, 2] },
};

function desiredStored() {
  const cap = FF.capsOf(), M = FF.marketOf();
  const need = FF.intakeNeed(M.di, cap.sales, FF.coverOf(), FF.inventory(), FF.C);
  const prod = FF.prodOf();
  const baseAcc = Math.min(prod, cap.intake, need);
  const freeNow = Math.max(0, cap.storage - FF.inventory());
  return Math.min(baseAcc, freeNow);
}

function runStyle(seed, style) {
  FF.reset(seed);
  let day1cmd = FF.Cmd.wait();
  if (style.cover !== null) day1cmd = FF.Cmd.policy(style.cover);
  else if (style.stance) day1cmd = FF.Cmd.stance(style.stance);
  FF.stepDay(day1cmd);
  if (style.cover !== null && style.stance) FF.stepDay(FF.Cmd.stance(style.stance));

  let minCash = FF.ledger().cash, forgoneQty = 0, forgoneValue = 0, desiredValue = 0;
  let insolvencyDays = 0, bustDay = null;
  for (let day = FF.run().day; day <= FF.C.days; day++) {
    if (FF.isOver()) break;
    const cashBefore = FF.ledger().cash;
    const budget = Math.max(0, cashBefore - FF.C.fixed);
    const payable = FF.C.farm > 0 ? Math.floor(budget / FF.C.farm) : Infinity;
    const want = desiredStored();
    const gotten = Math.min(want, payable);
    const forgone = Math.max(0, want - gotten);
    forgoneQty += forgone; forgoneValue += forgone * FF.C.farm;
    desiredValue += want * FF.C.farm;
    if (cashBefore < FF.C.fixed) insolvencyDays++;

    FF.stepDay(FF.Cmd.wait());
    minCash = Math.min(minCash, FF.ledger().cash);
    if (FF.isBust() && bustDay === null) bustDay = day;
  }
  const relAvg = FF.relOf().reduce((a, b) => a + b, 0) / FF.relOf().length;
  return { minCash, forgoneQty, forgoneValue, desiredValue, insolvencyDays, bust: FF.isBust(),
    netWorth: FF.netWorth(FF.toKernelState()), relAvg, inventory: FF.inventory() };
}

function avg(a) { return a.reduce((x, y) => x + y, 0) / a.length; }
function pct(a, p) { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length * p)]; }

console.log('=== 초기자본 x 플레이 스타일 노출 (n=' + N_SEEDS + ') ===\n');
for (const [levelName, frac] of Object.entries(CAPITAL_LEVELS)) {
  FF.C.cash = Math.round(BASE_CASH * frac);
  console.log('--- 초기자본 ' + levelName + ' (내부값 ' + FF.C.cash + ') ---');
  for (const [styleName, style] of Object.entries(STYLES)) {
    const rows = [];
    for (let seed = 1; seed <= N_SEEDS; seed++) rows.push(runStyle(seed, style));
    const minCashes = rows.map(r => r.minCash);
    const forgoneRatio = rows.map(r => r.desiredValue > 0 ? r.forgoneValue / r.desiredValue : 0);
    console.log(styleName.padEnd(16),
      '최저현금 p10=' + pct(minCashes, 0.1).toFixed(0) + ' p50=' + pct(minCashes, 0.5).toFixed(0),
      '포기비율 평균=' + (100 * avg(forgoneRatio)).toFixed(2) + '%',
      '포기발생 시드=' + rows.filter(r => r.forgoneQty > 0).length + '/' + N_SEEDS,
      '지급불능일수 평균=' + avg(rows.map(r => r.insolvencyDays)).toFixed(2),
      'bust=' + rows.filter(r => r.bust).length + '/' + N_SEEDS,
      'netWorth avg=' + avg(rows.map(r => r.netWorth)).toFixed(0),
      'relAvg=' + avg(rows.map(r => r.relAvg)).toFixed(2),
      'inv avg=' + avg(rows.map(r => r.inventory)).toFixed(1));
  }
  console.log('');
}
FF.C.cash = BASE_CASH; // 원상복구(같은 프로세스에서 재사용 대비)
