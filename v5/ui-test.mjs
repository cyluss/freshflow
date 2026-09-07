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
  t('첫날 월간 전망', !!q('koutlook'));
  {
    const spans = [...q('koutlook').querySelectorAll('.ospan')];
    t('전망 여섯 구간', spans.length === 6, spans.length + '개');
    t('구간마다 막대 셋', spans.every(x => x.querySelectorAll('.ob').length === 3));
    const pcts = [...spans[0].querySelectorAll('.ob-pct')].map(x => parseInt(x.textContent));
    t('합이 100', pcts.reduce((a, b) => a + b, 0) === 100, pcts.join('+'));
    t('표시는 5% 단위', pcts.every(v => v % 5 === 0), pcts.join('/'));
    t('구간마다 판정 한 줄', spans.every(x => x.querySelector('.ospan-verdict').textContent.length > 3));
    t('생산과 수요 둘', q('koutlook').textContent.includes('생산') && q('koutlook').textContent.includes('수요'));
    t('초순 중순 하순', ['초순','중순','하순'].every(x => q('koutlook').textContent.includes(x)));
  }
  t('로드 오류 없음', errs.length === 0);
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
  t('구매 카드 제거', !s.q('kacts') && !s.q('kbs') && !s.q('kbw'));
  t('설비 관리 버튼 없음', !s.q('kopen'));
  t('매입 목표 제거', !s.q('kpolicy'));
  t('비교 근거 없음', !s.q('kcmp'));

  const s1b = open(FILE, 84206);
  s1b.q('kbc0').click(); await tick();
  s1b.q('kgo').click(); await tick();
  t('배분도 dock 안', !!s1b.d.querySelector('.dock #kchan'));
  t('시계도 dock 안', !!s1b.d.querySelector('.dock #kclock'));
  const dockIds = [...s1b.d.querySelector('.dock').children].map(c => c.id).filter(Boolean);
  t('dock 끝은 진행과 종료', dockIds.slice(-2).join() === 'kgo,kfin');
  t('진행 버튼은 하루', s1b.q('kgo').textContent === '하루 넘기기');
}

// 3. 선택과 해제가 대기열에 반영된다
{
  const s = open(FILE, 31236);
  // 첫날은 계약 여부만 고른다
  t('선택지 넷', [0,1,2,3].every(i => !!s.q('kbc' + i)));
  t('첫날 판매 카드 없음', !s.q('kbs'));
  s.q('kbc2').click(); await tick();
  t('선택 후 대기열 1', s.w.FF.queueOf().length === 1 && s.w.FF.queueOf()[0].size === 1);
  s.q('kbc3').click(); await tick();
  t('다른 크기로 교체', s.w.FF.queueOf().length === 1 && s.w.FF.queueOf()[0].size === 1.5);
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
  t('무장 문구', s.q('kfin').textContent.includes('30일까지 운영'));
  s.q('kfin').click(); await tick();
  t('2클릭에 종료', s.q('kd').textContent === '30');
}

