// AST 기반 정적 검사
import fs from 'fs';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const FILES = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js','src-fact.js','src-debug.js','src-render.js','src-text.js','src-ui-flow.js','src-ui-matrix.js','src-ui-chart.js','src-ui-outlook.js','src-report.js','src-clip.js','src-view.js','src-boot.js'];
const problems = [];
const decl = new Set();          // FF.x = ... 로 선언된 것
const refs  = new Map();         // FF.x 참조 횟수 (선언 제외)
const strings = [];              // 모든 문자열 리터럴
const globalsUsed = new Map();   // 스코프에 없는 식별자 참조

const ALLOW_GLOBAL = new Set([
  'window','document','Math','Object','Array','String','Number','JSON','Date',
  'setTimeout','clearTimeout','navigator','location','parseInt','parseFloat',
  'isNaN','console','FF','FV','mo','undefined','setInterval','clearInterval','NaN','Infinity','Boolean','Set','Map','URL'
]);

for (const f of FILES) {
  const src = fs.readFileSync(f, 'utf8');
  let ast;
  try {
    ast = acorn.parse(src, { ecmaVersion: 2020, locations: true });
  } catch (e) {
    problems.push(`${f}: 구문 오류 ${e.message}`);
    continue;
  }

  // 1) FF.x 선언과 참조를 분리 수집
  walk.simple(ast, {
    AssignmentExpression(n) {
      const t = n.left;
      if (t.type === 'MemberExpression' && !t.computed &&
          t.object.type === 'Identifier' && t.object.name === 'FF')
        decl.add(t.property.name);
    },
    MemberExpression(n) {
      if (!n.computed && n.object.type === 'Identifier' && n.object.name === 'FF')
        refs.set(n.property.name, (refs.get(n.property.name) || 0) + 1);
    },
    Literal(n) {
      if (typeof n.value === 'string') strings.push({ f, line: n.loc.start.line, v: n.value });
    },
    TemplateLiteral(n) {
      n.quasis.forEach(q => strings.push({ f, line: n.loc.start.line, v: q.value.raw }));
    }
  });

  // 2) 스코프 밖 식별자 참조 (미정의 호출 탐지)
  const scopes = [new Set()];
  const declare = name => scopes[scopes.length - 1].add(name);
  const known = name => scopes.some(s => s.has(name)) || ALLOW_GLOBAL.has(name);
  const collectParams = (params) => params.forEach(p => {
    if (p.type === 'Identifier') declare(p.name);
  });
  const visit = (node, parent) => {
    if (!node || typeof node.type !== 'string') return;
    const opensScope = /Function/.test(node.type);
    if (opensScope) { scopes.push(new Set()); collectParams(node.params || []); }
    if (node.type === 'CatchClause' && node.param && node.param.type === 'Identifier') {
      scopes.push(new Set([node.param.name]));
    }
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') declare(node.id.name);
    if (node.type === 'FunctionDeclaration' && node.id) scopes[scopes.length - 2]?.add(node.id.name);
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      const v = node[key];
      if (Array.isArray(v)) v.forEach(c => visit(c, node));
      else if (v && typeof v.type === 'string') visit(v, node);
    }
    if (node.type === 'Identifier' && parent) {
      const isProp = parent.type === 'MemberExpression' && parent.property === node && !parent.computed;
      const isKey  = parent.type === 'Property' && parent.key === node && !parent.computed;
      const isDecl = parent.type === 'VariableDeclarator' && parent.id === node;
      if (!isProp && !isKey && !isDecl && !known(node.name))
        globalsUsed.set(node.name, (globalsUsed.get(node.name) || 0) + 1);
    }
    if (opensScope) scopes.pop();
    if (node.type === 'CatchClause' && node.param) scopes.pop();
  };
  // 두 번 순회: 선언을 먼저 모으고 참조를 본다
  walk.simple(ast, {
    VariableDeclarator(n) { if (n.id.type === 'Identifier') scopes[0].add(n.id.name) },
    FunctionDeclaration(n) { if (n.id) scopes[0].add(n.id.name) }
  });
  visit(ast, null);
}

// A. 문자열 안의 FF. 또는 네임스페이스가 섞인 태그/속성
const SUSPECT = /(<\s*FF\.)|(FF\.[a-zA-Z]+\s*[:=])|(data-FF\.)|(FF\.[a-zA-Z-]+-[a-zA-Z])/;
for (const s of strings) {
  if (s.v.includes('FF.') || SUSPECT.test(s.v))
    problems.push(`${s.f}:${s.line} 문자열 오염 → ${JSON.stringify(s.v.slice(0, 60))}`);
}

