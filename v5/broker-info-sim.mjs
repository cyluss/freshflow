// 이슈 #13 1단계: 유통업 관계자 정보(공급/수요 forecast 해상도 개선)의 가격 0 가치 측정.
// 자유(무료) forecast와 유료 forecast는 같은 FF.hor 분포를 다른 noise로 흐린 것뿐이다 - 미래
// actual이나 hidden 상태를 직접 공개하지 않는다(#13 원칙). 공급/수요를 독립 축으로 다뤄
// off/off, on/off, off/on, on/on 2x2를 만든다. 정책은 두 조건에서 완전히 같고(같은 사전선언
// 문턱표), 입력(noise)만 다르다 - 정보 자체의 가치만 분리해서 재려는 것이다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 500);
// 사전 선언. free는 게임 기본 noise(0.35) 그대로다. info는 그보다 뚜렷이 낮췄지만 0은 아니다
// (0으로 가면 관계자 정보가 사실상 actual 공개가 된다 - #13이 금지한 실패 조건이다).
const FREE_NOISE = FF.C.noise;
const INFO_NOISE = 0.10;
const HOR_A = 1, HOR_B = 7; // 결정 시점부터 1~7일 지평. 커널 자신의 need 계산과 같은 폭이다.
const EPS = 1; // 정보 가치 "0" 판정 허용오차(원)

// 스타일은 판로 태도(stance)만 바꾼다. cover는 이 실험의 관측 대상이라 스타일이 손대지 않는다.
const STYLES = {
  '기본': null,
  '프랜차이즈우선': [1, 2, 1],
  '도매우선': [1, 1, 2],
};

// argmax(가장 확률 높은 구간)는 blur의 아핀 변환(o=v*(1-noise)+noise/3) 아래서 순서가 절대
// 안 바뀐다 - noise를 아무리 낮춰도 "어느 구간이 1등인가"는 그대로다. 그래서 이 실험은 실제
// 공개 forecast가 쓰는 FF.outlookVerdict(절대 확률 50%가 기준선인 신뢰도 등급)를 그대로
// 재사용한다. blur가 확률을 1/3 쪽으로 당기면 50% 문턱을 못 넘어 "similar"에 머물 수 있고,
// noise가 낮아지면 같은 실제 국면에서 문턱을 넘어 "high/low"로 승격될 수 있다 - 이게 진짜
// 해상도 효과다.
const VSCORE = { low: -2, mostlyLow: -1, similar: 0, mostlyHigh: 1, high: 2 };
// 사전 선언. netSignal = 수요점수 - 공급점수(수요강세+공급약세일수록 커진다).
function coverFromSignal(net) {
  if (net >= 2) return 2;
  if (net <= -2) return 1;
  return 1.5;
}

function blurWith(v, noise) {
  const o = v.map(x => x * (1 - noise) + noise / 3);
  const s = o[0] + o[1] + o[2];
  return o.map(x => x / s);
}
function verdictScore(v) {
  return VSCORE[FF.outlookVerdict(FF.pct(v))];
}

function runCond(seed, stance, supplyNoise, demandNoise) {
  FF.reset(seed);
  let startDay = FF.run().day;
  if (stance) { FF.stepDay(FF.Cmd.stance(stance)); startDay = FF.run().day; }
  let switches = 0, lastCover = FF.coverOf();
  const decisions = [];
  for (let day = startDay; day <= FF.C.days; day++) {
    if (FF.isOver()) break;
    const M = FF.marketOf(), T = FF.tiltOf();
    const supV = blurWith(FF.hor(M.si, HOR_A, HOR_B, FF.C, T.supply), supplyNoise);
    const demV = blurWith(FF.hor(M.di, HOR_A, HOR_B, FF.C, T.demand), demandNoise);
    const net = verdictScore(demV) - verdictScore(supV);
    const cover = coverFromSignal(net);
    decisions.push(cover);
    if (cover !== lastCover) { switches++; lastCover = cover; }
    FF.stepDay(FF.Cmd.policy(cover));
  }
  return { netWorth: FF.netWorth(FF.toKernelState()), switches, bust: FF.isBust(), decisions };
}

function runStatic(seed, stance) {
  FF.reset(seed);
  if (stance) FF.stepDay(FF.Cmd.stance(stance));
  while (!FF.isOver()) FF.stepDay(FF.Cmd.wait()); // cover는 기본값(1.5)에 그대로 둔다
  return { netWorth: FF.netWorth(FF.toKernelState()), bust: FF.isBust() };
}

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function pct(a, p) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length * p)]; }

const COND = {
  'off_off': [FREE_NOISE, FREE_NOISE],
  'on_off': [INFO_NOISE, FREE_NOISE],
  'off_on': [FREE_NOISE, INFO_NOISE],
  'on_on': [INFO_NOISE, INFO_NOISE],
};

