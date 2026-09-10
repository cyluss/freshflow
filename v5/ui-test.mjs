// UI 회귀 검증: 존재해야 하는 것은 단언한다
import fs from 'fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const FILE = 'fresh-flow-v0.html';
const REF  = '/home/claude/v4/fresh-flow-v0.html';
const tick = () => new Promise(r => setTimeout(r, 0));
let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log('FAIL', name) } };

function open(file, seed) {
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => errs.push(e.message.split('\n')[0]));
  const dom = new JSDOM(fs.readFileSync(file, 'utf8'),
    { runScripts: 'dangerously', url: 'http://x/#seed=' + seed, virtualConsole: vc });
  const d = dom.window.document;
  return { w: dom.window, d, q: id => d.getElementById(id), errs };
}

// 1. 첫 화면
{
  const { q, d, errs } = open(FILE, 31236);
  t('첫날 진행 버튼', q('kgo') && q('kgo').textContent === '첫날 운영');
  t('첫날 안내 있음', !!q('kexplore'));
  t('첫날 계약 선택', !!q('kopening') && !!q('kbc0') && !!q('kbc3') && !q('kbs'));
  t('첫날 예보표 없음', !q('kchart'));
  t('첫날 flow 있음', !!q('kchain'));
  t('첫날 dock 있음', !!d.querySelector('.dock'));
  t('첫날 전망', !!q('koutlook'));
  {
    const spans = [...q('koutlook').querySelectorAll('.ospan')];
    t('전망 여섯 구간', spans.length === 6, spans.length + '개');
    t('구간마다 막대 셋', spans.every(x => x.querySelectorAll('.ob').length === 3));
    const pcts = [...spans[0].querySelectorAll('.ob-pct')].map(x => parseInt(x.textContent));
    t('합이 100', pcts.reduce((a, b) => a + b, 0) === 100, pcts.join('+'));
    t('표시는 5% 단위', pcts.every(v => v % 5 === 0), pcts.join('/'));
    t('구간마다 판정 한 줄', spans.every(x => x.querySelector('.ospan-verdict').textContent.length > 3));
    t('생산과 수요 둘', q('koutlook').textContent.includes('생산') && q('koutlook').textContent.includes('수요'));
    t('구간은 실제 day 범위로 표시', spans.every(x => /^\d+~\d+일$/.test(x.querySelector('.ospan-days').textContent)));
  }
  t('로드 오류 없음', errs.length === 0);
}

// 1b. 병목 라벨은 실제 손실이 있을 때만 "막힌 곳"이다
{
  const s0 = open(FILE, 31236);
  s0.q('kbc0').click(); await tick();
  s0.q('kgo').click(); await tick();
  t('isLossCause 분류', s0.w.FF.isLossCause('ship') && s0.w.FF.isLossCause('stock') &&
    s0.w.FF.isLossCause('intake') && s0.w.FF.isLossCause('store') &&
    !s0.w.FF.isLossCause('demand') && !s0.w.FF.isLossCause('supply') && !s0.w.FF.isLossCause('policy'));
  const today = s0.w.FF.today();
  const lost = s0.w.FF.isLossCause(today.b);
  const label = s0.q('kbn').querySelector('span').textContent;
  t('병목 라벨은 손실 여부와 일치', label === today.day + '일차 ' + (lost ? '막힌 곳' : '상태'));
  const bnTxt = s0.q('kbn').textContent;
  t('실제 입고 값이 정확히 일치', bnTxt.includes('실제 입고 ' + s0.w.FF.fInt(today.acc) + 't'));
  t('생산 값이 정확히 일치', bnTxt.includes('생산 ' + s0.w.FF.fInt(today.prod) + 't'));
  const revTotal = Math.round((today.revCh || []).reduce((a, b) => a + b, 0));
  t('판매/주문 총계가 정확히 일치', bnTxt.includes(
    '판매 ' + s0.w.FF.fInt(today.sold) + 't / 주문 ' + s0.w.FF.fInt(today.dem) + 't'));
  t('매출 총계가 정확히 일치', bnTxt.includes('매출 ' + s0.w.mo(revTotal) + '원'));

  // 판로별 상세는 어제 결과 안의 펼치기로 접혀 있다가, 펼치면 예전 dayresult와 같은 내용을 보인다
  const foldHead = s0.d.querySelector('[data-fold="dayresult"]');
  t('판로별 상세 펼치기 존재', !!foldHead);
  t('접힌 상태에서는 목록 없음', !s0.q('kdayresult'));
  foldHead.click(); await tick();
  const dr = [...s0.q('kdayresult').querySelectorAll('.dr-row')];
  const want = s0.w.FF.dayChannelResult();
  t('펼치면 판로 수만큼 행이 보인다', dr.length === want.length);
  t('행 내용이 dayChannelResult와 일치', dr.every((el, i) =>
    el.textContent.includes(s0.w.FF.fInt(want[i].sold) + 't') &&
    el.textContent.includes(s0.w.mo(want[i].revenue))));
  foldHead.click(); await tick();
  t('다시 접으면 목록이 사라진다', !s0.q('kdayresult'));

  t('상세 운영 탭에는 어제 흐름 탭이 없다',
    [...s0.d.querySelectorAll('.tabs a')].every(a => a.textContent !== '어제 흐름'));
}

