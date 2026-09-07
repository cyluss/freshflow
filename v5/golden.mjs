// 과업 1: 골든 회귀 스위트
// 게임 규칙 리팩터링 전후로 결과가 같은지 검사한다.
// 화면이 아니라 도메인 출력만 본다. 잘못된 리팩터링도 렌더링은 되기 때문이다.
import fs from 'fs';
import { JSDOM } from 'jsdom';

const FILE = process.env.FILE || 'fresh-flow-v0.html';
const OUT  = process.env.OUT  || 'golden.json';
const MODE = process.argv[2] || 'check';   // record | check

const SEEDS = [1, 2, 777, 12345, 22209, 30699, 31236, 49616, 55555, 58207, 84206, 92582];
const PLANS = [
  {},                                   // 무투자
  { 4: 'sales' },
  { 6: 'contract', 9: 'sales' },
  { 13: 'sales' },
  { 2: 'contract', 8: 'sales', 16: 'sales' },
  { 3: 'sales', 5: 'sales' }
];
const FINISH = [0, 8, 20];               // 0 이면 끝까지

function boot() {
  const dom = new JSDOM(fs.readFileSync(FILE, 'utf8'),
    { runScripts: 'dangerously', url: 'http://x/#seed=1' });
  return dom.window;
}

const r1 = n => Math.round(n * 1e6) / 1e6;
// 내부 용어가 바뀌어도 골든은 같아야 한다. 정식 이름으로 맞춘다.
const KIND = k => (k === 'shipping' ? 'sales' : k);

function playOne(w, seed, plan, finishAt) {
  const FF = w.FF;
  const SALES='sales';
  plan = Object.fromEntries(Object.entries(plan)
    .map(([d, k]) => [d, k === 'shipping' ? SALES : k]));
  FF.reset(seed);
  const days = [];
  for (let d = 1; d <= FF.C.days; d++) {
    if (FF.isOver()) break;
    if (finishAt && d === finishAt) { FF.finishRun(); break }
    FF.stepDay(plan[d] ? (plan[d]==='contract' ? FF.Cmd.contract() : FF.Cmd.buy(plan[d])) : FF.Cmd.wait());
    const h = FF.histOf();
    const row = h[h.length - 1];
    if (row) days.push([row.day, r1(row.prod), r1(row.dem), r1(row.acc), r1(row.sold),
                        r1(row.end), r1(row.wI + row.wS + row.wT), r1(row.missed),
                        r1(row.profit), row.b]);
  }
  const L = FF.ledger(), P = FF.plant();
  const W0 = FF.world();
  return {
    tilt: W0 && W0.tilt ? [W0.tilt().supply, W0.tilt().demand] : null,
    cash: r1(L.cash), spent: L.spent, salvaged: L.salvaged,
    caps: [P.cap.intake, P.cap.storage, P.cap.sales],
    buys: [P.buys.sales, P.buys.contract || 0],
    finDay: FF.run().finDay,
    mods: FF.logOf().mods.map(m => [m.day, KIND(m.kind)]),
    events: FF.logOf().evlog.map(e => [e.day, e.b]),
    days,
    // 분석 출력
    hindsight: (h => ({ base: h.base, best: { i: h.best.i, s: h.best.s, v: h.best.v }, mine: h.mine }))(FF.hindsight()),
    missedOps: FF.missedOps().map(x => [x.day, KIND(x.kind), x.gain]),
    modContrib: FF.modContrib(),
    // 참조 구현과의 일치
    replayEq: Math.abs(FF.replayPlan(seed, plan) - L.cash) < 1e-6 || !!finishAt
  };
}

function collect() {
  const w = boot();
  const out = {};
  for (const seed of SEEDS)
    for (let p = 0; p < PLANS.length; p++)
      for (const f of FINISH)
        out[`${seed}|${p}|${f}`] = playOne(w, seed, PLANS[p], f);
  return out;
}

const got = collect();

if (MODE === 'record') {
  fs.writeFileSync(OUT, JSON.stringify(got));
  const n = Object.keys(got).length;
  console.log(`골든 기록: ${n}판, ${(fs.statSync(OUT).size / 1024).toFixed(0)}KB`);
  process.exit(0);
}

if (!fs.existsSync(OUT)) { console.log('골든 파일이 없다. record 로 먼저 만든다.'); process.exit(1) }
const want = JSON.parse(fs.readFileSync(OUT, 'utf8'));
let same = 0, diff = [];
for (const k of Object.keys(want)) {
  const a = JSON.stringify(want[k]), b = JSON.stringify(got[k]);
  if (a === b) same++; else diff.push(k);
}
const extra = Object.keys(got).filter(k => !(k in want));
if (diff.length || extra.length) {
  console.log(`골든 불일치 ${diff.length}건`);
  diff.slice(0, 3).forEach(k => {
    const a = want[k], b = got[k];
    for (const f of Object.keys(a))
      if (JSON.stringify(a[f]) !== JSON.stringify(b[f]))
        console.log(`  ${k} ${f}: ${JSON.stringify(a[f]).slice(0,70)} → ${JSON.stringify(b[f]).slice(0,70)}`);
  });
  process.exit(1);
}
console.log(`골든 일치: ${same}판`);
