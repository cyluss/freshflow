// V8 CPU 프로파일로 실제 자기 시간을 잰다
import fs from 'fs';
import { JSDOM } from 'jsdom';
import inspector from 'node:inspector';

const tick = () => new Promise(r => setTimeout(r, 0));
const html = fs.readFileSync('fresh-flow-v0.html', 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://x/#seed=30699' });
const w = dom.window, d = w.document, q = id => d.getElementById(id);

// 워밍
let n = 0;
while (q('kgo') && !(q('klabel') && q('klabel').textContent.includes('운영 종료')) && n < 60) {
  if (+q('kd').textContent === 5 && q('kopen')) { q('kopen').click(); await tick(); q('kbi').click(); await tick() }
  q('kgo').click(); await tick(); n++;
}

const session = new inspector.Session();
session.connect();
const post = (m, p) => new Promise((res, rej) =>
  session.post(m, p, (e, r) => e ? rej(e) : res(r)));

await post('Profiler.enable');
await post('Profiler.setSamplingInterval', { interval: 100 });
await post('Profiler.start');

// 측정 대상: 종료 화면 재렌더 200회
for (let i = 0; i < 200; i++) { w.FF.repaint(); await tick() }

const { profile } = await post('Profiler.stop');
session.disconnect();

// 자기 시간 집계
const byId = new Map(profile.nodes.map(nd => [nd.id, nd]));
const self = new Map();
const total = profile.samples.length;
for (const id of profile.samples) {
  const nd = byId.get(id);
  if (!nd) continue;
  const f = nd.callFrame;
  const key = (f.functionName || '(anon)') + ' @' + (f.url || '').split('/').pop() + ':' + (f.lineNumber + 1);
  self.set(key, (self.get(key) || 0) + 1);
}
const dur = (profile.endTime - profile.startTime) / 1000;
console.log(`샘플 ${total}개, ${dur.toFixed(0)}ms, 재렌더 200회`);
console.log('\n자기 시간 상위:');
[...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
  .forEach(([k, v]) => console.log(`  ${(v / total * 100).toFixed(1).padStart(5)}%  ${(v * dur / total).toFixed(1).padStart(6)}ms  ${k}`));
