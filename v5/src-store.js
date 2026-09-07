
FF.LASTDUMP="";
// 신호 구현을 주입받는다. 노드에서는 가짜 신호를 넣어 돌린다.
FF.useSignals=function(signal,computed){FF._signal=signal;FF._computed=computed}
// 신호 구현은 밖에서 주입한다. 없으면 최소 구현으로 헤드리스 실행한다.
FF.useSignals(FF._injected||function(v){return {value:v}},
  FF._injectedComputed||function(f){return {get value(){return f()}}});
FF.EVENT=FF._signal(null);
FF.setEvent=function(e){FF.EVENT.value=e}
FF.evt=function(){FF.VERSION.value;return FF.EVENT.value}
// 초과분 매입 계약 보유량. 0 이면 미보유.
FF.CONTRACT=FF._signal(0);
FF.contractOf=function(){FF.VERSION.value;return FF.CONTRACT.value}
FF.setContract=function(v){FF.CONTRACT.value=v}
FF.PENDING=FF._signal(null);
FF.setPending=function(p){FF.PENDING.value=p}
FF.PHASE=FF._signal("play");
FF.isOver=function(){FF.VERSION.value;return FF.PHASE.value!=="play"}
FF.isBust=function(){FF.VERSION.value;return FF.PHASE.value==="bust"}
FF.setPhase=function(p){FF.PHASE.value=p}
FF.RECOVER=FF._signal({prev:{},pending:{}});
FF.resetRecover=function(){FF.RECOVER.value={prev:{},pending:{}}}
FF.recoverPrev=function(key){FF.VERSION.value;var r=FF.RECOVER.value.prev;
 return (key in r)?r[key]:null}
FF.noteRecover=function(key,val){FF.RECOVER.value.pending[key]=val}
FF.rollRecover=function(){
 var R=FF.RECOVER.value, prev={};
 for(var k in R.prev)prev[k]=R.prev[k];
 for(k in R.pending)prev[k]=R.pending[k];
 FF.RECOVER.value={prev:prev,pending:{}};
}
FF.VERSION=FF._signal(0);
FF.commit=function(){FF.VERSION.value=FF.VERSION.value+1}
FF.memo=function(fn){
 var c=FF._computed(function(){FF.VERSION.value;return fn()});
 return function(){return c.value};
}

FF.memoBy=function(fn){
 var map={};
 return function(a){
  if(!map[a])map[a]=FF._computed(function(){FF.VERSION.value;return fn(a)});
  return map[a].value;
 };
}
FF.WORLD=FF._signal(null);
FF.world=function(){return FF.WORLD.value}
FF.setWorld=function(w){FF.WORLD.value=w}
FF.LOTS=FF._signal([]);
FF.lotsOf=function(){return FF.LOTS.value}
FF.setLots=function(a){FF.LOTS.value=a}
FF.ENGINE=FF._signal(null);
FF.engineState=function(){return FF.ENGINE.value}
FF.resetEngineState=function(){
 FF.ENGINE.value={prevB:"none",lastBuy:{intake:0,sales:0},
  phase:{intake:{dir:0,n:0},sales:{dir:0,n:0}}};
}
FF.PLANT=FF._signal(null);
FF.plant=function(){FF.VERSION.value;return FF.PLANT.value}
FF.resetPlant=function(){FF.PLANT.value={cap:{intake:FF.C.cap.intake,storage:FF.C.cap.storage,sales:FF.C.cap.sales},buys:{sales:0,contract:0}}}
FF.expand=function(kind){var P=FF.PLANT.value,c={intake:P.cap.intake,storage:P.cap.storage,sales:P.cap.sales};
 c[kind]+=FF.C.step[kind];
 FF.PLANT.value={cap:c,buys:P.buys};}
FF.countBuy=function(kind){var P=FF.PLANT.value,b={sales:P.buys.sales,contract:P.buys.contract||0};
 b[kind]++;
 FF.PLANT.value={cap:P.cap,buys:b};}