// 2. 배분 막대는 진행 중 항상 보인다
{
  const s = open(FILE, 31236);
  s.q('kbc0').click(); await tick();
  let always = true;
  for (let i = 0; i < 12; i++) {
    s.q('kgo').click(); await tick();
    if (s.q('kgo') && !s.q('kchan')) { always = false; break }
  }
  t('배분 막대 상시 노출', always);
  t('옛 구매 카드 제거', !s.q('kacts') && !s.q('kbw'));
  {
   const hit = s.w.FF.capHits('sales', 5);
   const shortfall = s.w.FF.stancePlan().missed.some(m => m >= 1);
   t('판매 한도 버튼은 신호와 일치', !!s.q('kbs') === (hit.n > 0 || hit.last || shortfall));
  }
  t('설비 관리 버튼 없음', !s.q('kopen'));
  t('매입 목표 제거', !s.q('kpolicy'));
  t('비교 근거 없음', !s.q('kcmp'));

  const s1b = open(FILE, 84206);
  s1b.q('kbc0').click(); await tick();
  s1b.q('kgo').click(); await tick();
  t('배분은 본문에 있다', !!s1b.q('kchan') && !s1b.d.querySelector('.dock #kchan'));
  t('시계는 dock 안', !!s1b.d.querySelector('.dock #kclock'));
  const dockIds = [...s1b.d.querySelector('.dock').children].map(c => c.id).filter(Boolean);
  t('dock 구성은 시계·진행·종료', dockIds.join() === 'kclock,kgo,kfin');
  t('진행 버튼은 하루', s1b.q('kgo').textContent === '하루 넘기기');
}

// 2b. 이슈 #32: 증설 버튼에 회수 판단 근거(payback/overRun)가 보인다
{
  const s = open(FILE, 76562);
  s.q('kbc0').click(); await tick();
  let n = 0;
  while (s.q('kgo') && !s.w.FF.isOver() && s.w.FF.run().day < s.w.FF.C.days && n < s.w.FF.C.days + 10) {
    s.q('kgo').click(); await tick(); n++;
  }
  t('게임 마지막 날 도달', s.w.FF.run().day === s.w.FF.C.days && !s.w.FF.isOver());
  const bp = s.q('kbp');
  t('마지막 날 조달 능력 버튼 존재', !!bp);
  const note = bp.querySelector('.opt-note');
  const opt = s.w.FF.optionOf('procure');
  t('회수 근거 노출', !!note && note.textContent === s.w.FV.paybackNote(opt));
  t('overRun이면 경고색', opt.overRun === true && note.style.color === 'var(--text-warning)');
}

// 3. 선택과 해제가 대기열에 반영된다
{
  const s = open(FILE, 31236);
  // 첫날은 계약 여부만 고른다
  t('선택지 넷', [0,1,2,3].every(i => !!s.q('kbc' + i)));
  t('첫날 판매 한도 버튼 없음', !s.q('kbs'));
  s.q('kbc2').click(); await tick();
  t('선택 후 대기열 1', s.w.FF.queueOf().length === 1 && s.w.FF.queueOf()[0].size === 2);
  s.q('kbc3').click(); await tick();
  t('다른 크기로 교체', s.w.FF.queueOf().length === 1 && s.w.FF.queueOf()[0].size === 3);
  s.q('kbc0').click(); await tick();
  t('노출 없음 선택', s.w.FF.queueOf().length === 0);

  // 진행 중에는 판매만 고른다
  s.q('kgo').click(); await tick();
  t('진행 중 선택지 없음', !s.q('kbc0'));
  t('진행 중 대기열은 비어 있다', s.w.FF.queueOf().length === 0);
}

// 4. 운영 종료는 2단계다
{
  const s = open(FILE, 31236);
  s.q('kgo').click(); await tick();
  t('종료 버튼 존재', !!s.q('kfin'));
  const day = s.q('kd').textContent;
  s.q('kfin').click(); await tick();
  t('1클릭은 무장만', s.q('kd').textContent === day);
  t('무장 문구', s.q('kfin').textContent.includes(s.w.FF.C.days + '일까지 운영'));
  s.q('kfin').click(); await tick();
  t('2클릭에 종료', s.q('kd').textContent === String(s.w.FF.C.days));
}

// 5. 종료 화면의 접이식은 여섯 개이고 실제로 펼쳐진다
{
  const s = open(FILE, 30699);
  let n = 0;
  while (s.q('kgo') && !(s.q('klabel') && s.q('klabel').textContent.includes('운영 종료')) && n < s.w.FF.C.days + 10) {
    if (+s.q('kd').textContent === 5) { s.w.FF.toggleBuy('sales'); await tick() }
    s.q('kgo').click(); await tick(); n++;
  }
  t('결과 카드 존재', !!s.q('kbrief'));
  const folds = s.d.querySelectorAll('[data-fold]');
  t('접이식 다섯 개', folds.length === 5);
  t('접이식 초기 접힘', [...folds].every(e => e.parentElement.open === false));
  const foldOf = k => s.d.querySelector('[data-fold="' + k + '"]').parentElement;
  for (const k of ['perf', 'ops', 'mods', 'miss', 'log']) {
    const e = s.d.querySelector('[data-fold="' + k + '"]');
    t('fold ' + k + ' 존재', !!e);
    t('fold ' + k + ' 접힘', foldOf(k).open === false && !foldOf(k).querySelector('.fold-body'));
    e.click(); await tick();
    t('fold ' + k + ' 펼침', foldOf(k).open === true && !!foldOf(k).querySelector('.fold-body'));
    t('fold ' + k + ' 열림 표시', foldOf(k).hasAttribute('open'));
  }
  const after = s.q('kbrief').textContent;
  t('운영 결과 내용', after.includes('최종 재고'));
  t('투자 분석 내용', after.includes('추가 용량'));
  t('기회 분석 내용', after.includes('그날 하나를 더 샀을 때의 현금 차이'));
  t('전체 기록 내용', after.includes('진행 기록'));
  t('관계 포트폴리오 내용', after.includes('온라인') && after.includes('프랜차이즈') && after.includes('도매'));
  // 이슈 #31: 관계 포트폴리오 스파크라인은 게임 길이(FF.C.days)만큼 입력이 들어와도
  // 렌더 폭이 SPARK_MAX로 고정돼야 한다 - 안 그러면 이어붙은 문자열이 줄바꿈 없이
  // 뷰포트 폭을 밀어낸다(365일 종료 화면에서 실측된 레이아웃 붕괴).
  {
    const bars = [...s.q('kbrief').querySelectorAll('.spark-bars')];
    t('스파크라인 존재', bars.length === 3);
    t('스파크라인 폭이 SPARK_MAX로 고정', bars.every(b => b.textContent.length <= s.w.FV.SPARK_MAX),
      bars.map(b => b.textContent.length).join(','));
  }
  // 기회 분석 표가 데이터와 같은 수의 행을 낸다
  {
    const body = s.d.querySelector('[data-fold="miss"]').nextElementSibling;
    const rows = [...body.querySelectorAll('div')]
      .filter(x => (x.style.gridTemplateColumns || '').includes('14%'));
    const M = s.w.FF.missedMatrix();
    t('기회 표 행 수', rows.length === M.rows.length + 1, rows.length + ' vs ' + (M.rows.length + 1));
    t('열은 일 + 판매', rows[0].children.length === 2);
    const best = Math.max(...s.w.FF.missedOps().map(x => x.gain));
    t('최고값 표시', body.textContent.includes(best.toLocaleString('ko-KR')));
    t('정상 차분은 점', body.textContent.includes('·'));
  }
  const cp = s.d.querySelector('#kcopy');
  t('복사 버튼 존재', !!cp);
  cp.click(); await tick();
  t('복사 반응', s.d.querySelector('#kcopy').textContent.startsWith('복사됨'));
  t('플레이 중 오류 없음', s.errs.length === 0);
}

