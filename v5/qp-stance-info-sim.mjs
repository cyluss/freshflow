// 이슈 #13 1단계 3차: quota 보호층과 forecast 반응층을 분리한다.
// 직전 stance-info-sim.mjs는 forecast 정보가치가 아니라 "stance가 quota 관계규칙을
// 침범하는 부작용"을 잰 것이었다(전체 배분을 통째로 바꿔서 관계 상태 자체가 흔들렸다).
// 이번엔 모든 판로의 quota를 먼저 무조건 확보(FF.C.stance.min을 전 단계에서 1로 강제)한
// 뒤, 그 위에 남는 잉여(surplus)만 forecast 신호로 재배분한다 - 실제 FF.allocatePool/
// FF.roundAllocation을 그대로 쓰되(재구현 없음) rules.stance.min만 바꿔서 이걸 만든다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

// quota 보호층: 모든 stance 레벨(0~3)이 quota*1을 먼저 확보한다(원래는 레벨3=보장만 그랬다).
// weight는 원래 표(양보0.6·보통1·우선1.6·보장1) 그대로 둔다 - 잉여 배분 비중만 이 표로 정한다.
FF.C.stance = { weight: [0.6, 1, 1.6, 1], min: [1, 1, 1, 1], start: 1 };

const N_SEEDS = Number(process.argv[2] || 500);
const FREE_NOISE = FF.C.noise;
const INFO_NOISE = 0.10;
const HOR_A = 1, HOR_B = 7;
const EPS = 1;

// 잉여 배분 프리셋. franchise(가운데)는 항상 중립(1) - quota는 이미 보장됐으니 굳이 더
// 밀거나 뺄 이유가 없다. QP_CONCENTRATE는 whole(cap이 가장 크다=28)에 잉여를 몰아 부족한
// 물량을 가장 잘 흡수하게 하고, QP_DEFENSIVE는 online(settle=0, 가장 빠른 현금화)에 몰아
// 수요약세/공급강세 국면에서 현금을 빨리 확보한다.
const QP_NEUTRAL = [1, 1, 1], QP_CONCENTRATE = [1, 1, 2], QP_DEFENSIVE = [2, 1, 1];
function stanceFromSignal(net) {
  if (net >= 2) return QP_CONCENTRATE;
  if (net <= -2) return QP_DEFENSIVE;
  return QP_NEUTRAL;
}
function stanceKey(s) { return s.join(','); }

const VSCORE = { low: -2, mostlyLow: -1, similar: 0, mostlyHigh: 1, high: 2 };
function blurWith(v, noise) {
  const o = v.map(x => x * (1 - noise) + noise / 3);
  const s = o[0] + o[1] + o[2];
  return o.map(x => x / s);
}
function verdictScore(v) { return VSCORE[FF.outlookVerdict(FF.pct(v))]; }

function runStatic(seed) {
  FF.reset(seed);
  FF.stepDay(FF.Cmd.stance(QP_NEUTRAL));
  while (!FF.isOver()) FF.stepDay(FF.Cmd.wait());
  return { netWorth: FF.netWorth(FF.toKernelState()), bust: FF.isBust() };
}

function runReactive(seed, supplyNoise, demandNoise) {
  FF.reset(seed);
  let switches = 0, lastKey = stanceKey(QP_NEUTRAL);
  const decisions = [];
  for (let day = FF.run().day; day <= FF.C.days; day++) {
    if (FF.isOver()) break;
    const M = FF.marketOf(), T = FF.tiltOf();
    const supV = blurWith(FF.hor(M.si, HOR_A, HOR_B, FF.C, T.supply), supplyNoise);
    const demV = blurWith(FF.hor(M.di, HOR_A, HOR_B, FF.C, T.demand), demandNoise);
    const net = verdictScore(demV) - verdictScore(supV);
    const stance = stanceFromSignal(net);
    decisions.push(stanceKey(stance));
    if (stanceKey(stance) !== lastKey) { switches++; lastKey = stanceKey(stance); }
    FF.stepDay(FF.Cmd.stance(stance));
  }
  return { netWorth: FF.netWorth(FF.toKernelState()), switches, bust: FF.isBust(), decisions };
}

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function pct(a, p) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length * p)]; }

