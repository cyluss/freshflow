// 파생값 불변조건 상시 검증. UI 없이 헤드리스로, 여러 시드/정책 조합에서 돌린다.
// 목적은 화면 스크린샷으로 우연히 드러나는 것을 미리 잡는 것이다. 화면은 실험 도구가 아니다.
//   effectiveIntake <= production
//   effectiveIntake <= intakeCap + effectiveContract
//   sellable(pool 상한) <= stock + effectiveIntake, <= salesCap
//   expectedSale(Σ 배정) <= sellable, == 반올림 후 pool 이하
//   판로 배정 <= 주문, <= 판로 상한
//   bottleneck 이 loss 로 분류되면(intake/store/ship/stock) 실제로 놓친 물량이 있어야 한다
import fs from 'fs';

const stub = 'var FF={},FV={};';
const DOMAIN = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
  'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js'];
const src = stub + DOMAIN.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nreturn FF;';
const FF = new Function(src)();

const EPS = 1e-6;
let checked = 0, violations = 0;
const fail = (msg) => { violations++; console.log('VIOLATION', msg); };

const STANCE_SETS = [[1,1,1], [0,1,2], [3,1,0], [2,2,2], [1,3,1], [0,0,3], [3,3,3], [2,0,1], [0,2,3]];
const CONTRACTS = [0, 0.5, 1, 1.5];
const SEEDS = 200;
const DAYS = 30;

for (let seed = 1; seed <= SEEDS; seed++) {
  const contractX = CONTRACTS[seed % CONTRACTS.length];
  FF.reset(seed);
  FF.stepDay(contractX > 0 ? FF.Cmd.contract(contractX) : FF.Cmd.wait());

  for (let day = 2; day <= DAYS && !FF.isOver(); day++) {
    const levels = STANCE_SETS[(seed + day) % STANCE_SETS.length];

    // --- 계획 단계: 오늘 하루를 실행하기 전 미리보기 불변조건 ---
    FF.setStance(levels);
    const caps = FF.capsOf();
    const effC = FF.effectiveContract();
    const exp = FF.expectedIntake();
    checked++;
    // expectedIntake는 반올림값이라 정수 상한과 최대 0.5 차이가 날 수 있다(예: 20.5 -> 21).
    if (exp > caps.intake + effC + 0.5 + EPS)
      fail(`seed${seed} d${day}: expectedIntake ${exp} > capIntake+effectiveContract ${caps.intake + effC}`);

    const P = FF.stancePlan();
    const sellableCeil = P.inv + P.exp;
    if (P.pool > sellableCeil + EPS)
      fail(`seed${seed} d${day}: pool ${P.pool} > 재고+입고예상 ${sellableCeil}`);
    if (P.pool > caps.sales + EPS)
      fail(`seed${seed} d${day}: pool ${P.pool} > 판매한도 ${caps.sales}`);
    const allocSum = P.preview.reduce((a, b) => a + b, 0);
    if (Math.abs(allocSum - P.sum) > EPS)
      fail(`seed${seed} d${day}: preview 합 ${allocSum} != 보고된 sum ${P.sum}`);
    if (allocSum > P.pool + EPS)
      fail(`seed${seed} d${day}: 배정 합 ${allocSum} > 판매 가능 ${P.pool}`);
    P.preview.forEach((v, i) => {
      if (v > P.est[i] + EPS) fail(`seed${seed} d${day}: 배정[${i}] ${v} > 주문 ${P.est[i]}`);
      if (v > P.rows[i].cap + EPS) fail(`seed${seed} d${day}: 배정[${i}] ${v} > 판로상한 ${P.rows[i].cap}`);
    });

    // --- 실행: 하루 커밋 ---
    FF.stepDay(FF.Cmd.wait());
    const r = FF.today();
    checked++;

    // --- 사후 단계: 확정 결과 불변조건 ---
    if (r.acc > r.prod + EPS) fail(`seed${seed} d${day}: 실제입고 ${r.acc} > 생산 ${r.prod}`);
    const sumToCh = (r.toCh || []).reduce((a, b) => a + b, 0);
    if (Math.abs(sumToCh - r.sold) > EPS)
      fail(`seed${seed} d${day}: toCh 합 ${sumToCh} != sold ${r.sold}`);
    // 손실형 병목은 종류마다 손실이 실제로 잡히는 수치가 다르다.
    // intake/store는 입고 쪽 손실(wIcap/wIstore+wS)이고, ship/stock은 판매 쪽 손실(missed)이다.
    const LOSS_AMOUNT = { intake: r.wIcap, store: (r.wIstore || 0) + (r.wS || 0), ship: r.missed, stock: r.missed };
    if (r.b in LOSS_AMOUNT && LOSS_AMOUNT[r.b] <= EPS)
      fail(`seed${seed} d${day}: b=${r.b}(손실형)인데 해당 손실량=${LOSS_AMOUNT[r.b]}`);
  }
}

console.log(`검사 ${checked}건, 위반 ${violations}건 (시드 ${SEEDS} x 최대 ${DAYS}일)`);
process.exit(violations > 0 ? 1 : 0);