// 7. 로그와 복사가 vnode 로 동작한다
{
  const s3 = open(FILE, 30699);
  let n = 0;
  while (s3.q('kgo') && !(s3.q('klabel') && s3.q('klabel').textContent.includes('운영 종료')) && n < s3.w.FF.C.days + 10) {
    if (+s3.q('kd').textContent === 5) { s3.w.FF.toggleBuy('sales'); await tick() }
    s3.q('kgo').click(); await tick(); n++;
  }
  s3.d.querySelector('[data-fold="log"]').click(); await tick();
  const grid8 = [...s3.q('kbrief').querySelectorAll('div')]
    .filter(x => (x.style.gridTemplateColumns || '').includes('repeat(8'));
  const daily = grid8.filter(x => x.style.gap === '2px');
  const buys  = grid8.filter(x => x.style.gap === '4px');
  t('일별표 헤더+행', daily.length === 7);
  t('증설표 헤더+행', buys.length === 2);
  const cp = s3.d.querySelector('#kcopy');
  t('복사 버튼 vnode', !!cp);
  cp.click(); await tick();
  t('복사 후 문구', s3.d.querySelector('#kcopy').textContent.startsWith('복사됨'));
  t('덤프 채워짐', (s3.d.querySelector('#kdump').value || '').startsWith('seed'));
  t('증설 기록 존재', s3.q('kbrief').textContent.includes('증설 기록'));
  t('로그 오류 없음', s3.errs.length === 0);
}


// 9. 종료 그래프
{
  const s5 = open(FILE, 30699);
  let n = 0;
  while (s5.q('kgo') && !(s5.q('klabel') && s5.q('klabel').textContent.includes('운영 종료')) && n < s5.w.FF.C.days + 10) {
    if (+s5.q('kd').textContent === 5) { s5.w.FF.toggleBuy('sales'); await tick() }
    s5.q('kgo').click(); await tick(); n++;
  }
  const svg = s5.q('kchart').querySelector('svg');
  t('그래프 svg 존재', !!svg);
  t('생산/판매 선 둘', svg.querySelectorAll('polyline').length === 2);
  t('재고 막대는 게임 일수만큼', svg.querySelectorAll('rect[opacity="0.5"]').length === s5.w.FF.C.days);
  t('사건 원 존재', svg.querySelectorAll('circle').length > 0);
  t('증설 마름모', svg.querySelectorAll('rect[transform]').length === 1);
  t('기여 라벨', svg.querySelectorAll('text').length === 1);
  t('범례 문구', s5.q('kchart').textContent.includes('생산'));
  t('그래프 오류 없음', s5.errs.length === 0);
}


// 10. 예보표: 지난 상태 표는 뺐다. 앞으로의 생산/수요 전망만 남는다.
{
  const s6 = open(FILE, 31236);
  for (let i = 0; i < 4; i++) { s6.q('kgo').click(); await tick() }
  const chart = s6.q('kchart');
  t('예보표 존재', !!chart);
  const lines = [...chart.querySelectorAll('div')].filter(x => x.style.display === 'flex');
  t('행 둘(생산/수요)', lines.length === 2);
  const names = lines.map(x => x.firstElementChild.textContent);
  t('행 이름', names.join() === '생산,수요');
  t('앞으로 표시', chart.textContent.includes('앞으로'));
  t('지난 상태 표 없음', !chart.textContent.includes('입고') && !chart.textContent.includes('창고'));
  t('예보표 오류 없음', s6.errs.length === 0);
}


// 11. 캐러셀은 CSS 만으로 동작한다
{
  const s7 = open(FILE, 58207);
  for (let i = 0; i < 3; i++) { s7.q('kgo').click(); await tick() }
  const panes = [...s7.d.querySelectorAll('.pane')];
  t('페이지 셋', panes.length === 3);
  t('페이지 id', panes.map(p => p.id).join() === 'p0,p1,p2');
  const links = [...s7.d.querySelectorAll('.tabs a')];
  t('탭이 앵커 링크', links.length === 3 && links.every((a, i) => a.getAttribute('href') === '#p' + i));
  t('첫 번째 면은 사건 이력', links[0].textContent === '사건 이력');
  t('두 번째 면은 전망', links[1].textContent === '전망');
  t('세 번째 면은 상세 운영', links[2].textContent === '상세 운영');
  t('두 번째 면 내용', /\d+~\d+일 전망/.test(s7.d.getElementById('p1').textContent));
  t('세 번째 면에 흐름도', !!s7.d.getElementById('p2').querySelector('#kchain'));
  t('첫 면에는 흐름도 없음', !s7.d.getElementById('p0').querySelector('#kchain'));
  const pager = s7.d.querySelector('.pager');
  t('스크롤 핸들러 없음', !pager.onscroll);
  t('캐러셀 상태 변수 없음', s7.w.FF.PANE === undefined && s7.w.FF.goPane === undefined);
  t('캐러셀 오류 없음', s7.errs.length === 0);
}


