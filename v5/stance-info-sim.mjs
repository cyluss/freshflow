// 이슈 #13 1단계 2차: 결정 레버를 cover에서 stance(판로 태도)로 바꿔 같은 forecast 신호로
// 재검증한다. noise/horizon/forecast 생성 방식(FF.hor+아핀 blur+FF.outlookVerdict)은
// broker-info-sim.mjs와 완전히 같다 - 바뀐 것은 신호를 소비하는 레버 하나뿐이다.
// 먼저 "고정 stance vs 무료 forecast로만 반응하는 stance"를 비교해서 stance 자체가 이
// 신호를 쓸 만한 레버인지부터 본다(cover는 반응해도 이득이 0.6%대로 얇았다 - 레버 문제였는지
// 정보 문제였는지 여기서 갈린다). 그 다음에만 공급/수요 관계자 정보 2x2로 넘어간다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 500);
const FREE_NOISE = FF.C.noise;
const INFO_NOISE = 0.10;
const HOR_A = 1, HOR_B = 7;
const EPS = 1;

// 채널 순서: [online, fran, whole]. 1차(cover)와 같은 net=수요점수-공급점수, 같은 ±2 문턱이다.
// CONSERVE: 수요약세/공급강세(관계 훼손 위험)일 때 franchise만 보장(3)해서 quota*0.5 미만으로
//   떨어져 관계가 영구히 끊기는 것을 막는다(#4/#8에서 이미 확인한 그 메커니즘).
// CONCENTRATE: 수요강세/공급약세(물량이 부족한데 수요는 강함)일 때 회전이 빠르고 단가 높은
//   online·whole에 가중치를 몰아준다(우선=2). settle이 긴 franchise에 몰아줘 봐야 부족한
//   물량을 더 오래 묶어두기만 한다.
const CONSERVE = [1, 3, 1], BALANCED = [1, 1, 1], CONCENTRATE = [2, 1, 2];
function stanceFromSignal(net) {
  if (net >= 2) return CONCENTRATE;
  if (net <= -2) return CONSERVE;
  return BALANCED;
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
  FF.stepDay(FF.Cmd.stance(BALANCED));
  while (!FF.isOver()) FF.stepDay(FF.Cmd.wait());
  return { netWorth: FF.netWorth(FF.toKernelState()), bust: FF.isBust() };
}

function runReactive(seed, supplyNoise, demandNoise) {
  FF.reset(seed);
  let switches = 0, lastKey = stanceKey(BALANCED);
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

console.log(`=== 0단계: 고정 stance vs 무료 forecast 반응형 stance (n=${N_SEEDS}) ===`);
const staticRows = [], freeRows = [];
for (let seed = 1; seed <= N_SEEDS; seed++) {
  staticRows.push(runStatic(seed));
  freeRows.push(runReactive(seed, FREE_NOISE, FREE_NOISE));
}
console.log('static(stance고정[1,1,1]) netWorth avg=' + avg(staticRows.map(r => r.netWorth)).toFixed(0),
  'median=' + pct(staticRows.map(r => r.netWorth), 0.5).toFixed(0),
  'bust=' + (100 * staticRows.filter(r => r.bust).length / staticRows.length).toFixed(1) + '%');
console.log('reactive-free(무료 forecast)  netWorth avg=' + avg(freeRows.map(r => r.netWorth)).toFixed(0),
  'median=' + pct(freeRows.map(r => r.netWorth), 0.5).toFixed(0),
  'stance전환 평균=' + avg(freeRows.map(r => r.switches)).toFixed(2),
  'bust=' + (100 * freeRows.filter(r => r.bust).length / freeRows.length).toFixed(1) + '%');
const dFreeVsStatic = staticRows.map((r, i) => freeRows[i].netWorth - r.netWorth);
console.log('무료 forecast 반응형 - 고정 (같은 시드): avg=' + avg(dFreeVsStatic).toFixed(0),
  'median=' + pct(dFreeVsStatic, 0.5).toFixed(0),
  'p10=' + pct(dFreeVsStatic, 0.1).toFixed(0), 'p90=' + pct(dFreeVsStatic, 0.9).toFixed(0),
  '개선비율(>0)=' + (100 * dFreeVsStatic.filter(x => x > EPS).length / N_SEEDS).toFixed(1) + '%',
  '평균/static=' + (100 * avg(dFreeVsStatic) / avg(staticRows.map(r => r.netWorth))).toFixed(2) + '%');

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

// 진단: CONSERVE(franchise 보장)가 발동한 날수와 netWorth 손실의 관계를 본다.
// 가설: franchise settle=14(세 판로 중 가장 길다)에 보장으로 몰아주면 현금이 빠듯한 국면일수록
// 매출 실현이 더 늦어져서, 이슈 #10이 만든 현금 제약과 충돌해 역효과가 난 것 아닌가.
console.log('\n=== 진단: CONSERVE 발동일수 vs netWorth 손실(고정 대비) ===');
const diag = [];
for (let seed = 1; seed <= N_SEEDS; seed++) {
  const conserveDays = freeRows[seed - 1].decisions.filter(d => d === stanceKey(CONSERVE)).length;
  const concentrateDays = freeRows[seed - 1].decisions.filter(d => d === stanceKey(CONCENTRATE)).length;
  const loss = freeRows[seed - 1].netWorth - staticRows[seed - 1].netWorth;
  diag.push({ seed, conserveDays, concentrateDays, loss });
}
function corr(xs, ys) {
  const mx = avg(xs), my = avg(ys);
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < xs.length; i++) { const dx = xs[i] - mx, dy = ys[i] - my; num += dx * dy; dx2 += dx * dx; dy2 += dy * dy; }
  return num / Math.sqrt(dx2 * dy2);
}
console.log('CONSERVE 발동일수 평균=' + avg(diag.map(d => d.conserveDays)).toFixed(2),
  'CONCENTRATE 발동일수 평균=' + avg(diag.map(d => d.concentrateDays)).toFixed(2));