console.log(`=== 0단계: quota-preserving 고정([1,1,1]) vs 무료 forecast 반응형 (n=${N_SEEDS}) ===`);
const staticRows = [], freeRows = [];
for (let seed = 1; seed <= N_SEEDS; seed++) {
  staticRows.push(runStatic(seed));
  freeRows.push(runReactive(seed, FREE_NOISE, FREE_NOISE));
}
console.log('static(QP 고정)   netWorth avg=' + avg(staticRows.map(r => r.netWorth)).toFixed(0),
  'median=' + pct(staticRows.map(r => r.netWorth), 0.5).toFixed(0),
  'bust=' + (100 * staticRows.filter(r => r.bust).length / staticRows.length).toFixed(1) + '%');
console.log('reactive-free(무료) netWorth avg=' + avg(freeRows.map(r => r.netWorth)).toFixed(0),
  'median=' + pct(freeRows.map(r => r.netWorth), 0.5).toFixed(0),
  'stance전환 평균=' + avg(freeRows.map(r => r.switches)).toFixed(2),
  'bust=' + (100 * freeRows.filter(r => r.bust).length / freeRows.length).toFixed(1) + '%');
const dFreeVsStatic = staticRows.map((r, i) => freeRows[i].netWorth - r.netWorth);
console.log('무료 forecast 반응형 - 고정 (같은 시드): avg=' + avg(dFreeVsStatic).toFixed(0),
  'median=' + pct(dFreeVsStatic, 0.5).toFixed(0),
  'p10=' + pct(dFreeVsStatic, 0.1).toFixed(0), 'p90=' + pct(dFreeVsStatic, 0.9).toFixed(0),
  '개선비율(>0)=' + (100 * dFreeVsStatic.filter(x => x > EPS).length / N_SEEDS).toFixed(1) + '%',
  '평균/static=' + (100 * avg(dFreeVsStatic) / avg(staticRows.map(r => r.netWorth))).toFixed(2) + '%');

// 관계 수준도 같이 찍어서 이번엔 QP_NEUTRAL 고정과 반응형 사이에 관계 훼손이 없는지 확인한다.
function finalRel(seed, mode) {
  FF.reset(seed);
  if (mode === 'static') { FF.stepDay(FF.Cmd.stance(QP_NEUTRAL)); while (!FF.isOver()) FF.stepDay(FF.Cmd.wait()); }
  else { let last = QP_NEUTRAL; for (let day = FF.run().day; day <= FF.C.days; day++) { if (FF.isOver()) break;
      const M = FF.marketOf(), T = FF.tiltOf();
      const net = verdictScore(blurWith(FF.hor(M.di, HOR_A, HOR_B, FF.C, T.demand), FREE_NOISE)) - verdictScore(blurWith(FF.hor(M.si, HOR_A, HOR_B, FF.C, T.supply), FREE_NOISE));
      last = stanceFromSignal(net); FF.stepDay(FF.Cmd.stance(last)); } }
  return FF.relOf().slice();
}
const relStatic = [], relFree = [];
for (let seed = 1; seed <= N_SEEDS; seed++) { relStatic.push(finalRel(seed, 'static')); relFree.push(finalRel(seed, 'free')); }
console.log('-- 관계 훼손 확인(30일 종료 시 rel, 0~3) --');
['online', 'fran', 'whole'].forEach((name, i) => {
  console.log(name.padEnd(8), 'static avg=' + avg(relStatic.map(r => r[i])).toFixed(2),
    'reactive-free avg=' + avg(relFree.map(r => r[i])).toFixed(2));
});

if (avg(dFreeVsStatic) <= EPS) {
  console.log('\n[중단] 무료 forecast 반응형도 quota-preserving 고정 대비 유의한 양수 효용이 없다.');
  console.log('설계상 stance는 quota 보호를 깨지 않고도 정보소비 레버가 되지 못했다 - 2x2로 넘어가지 않고 여기서 멈춘다.');
  process.exit(0);
}