// 12. 결과 카드는 label / value / context 세 칸으로만 쓴다
{
  const s8 = open(FILE, 92582);
  let m = 0;
  while (s8.q('kgo') && m < 60) {
    if (+s8.q('kd').textContent >= 2 && s8.q('kfin')) {
      s8.q('kfin').click(); await tick(); s8.q('kfin').click(); await tick(); break;
    }
    s8.q('kgo').click(); await tick(); m++;
  }
  s8.d.querySelector('[data-fold="perf"]').click(); await tick();
  const rows = [...s8.q('kbrief').querySelectorAll('.stat-row')];
  t('요약 줄이 있다', rows.length >= 6, rows.length + '줄');
  t('요약이 전부 3칸', rows.every(r => r.children.length === 3));
  const txt = s8.q('kbrief').textContent;
  t('유효 구간 또는 없음', txt.includes('유효 구간') || txt.includes('놓친 최대 기회'));
  t('설명 문장 없음', !txt.includes('아무 날에 하나를 더 샀어도'));
  t('보고서 제목', txt.includes(s8.w.FF.C.days + '일 운영 결과'));
}


// 14. 쓰이는 클래스는 모두 정의되어 있다
{
  const s10 = open(FILE, 30699);
  let m = 0;
  while (s10.q('kgo') && !(s10.q('klabel') && s10.q('klabel').textContent.includes('운영 종료')) && m < s10.w.FF.C.days + 10) {
    s10.q('kgo').click(); await tick(); m++;
  }
  const css = [...s10.d.querySelectorAll('style')].map(x => x.textContent).join('\n');
  const used = new Set();
  s10.d.querySelectorAll('[class]').forEach(el =>
    String(el.getAttribute('class')).split(/\s+/).forEach(c => c && used.add(c)));
  const missing = [...used].filter(c => !css.includes('.' + c));
  t('정의되지 않은 클래스 없음', missing.length === 0, missing.join(', '));
}


// 14. 쓰이는 클래스는 모두 스타일이 있다
{
  const s10 = open(FILE, 30699);
  let n = 0;
  while (s10.q('kgo') && !(s10.q('klabel') && s10.q('klabel').textContent.includes('운영 종료')) && n < s10.w.FF.C.days + 10) {
    if (n === 4) { s10.w.FF.toggleBuy('sales'); await tick() }
    s10.q('kgo').click(); await tick(); n++;
  }
  for (const k of ['ops','mods','miss','log']) {
    const el = s10.d.querySelector('[data-fold="' + k + '"]');
    if (el) { el.click(); await tick() }
  }
  const css = [...s10.d.styleSheets].flatMap(sh => [...sh.cssRules].map(r => r.selectorText || ''))
    .join(' ');
  const used = new Set();
  s10.d.querySelectorAll('[class]').forEach(el =>
    String(el.className).split(/\s+/).forEach(c => c && used.add(c)));
  const missing = [...used].filter(c => !css.includes('.' + c));
  t('정의되지 않은 클래스 없음', missing.length === 0, missing.join(', '));
}


// 15. 구매 버튼은 바뀌는 한도를 말한다
{
  const s11 = open(FILE, 84206);
  const bi = s11.q('kbc3').textContent;
  t('선택지 표기', bi.includes('+3t'));
  t('선택지 설명', bi.includes('한도 넘는 날'));
  s11.q('kbc0').click(); await tick();
  let n = 0;
  while (n < 20) { s11.q('kgo').click(); await tick(); n++; if (s11.q('kchan')) break }
  t('배분 막대 등장', !!s11.q('kchan'));

  // 흐름 화면과 같은 말을 쓴다
  const flow = s11.q('kchain').textContent;
  t('흐름도 판매 표기', flow.includes('판매') && !flow.includes('출하'));
  t('흐름도 하루 한도', flow.includes('하루 한도 40t') && flow.includes('하루 한도 42t'));

  t('둘째 날부터 선택지 없음', !s11.q('kbc0') && !s11.q('kopening'));
}

// 15b. 계약이 활성화되면(어제 사서 오늘부터) 판매 가능/입고 예상 미리보기에도 반영된다
{
  const s12b = open(FILE, 7);
  s12b.q('kbc3').click(); await tick(); // +3(내부단위) 계약
  t('첫날은 계약이 아직 안 걸린다', s12b.w.FF.effectiveContract() === 0);
  s12b.q('kgo').click(); await tick(); // 1일차 실행 -> 2일차: 계약이 오늘부터 유효
  t('둘째 날부터 계약이 유효', s12b.w.FF.effectiveContract() === 3);
  const caps = s12b.w.FF.capsOf();
  const expected = Math.round(Math.min(s12b.w.FF.prodOf(), caps.intake + 3));
  t('확정 입고가 기본 한도+계약을 반영', s12b.w.FF.todayIntake() === expected);
}

// 15c. 초과분 계약이 발동하면 그날 알려주고, 종료 후 누적 효과를 보여준다
{
  const s12 = open(FILE, 7);
  s12.q('kbc3').click(); await tick(); // +3(내부단위) 계약
  let n = 0, sawBoost = false, boostTxtChecked = false;
  while (!s12.w.FF.isOver() && n < s12.w.FF.C.days + 10) {
    s12.q('kgo').click(); await tick(); n++;
    const boostEl = s12.q('kcontractboost');
    if (boostEl) {
      sawBoost = true;
      if (!boostTxtChecked) {
        boostTxtChecked = true;
        const boost = s12.w.FF.contractBoostToday();
        t('계약 발동 문구 값이 정확히 일치',
          boostEl.textContent === '계약 발동 · 초과분 매입계약으로 ' + boost + 't 추가 입고');
      }
    }
  }
  t('계약 발동 시 콜아웃이 뜬 적 있다', sawBoost);
  const stats = s12.w.FF.contractStats();
  t('종료 후 계약 통계 존재', !!stats && stats.size === 3);
  const perfFold = s12.d.querySelector('[data-fold="perf"]');
  perfFold.click(); await tick();
  const perfTxt = s12.q('kbrief').textContent;
  t('종료 화면에 초과분 계약 통계', perfTxt.includes('초과분 계약') && perfTxt.includes('발동') && /추가 입고 [\d.]+t/.test(perfTxt));
  t('계약 기여 문구', perfTxt.includes('계약 기여'));
  t('오류 없음', s12.errs.length === 0);
}


