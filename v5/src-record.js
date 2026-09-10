// procure는 판매/입고와 달리 "한도 대비 사용률"이 아니라 그날 조달 능력 때문에 실제로
// 놓친 양(wIprocure)이 있었는지로 판정한다 - 회사가 산 capProcure 자체가 그 판정의 분모다.
FF.capHits=function(kind,win){
 var lastBlocked=false;
 var since=FF.engineState().lastBuy[kind];
 var h=[];
 for(var i=0;i<FF.histOf().length;i++)if(FF.histOf()[i].day>since)h.push(FF.histOf()[i]);
 h=h.slice(-win);
 var n=0;
 for(var j=0;j<h.length;j++){
  if(kind==="intake"&&h[j].acc>=h[j].capI-0.05)n++;
  if(kind==="sales"&&h[j].sold>=h[j].capS-0.05&&h[j].dem>h[j].sold+0.05)n++;
  if(kind==="procure"&&h[j].wIprocure>0.05)n++;
 }
 if(h.length){
  var z=h[h.length-1];
  lastBlocked=kind==="intake"?(z.acc>=z.capI-0.05)
   :kind==="procure"?(z.wIprocure>0.05)
   :(z.sold>=z.capS-0.05&&z.dem>z.sold+0.05);
 }
 return{n:n,len:h.length,last:lastBlocked};
}

FF.useRate=function(n){
 var h=FF.histOf().slice(-n);
 if(!h.length)return{intake:0,sales:0,procure:0};
 var a=0,b=0,c=0,capP=FF.plant().cap.procure;
 for(var i=0;i<h.length;i++){
  a+=h[i].acc/FF.plant().cap.intake;b+=h[i].sold/FF.plant().cap.sales;
  c+=capP>0?Math.min(h[i].prod,capP)/capP:0;
 }
 return{intake:a/h.length*100,sales:b/h.length*100,procure:c/h.length*100};
}

FF.recordDay=function(r,ev){
 FF.pushHist({day:FF.run().day,prod:r.prod,dem:r.dem,acc:r.acc,refused:r.refused,sold:r.sold,
  missed:r.missed,ageMix:r.ageMix,wI:r.wI,wIcap:r.wIcap,wIprocure:r.wIprocure,wIstore:r.wIstore,wIneed:r.wIneed,
  wS:r.wS,wT:r.wT,end:r.end,profit:r.profit-r.cost,b:r.b,
  si:FF.MARKET.value.si,di:FF.MARKET.value.di,
  capI:FF.plant().cap.intake,capS:FF.plant().cap.sales,capP:FF.plant().cap.procure,
  toCh:r.toCh.slice(),revCh:r.revCh.slice(),rel:FF.relOf().slice(),
  stance:(FF.stanceOf()||FF.C.channels.map(function(){return FF.C.stance.start})).slice()});
 for(var mi=0;mi<FF.logOf().mods.length;mi++){
  var md=FF.logOf().mods[mi];
  if(FF.run().day<=md.day)continue;
  var procured=Math.min(r.prod,FF.plant().cap.procure);
  md.use.push(md.kind==="contract"?(r.acc/FF.plant().cap.intake)
    :md.kind==="procure"?(FF.plant().cap.procure>0?procured/FF.plant().cap.procure:0)
    :(r.sold/FF.plant().cap.sales));
  md.extra=(md.extra||0)+(md.kind==="contract"?Math.max(0,r.acc-FF.plant().cap.intake)
    :md.kind==="procure"?Math.max(0,procured-md.from)
    :Math.max(0,r.sold-md.from));
  if(FF.run().day<=md.day+3){
   if(md.kind==="contract"&&r.acc>FF.plant().cap.intake+0.05)md.hit++;
   if(md.kind==="sales"&&r.sold>=FF.plant().cap.sales-0.05)md.hit++;
   if(md.kind==="procure"&&r.wIprocure>0.05)md.hit++;
  }
 }
 var actionable=(r.b==="intake"||r.b==="procure"||r.b==="ship"||r.b==="store"||r.b==="stock");
 var changed=(r.b!==FF.engineState().prevB);
 FF.engineState().prevB=r.b;
 FF.setEvent((actionable&&changed)?{b:r.b}:null);
 if(FF.evt())FF.append("evlog",{day:FF.run().day,b:r.b});
 if(ev)for(var q=0;q<ev.length;q++){
  if(ev[q].type==="purchase")
   FF.append("timeline",{day:ev[q].day,type:"buy",kind:ev[q].capacity,
    newCap:(ev[q].capacity==="contract")?FF.contractOf()
      :(FF.plant().cap[ev[q].capacity]+FF.C.step[ev[q].capacity])});
  // 이슈 #9: factor 이벤트가 지금까지 timeline에 안 남아서 실행 후 아무 흔적이 없었다(폐루프
  // 단절). 사실만 남긴다 - 요청액/입금액/비용. "이 덕에 파산을 피했다" 같은 인과 주장은
  // 반사실 없이는 할 수 없으므로 넣지 않는다(#20의 귀속 문제와 같은 함정).
  if(ev[q].type==="factor")
   FF.append("timeline",{day:ev[q].day,type:"factor",amount:ev[q].amount,cashIn:ev[q].cashIn,cost:ev[q].cost});
 }
}