console.log(`\n=== 1단계: 공급/수요 관계자 정보 2x2 (n=${N_SEEDS}, free noise=${FREE_NOISE}, info noise=${INFO_NOISE}) ===`);
const COND = {
  'off_off': [FREE_NOISE, FREE_NOISE],
  'on_off': [INFO_NOISE, FREE_NOISE],
  'off_on': [FREE_NOISE, INFO_NOISE],
  'on_on': [INFO_NOISE, INFO_NOISE],
};
const bySeed = {};
for (const [condName, [sN, dN]] of Object.entries(COND)) {
  const rows = [];
  for (let seed = 1; seed <= N_SEEDS; seed++) {
    const r = condName === 'off_off' ? freeRows[seed - 1] : runReactive(seed, sN, dN);
    rows.push(r);
    (bySeed[seed] = bySeed[seed] || {})[condName] = r;
  }
  console.log(condName.padEnd(8),
    'netWorth avg=' + avg(rows.map(r => r.netWorth)).toFixed(0),
    'median=' + pct(rows.map(r => r.netWorth), 0.5).toFixed(0),
    'stance전환 평균=' + avg(rows.map(r => r.switches)).toFixed(2),
    'bust=' + (100 * rows.filter(r => r.bust).length / rows.length).toFixed(1) + '%');
}

const dSupplyOnly = [], dDemandOnly = [], dBoth = [];
const chS = [], chD = [], chB = [];
for (let seed = 1; seed <= N_SEEDS; seed++) {
  const b = bySeed[seed];
  dSupplyOnly.push(b.on_off.netWorth - b.off_off.netWorth);
  dDemandOnly.push(b.off_on.netWorth - b.off_off.netWorth);
  dBoth.push(b.on_on.netWorth - b.off_off.netWorth);
  let s = 0, d = 0, bo = 0;
  for (let i = 0; i < b.off_off.decisions.length; i++) {
    if (b.on_off.decisions[i] !== b.off_off.decisions[i]) s++;
    if (b.off_on.decisions[i] !== b.off_off.decisions[i]) d++;
    if (b.on_on.decisions[i] !== b.off_off.decisions[i]) bo++;
  }
  chS.push(s); chD.push(d); chB.push(bo);
}
const zeroRatio = (arr) => 100 * arr.filter(x => Math.abs(x) < EPS).length / arr.length;
console.log('-- 정보가치(같은 시드, off_off 대비 netWorth 차이) --');
console.log('공급정보 단독: avg=' + avg(dSupplyOnly).toFixed(0), 'median=' + pct(dSupplyOnly, 0.5).toFixed(0),
  'p10=' + pct(dSupplyOnly, 0.1).toFixed(0), 'p90=' + pct(dSupplyOnly, 0.9).toFixed(0),
  '가치0비율=' + zeroRatio(dSupplyOnly).toFixed(1) + '%', '결정변경일수 평균=' + avg(chS).toFixed(2));
console.log('수요정보 단독: avg=' + avg(dDemandOnly).toFixed(0), 'median=' + pct(dDemandOnly, 0.5).toFixed(0),
  'p10=' + pct(dDemandOnly, 0.1).toFixed(0), 'p90=' + pct(dDemandOnly, 0.9).toFixed(0),
  '가치0비율=' + zeroRatio(dDemandOnly).toFixed(1) + '%', '결정변경일수 평균=' + avg(chD).toFixed(2));
console.log('둘다:      avg=' + avg(dBoth).toFixed(0), 'median=' + pct(dBoth, 0.5).toFixed(0),
  'p10=' + pct(dBoth, 0.1).toFixed(0), 'p90=' + pct(dBoth, 0.9).toFixed(0),
  '가치0비율=' + zeroRatio(dBoth).toFixed(1) + '%', '결정변경일수 평균=' + avg(chB).toFixed(2));
console.log('-- 결합가치(Value(S+D) vs Value(S)+Value(D)) --');
console.log('Value(both) avg=' + avg(dBoth).toFixed(0),
  'Value(supply)+Value(demand)=' + (avg(dSupplyOnly) + avg(dDemandOnly)).toFixed(0),
  '차이(interaction)=' + (avg(dBoth) - avg(dSupplyOnly) - avg(dDemandOnly)).toFixed(0));
