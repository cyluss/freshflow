// 전체 데이터 흐름 분석
import fs from 'fs';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const FILES = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js','src-debug.js','src-render.js','src-text.js','src-ui-flow.js','src-ui-matrix.js','src-ui-chart.js','src-ui-outlook.js','src-report.js','src-clip.js','src-view.js','src-boot.js'];
const LAYER = Object.fromEntries(FILES.map((f,i)=>[f,i]));

const decl = {};          // 심볼 → 파일
const calls = {};         // 심볼 → 호출하는 심볼 집합
const gRead = {};         // 심볼 → 읽는 G 필드
const gWrite = {};        // 심볼 → 쓰는 G 필드
const sigRead = {};       // 심볼 → 읽는 신호
const sigWrite = {};      // 심볼 → 쓰는 신호
const SIG = new Set(['GAME','EVENT','PENDING','AUTORUN','PHASE','QUEUE_S','SIG',
                     'OPENSIG','NEWSIG','CMPSIG']);

for (const f of FILES) {
  const src = fs.readFileSync(f,'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 2020 });
  const owner = anc => {
    for (let i = anc.length-1; i >= 0; i--) {
      const a = anc[i];
      if (a.type === 'AssignmentExpression' && a.left.type === 'MemberExpression'
          && a.left.object.name === 'FF') return a.left.property.name;
    }
    return '(top)';
  };
  const add = (m, k, v) => ((m[k] = m[k] || new Set()).add(v));

  walk.simple(ast, {
    AssignmentExpression(n) {
      const t = n.left;
      if (t.type === 'MemberExpression' && !t.computed
          && t.object.type === 'Identifier' && t.object.name === 'FF')
        decl[t.property.name] = f;
    }
  });

  walk.ancestor(ast, {
    MemberExpression(n, _s, anc) {
      const own = f + '#' + owner(anc);
      const o = n.object;
      // FF.G.<f>
      if (o.type === 'MemberExpression' && !o.computed
          && o.object.name === 'FF' && o.property.name === 'G') {
        const fld = n.computed ? '[]' : n.property.name;
        const p = anc[anc.length-2];
        const isWrite = p && ((p.type === 'AssignmentExpression' && p.left === n)
          || (p.type === 'UpdateExpression' && p.argument === n));
        add(isWrite ? gWrite : gRead, own, fld);
      }
      // FF.<sym>
      if (!n.computed && o.type === 'Identifier' && o.name === 'FF') {
        const name = n.property.name;
        if (SIG.has(name)) {
          const gp = anc[anc.length-3];
          const isW = gp && gp.type === 'AssignmentExpression'
            && gp.left.type === 'MemberExpression' && gp.left.object === n;
          add(isW ? sigWrite : sigRead, own, name);
        } else {
          const p = anc[anc.length-2];
          const isDecl = p && p.type === 'AssignmentExpression' && p.left === n;
          if (!isDecl) add(calls, own, name);
        }
      }
    }
  });
}

// 출력
const short = f => f.replace('src-','').replace('.js','');
const fmt = s => [...s].sort().join(',');

console.log('# 데이터 흐름\n');
console.log('## 게임 객체 G');
console.log('| 계층.심볼 | 읽기 | 쓰기 |');
console.log('|---|---|---|');
const keys = new Set([...Object.keys(gRead), ...Object.keys(gWrite)]);
[...keys].sort().forEach(k => {
  const [f, s] = k.split('#');
  console.log(`| ${short(f)}.${s} | ${gRead[k]?fmt(gRead[k]):''} | ${gWrite[k]?fmt(gWrite[k]):''} |`);
});

console.log('\n## 신호');
console.log('| 계층.심볼 | 읽기 | 쓰기 |');
console.log('|---|---|---|');
const sk = new Set([...Object.keys(sigRead), ...Object.keys(sigWrite)]);
[...sk].sort().forEach(k => {
  const [f, s] = k.split('#');
  console.log(`| ${short(f)}.${s} | ${sigRead[k]?fmt(sigRead[k]):''} | ${sigWrite[k]?fmt(sigWrite[k]):''} |`);
});

console.log('\n## 계층 간 호출 수');
const edge = {};
for (const [k, set] of Object.entries(calls)) {
  const from = k.split('#')[0];
  for (const t of set) {
    const to = decl[t];
    if (!to || to === from) continue;
    const e = short(from) + ' → ' + short(to);
    edge[e] = (edge[e] || 0) + 1;
  }
}
console.log('| 흐름 | 호출 |');
console.log('|---|---|');
Object.entries(edge).sort((a,b)=>b[1]-a[1]).forEach(([e,n]) => console.log(`| ${e} | ${n} |`));

console.log('\n## 무거운 계산 진입점');
const HEAVY = ['replayPlan','replay'];
const callers = {};
for (const [k, set] of Object.entries(calls))
  for (const t of set) if (HEAVY.includes(t)) (callers[t] = callers[t] || []).push(k);
for (const [h, cs] of Object.entries(callers)) {
  console.log(`\n### ${h}`);
  cs.forEach(c => {
    const [f,s] = c.split('#');
    console.log(`  ${short(f)}.${s}`);
  });
}

// 부록: G 필드별 생산자와 소비자
console.log('\n## G 필드별 흐름');
const fieldW = {}, fieldR = {};
for (const [k,set] of Object.entries(gWrite)) for (const f2 of set) (fieldW[f2]=fieldW[f2]||[]).push(k);
for (const [k,set] of Object.entries(gRead))  for (const f2 of set) (fieldR[f2]=fieldR[f2]||[]).push(k);
const all = [...new Set([...Object.keys(fieldW), ...Object.keys(fieldR)])].sort();
console.log('| 필드 | 쓰기 | 읽기 수 | 읽는 계층 |');
console.log('|---|---|---|---|');
for (const f2 of all) {
  const w = (fieldW[f2]||[]).map(x=>short(x.split('#')[0])+'.'+x.split('#')[1]).join(',') || '(초기화만)';
  const rs = fieldR[f2]||[];
  const layers = [...new Set(rs.map(x=>short(x.split('#')[0])))].join(',');
  console.log(`| ${f2} | ${w} | ${rs.length} | ${layers} |`);
}

// 부록: stamp 가 감시하지 않는 필드 중 반사실에 영향을 주는 것
console.log('\n## 캐시 지문 검증');
const STAMP = new Set(['day','mods','finDay']);
const replayInputs = new Set();
for (const k of ['analysis._missedOps','analysis._modContrib','analysis._recoverPct',
                 'analysis._hindsight','analysis._endCardData','analysis._chartData','analysis._matrixData']) {
  const [f2,s2] = k.split('.');
  const key = 'src-'+f2+'.js#'+s2;
  (gRead[key]||new Set()).forEach(x=>replayInputs.add(x));
}
const missing = [...replayInputs].filter(x=>!STAMP.has(x)).sort();
console.log('memo 대상이 읽는 G 필드:', [...replayInputs].sort().join(','));
console.log('지문에 없는 필드:', missing.join(',') || '(없음)');

// 부록: VERSION 을 올리는 함수는 셋뿐이어야 한다
{
  const committers = [];
  for (const [k,set] of Object.entries(calls))
    if (set.has('commit')) committers.push(k.split('#')[1]);
  const ok = committers.length === 3 &&
    ['stepDay','reset','finishRun'].every(x => committers.includes(x));
  console.log('\n## commit 호출자');
  console.log(committers.join(', '), ok ? '(정상)' : '(예상과 다름)');
  if (!ok) process.exitCode = 1;
}