// 16. 화면에 내부 코드값이 새지 않는다
{
  const CODES = ['sales','sales','storage','manual','event','early','mid','late',
                 'high','low','weak','strong','free','near','full','ship','stock','contract'];
  const s12 = open(FILE, 30699);
  let n = 0;
  while (s12.q('kgo') && !(s12.q('klabel') && s12.q('klabel').textContent.includes('운영 종료')) && n < s12.w.FF.C.days + 10) {
    if (s12.q('kbc2')) { s12.q('kbc2').click(); await tick() }
    s12.q('kgo').click(); await tick(); n++;
  }
  for (const k of ['ops','mods','miss','log']) {
    const el = s12.d.querySelector('[data-fold="' + k + '"]');
    if (el) { el.click(); await tick() }
  }
  const txt = s12.d.getElementById('app').textContent;
  const leaked = CODES.filter(c => new RegExp('\\b' + c + '\\b').test(txt));
  t('코드값 누수 없음', leaked.length === 0, leaked.join(', '));

  // 복사 기록도 마찬가지다
  s12.d.querySelector('#kcopy').click(); await tick();
  const dump = s12.d.querySelector('#kdump').value;
  t('복사 기록 코드값 없음', !CODES.some(c => new RegExp('\\b' + c + '\\b').test(dump)));
  t('복사 기록 판매 표기', dump.includes('판매') && !dump.includes('출하'));
}


// 17. 진단과 전망은 사람 말로 쓴다
{
  const JARGON = ['유출 제약','유입 제약','한도에 닿','제약:','목표재고','확률분포','병목',
                  '전망격차','반복제약','사용가능','%p','쪽 +','쪽 -'];
  const s13 = open(FILE, 30699);
  let seen = [];
  let n = 0;
  while (s13.q('kgo') && !(s13.q('klabel') && s13.q('klabel').textContent.includes('운영 종료')) && n < s13.w.FF.C.days + 10) {
    if (s13.q('kbc2')) { s13.q('kbc2').click(); await tick() }
    
    s13.q('kgo').click(); await tick(); n++;
    const txt = s13.d.getElementById('app').textContent;
    JARGON.forEach(j => { if (txt.includes(j) && !seen.includes(j)) seen.push(j) });
  }
  for (const k of ['ops','mods','miss','log']) {
    const el = s13.d.querySelector('[data-fold="' + k + '"]');
    if (el) { el.click(); await tick() }
  }
  {
    const txt = s13.d.getElementById('app').textContent;
    JARGON.forEach(j => { if (txt.includes(j) && !seen.includes(j)) seen.push(j) });
    s13.d.querySelector('#kcopy').click(); await tick();
    const dump = s13.d.querySelector('#kdump').value;
    JARGON.forEach(j => { if (dump.includes(j) && !seen.includes('복사:' + j)) seen.push('복사:' + j) });
  }
  t('내부 용어 노출 없음', seen.length === 0, seen.join(', '));

  // 전망은 판정을 먼저 보여준다
  const s14 = open(FILE, 55555);
  const span = s14.q('koutlook').querySelector('.ospan');
  const order = [...span.children].map(c => c.className);
  t('전망 순서 판정 먼저', order.indexOf('ospan-verdict') < order.indexOf('ospan-bars'),
    order.join('>'));
  t('전망 안내 문구', s14.q('koutlook').textContent.includes('각 기간에 예상되는 상태'));
  t('전망 제목', s14.q('koutlook').textContent.includes('생산 전망'));
}

