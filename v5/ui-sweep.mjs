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


// 다시드 회귀. 빌드가 아니라 규칙 변경 때 돌린다.
// 6. 여러 조합에서 불변식이 유지된다
// 경제 파라미터는 골든이 지킨다. 여기서는 화면 동작만 본다.
{
  let ok = 0, bad = 0;
  for (const seed of [1, 2, 31236, 30699, 22209, 49616])
    for (const acts of [null, { 4: 'sales' }, { 6: 'sales', 9: 'sales' }, { 13: 'sales' }]) {
      const s = open(FILE, seed);
      if (s.q('kbc0')) { s.q('kbc0').click(); await tick() }
      let n = 0;
      while (s.q('kgo') && !(s.q('klabel') && s.q('klabel').textContent.includes('운영 종료')) && n < s.w.FF.C.days + 10) {
        const day = +s.q('kd').textContent;
        if (acts && acts[day]) { s.w.FF.toggleBuy(acts[day]); await tick() }
        s.q('kgo').click(); await tick(); n++;
      }
      for (const k of ['ops', 'mods', 'miss', 'log']) {
        const e = s.d.querySelector('[data-fold="' + k + '"]');
        if (e) { e.click(); await tick() }
      }
      const okRun = s.w.ffCheck().위반 === 0
        && s.q('kbrief').textContent.includes('운영 결과')
        && s.errs.length === 0;
      if (okRun) ok++; else bad++;
    }
  t('24조합 불변식과 결과 카드', bad === 0, ok + '/24');
}


// 하네스 자기검증: 없는 선택자는 반드시 실패로 잡혀야 한다
{
  const s2 = open(FILE, 1);
  t('없는 요소는 null', s2.q('없는아이디') === null);
  t('없는 fold 선택자 null', s2.d.querySelector('[data-없음]') === null);
}


// 13. 화면에 undefined 나 NaN 이 새지 않는다
{
  for (const seed of [1, 30699, 84206, 55555, 92582]) {
    const s9 = open(FILE, seed);
    if (s9.q('kbc0')) { s9.q('kbc0').click(); await tick() }
    let m = 0, leak = null;
    while (s9.q('kgo') && !(s9.q('klabel') && s9.q('klabel').textContent.includes('운영 종료')) && m < s9.w.FF.C.days + 10) {
      s9.q('kgo').click(); await tick(); m++;
      const txt = s9.d.getElementById('app').textContent;
      if (!leak && (txt.includes('undefined') || txt.includes('NaN'))) leak = m;
    }
    for (const k of ['ops', 'mods', 'miss', 'log']) {
      const e = s9.d.querySelector('[data-fold="' + k + '"]');
      if (e) { e.click(); await tick() }
    }
    const txt = s9.d.getElementById('app').textContent;
    if (!leak && (txt.includes('undefined') || txt.includes('NaN'))) leak = '종료';
    t('seed ' + seed + ' 값 누수 없음', leak === null, '일차 ' + leak);
  }
}

// 13. 화면에 미정의 값이나 미정의 클래스가 나오지 않는다
{
  const BAD = ['undefined', 'NaN', 'null', '[object Object]'];
  let hits = [];
  for (const seed of [1, 2, 30699, 55555, 84206, 92582]) {
    const s9 = open(FILE, seed);
    if (s9.q('kbc0')) { s9.q('kbc0').click(); await tick() }
    let n = 0;
    const scan = where => {
      const txt = s9.d.getElementById('app').textContent;
      for (const b of BAD)
        if (txt.includes(b)) { hits.push(`seed ${seed} ${where}: ${b}`); return true }
      return false;
    };
    while (s9.q('kgo') && !(s9.q('klabel') && s9.q('klabel').textContent.includes('운영 종료')) && n < s9.w.FF.C.days + 10) {
      if (n === 4) { s9.w.FF.toggleBuy('sales'); await tick() }
      s9.q('kgo').click(); await tick(); n++;
      if (scan('day ' + n)) break;
    }
    for (const k of ['ops','mods','miss','log']) {
      const el = s9.d.querySelector('[data-fold="' + k + '"]');
      if (el) { el.click(); await tick() }
    }
    scan('결과');
  }
  t('화면에 미정의 값 없음', hits.length === 0, hits.slice(0, 3).join(' | '));
}


console.log(pass + ' passed, ' + fail + ' failed');
