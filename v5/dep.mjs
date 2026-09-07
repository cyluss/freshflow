// 뷰와 게임 객체 의존 분석
import fs from 'fs';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const FILES = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js','src-debug.js','src-render.js','src-text.js','src-ui-flow.js','src-ui-matrix.js','src-ui-chart.js','src-ui-outlook.js','src-report.js','src-clip.js','src-view.js','src-boot.js'];
const VIEW = new Set(['src-render.js','src-text.js','src-ui-flow.js','src-ui-matrix.js','src-ui-chart.js','src-ui-outlook.js','src-clip.js','src-view.js']);

const gAccess = {};   // 파일 → 심볼 → G 필드 집합
const sigRead = {};   // 파일 → 심볼 → 신호 집합
const SIGNALS = new Set(['GAME','EVENT','PENDING','AUTORUN','PHASE','QUEUE_S',
                         'SIG','OPENSIG','NEWSIG','CMPSIG']);

for (const f of FILES) {
  const ast = acorn.parse(fs.readFileSync(f,'utf8'), { ecmaVersion: 2020 });
  const ownerOf = anc => {
    for (let i = anc.length - 1; i >= 0; i--) {
      const a = anc[i];
      if (a.type === 'AssignmentExpression' && a.left.type === 'MemberExpression'
          && a.left.object.name === 'FF') return a.left.property.name;
    }
    return '(top)';
  };
  walk.ancestor(ast, {
    MemberExpression(n, _st, anc) {
      const o = n.object;
      if (o.type === 'MemberExpression' && !o.computed &&
          o.object.type === 'Identifier' && o.object.name === 'FF' && o.property.name === 'G') {
        const prop = n.computed ? '[]' : n.property.name;
        const own = ownerOf(anc);
        ((gAccess[f] = gAccess[f] || {})[own] = gAccess[f][own] || new Set()).add(prop);
      }
      if (!n.computed && n.object.type === 'Identifier' && n.object.name === 'FF'
          && SIGNALS.has(n.property.name)) {
        const own = ownerOf(anc);
        ((sigRead[f] = sigRead[f] || {})[own] = sigRead[f][own] || new Set()).add(n.property.name);
      }
    }
  });
}

console.log('== 게임 객체 직접 접근');
let viewFields = new Set(), viewSymbols = 0;
for (const f of FILES) {
  if (!gAccess[f]) continue;
  const tag = VIEW.has(f) ? '뷰' : '  ';
  for (const [own, set] of Object.entries(gAccess[f])) {
    console.log(`  ${tag} ${f.replace('src-','').replace('.js','')}.${own} → ${[...set].sort().join(',')}`);
    if (VIEW.has(f)) { viewSymbols++; [...set].forEach(x => viewFields.add(x)); }
  }
}

console.log('\n== 신호 구독');
for (const f of FILES) {
  if (!sigRead[f]) continue;
  for (const [own, set] of Object.entries(sigRead[f]))
    console.log(`     ${f.replace('src-','').replace('.js','')}.${own} → ${[...set].sort().join(',')}`);
}

console.log('\n== 요약');
console.log(`  뷰가 G를 직접 읽는 심볼: ${viewSymbols}개`);
console.log(`  뷰가 읽는 G 필드: ${[...viewFields].sort().join(', ')}`);