// 실시간 진행
{
  const rt = open(FILE, 30699);
  rt.q('kbc0').click(); await tick();
  for (let i = 0; i < 6; i++) { rt.q('kgo').click(); await tick() }

  // 추세 막대가 두 신호를 항상 보여준다
  const tr = rt.q('ktrend');
  t('추세 막대 존재', !!tr);
  t('추세는 본문에 있다', !!rt.q('ktrend') && !rt.d.querySelector('.dock #ktrend'));
  t('추세는 재고와 못 판 주문', tr.textContent.includes('재고') && tr.textContent.includes('못 판 주문'));
  t('막대 여덟 칸', [...tr.querySelectorAll('.spark-bars')].every(x => x.textContent.length <= 8));

  // 재생하면 돌고 사건에서 자동으로 멈춘다
  const play = rt.d.querySelector('#kclock .clk');
  play.click(); await tick();
  t('재생 상태', rt.w.FF.clockOf().running === true);

  // 버튼은 재생과 정지 하나뿐이다(배속 버튼은 다른 클래스라 별도로 존재한다)
  t('시계 버튼 하나', rt.d.querySelectorAll('#kclock .clk').length === 1);
  t('하루는 5초', rt.w.FV.CLOCK_MS === 5000);
  // 이슈 #33: heartbeat이 250ms인 이유는 5000/2500/1250(1/2/4배속 하루 길이)이
  // 전부 나누어떨어져야 실제 속도가 라벨과 어긋나지 않기 때문이다(1000ms였을 때는
  // 1250ms가 나누어떨어지지 않아 4배속이 실제로 2.5배로만 나왔다).
  t('시계는 250ms 간격', rt.w.FV.TICK_MS === 250);

  // 이슈 #33: 배속 선택. 기본은 1배, 고르면 그 배만큼 하루가 짧아진다.
  {
    const speedBtn = i => rt.d.querySelectorAll('.clk-speed')[i];
    t('배속 버튼 셋', [...rt.d.querySelectorAll('.clk-speed')].map(b => b.textContent).join(',') === '1×,2×,4×');
    t('기본 배속 1', rt.w.FF.clockOf().speed === 1 && rt.w.FV.dayMs() === 5000);
    speedBtn(2).click(); await tick();
    t('4배속 선택', rt.w.FF.clockOf().speed === 4 && rt.w.FV.dayMs() === 1250);
    t('선택 표시', rt.d.querySelector('.clk-speed-on').textContent === '4×');
    speedBtn(0).click(); await tick();
    t('1배속으로 되돌림', rt.w.FF.clockOf().speed === 1 && rt.w.FV.dayMs() === 5000);
  }

  // 정지하면 타이머가 스스로 걷힌다
  rt.w.FF.setClock(false);
  await new Promise(r => setTimeout(r, 1200));
  t('정지 뒤 타이머 없음', !rt.w.FV._timer);
  rt.w.FF.setClock(true); rt.w.FV.startClock();


  // 새로 생긴 칸만 전환한다
  const bars = rt.d.querySelector('#ktrend .spark-bars');
  t('막대 마지막 칸에 전환', !!bars.querySelector('.spark-new'));
  t('나머지 칸은 그대로', bars.childNodes[0].nodeType === 3);

  // 병목이 바뀌어도 멈추지 않는다. 종료에서만 멈춘다.
  let guard = 0;
  while (rt.w.FF.clockOf().running && guard < rt.w.FF.C.days + 10) { rt.w.FF.tickDay(); await tick(); guard++ }
  t('종료에서 정지', rt.w.FF.clockOf().running === false && rt.w.FF.isOver());
  t('병목 변화로는 멈추지 않음', guard >= 20);
  // 이슈 #30: guard 루프가 게임 일수만큼 늘어나 실제 경과 시간(setTimeout 0의 누적)이
  // heartbeat 간격을 넘을 수 있다 - 남아 있는 배경 타이머를 확실히 걷어낸 뒤, 새로
  // 시작한 타이머가 (게임이 이미 끝난 상태라) 스스로 멈출 기회를 얻기 전에(await 없이)
  // 바로 확인해야 경쟁 상태 없이 "시작 직후 상태"를 본다.
  rt.w.FV.stopClock();

  // 새 게임을 시작하면 시계는 꺼지지만(진행 여부는 게임 상태다), 배속은 화면 설정이라
  // 이어간다(이슈 #33) - 사운드나 테마 설정이 새 판마다 초기화되지 않는 것과 같다.
  rt.w.FF.setClockSpeed(2);
  rt.w.FV.startClock(); rt.w.FF.setClock(true);
  const wasRunning = rt.w.FF.clockOf().running && !!rt.w.FV._timer;
  rt.w.FV.newGame(777); await tick();
  t('새 게임 전에 돌고 있었음', wasRunning);
  t('새 게임은 시계 정지', rt.w.FF.clockOf().running === false);
  t('새 게임은 타이머 없음', !rt.w.FV._timer);
  t('새 게임도 배속은 유지', rt.w.FF.clockOf().speed === 2);
  t('새 판 첫날', rt.w.FF.dayOf() === 1 && !!rt.q('kopening'));
  rt.w.FV.stopClock();
}

// 시계는 재생을 누르기 전에는 타이머를 만들지 않는다
{
  const sc = open(FILE, 1);
  t('시작 시 타이머 없음', !sc.w.FV._timer);
  t('시계 기본 정지', sc.w.FF.clockOf().running === false);
  sc.q('kgo').click(); await tick();
  t('진행 후에도 타이머 없음', !sc.w.FV._timer);
  const play = sc.d.querySelector('#kclock .clk');
  play.click(); await tick();
  t('재생 누르면 타이머 생김', !!sc.w.FV._timer && sc.w.FF.clockOf().running === true);
  play.click(); await tick();
  t('정지 누르면 타이머 없음', !sc.w.FV._timer && sc.w.FF.clockOf().running === false);
}

// 접이식 열림은 화면 상태다. 도메인이 들고 있지 않다.
{
  const fo = open(FILE, 30699);
  t('도메인에 접이식 상태 없음', fo.w.FF.OPEN === undefined && fo.w.FF.OPENSIG === undefined);
  t('화면이 접이식 상태를 가짐', typeof fo.w.FV.OPEN === 'object');
  t('비교표 신호 제거', fo.w.FF.CMPSIG === undefined);
  t('새 게임 확인은 SIG', typeof fo.w.FF.SIG.newGame === 'object' && fo.w.FF.NEWSIG === undefined);
}

// 화면은 게임 상태 신호를 직접 읽지 않는다
{
  const src = fs.readFileSync(FILE, 'utf8');
  const view = src.slice(src.indexOf('FV.App=function'));
  const SIG = ['RUN','LEDGER','PLANT','HIST','LOG','MARKET','LOTS','ENGINE',
               'WORLD','RECOVER','EVENT','PENDING','PHASE','CONTRACT','QUEUE_S','VERSION'];
  const hit = SIG.filter(s2 => new RegExp('FF\\.' + s2 + '\\b').test(view));
  t('뷰가 게임 신호 직접 접근 없음', hit.length === 0, hit.join(', '));
}