// 5. 종료 화면의 접이식은 네 개이고 실제로 펼쳐진다
{
  const s = open(FILE, 30699);
  let n = 0;
  while (s.q('kgo') && !(s.q('klabel') && s.q('klabel').textContent.includes('운영 종료')) && n < 60) {
    if (+s.q('kd').textContent === 5) { s.w.FF.toggleBuy('sales'); await tick() }
    s.q('kgo').click(); await tick(); n++;
  }
  t('결과 카드 존재', !!s.q('kbrief'));
  const folds = s.d.querySelectorAll('[data-fold]');
  t('접이식 네 개', folds.length === 4);
  t('접이식 초기 접힘', [...folds].every(e => e.parentElement.open === false));
  const foldOf = k => s.d.querySelector('[data-fold="' + k + '"]').parentElement;
  for (const k of ['ops', 'mods', 'miss', 'log']) {
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
  while (s3.q('kgo') && !(s3.q('klabel') && s3.q('klabel').textContent.includes('운영 종료')) && n < 60) {
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
  while (s5.q('kgo') && !(s5.q('klabel') && s5.q('klabel').textContent.includes('운영 종료')) && n < 60) {
    if (+s5.q('kd').textContent === 5) { s5.w.FF.toggleBuy('sales'); await tick() }
    s5.q('kgo').click(); await tick(); n++;
  }
  const svg = s5.q('kchart').querySelector('svg');
  t('그래프 svg 존재', !!svg);
  t('생산/판매 선 둘', svg.querySelectorAll('polyline').length === 2);
  t('재고 막대 30개', svg.querySelectorAll('rect[opacity="0.5"]').length === 30);
  t('사건 원 존재', svg.querySelectorAll('circle').length > 0);
  t('증설 마름모', svg.querySelectorAll('rect[transform]').length === 1);
  t('기여 라벨', svg.querySelectorAll('text').length === 1);
  t('범례 문구', s5.q('kchart').textContent.includes('생산'));
  t('그래프 오류 없음', s5.errs.length === 0);
}


// 10. 예보표
{
  const s6 = open(FILE, 31236);
  for (let i = 0; i < 4; i++) { s6.q('kgo').click(); await tick() }
  const chart = s6.q('kchart');
  t('예보표 존재', !!chart);
  const lines = [...chart.querySelectorAll('div')].filter(x => x.style.display === 'flex');
  t('머리 + 7행', lines.length === 8);
  const names = lines.slice(1).map(x => x.firstElementChild.textContent);
  t('행 이름 일곱', names.join() === '생산,입고,창고,판매,수요,사건,투자');
  const fut = lines[0].textContent;
  t('전망 열 셋', ['+1','+2','+3'].every(x => fut.includes(x)));
  t('남은 일수 표시', chart.textContent.includes('남은'));
  t('예보표 오류 없음', s6.errs.length === 0);
}


// 11. 캐러셀은 CSS 만으로 동작한다
{
  const s7 = open(FILE, 58207);
  for (let i = 0; i < 3; i++) { s7.q('kgo').click(); await tick() }
  const panes = [...s7.d.querySelectorAll('.pane')];
  t('페이지 둘', panes.length === 2);
  t('페이지 id', panes.map(p => p.id).join() === 'p0,p1');
  const links = [...s7.d.querySelectorAll('.tabs a')];
  t('탭이 앵커 링크', links.length === 2 && links.every((a, i) => a.getAttribute('href') === '#p' + i));
  t('두 번째 면은 월간 전망', links[1].textContent === '월간 전망');
  t('두 번째 면 내용', s7.d.getElementById('p1').textContent.includes('초순'));
  t('전망은 남은 기간', s7.d.getElementById('p1').textContent.includes('남은'));
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
  const rows = [...s8.q('kbrief').querySelectorAll('.stat-row')];
  t('요약 줄이 있다', rows.length >= 6, rows.length + '줄');
  t('요약이 전부 3칸', rows.every(r => r.children.length === 3));
  const txt = s8.q('kbrief').textContent;
  t('유효 구간 또는 없음', txt.includes('유효 구간') || txt.includes('놓친 최대 기회'));
  t('설명 문장 없음', !txt.includes('아무 날에 하나를 더 샀어도'));
  t('보고서 제목', txt.includes('30일 운영 결과'));
}


// 14. 쓰이는 클래스는 모두 정의되어 있다
{
  const s10 = open(FILE, 30699);
  let m = 0;
  while (s10.q('kgo') && !(s10.q('klabel') && s10.q('klabel').textContent.includes('운영 종료')) && m < 60) {
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
  while (s10.q('kgo') && !(s10.q('klabel') && s10.q('klabel').textContent.includes('운영 종료')) && n < 60) {
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
  t('선택지 표기', bi.includes('+1.5t'));
  t('선택지 설명', bi.includes('한도 넘는 날'));
  s11.q('kbc0').click(); await tick();
  let n = 0;
  while (n < 20) { s11.q('kgo').click(); await tick(); n++; if (s11.q('kchan')) break }
  t('배분 막대 등장', !!s11.q('kchan'));

  // 흐름 화면과 같은 말을 쓴다
  const flow = s11.q('kchain').textContent;
  t('흐름도 판매 표기', flow.includes('판매') && !flow.includes('출하'));
  t('흐름도 하루 한도', flow.includes('하루 한도 20t') && flow.includes('하루 한도 21t'));

  t('둘째 날부터 선택지 없음', !s11.q('kbc0') && !s11.q('kopening'));
}


// 16. 화면에 내부 코드값이 새지 않는다
{
  const CODES = ['sales','sales','storage','manual','event','early','mid','late',
                 'high','low','weak','strong','free','near','full','ship','stock','contract'];
  const s12 = open(FILE, 30699);
  let n = 0;
  while (s12.q('kgo') && !(s12.q('klabel') && s12.q('klabel').textContent.includes('운영 종료')) && n < 60) {
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
  while (s13.q('kgo') && !(s13.q('klabel') && s13.q('klabel').textContent.includes('운영 종료')) && n < 60) {
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
  t('추세도 dock 안', !!rt.d.querySelector('.dock #ktrend'));
  t('추세는 재고와 못 판 주문', tr.textContent.includes('재고') && tr.textContent.includes('못 판 주문'));
  t('막대 여덟 칸', [...tr.querySelectorAll('.spark-bars')].every(x => x.textContent.length <= 8));

  // 재생하면 돌고 사건에서 자동으로 멈춘다
  const play = rt.d.querySelector('#kclock .clk');
  play.click(); await tick();
  t('재생 상태', rt.w.FF.clockOf().running === true);

  // 버튼은 재생과 정지 하나뿐이다
  t('시계 버튼 하나', rt.d.querySelectorAll('#kclock .clk').length === 1);
  t('하루는 5초', rt.w.FV.CLOCK_MS === 5000);
  t('시계는 1초 간격', rt.w.FV.TICK_MS === 1000);

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
  while (rt.w.FF.clockOf().running && guard < 40) { rt.w.FF.tickDay(); await tick(); guard++ }
  t('종료에서 정지', rt.w.FF.clockOf().running === false && rt.w.FF.isOver());
  t('병목 변화로는 멈추지 않음', guard >= 20);

  // 새 게임을 시작하면 시계와 타이머가 함께 꺼진다
  rt.w.FV.startClock(); rt.w.FF.setClock(true); await tick();
  const wasRunning = rt.w.FF.clockOf().running && !!rt.w.FV._timer;
  rt.w.FV.newGame(777); await tick();
  t('새 게임 전에 돌고 있었음', wasRunning);
  t('새 게임은 시계 정지', rt.w.FF.clockOf().running === false);
  t('새 게임은 타이머 없음', !rt.w.FV._timer);
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
  t('판로도 dock 안', !!ch.d.querySelector('.dock #kchan'));
  const rows = [...bar.querySelectorAll('.chan-card')];
  t('판로 셋', rows.length === 3);
  t('판로 이름', rows.map(r => r.querySelector('.chan-name').textContent).join() === '온라인,프랜차이즈,도매');
  t('관계 표시', rows.every(r => ['끊김','보통','좋음','최상'].includes(r.querySelector('.chan-rel').textContent)));
  t('가격 표시', rows.every(r => /오늘 \d+원/.test(r.textContent)));
  t('상한 표시', rows.every(r => /최대 \d+t/.test(r.textContent)));
  t('예상 표시', rows.every(r => /예상 \d+t/.test(r.textContent)));
  t('한 줄 구성', rows.every(r => {
    const row2 = r.querySelector('.chan-row2');
    return row2.children.length === 3 &&
      row2.children[0].className === 'chan-id' &&
      row2.children[1].className === 'chan-desc' &&
      row2.children[2].className === 'stc';
  }));
  t('태도 버튼 넷 중 하나', rows.every(r =>
    ['양보','보통','우선','보장'].includes(r.querySelector('.stc').textContent)));

  t('배분 머리줄', /오늘 배분할 재고/.test(bar.querySelector('.chan-head-num').textContent));
  t('머리줄 예상 근거', /이월 .*입고 예상/.test(bar.querySelector('.chan-head-note').textContent));

  const plan0 = ch.w.FF.stancePlan();
  t('기본은 전부 보통', plan0.levels.every(v => v === 1));
  t('미리보기는 상한을 넘지 않는다', plan0.preview.every((v, i) => v <= plan0.rows[i].cap + 1e-9));

  // 태도 버튼을 누르면 그 판로만 다음 단계로 돈다
  const D = 2; // 도매
  rows[D].querySelector('.stc').click(); await tick();
  const p1 = ch.w.FF.stancePlan();
  t('한 판로만 바뀐다', p1.levels[D] === 2 && p1.levels[0] === 1 && p1.levels[1] === 1);
  t('우선은 보통보다 몫이 크거나 같다', p1.preview[D] >= plan0.preview[D] - 1e-9);

  // 네 번 누르면 한 바퀴 돌아 보통으로 돌아온다
  rows[D].querySelector('.stc').click(); await tick();
  rows[D].querySelector('.stc').click(); await tick();
  rows[D].querySelector('.stc').click(); await tick();
  t('네 번이면 원래 단계로', ch.w.FF.stancePlan().levels[D] === 1);

  // 보장은 quota 를 다른 판로보다 먼저 확보한다
  rows[D].querySelector('.stc').click(); rows[D].querySelector('.stc').click(); await tick();
  const guaranteed = ch.w.FF.stancePlan();
  t('보장 단계 표시', guaranteed.levels[D] === 3 &&
    ch.q('kchan').querySelectorAll('.chan-card')[D].querySelector('.stc').textContent === '보장');

  // 초기화 버튼은 태도를 전부 지운다
  ch.q('kchan').querySelector('.cs-auto').click(); await tick();
  t('초기화하면 전부 보통', ch.w.FF.stanceOf() === null && ch.w.FF.stancePlan().levels.every(v => v === 1));

  // 태도는 대기열을 쓰지 않는다. 증설 계약과 같은 날 함께 낼 수 있다.
  ch.w.FF.cycleStance(D); await tick();
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

  // 태도를 건드리지 않고 며칠 진행해도(전부 보통) 이슈가 뜨면 안 된다
  for (let i = 0; i < 3; i++) { s.q('kgo').click(); await tick() }
  t('보통 방치는 조용하다', !s.q('kissue'));

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

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