// 구매 순간의 관측치를 남긴다. 게임 규칙이 아니라 기록이다.
FF.recordPurchase=function(act,path,size){
 var day=FF.run().day;
 var T=FF.tiltOf();
 var svB=FF.pct(FF.blur(FF.hor(FF.MARKET.value.si,4,7,FF.C,T.supply)));
 var dvB=FF.pct(FF.blur(FF.hor(FF.MARKET.value.di,4,7,FF.C,T.demand)));
 if(act==="contract"){
  // 계약은 개장 전 결정이다. 근거는 관측이 아니라 근일 전망이다.
  size=size||FF.contractOf();
  FF.append("mods",{kind:act,day:day,idx:1,from:0,size:size,use:[],hit:0});
  FF.append("buylog",{day:day,kind:act,
   gap:dvB[2]-dvB[0], supplyGap:svB[2]-svB[0],
   tilt:T.demand, supplyTilt:T.supply,
   hitN:0,hitLen:0,left:FF.C.days-day,path:path||"manual",
   util:null,nth:1,cap:size});
  return;
 }
 FF.append("mods",{kind:act,day:day,idx:FF.plant().buys[act]+1,
   from:FF.plant().cap[act],use:[],hit:0});
 var hB=FF.capHits(act,5),uB=FF.useRate(3);
 var gB=dvB[2]-dvB[0];
 var ES=FF.engineState();
 if(FF.dirOf(gB)!==0&&ES.phase[act].dir===FF.dirOf(gB))ES.phase[act].n++;
 else {ES.phase[act].dir=FF.dirOf(gB);ES.phase[act].n=FF.dirOf(gB)===0?0:1}
 ES.lastBuy[act]=day;
 FF.append("buylog",{day:day,kind:act,gap:gB,
  hitN:hB.n, hitLen:hB.len, left:FF.C.days-day, path:path||"manual",
  util:Math.round(uB[act]),
  nth:FF.plant().buys[act]+1,cap:FF.plant().cap[act]});
}

// 하루 시작 시점의 한도 도달 여부를 남긴다.
FF.recordDayStart=function(atCapIntake,atCapSales,act){
 FF.append("events",{day:FF.run().day,atCapIntake:atCapIntake,
   atCapShipping:atCapSales,bought:act||"none"});
}


// 새 사건을 진행 기록에 남긴다.
FF.recordEvent=function(){
 var ev=FF.evt();
 if(!ev)return;
 FF.append("timeline",{day:FF.run().day-1,type:"event",b:ev.b});
}

// 이슈 #25/#27/#28: 자동진행 WARNING. #25가 검증한 4개 트리거 정의(롤링 9일창 진단·
// 14일창 shortfallRatio·관계 하락)를 headless 검증 스크립트와 같은 상수로 그대로 옮긴다.
// 새 hidden fact를 안 쓴다 - FF.histOf()에 이미 기록된 값만 읽는다.
FF.TRIGGER_DIAG_WINDOW=9; FF.TRIGGER_SIG_WINDOW=14; FF.TRIGGER_SHORTFALL_TH=0.10;
// 이 1은 부동소수 오차 여유(FF.C.ui.eps=0.05)가 아니라 #25/#27 전체가 쓴 중요도
// 문턱이다 - 롤링창 합이 그보다 작으면 신호로 보지 않는다. 서로 다른 목적이라 섞지 않는다.
FF.TRIGGER_EPS=1;
// #27이 검증한 재알림 주기. 관계/Intake/Sales는 episode당 1회(재알림 없음)로 확정됐으므로
// 이 표에 없다 - Procurement만 유의미한 경제적 근거(21일도 edgeOnly 대비 개선 유지)가 있었다.
FF.RENOTIFY_DAYS={procure:21};

