// 신호 흐름 추적. 심볼 하나를 주면 그것을 쓰는 곳과 읽는 곳을 보여준다.
//   node trace.mjs LEDGER      신호를 쓰고 읽는 함수
//   node trace.mjs addCash     함수가 만지는 신호와 그 함수를 부르는 곳
import fs from 'fs';
const FILES=['src-core.js','src-store.js','src-access.js','src-uistate.js','src-kernel.js',
 'src-runner.js','src-record.js','src-engine.js','src-counter.js','src-report-data.js','src-debug.js',
 'src-render.js','src-text.js','src-ui-compare.js','src-ui-flow.js','src-ui-matrix.js',
 'src-ui-chart.js','src-ui-outlook.js','src-report.js','src-clip.js','src-view.js','src-boot.js'];
const target=process.argv[2];
if(!target){console.log('사용: node trace.mjs <신호 또는 함수 이름>');process.exit(0)}

// 파일별로 함수 단위로 자른다
const owners=[];    // {file, name, body}
for(const f of FILES){
  const lines=fs.readFileSync(f,'utf8').split('\n');
  let cur=null,buf=[];
  const flush=()=>{ if(cur)owners.push({file:f,name:cur,body:buf.join('\n')}) };
  lines.forEach(ln=>{
    const m=/^(?:FF|FV|window)\.([A-Za-z_$][\w$]*)\s*=/.exec(ln);
    if(m){flush();cur=m[1];buf=[ln]} else buf.push(ln);
  });
  flush();
}
const short=f=>f.replace('src-','').replace('.js','');
const W=new RegExp('(?:FF|FV)\\.'+target+'\\.value\\s*=');
const R=new RegExp('(?:FF|FV)\\.'+target+'\\b');
const CALL=new RegExp('(?:FF|FV)\\.'+target+'\\s*\\(');

const writes=owners.filter(o=>W.test(o.body));
const reads=owners.filter(o=>R.test(o.body)&&!W.test(o.body)&&o.name!==target);
const decl=owners.filter(o=>o.name===target);

console.log(`# ${target}\n`);
if(decl.length)console.log('선언: '+decl.map(o=>short(o.file)).join(', ')+'\n');
if(writes.length){
  console.log('## 값을 바꾸는 곳');
  writes.forEach(o=>console.log(`  ${short(o.file)}.${o.name}`));
  console.log('');
}
if(reads.length){
  console.log('## 참조하는 곳');
  const by={};
  reads.forEach(o=>(by[short(o.file)]=by[short(o.file)]||[]).push(o.name));
  Object.entries(by).forEach(([f,ns])=>console.log(`  ${f}: ${ns.join(', ')}`));
  console.log('');
}
// 함수라면 이 함수가 만지는 신호도 보여준다
const SIGS=['RUN','LEDGER','PLANT','LOG','HIST','MARKET','LOTS','ENGINE','WORLD','RECOVER',
            'EVENT','PENDING','AUTORUN','PHASE','GAME','QUEUE_S','OPENSIG','VERSION','SIG'];
if(decl.length){
  const body=decl.map(o=>o.body).join('\n');
  const touch=SIGS.filter(s=>new RegExp('(?:FF|FV)\\.'+s+'\\b').test(body));
  const calls=[...new Set([...body.matchAll(/(?:FF|FV)\.([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]))]
    .filter(n=>n!==target);
  if(touch.length)console.log('## 이 함수가 만지는 신호\n  '+touch.join(', ')+'\n');
  if(calls.length)console.log('## 이 함수가 부르는 것\n  '+calls.slice(0,12).join(', ')+(calls.length>12?' ...':'')+'\n');
}