// 판로 배분
{
  const ch = open(FILE, 30699);
  ch.q('kbc2').click(); await tick();
  for (let i = 0; i < 5; i++) { ch.q('kgo').click(); await tick() }

  const bar = ch.q('kchan');
  t('판로 막대 존재', !!bar);
  t('판로는 본문에 있다', !!ch.q('kchan') && !ch.d.querySelector('.dock #kchan'));
  const rows = [...bar.querySelectorAll('.chan-card')];
  t('판로 셋', rows.length === 3);
  t('판로 이름', rows.map(r => r.querySelector('.chan-name').textContent).join() === '온라인,프랜차이즈,도매');
  t('관계 낱말 표시', rows.every(r => ['끊김','보통','좋음','최상'].some(w => r.querySelector('.chan-rel').textContent.includes(w))));
  t('관계에 라벨 있다', rows.every(r => r.querySelector('.chan-rel').textContent.startsWith('관계')));
  t('가격 표시', rows.every(r => /\d+원/.test(r.querySelector('.chan-cond').textContent)));
  t('상한 표시', rows.every(r => /최대 \d+t/.test(r.querySelector('.chan-cond').textContent)));
  t('배정 표시', rows.every(r => /배정 \d+t/.test(r.querySelector('.chan-alloc').textContent)));
  t('주문량 표시', rows.every(r => /주문 \d+t/.test(r.querySelector('.chan-alloc').textContent)));
  t('정책 버튼 넷', rows.every(r => r.querySelectorAll('.pol').length === 4));
  t('정책 버튼 이름', rows.every(r =>
    [...r.querySelectorAll('.pol')].map(b => b.textContent).join() === '양보,기본,우선,보장'));
  t('기본 단계가 켜져 있다', rows.every(r => r.querySelector('.pol-on').textContent === '기본'));

  t('머리줄 판매 가능은 가장 크게', /판매 가능/.test(bar.querySelector('.chan-head-main').textContent));
  t('머리줄에 재고', /재고 \d+t/.test(bar.querySelector('.chan-head-note').textContent));
  t('머리줄에 확정 입고', /확정 입고 \d+t/.test(bar.querySelector('.chan-head-note').textContent));
  {
   const P0 = ch.w.FF.stancePlan(), capSales = ch.w.FF.capsOf().sales;
   const values = [...bar.querySelectorAll('.chan-head-value')];
   t('판매 가능 값은 배분 예산과 같다', values[0].textContent === P0.pool + 't');
   t('예상 판매 값은 배정 합과 같다', values[1].textContent === P0.sum + 't');
   const noteTxt = bar.querySelector('.chan-head-note').textContent;
   t('재고 값이 정확히 일치', noteTxt.includes('재고 ' + P0.inv + 't'));
   t('확정 입고 값이 정확히 일치', noteTxt.includes('오늘 확정 입고 ' + P0.exp + 't'));
   t('판매 한도는 실제로 걸릴 때만', /판매 한도 \d+t/.test(noteTxt) === (P0.sellable > capSales));
   const unassignedTxt = [...bar.querySelectorAll('.chan-head-note')].map(x => x.textContent).join(' ');
   t('미배정은 있을 때만', /미배정 \d+t/.test(unassignedTxt) === (P0.unassigned >= 1));
   if (P0.unassigned >= 1) t('미배정 값이 정확히 일치', unassignedTxt.includes('미배정 ' + P0.unassigned + 't'));
   const old = ch.w.FF.oldStock(), oldEl = bar.querySelector('.chan-head-old');
   t('오래된 재고는 있을 때만', !!oldEl === (old >= 1));
   if (oldEl) t('오래된 재고 값이 정확히 일치', oldEl.textContent === '오래된 재고 ' + old + 't');
  }

  const plan0 = ch.w.FF.stancePlan();
  t('기본값은 전부 기본 단계', plan0.levels.every(v => v === 1));
  t('미리보기는 상한을 넘지 않는다', plan0.preview.every((v, i) => v <= plan0.rows[i].cap + 1e-9));
  t('배정 합은 판매 가능을 넘지 않는다', plan0.preview.reduce((a, b) => a + b, 0) <= plan0.pool);
  t('배정은 주문을 넘지 않는다', plan0.preview.every((v, i) => v <= plan0.est[i]));

  // 정책 버튼은 직접 그 단계로 간다. 순환이 아니다.
  const D = 2; // 도매
  rows[D].querySelectorAll('.pol')[2].click(); await tick(); // 우선
  const p1 = ch.w.FF.stancePlan();
  t('한 판로만 바뀐다', p1.levels[D] === 2 && p1.levels[0] === 1 && p1.levels[1] === 1);
  t('우선은 기본보다 몫이 크거나 같다', p1.preview[D] >= plan0.preview[D] - 1e-9);
  t('켜진 버튼이 바뀐다',
    ch.q('kchan').querySelectorAll('.chan-card')[D].querySelector('.pol-on').textContent === '우선');

  // 보장은 quota 를 다른 판로보다 먼저 확보한다
  rows[D].querySelectorAll('.pol')[3].click(); await tick(); // 보장
  const guaranteed = ch.w.FF.stancePlan();
  t('보장 단계 표시', guaranteed.levels[D] === 3 &&
    ch.q('kchan').querySelectorAll('.chan-card')[D].querySelector('.pol-on').textContent === '보장');

  // 초기화 버튼은 태도를 전부 지운다
  ch.q('kchan').querySelector('.cs-auto').click(); await tick();
  t('초기화하면 전부 기본 단계', ch.w.FF.stanceOf() === null && ch.w.FF.stancePlan().levels.every(v => v === 1));

  // 태도는 대기열을 쓰지 않는다. 증설 계약과 같은 날 함께 낼 수 있다.
  ch.w.FF.setChannelStance(D, 2); await tick();
  t('태도는 대기열 밖', !ch.w.FF.queueOf().some(x => x.kind === 'sell'));
  t('대기열은 계속 비어 있다', ch.w.FF.queueOf().length === 0);
  ch.q('kgo').click(); await tick();
  t('다음 날에도 태도가 남는다', ch.w.FF.stanceOf() !== null);

  // 관계는 실제 배분의 결과로 움직인다. 쿼터의 절반도 못 채우면 그날 바로 내려간다.
  const F = 1;   // 프랜차이즈
  // 프랜차이즈를 계속 양보로 두고 다른 둘을 우선으로 돌려 굶긴다
  ch.w.FF.setStance([2, 0, 2]); await tick();
  const relBefore = ch.w.FF.relOf()[F];
  ch.q('kgo').click(); await tick();
  t('굶기면 관계가 내려가거나 유지된다', ch.w.FF.relOf()[F] <= relBefore);
}

