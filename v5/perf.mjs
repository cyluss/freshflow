// 성능 회귀 감시: 절대 속도가 아니라 호출 횟수와 상한을 본다
import fs from 'fs';
import { JSDOM } from 'jsdom';

const tick = () => new Promise(r => setTimeout(r, 0));
let pass = 0, fail = 0;
const t = (name, cond, info) => {
  if (cond) pass++; else { fail++; console.log('FAIL', name, info === undefined ? '' : info) }
};

// 계측 주입
let html = fs.readFileSync('fresh-flow-v0.html', 'utf8');
const HEAVY = ['replayPlan', 'missedOps', 'modContrib', 'hindsight', 'stepDay', 'simulate', 'stepState'];
for (const f of HEAVY)
  html = html.replace(`FF.${f}=function(`,
    `FF.${f}=function(...a){window.__n=window.__n||{};window.__n.${f}=(window.__n.${f}||0)+1;
     return FF["_p_${f}"].apply(null,a)};FF._p_${f}=function(`);
const COMPS = ['NavBarView','ForecastView','TimelineChartView','DecisionView',
               'OptionCompareView','FlowView','HistoryView','DockView','GameResultView'];
for (const c of COMPS)
  html = html.replace(`FV.${c}=function(){`,
    `FV.${c}=function(){window.__c=window.__c||{};window.__c.${c}=(window.__c.${c}||0)+1;`);

const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://x/#seed=30699' });
const w = dom.window, d = w.document, q = id => d.getElementById(id);
const reset = () => { w.__n = {}; w.__c = {} };
const FFover = () => q('klabel') && q('klabel').textContent.includes('운영 종료');

// 1) 하루 진행: 반사실 재생이 일어나면 안 된다
let worstReplay = 0, clicks = 0;
while (q('kgo') && clicks < 60) {
  if (+q('kd').textContent === 5) { w.FF.toggleBuy('sales'); await tick() }
  reset();
  q('kgo').click();
  await tick();
  if (FFover()) break;                       // 종료 전환 클릭은 제외
  worstReplay = Math.max(worstReplay, w.__n.replayPlan || 0);
  clicks++;
}
t('플레이 중 replayPlan 0회', worstReplay === 0, '최대 ' + worstReplay + '회');

// 2) 종료 화면 최초: 재생은 한 묶음만
const firstReplay = w.__n.replayPlan || 0;
t('종료 최초 replayPlan 5회 이하', firstReplay <= 5, firstReplay + '회');
t('종료 최초 stepState 4000회 이하', (w.__n.stepState || 0) <= 4000, (w.__n.stepState || 0) + '회');

// 3) 접이식 토글: 캐시가 살아 있으면 재생이 0
for (const k of ['ops', 'mods', 'miss', 'log']) {
  reset();
  d.querySelector(`[data-fold="${k}"]`).click(); await tick();
  t(`fold ${k} 재생 0회`, (w.__n.replayPlan || 0) === 0, (w.__n.replayPlan || 0) + '회');
  t(`fold ${k} 결과 카드만 갱신`, (w.__c.GameResultView || 0) === 1 && !w.__c.FlowView,
    JSON.stringify(w.__c));
}

// 4) 게임 상태가 안 바뀌면 재계산도 없다
{
  for (let i = 0; i < 3; i++) { w.FF.repaint(); await tick() }
  reset();
  for (let i = 0; i < 20; i++) { w.FF.repaint(); await tick() }
  t('상태 불변 시 재계산 0회', (w.__n.replayPlan||0)===0 && (w.__n.simulate||0)===0,
    `replay ${w.__n.replayPlan||0}, sim ${w.__n.simulate||0}`);
}

// 5) 재렌더 상한
for (let i = 0; i < 5; i++) { w.FF.repaint(); await tick() }
const t0 = Date.now();
for (let i = 0; i < 50; i++) { w.FF.repaint(); await tick() }
const per = (Date.now() - t0) / 50;
t('재렌더 1회 20ms 이하', per < 20, per.toFixed(1) + 'ms');

// 6) 새 게임 후 캐시가 무효화된다
{
  const dom2 = new JSDOM(html, { runScripts: 'dangerously', url: 'http://x/#seed=1' });
  const w2 = dom2.window, q2 = id => dom2.window.document.getElementById(id);
  let n = 0;
  while (q2('kgo') && !(q2('klabel') && q2('klabel').textContent.includes('운영 종료')) && n < 60) {
    q2('kgo').click(); await tick(); n++;
  }
  const a = w2.FF.missedOps().length;
  q2('kseed').value = '30699'; q2('knew').click(); await tick();
  n = 0;
  while (q2('kgo') && !(q2('klabel') && q2('klabel').textContent.includes('운영 종료')) && n < 60) {
    q2('kgo').click(); await tick(); n++;
  }
  const b = w2.FF.missedOps();
  t('새 게임 후 캐시 무효화', Array.isArray(b) && b.length !== 0, 'a=' + a + ' b=' + b.length);
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
