// 이슈 #21/#19: Stance 단독 효과(+1.23M, 이전 코멘트)를 분해한다. 관계 레벨은 실제로는
// 사용자가 가정한 가격/quota 두 채널이 아니라 R.rel에 세 채널이 있다(src-core.js:50):
//   price:[0.64,1,1.30,1.60]  cap:[1,1,1.4,1.8]  floor:[0,0.5,1,1.5]
// (레벨0→3이면 가격 2.5배, 유효capacity 1.8배, 보장quota 0→1.5배 - 세 배수가 곱으로 겹친다.)
// 각 채널을 R.rel에서 레벨1(기본) 값으로 고정해 중립화하고, 나머지만 살려서 기여도를 잰다.
//
// 그리고 사용자가 제기한 핵심 통제질문: "관계를 키운 것"과 "가혹한 하락규칙을 방어한 것"을
// 구분한다 - 완전 방치(stance 항상 1, 아무 개입 없음) 상태에서 365일 관계 궤적이 어떻게
// 움직이는지 먼저 본다. 궤적이 스스로 무너지면 방어는 성장이 아니라 필수유지보수에 가깝다.
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-fact.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const N_SEEDS = Number(process.argv[2] || 800);
const HORIZON = 365;
FF.C.days = HORIZON;
const ORIGINAL_REL = JSON.parse(JSON.stringify(FF.C.rel));

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function dailyNetWorth() { return FF.ledger().cash + FF.sumAmt(FF.arOf()) - FF.sumAmt(FF.apOf()); }

function setRel(neutralize) {
  FF.C.rel = JSON.parse(JSON.stringify(ORIGINAL_REL));
  const flatAt1 = arr => arr.map(() => arr[1]); // 레벨1(기본) 값으로 고정
  if (neutralize.price) FF.C.rel.price = flatAt1(ORIGINAL_REL.price);
  if (neutralize.cap) FF.C.rel.cap = flatAt1(ORIGINAL_REL.cap);
  if (neutralize.floor) FF.C.rel.floor = flatAt1(ORIGINAL_REL.floor);
}

function runSeed(seed, stanceActive) {
  FF.reset(seed);
  let prevRel = FF.relOf().slice();
  let pendingRaise = -1;
  const relTrace = [prevRel.slice()];
  for (let day = FF.run().day; day <= HORIZON; day++) {
    if (FF.isOver()) break;
    let cmd = FF.Cmd.wait();
    if (stanceActive && pendingRaise !== -1) {
      const stance = (FF.stanceOf() || FF.C.channels.map(() => FF.C.stance.start)).slice();
      if (stance[pendingRaise] < 3) { stance[pendingRaise]++; cmd = FF.Cmd.stance(stance); }
    }
    pendingRaise = -1;
    FF.stepDay(cmd);
    const curRel = FF.relOf();
    for (let i = 0; i < curRel.length; i++) if (curRel[i] < prevRel[i]) { pendingRaise = i; break; }
    prevRel = curRel.slice();
    relTrace.push(curRel.slice());
  }
  return { bust: FF.isBust(), nw: dailyNetWorth(), relTrace };
}

// (1) 완전 방치 궤적: stance 항상 기본값, 아무 개입도 안 한다(위 runSeed의 stanceActive=false와 동일 정책).
console.log('=== (1) 완전 방치 시 365일 관계 궤적 ===');
{
  const traces = [];
  for (let seed = 1; seed <= 300; seed++) {
    const r = runSeed(seed, false);
    if (r.bust) continue;
    traces.push(r.relTrace);
  }
  const checkpoints = [0, 30, 90, 180, 270, 365];
  for (const cp of checkpoints) {
    const vals = traces.filter(t => t.length > cp).map(t => avg(t[cp]));
    console.log(`  day${cp}: 채널평균 관계레벨 = ${avg(vals).toFixed(3)}`);
  }
}

// (2) 채널 분해: 전체 vs 각 채널 중립화.
console.log('\n=== (2) Stance 방어 효과의 채널별 분해(N=' + N_SEEDS + ') ===');
const CONFIGS = [
  { name: '전체(price+cap+floor 전부 살림)', neutralize: {} },
  { name: 'price만 중립화(cap+floor 효과)', neutralize: { price: true } },
  { name: 'cap만 중립화(price+floor 효과)', neutralize: { cap: true } },
  { name: 'floor만 중립화(price+cap 효과)', neutralize: { floor: true } },
  { name: 'price만 살림(price 단독 효과)', neutralize: { cap: true, floor: true } },
  { name: 'cap만 살림(cap 단독 효과)', neutralize: { price: true, floor: true } },
  { name: 'floor만 살림(floor 단독 효과)', neutralize: { price: true, cap: true } },
  { name: '전부 중립화(관계 효과 완전 제거 - 대조)', neutralize: { price: true, cap: true, floor: true } },
];

for (const cfg of CONFIGS) {
  setRel(cfg.neutralize);
  const diffs = [];
  let n = 0;
  for (let seed = 1; seed <= N_SEEDS; seed++) {
    const a = runSeed(seed, true);
    const c = runSeed(seed, false);
    if (a.bust || c.bust) continue;
    n++; diffs.push(a.nw - c.nw);
  }
  console.log(`  ${cfg.name}: n=${n} 평균쌍차=${avg(diffs).toFixed(0)} 양수비율=${(100 * diffs.filter(v => v > 0).length / n).toFixed(1)}%`);
}

FF.C.rel = ORIGINAL_REL;
FF.C.days = 30;