FF.shipShortfallAmt=function(d){
 var eps=FF.C.ui.eps;
 return (d.sold>=d.capS-eps&&d.dem>d.sold+eps)?(d.dem-d.sold):0;
}
// 롤링 9일창 최댓값 진단. procure-endtoend-sim.mjs/trigger-capacity-delay-sim.mjs와 같은
// 방식이다 - day 당일은 포함하지 않는다(그날 아직 안 지났다).
FF.triggerDiagAt=function(day){
 var hist=FF.histOf(), from=Math.max(1,day-FF.TRIGGER_DIAG_WINDOW);
 var sumCap=0,sumProcure=0,sumStore=0,sumCash=0,sumShip=0;
 for(var i=0;i<hist.length;i++){
  var d=hist[i]; if(d.day<from||d.day>=day)continue;
  sumCap+=d.wIcap; sumProcure+=d.wIprocure; sumStore+=d.wIstore; sumCash+=d.wS; sumShip+=FF.shipShortfallAmt(d);
 }
 var maxV=Math.max(sumCap,sumProcure,sumStore,sumCash,sumShip);
 if(maxV<=FF.TRIGGER_EPS)return "none";
 if(sumCap===maxV)return "intake_cap";
 if(sumProcure===maxV)return "procure_cap";
 return "other";
}
FF.triggerShortfallRatioAt=function(day){
 var hist=FF.histOf(), from=Math.max(1,day-FF.TRIGGER_SIG_WINDOW), s=0,c=0;
 for(var i=0;i<hist.length;i++){
  var d=hist[i]; if(d.day<from||d.day>=day)continue;
  s+=FF.shipShortfallAmt(d); c+=d.capS;
 }
 return c>0?s/c:0;
}
// day(이미 기록된 과거 날짜)에 어느 채널이든 전날보다 관계가 내려갔는지.
FF.stanceDeclinedOn=function(day){
 var hist=FF.histOf(), idx=-1;
 for(var i=0;i<hist.length;i++)if(hist[i].day===day){idx=i;break}
 if(idx<=0)return false;
 var cur=hist[idx].rel, prev=hist[idx-1].rel;
 for(var c=0;c<cur.length;c++)if(cur[c]<prev[c])return true;
 return false;
}
// 이슈 #28: episode(false→true=시작, true 지속=같은 episode, true→false=종료) 정의를
// #27과 그대로 맞춘다. 새 episode는 cooldown과 무관하게 항상 알린다 - cooldown은 같은
// episode가 RENOTIFY_DAYS보다 길게 이어질 때만 재알림에 적용한다(#27 검증 그대로).
// ENGINE.warn은 이 함수의 유일한 쓰기 지점이다 - 경제 판정(sig)은 여기서 만들지 않고
// triggerDiagAt/triggerShortfallRatioAt/stanceDeclinedOn이 이미 낸 값만 읽는다.
FF.updateWarnings=function(){
 if(FF.isOver())return [];
 var day=FF.dayOf();
 var diag=FF.triggerDiagAt(day);
 var sig={
  stance: FF.stanceDeclinedOn(day-1),
  intake: diag==="intake_cap",
  sales: FF.triggerShortfallRatioAt(day)>FF.TRIGGER_SHORTFALL_TH,
  procure: diag==="procure_cap"
 };
 var W=FF.ENGINE.value.warn, fired=[];
 for(var k in sig){
  var w=W[k], on=sig[k];
  if(on&&!w.active){ w.active=true; w.lastNotifyDay=day; fired.push(k); }
  else if(on&&w.active){
   var rn=FF.RENOTIFY_DAYS[k];
   if(rn&&day-w.lastNotifyDay>=rn){ w.lastNotifyDay=day; fired.push(k); }
  } else if(!on){ w.active=false; }
 }
 return fired;
}

// 관계 신호와 이슈. 신호는 방금 무엇이 바뀌었는지, 이슈는 지금 무엇이 열려 있는지다.
// 이슈는 의도(우선/보장)와 실제(오늘 쿼터 미달)가 어긋날 때만 연다.
// 양보나 보통에서 쿼터를 못 채우는 것은 의도와 어긋나지 않으므로 이슈가 아니다.
// 오늘 막 떨어졌으면 decline, 이미 나쁜 상태였는데 이제 지키기로 했으면 stuck 이다.
// 이미 열려 있으면 다시 열지 않는다(매일 신호하지 않는다). 회복은 열린 이슈를 닫는다.
FF.recordIssues=function(prevRel,r){
 var CH=FF.C.channels, nch=CH.length, curRel=FF.relOf(), day=FF.run().day;
 var stance=FF.stanceOf();
 var issues=FF.issueOf().slice(), signals=[];
 for(var i=0;i<nch;i++){
  var lvl=(stance&&stance.length===nch)?stance[i]:FF.C.stance.start;
  var quotaFail=r.toCh[i]<CH[i].quota-FF.C.ui.zero;
  if(lvl>=2&&quotaFail){
   if(!issues[i]){
    issues[i]={since:day,resolution:null};
    signals.push({type:curRel[i]<prevRel[i]?"decline":"stuck",i:i,day:day,from:prevRel[i],to:curRel[i]});
   }
  } else if(issues[i]){
   // 회복 판정은 관계가 올랐는가(curRel>prevRel)가 아니라 지금 쿼터를 채우고 있는가로 본다.
   // 관계가 이미 최고 단계면 더 오를 수 없어서 전자로는 영영 닫히지 않는다(issue #4).
   signals.push({type:"recover",i:i,day:day,from:prevRel[i],to:curRel[i]});
   issues[i]=null;
  }
 }
 FF.setIssue(issues);
 FF.setSignal(signals);
 for(var si=0;si<signals.length;si++)FF.append("relLog",signals[si]);
}