for (const [styleName, stance] of Object.entries(STYLES)) {
  console.log(`\n=== 스타일: ${styleName} (n=${N_SEEDS}, free noise=${FREE_NOISE}, info noise=${INFO_NOISE}) ===`);
  const staticRows = [];
  for (let seed = 1; seed <= N_SEEDS; seed++) staticRows.push(runStatic(seed, stance));
  console.log('static(cover고정1.5) netWorth avg=' + avg(staticRows.map(r => r.netWorth)).toFixed(0),
    'median=' + pct(staticRows.map(r => r.netWorth), 0.5).toFixed(0),
    'bust=' + (100 * staticRows.filter(r => r.bust).length / staticRows.length).toFixed(1) + '%');
  const bySeed = {};
  for (const [condName, [sN, dN]] of Object.entries(COND)) {
    const rows = [];
    for (let seed = 1; seed <= N_SEEDS; seed++) {
      const r = runCond(seed, stance, sN, dN);
      rows.push(r);
      (bySeed[seed] = bySeed[seed] || {})[condName] = r;
    }
    console.log(condName.padEnd(8),
      'netWorth avg=' + avg(rows.map(r => r.netWorth)).toFixed(0),
      'median=' + pct(rows.map(r => r.netWorth), 0.5).toFixed(0),
      'cover전환 평균=' + avg(rows.map(r => r.switches)).toFixed(2),
      'bust=' + (100 * rows.filter(r => r.bust).length / rows.length).toFixed(1) + '%');
  }

  // 정보 가치 = 해당 조건 netWorth - off_off netWorth (같은 시드끼리 비교)
  const dSupplyOnly = [], dDemandOnly = [], dBoth = [];
  const decisionChangedSupply = [], decisionChangedDemand = [], decisionChangedBoth = [];
  for (let seed = 1; seed <= N_SEEDS; seed++) {
    const b = bySeed[seed];
    dSupplyOnly.push(b.on_off.netWorth - b.off_off.netWorth);
    dDemandOnly.push(b.off_on.netWorth - b.off_off.netWorth);
    dBoth.push(b.on_on.netWorth - b.off_off.netWorth);
    let chS = 0, chD = 0, chB = 0;
    for (let i = 0; i < b.off_off.decisions.length; i++) {
      if (b.on_off.decisions[i] !== b.off_off.decisions[i]) chS++;
      if (b.off_on.decisions[i] !== b.off_off.decisions[i]) chD++;
      if (b.on_on.decisions[i] !== b.off_off.decisions[i]) chB++;
    }
    decisionChangedSupply.push(chS); decisionChangedDemand.push(chD); decisionChangedBoth.push(chB);
  }
  const zeroRatio = (arr) => 100 * arr.filter(x => Math.abs(x) < EPS).length / arr.length;
  console.log('-- 1단계: 정보가치(같은 시드, off_off 대비 netWorth 차이) --');
  console.log('공급정보 단독: avg=' + avg(dSupplyOnly).toFixed(0), 'median=' + pct(dSupplyOnly, 0.5).toFixed(0),
    'p10=' + pct(dSupplyOnly, 0.1).toFixed(0), 'p90=' + pct(dSupplyOnly, 0.9).toFixed(0),
    '가치0비율=' + zeroRatio(dSupplyOnly).toFixed(1) + '%',
    '결정변경일수 평균=' + avg(decisionChangedSupply).toFixed(2));
  console.log('수요정보 단독: avg=' + avg(dDemandOnly).toFixed(0), 'median=' + pct(dDemandOnly, 0.5).toFixed(0),
    'p10=' + pct(dDemandOnly, 0.1).toFixed(0), 'p90=' + pct(dDemandOnly, 0.9).toFixed(0),
    '가치0비율=' + zeroRatio(dDemandOnly).toFixed(1) + '%',
    '결정변경일수 평균=' + avg(decisionChangedDemand).toFixed(2));
  console.log('둘다:      avg=' + avg(dBoth).toFixed(0), 'median=' + pct(dBoth, 0.5).toFixed(0),
    'p10=' + pct(dBoth, 0.1).toFixed(0), 'p90=' + pct(dBoth, 0.9).toFixed(0),
    '가치0비율=' + zeroRatio(dBoth).toFixed(1) + '%',
    '결정변경일수 평균=' + avg(decisionChangedBoth).toFixed(2));

  console.log('-- 2단계: 결합가치(Value(S+D) vs Value(S)+Value(D)) --');
  console.log('Value(both) avg=' + avg(dBoth).toFixed(0),
    'Value(supply)+Value(demand)=' + (avg(dSupplyOnly) + avg(dDemandOnly)).toFixed(0),
    '차이(interaction)=' + (avg(dBoth) - avg(dSupplyOnly) - avg(dDemandOnly)).toFixed(0));
}