// B. 선언되었으나 참조되지 않는 FF 심볼 (window.ff* API 제외)
const exported = new Set();
for (const f of FILES)
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/window\.(ff[A-Za-z]*)/g)) exported.add(m[1]);
for (const name of decl)
  if ((refs.get(name) || 0) <= 1 && !exported.has(name))
    problems.push(`죽은 심볼 FF.${name}`);

// C. 선언 없이 참조되는 FF 심볼
const INJECTED = new Set(['_injected','_injectedComputed']);   // 부팅 스크립트가 넣는다
for (const [name] of refs)
  if (!decl.has(name) && !INJECTED.has(name)) problems.push(`미정의 참조 FF.${name}`);

// D. 스코프에 없는 식별자
for (const [name, n] of globalsUsed) problems.push(`미정의 식별자 ${name} (${n}회)`);


// D2. 뷰 계층은 FF.G 를 직접 읽지 않는다
{
  const VIEWF = ['src-render.js','src-text.js','src-ui-flow.js','src-ui-matrix.js','src-ui-chart.js','src-ui-outlook.js','src-report.js','src-clip.js','src-view.js'];
  for (const f of VIEWF) {
    fs.readFileSync(f,'utf8').split('\n').forEach((ln,i) => {
      if (/FF\.G\./.test(ln)) problems.push(`${f}:${i+1} 뷰가 FF.G 직접 접근`);
    });
  }
}

// D3. 추출 완료된 G 필드는 다시 쓰지 않는다
{
  const EXTRACTED = ['rng','lots','prevB','phase','lastBuyI','lastBuyS','si','di','cash','spent','salvaged','hist','evlog','events','buylog','timeline','mods','cap','buys','day','seed','finDay'];
  for (const f of FILES) {
    fs.readFileSync(f,'utf8').split('\n').forEach((ln,i) => {
      for (const fld of EXTRACTED)
        if (new RegExp('FF\\.G\\.' + fld + '\\b').test(ln))
          problems.push(`${f}:${i+1} 추출된 필드 재사용 G.${fld}`);
    });
  }
}

// D4. 하루 물리는 tick 안에만 있어야 한다
{
  const PHYS = ['C.cover','C.alpha','C.mid','C.hold','C.waste','C.fixed','C.farm','C.ttl','C.q['];
  const src = fs.readFileSync('src-kernel.js','utf8');
  const lines = src.split('\n');
  const s0 = lines.findIndex(l => l.startsWith('FF.stepState=function'));
  const s1 = lines.findIndex((l,i) => i > s0 && l === '}');
  lines.forEach((ln,i) => {
    if (i >= s0 && i <= s1) return;
    for (const p of PHYS)
      if (ln.includes('FF.'+p)) problems.push(`src-kernel.js:${i+1} 물리 상수가 커널 밖에 있다: ${p}`);
  });
}