FF.RUN=FF._signal(null);
FF.run=function(){FF.VERSION.value;return FF.RUN.value}
FF.resetRun=function(seed){FF.RUN.value={day:1,seed:seed,finDay:0}}
FF.nextDay=function(){var R=FF.RUN.value;FF.RUN.value={day:R.day+1,seed:R.seed,finDay:R.finDay}}
FF.markFinish=function(){var R=FF.RUN.value;FF.RUN.value={day:R.day,seed:R.seed,finDay:R.day}}
// 일별 기록. 하루에 한 번 반드시 늘어난다.
FF.HIST=FF._signal([]);
FF.histOf=function(){FF.VERSION.value;return FF.HIST.value}
FF.pushHist=function(rec){FF.HIST.value=FF.HIST.value.concat([rec])}

// 사건 기록. 사건이 있을 때만 늘어난다.
FF.LOG=FF._signal(null);
FF.resetLog=function(){
 FF.HIST.value=[];
 FF.LOG.value={evlog:[],events:[],buylog:[],timeline:[],mods:[],relLog:[]};
}
FF.append=function(k,rec){var L=FF.LOG.value,n={};
 for(var x in L)n[x]=L[x];
 n[k]=L[k].concat([rec]);
 FF.LOG.value=n;}
FF.logOf=function(){FF.VERSION.value;return FF.LOG.value}
FF.LEDGER=FF._signal(null);
FF.ledger=function(){FF.VERSION.value;return FF.LEDGER.value}
FF.resetLedger=function(){FF.LEDGER.value={cash:FF.C.cash,spent:0,salvaged:0}}
FF.addCash=function(v){var L=FF.LEDGER.value;FF.LEDGER.value={cash:L.cash+v,spent:L.spent,salvaged:L.salvaged}}
FF.spend=function(v){var L=FF.LEDGER.value;FF.LEDGER.value={cash:L.cash-v,spent:L.spent+v,salvaged:L.salvaged}}
FF.setSalvage=function(v){var L=FF.LEDGER.value;FF.LEDGER.value={cash:L.cash+v,spent:L.spent,salvaged:v}}
FF.MARKET=FF._signal(null);
FF.marketOf=function(){FF.VERSION.value;return FF.MARKET.value}
FF.setMarket=function(si,di){FF.MARKET.value={si:si,di:di}}
// 판로 관계와 배분. 오늘의 배분이 내일의 거래조건을 바꾼다.
FF.REL=FF._signal(null);
FF.setRel=function(a){FF.REL.value=a}
FF.AR=FF._signal([]);
FF.setAr=function(a){FF.AR.value=a}
FF.ALLOC=FF._signal(null);
FF.setAlloc=function(a){FF.ALLOC.value=a}
// 판로 태도. 판로마다 0~3 단계. 최소 확보량과 나머지 가중치를 core 의 stance 표가 정한다.
FF.STANCE=FF._signal(null);
FF.setStance=function(a){FF.STANCE.value=a}
// 관계 이슈. 판로마다 열린 이슈 하나 또는 null. 신호는 그날 하루만 유효하다.
FF.ISSUE=FF._signal(null);
FF.setIssue=function(a){FF.ISSUE.value=a}
FF.SIGNAL=FF._signal([]);
FF.setSignal=function(a){FF.SIGNAL.value=a}

// 이번 달 성향. 판 시작에 정해지고 끝까지 유지된다. 전망 계산이 이것을 쓴다.
// 매입 정책. 며칠치를 목표로 들고 갈지. 플레이 중 바뀐다.
FF.COVER=FF._signal(null);
FF.setCover=function(v){FF.COVER.value=v}
FF.TILT=FF._signal({supply:1,demand:1});
FF.tiltOf=function(){FF.VERSION.value;return FF.TILT.value}
FF.setTilt=function(t){FF.TILT.value=t}

// 플레이어 행동. 게임이 받아들이는 명령의 전체 집합이다.
FF.inventory=function(){
 FF.VERSION.value;
 var L=FF.lotsOf(),t=0;
 for(var i=0;i<L.length;i++)t+=L[i].q;
 return t;
}
// 어댑터: 신호와 커널 상태를 잇는다. 게임 규칙은 여기 없다.