// 신호와 이슈: 평소엔 조용하고, 정책과 결과가 어긋날 때만 나타난다
{
  const s = open(FILE, 30699);
  s.q('kbc2').click(); await tick();
  t('시작 시 신호 없음', !s.q('kissue'));

  // 태도를 건드리지 않고 며칠 진행해도(전부 기본 단계) 이슈가 뜨면 안 된다
  for (let i = 0; i < 3; i++) { s.q('kgo').click(); await tick() }
  t('기본 단계 방치는 조용하다', !s.q('kissue'));

  // 온라인을 우선으로 지키다가 쿼터를 못 채우면 이슈가 뜬다
  let opened = false;
  for (let i = 0; i < 10 && !opened; i++) {
    s.w.FF.setStance([2, 1, 1]);
    s.q('kgo').click(); await tick();
    if (s.q('kissue')) opened = true;
  }
  t('우선인데 쿼터 미달이면 이슈가 뜬다', opened, JSON.stringify(s.w.FF.issueOf()));
  if (opened) {
    const bar = s.q('kissue');
    t('이슈 문구에 판로 이름', bar.textContent.includes('온라인'));
    t('이슈에 포기 버튼', !!bar.querySelector('.issue-btn'));

    // 다음 날, 같은 상태가 이어지면 신호는 다시 뜨지 않는다(이슈만 남는다)
    s.w.FF.setStance([2, 1, 1]);
    s.q('kgo').click(); await tick();
    t('다음날 신호 재발행 없음', s.w.FF.signalOf().length === 0 || !s.w.FF.signalOf().some(x => x.i === 0));
    t('이슈는 계속 열려 있다', !!s.w.FF.issueOf()[0]);

    // 포기 버튼을 누르면 표시가 바뀌고 게임 규칙은 그대로다
    const nwBefore = s.w.FF.netWorth(s.w.FF.toKernelState());
    s.q('kissue').querySelector('.issue-btn').click(); await tick();
    t('포기 후 순자산 불변', s.w.FF.netWorth(s.w.FF.toKernelState()) === nwBefore);
    t('포기 후 의도적 포기 표시', s.q('kissue').textContent.includes('의도적 포기'));
    t('포기해도 포기 버튼은 사라진다', !s.q('kissue').querySelector('.issue-btn'));
  }
}

// N. 이슈 #11: AP 상태 표시와 factoring 버튼
{
  const s = open(FILE, 7);
  for (let i = 0; i < 3; i++) { s.q('kgo').click(); await tick() }
  t('AP 잔액 없으면 AP 안내 없음', s.w.FF.apStatus().outstanding > 0 || !s.q('kap'));
  t('평소엔 factoring 버튼 없음', s.w.FF.factorPlan().eligible ? true : !s.q('kfactor'));

  // 위험 신호를 강제로 만든다: 현금을 크게 깎고 만기 있는 AR을 채운다.
  const day = s.w.FF.dayOf();
  s.w.FF.addCash(-s.w.FF.ledger().cash - 100000);
  s.w.FF.setAr([{ at: day + 3, amt: 20000 }]);
  s.w.FF.commit(); s.w.FF.repaint(); await tick();

  const P = s.w.FF.factorPlan();
  t('강제 상황에서 factoring 조건 충족', P.eligible && P.outstanding === 20000, JSON.stringify(P));
  t('factoring 버튼 노출', !!s.q('kfactor'));
  t('제안 금액이 outstanding 이하', P.suggested > 0 && P.suggested <= P.outstanding);

  s.q('kfactorgo').click(); await tick();
  t('factoring 대기열에 제안 금액이 들어간다', s.w.FF.queuedFactorAmount() === P.suggested);

  const cashBefore = s.w.FF.ledger().cash;
  const arBefore = s.w.FF.sumAmt(s.w.FF.arOf());
  s.q('kgo').click(); await tick();
  t('factoring 실행 후 현금이 늘어난다(할인 있어도 순유입)', s.w.FF.ledger().cash > cashBefore);
  t('factoring 실행 후 AR 잔액이 정확히 제안 금액만큼 준다',
    Math.abs((arBefore - s.w.FF.sumAmt(s.w.FF.arOf())) - P.suggested) < 1e-6);
  t('factoring은 커널 command 집합 안에 있다(FF.Cmd.factor)', typeof s.w.FF.Cmd.factor === 'function');
}

// O. 이슈 #28: 자동진행 WARNING 배너
{
  const s = open(FILE, 7);
  for (let i = 0; i < 3; i++) { s.q('kgo').click(); await tick() }
  t('평소엔 WARNING 배너 없음', s.w.FF.warnOf() && Object.values(s.w.FF.warnOf()).every(w => !w.active) ? !s.q('kwarnbar') : true);

  // 오늘 막 알림이 나간 상태를 강제로 만든다(팩토링 테스트의 강제-상황 패턴과 같다).
  const day = s.w.FF.dayOf();
  s.w.FF.engineState().warn.procure = { active: true, lastNotifyDay: day };
  s.w.FF.commit(); s.w.FF.repaint(); await tick();
  t('오늘 알림이 뜬 트리거는 배너에 보인다', !!s.q('kwarnbar') && s.q('kwarnbar').textContent.includes('조달 능력 부족 지속'));

  // 같은 episode가 계속돼도(active 그대로) 어제 이미 알렸으면 오늘은 다시 안 뜬다.
  s.w.FF.engineState().warn.procure = { active: true, lastNotifyDay: day - 1 };
  s.w.FF.commit(); s.w.FF.repaint(); await tick();
  t('어제 이미 알린 episode는 오늘 다시 안 뜬다', !s.q('kwarnbar'));

  t('자동진행 중에도 시간은 계속 흐른다(WARNING이 진행을 막지 않음)', !s.w.FF.isOver());
  s.q('kgo').click(); await tick();
  t('WARNING 상태에서도 하루 넘기기가 정상 동작', s.w.FF.dayOf() === day + 1);
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