console.log('corr(conserveDays, loss)=' + corr(diag.map(d => d.conserveDays), diag.map(d => d.loss)).toFixed(3));
console.log('corr(concentrateDays, loss)=' + corr(diag.map(d => d.concentrateDays), diag.map(d => d.loss)).toFixed(3));
const zeroConserve = diag.filter(d => d.conserveDays === 0);
const someConserve = diag.filter(d => d.conserveDays > 0);
console.log('CONSERVE 0일: n=' + zeroConserve.length, 'loss avg=' + avg(zeroConserve.map(d => d.loss)).toFixed(0));
console.log('CONSERVE>0일: n=' + someConserve.length, 'loss avg=' + avg(someConserve.map(d => d.loss)).toFixed(0));

// 추가 확인: stance를 아예 안 정하면(null) 커널이 기본으로 쓰는 "단가 우선 정렬" 배분과,
// 명시적으로 [1,1,1](보통)을 세팅해 매일 같은 값을 다시 넣는 water-filling 배분이 애초에
// 같은가. 다르다면 위 static 기준선 자체가 "진짜 아무것도 안 하는" 기준이 아닐 수 있다.
function runRawNull(seed) {
  FF.reset(seed);
  while (!FF.isOver()) FF.stepDay(FF.Cmd.wait());
  return { netWorth: FF.netWorth(FF.toKernelState()), bust: FF.isBust() };
}
console.log('\n=== 확인: stance 미설정(null, 단가우선) vs 명시적 [1,1,1](water-filling) ===');
const rawRows = [];
for (let seed = 1; seed <= N_SEEDS; seed++) rawRows.push(runRawNull(seed));
console.log('raw(stance null)      netWorth avg=' + avg(rawRows.map(r => r.netWorth)).toFixed(0),
  'median=' + pct(rawRows.map(r => r.netWorth), 0.5).toFixed(0));
console.log('static([1,1,1] 명시)   netWorth avg=' + avg(staticRows.map(r => r.netWorth)).toFixed(0),
  'median=' + pct(staticRows.map(r => r.netWorth), 0.5).toFixed(0));
const dRawVsStatic = rawRows.map((r, i) => staticRows[i].netWorth - r.netWorth);
console.log('[1,1,1] - null (같은 시드): avg=' + avg(dRawVsStatic).toFixed(0),
  'median=' + pct(dRawVsStatic, 0.5).toFixed(0));

// 원인 확정: 관계 수준(rel) 경로가 진짜 원인인지 직접 찍어본다. 관계가 오르면 price·cap
// 배수가 영구히 올라 30일 누적 효과가 크다(#4/#8에서 이미 확인한 메커니즘) - null(단가우선)이
// 프랜차이즈 같은 저가 채널의 quota를 자주 못 채워 관계가 떨어지는 것 아닌가.
function finalRel(seed, mode) {
  FF.reset(seed);
  if (mode === 'static') { FF.stepDay(FF.Cmd.stance(BALANCED)); while (!FF.isOver()) FF.stepDay(FF.Cmd.wait()); }
  else { while (!FF.isOver()) FF.stepDay(FF.Cmd.wait()); } // raw(null)
  return FF.relOf().slice();
}
console.log('\n=== 원인 확정: 30일 종료 시 채널별 관계 수준(rel, 0~3) ===');
const relRaw = [], relStatic = [];
for (let seed = 1; seed <= N_SEEDS; seed++) { relRaw.push(finalRel(seed, 'raw')); relStatic.push(finalRel(seed, 'static')); }
['online', 'fran', 'whole'].forEach((name, i) => {
  console.log(name.padEnd(8),
    'raw avg=' + avg(relRaw.map(r => r[i])).toFixed(2),
    'static([1,1,1]) avg=' + avg(relStatic.map(r => r[i])).toFixed(2));
});