// D5. replayPlan 은 참조 구현에서만 부른다
{
  for (const f of ['src-counter.js','src-report-data.js','src-debug.js']) {
    let owner = '';
    fs.readFileSync(f,'utf8').split('\n').forEach((ln,i) => {
      const m = /^(?:FF|window)\.([A-Za-z_$][\w$]*)\s*=/.exec(ln);
      if (m) owner = m[1];
      if (/FF\.replay(Plan)?\(/.test(ln) && !/Ref$/.test(owner) && !/^ff/.test(owner))
        problems.push(`${f}:${i+1} 참조 구현 밖에서 replayPlan 사용 (${owner})`);
    });
  }
}

// D6. 도메인 계층에는 화면 문구를 두지 않는다
{
  const DOMAIN = ['src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js','src-fact.js'];
  const HANGUL = /[\uac00-\ud7a3]/;
  const ALLOW = /^\s*(\/\/|\*|\/\*)/;                      // 주석은 허용
  for (const f of DOMAIN) {
    let inDebug = false;
    fs.readFileSync(f,'utf8').split('\n').forEach((ln,i) => {
      if (/^window\.ff/.test(ln)) inDebug = true;
      if (inDebug && /^}/.test(ln)) inDebug = false;
      if (inDebug || ALLOW.test(ln)) return;
      for (const m of ln.matchAll(/(["'])((?:(?!\1).)*)\1/g))
        if (HANGUL.test(m[2]))
          problems.push(`${f}:${i+1} 도메인에 화면 문구 ${JSON.stringify(m[2].slice(0,20))}`);
    });
  }
}

// D7. 행동은 명령으로만 전달한다
{
  for (const f of ['src-view.js','src-ui-flow.js','src-ui-matrix.js','src-ui-chart.js','src-ui-outlook.js','src-report.js','src-engine.js']) {
    fs.readFileSync(f,'utf8').split('\n').forEach((ln,i) => {
      if (/FF\.stepDay\(\s*["']/.test(ln)) problems.push(`${f}:${i+1} stepDay 에 문자열 전달`);
      if (/FF\.transition\([^,]+,\s*["']/.test(ln)) problems.push(`${f}:${i+1} 커널에 문자열 전달`);
    });
  }
}

// D8. 증설 규칙은 커널에만 있다
{
  const OUT = ['src-counter.js','src-report-data.js','src-debug.js','src-view.js','src-ui-flow.js','src-ui-matrix.js','src-ui-chart.js','src-ui-outlook.js','src-report.js'];
  for (const f of OUT) {
    fs.readFileSync(f,'utf8').split('\n').forEach((ln,i) => {
      if (/cap\.[a-z]+\s*\+=|cap\[[^\]]+\]\s*\+=/.test(ln))
        problems.push(`${f}:${i+1} 커널 밖에서 용량 변경`);
    });
  }
}

// D9. 날짜 반복문은 러너와 시뮬레이터에만 있다
{
  const ALLOWED = ['runTracks','runScenario','step','simulate','replay','_hindsightRef','_missedOpsRef','_modContribRef','advance','finishRun'];
  for (const f of ['src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js','src-debug.js']) {
    const lines = fs.readFileSync(f,'utf8').split('\n');
    let owner = '';
    lines.forEach((ln,i) => {
      const m = /^FF\.([A-Za-z_$][\w$]*)\s*=/.exec(ln);
      if (m) owner = m[1];
      if (/FF\.transition\(/.test(ln) && !ALLOWED.includes(owner) && owner !== 'stepDay')
        problems.push(`${f}:${i+1} 러너 밖에서 커널 호출 (${owner})`);
    });
  }
}

// D10. 분석은 시뮬레이터를 통해서만 세계를 계산한다
{
  for (const f of ['src-counter.js','src-report-data.js','src-debug.js']) {
    let owner = '';
    fs.readFileSync(f,'utf8').split('\n').forEach((ln,i) => {
      const m = /^(?:FF|window)\.([A-Za-z_$][\w$]*)\s*=/.exec(ln);
      if (m) owner = m[1];
      if (/Ref$/.test(owner) || owner === 'simulate' || owner === 'compareStrategies' || /^ff/.test(owner)) return;
      if (/FF\.(stepState|transition|World|runScenario|runTracks)\(/.test(ln))
        problems.push(`${f}:${i+1} 분석이 직접 세계를 계산 (${owner})`);
    });
  }
}

// D11. 뷰가 엔진에서 쓰는 것은 명령 진입점 셋뿐이다
{
  const ENTRY = new Set(['startNew','advance','stepDay','tickDay']);
  const owner = {};
  for (const f of ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js','src-debug.js'])
    for (const m of fs.readFileSync(f,'utf8').matchAll(/^FF\.([A-Za-z_$][\w$]*)\s*=/gm)) owner[m[1]] = f;
  for (const f of ['src-render.js','src-text.js','src-ui-flow.js','src-ui-matrix.js','src-ui-chart.js','src-ui-outlook.js','src-report.js','src-clip.js','src-view.js']) {
    fs.readFileSync(f,'utf8').split('\n').forEach((ln,i) => {
      for (const m of ln.matchAll(/FF\.([A-Za-z_$][\w$]*)/g))
        if (owner[m[1]] === 'src-engine.js' && !ENTRY.has(m[1]))
          problems.push(`${f}:${i+1} 뷰가 엔진 내부 호출 FF.${m[1]}`);
    });
  }
}

// D12. 커널은 전역 규칙을 직접 읽지 않는다. 인자로 받는다.
{
  const KERNEL = ['stepState','bottleneck','transition','World','initialState','finalValue','mvSeq',
                  'M','hor','blur','expD'];
  const lines = fs.readFileSync('src-kernel.js','utf8').split('\n');
  let owner = '';
  lines.forEach((ln,i) => {
    const m = /^FF\.([A-Za-z_$][\w$]*)\s*=/.exec(ln);
    if (m) owner = m[1];
    if (!KERNEL.includes(owner)) return;
    // 기본값 대입만 허용한다
    if (/rules\s*\|\|\s*FF\.C/.test(ln)) return;
    if (/FF\.C\./.test(ln)) problems.push(`src-kernel.js:${i+1} 커널이 전역 규칙 참조 (${owner})`);
  });
}

// D13. 로그 적재는 record* 계열과 흐름 제어 둘만 한다
{
  const ALLOWED = ['recordDay','recordPurchase','recordDayStart','recordEvent','recordIssues','finishRun'];
  const lines = ['src-kernel.js','src-runner.js','src-record.js','src-engine.js']
    .flatMap(f => fs.readFileSync(f,'utf8').split('\n').map(l => [f,l]));
  let owner = '';
  lines.forEach(([f,ln],i) => {
    const m = /^FF\.([A-Za-z_$][\w$]*)\s*=/.exec(ln);
    if (m) owner = m[1];
    if (/FF\.(append|setEvent)\(/.test(ln) && !ALLOWED.includes(owner))
      problems.push(`${f} 기록 담당 밖에서 로그 적재 (${owner})`);
  });
}

// D14. 뷰는 반사실 실행 계층을 직접 부르지 않는다
{
  const COUNTER = new Set();
  for (const m of fs.readFileSync('src-counter.js','utf8').matchAll(/^FF\.([A-Za-z_$][\w$]*)\s*=/gm))
    COUNTER.add(m[1]);
  const ALLOW = new Set(['optionOf']);   // 구매 카드가 쓰는 옵션 요약
  for (const f of ['src-render.js','src-text.js','src-ui-flow.js','src-ui-matrix.js','src-ui-chart.js','src-ui-outlook.js','src-report.js','src-clip.js','src-view.js']) {
    fs.readFileSync(f,'utf8').split('\n').forEach((ln,i) => {
      for (const m of ln.matchAll(/FF\.([A-Za-z_$][\w$]*)/g))
        if (COUNTER.has(m[1]) && !ALLOW.has(m[1]))
          problems.push(`${f}:${i+1} 뷰가 반사실 실행 호출 FF.${m[1]}`);
    });
  }
}

// D15. 뷰는 상태 저장소를 직접 만지지 않는다. 읽기는 접근자, 쓰기는 명령이다.
{
  const STORE = new Set();
  for (const m of fs.readFileSync('src-store.js','utf8').matchAll(/^FF\.([A-Za-z_$][\w$]*)\s*=/gm))
    STORE.add(m[1]);
  // 읽기 전용 조회와 사건 확인은 허용한다
  const ALLOW = new Set(['isOver','isBust','evt','inventory','LASTDUMP','useSignals','contractOf']);
  for (const f of ['src-render.js','src-text.js','src-ui-flow.js','src-ui-matrix.js','src-ui-chart.js','src-ui-outlook.js','src-report.js','src-clip.js','src-view.js']) {
    fs.readFileSync(f,'utf8').split('\n').forEach((ln,i) => {
      for (const m of ln.matchAll(/FF\.([A-Za-z_$][\w$]*)/g))
        if (STORE.has(m[1]) && !ALLOW.has(m[1]))
          problems.push(`${f}:${i+1} 뷰가 저장소 직접 접근 FF.${m[1]}`);
    });
  }
}

// D16. 도메인은 화면 계층을 모른다
{
  const DOM = ['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js','src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js','src-debug.js'];
  for (const f of DOM) {
    fs.readFileSync(f,'utf8').split('\n').forEach((ln,i) => {
      if (/\bFV\./.test(ln)) problems.push(`${f}:${i+1} 도메인이 화면 계층 참조`);
      // 신호 구현 주입 한 곳만 예외다
      if (/useSignals\(/.test(ln)) return;
      if (/\bdocument\.|window\.preact/.test(ln)) problems.push(`${f}:${i+1} 도메인이 DOM 참조`);
    });
  }
}

// D17. 문구와 조각 계층은 DOM 을 만지지 않는다. 클립보드만 예외다.
{
  const PURE = ['src-text.js','src-ui-flow.js','src-ui-matrix.js',
                'src-ui-chart.js','src-ui-outlook.js','src-report.js'];
  for (const f of PURE) {
    fs.readFileSync(f,'utf8').split('\n').forEach((ln,i) => {
      if (/\bdocument\.|navigator\./.test(ln))
        problems.push(`${f}:${i+1} 조각 계층이 DOM 조작`);
    });
  }
}

// D18. 화면 문구는 문구 계층에만 둔다
{
  const WORDS = new Set();
  for (const m of fs.readFileSync('src-text.js','utf8').matchAll(/^FV\.([A-Za-z_$][\w$]*)\s*=/gm))
    WORDS.add(m[1]);
  if (!WORDS.has('say') || !WORDS.has('WORD'))
    problems.push('src-text.js 에 문구 표가 없다');
}

// D19. 기록은 넣기만 한다. 넣은 뒤 고치지 않는다.
{
  for (const f of ['src-record.js','src-engine.js','src-runner.js']) {
    fs.readFileSync(f,'utf8').split('\n').forEach((ln,i) => {
      if (/(histOf\(\)|logOf\(\)\.[a-z]+)\s*\[[^\]]*\]\s*\.[A-Za-z_$][\w$]*\s*=/.test(ln))
        problems.push(`${f}:${i+1} 기록을 사후 수정`);
    });
  }
}

// D20. 신호를 만들면 reset 이 초기화하고 접근자가 VERSION 을 구독한다.
//      셋 중 하나라도 빠지면 이전 판 값이 남거나 화면이 갱신되지 않는다.
{
  const FILES2 = ['src-store.js','src-uistate.js'];
  const src2 = FILES2.map(f => fs.readFileSync(f,'utf8')).join('\n');

  // 최상위 정의 단위로 자른다
  const blocks = [];
  {
    let owner = null, buf = [];
    for (const ln of src2.split('\n')) {
      const m = /^FF\.([A-Za-z_$][\w$]*)\s*=/.exec(ln);
      if (m) { if (owner) blocks.push([owner, buf.join('\n')]); owner = m[1]; buf = [ln] }
      else if (owner) buf.push(ln);
    }
    if (owner) blocks.push([owner, buf.join('\n')]);
  }
  const decl = blocks
    .filter(([n,b]) => new RegExp('^FF\\.' + n + '\\s*=\\s*FF\\._signal\\(').test(b))
    .map(([n]) => n);

  const VIEWSRC = ['src-view.js','src-report.js','src-ui-flow.js','src-ui-chart.js',
                   'src-ui-matrix.js','src-ui-outlook.js','src-text.js','src-clip.js']
    .map(f => fs.readFileSync(f,'utf8'));
  const engine = fs.readFileSync('src-engine.js','utf8');
  const resetBody = engine.slice(engine.indexOf('FF.reset=function'),
                                 engine.indexOf('FF.commit();FF.repaint()'));

  // 화면 신호와 갱신 표시는 판 상태가 아니다
  const VIEWONLY = ['GAME','VERSION','CLOCK'];

  for (const sig of decl) {
    if (VIEWONLY.includes(sig)) continue;
    const wr = new RegExp('FF\\.' + sig + '\\.value\\s*=');
    const init = wr.test(resetBody)
      || blocks.some(([n,b]) => n !== sig && wr.test(b)
                     && new RegExp('FF\\.' + n + '\\(').test(resetBody));
    if (!init) problems.push(`신호 ${sig} 를 reset 이 초기화하지 않는다`);

    // 화면이 부르는 접근자라면 VERSION 을 구독해야 한다
    const readers = blocks.filter(([n,b]) => n !== sig
      && new RegExp('return FF\\.' + sig + '\\.value').test(b));
    const usedByView = readers.filter(([n]) =>
      VIEWSRC.some(v => new RegExp('FF\\.' + n + '\\(').test(v)));
    if (usedByView.length && !usedByView.some(([,b]) => /FF\.(VERSION|GAME)\.value/.test(b)))
      problems.push(`신호 ${sig} 의 화면 접근자가 갱신을 구독하지 않는다`);
  }
}

// E. 계층 규칙: 아래 층이 위 층 심볼을 부르지 않는다
const LAYER = Object.fromEntries(FILES.map((f,i)=>[f,i]));
const owner = {};
for (const f of FILES)
  for (const m of fs.readFileSync(f,'utf8').matchAll(/^FF\.([A-Za-z_$][\w$]*)\s*=/gm)) owner[m[1]] = f;
for (const f of FILES) {
  const src = fs.readFileSync(f,'utf8');
  const lines = src.split('\n');
  lines.forEach((ln,i) => {
    for (const m of ln.matchAll(/FF\.([A-Za-z_$][\w$]*)/g)) {
      const o = owner[m[1]];
      if (!o || o === f) continue;
      if (LAYER[o] > LAYER[f])
        problems.push(`${f}:${i+1} 계층 역전 ${f}(${LAYER[f]}) → FF.${m[1]} in ${o}(${LAYER[o]})`);
    }
  });
}

if (problems.length) { problems.forEach(p => console.log(' ', p)); console.log(problems.length + ' 건'); process.exit(1) }
console.log('lint 통과: 선언 ' + decl.size + ', 문자열 ' + strings.length);
