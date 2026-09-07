
FV.MOUNT=null;






FV.FlowSummary=function(props){
 var d=props.day;
 if(FF.isOver())return FV._html`<div id="kbn" class="sub-p">${FF.isBust()?"현금 소진":FF.C.days+"일 운영 결과"}</div>`;
 if(!d)return FV._html`<div id="kbn" class="sub-p"></div>`;
 return FV._html`
  <div id="kbn" class="sub-p">
   <span style=${{fontSize:"12px",color:"var(--text-muted)"}}>어제 막힌 곳</span><br />
   <span style=${{color:"var(--text-warning)"}}>${FV.BL[d.b]}</span><br />
   <span style=${{fontSize:"12px",color:"var(--text-secondary)"}}>${FV.causeLine(d)}</span>
  </div>`;
}

FV.DecisionMetric=function(props){
 return FV._html`
  <div style=${{display:"flex",justifyContent:"space-between",gap:"6px",fontSize:"11px",lineHeight:"1.5"}}>
   <span style=${{color:"var(--text-muted)"}}>${props.label}</span>
   <span style=${{color:props.warn?"var(--text-warning)":"var(--text-secondary)"}}>${props.value}</span>
  </div>`;
}

// 초과분 매입 계약 선택지. 첫날에 노출량을 고른다.
FV.ContractOption=function(props){
 var o=props.opt, zero=(o.x===0);
 var on=zero?!FF.queued("contract"):FF.queued("contract",o.x);
 var afford=zero||FF.status().cash>=o.price;
 return FV._h("button",{
   id:props.id, class:"btn-cell"+(on?" opt-on":""),
   style:{borderColor:on?"var(--border-accent)":"var(--border-strong)",
     background:"transparent",opacity:afford?"1":"0.4"},
   onClick:function(){ if(zero)FF.clearQueue(); else FF.toggleBuy("contract",o.x) }
  },[
   FV._h("div",{class:"opt-size"}, zero?"계약 없음":("+"+o.x+"t")),
   FV._h("div",{class:"opt-price"}, zero?"0원":(mo(o.price)+"원")),
   FV._h("div",{class:"opt-note"},
     zero?"한도까지만 받는다":("한도 넘는 날 "+o.x+"t 더 받는다"))
  ]);
}

// 신호는 방금 무엇이 바뀌었는지, 이슈는 지금 무엇이 열려 있는지다. 평소엔 아무것도 그리지 않는다.
FV.IssueBar=function(){
 FF.observe();
 if(FF.isOver())return null;
 var P=FF.issuePlan();
 if(!P.signals.length&&!P.issues.length)return null;
 var chName=function(i){return FV.say("channel",FF.C.channels[i].key)};
 var relWord=function(v){return FV.say("relword",String(v))};
 var sigRows=P.signals.map(function(s){
  return FV._h("div",{class:"sig sig-"+s.type},
   chName(s.i)+" "+FV.say("signal",s.type)+" · "+relWord(s.from)+" → "+relWord(s.to));
 });
 var issueRows=P.issues.map(function(is){
  var accepted=is.resolution==="accepted";
  return FV._h("div",{class:"issue"+(accepted?" issue-accepted":"")},[
   FV._h("div",{class:"issue-head"},
    chName(is.i)+" 정책: "+FV.say("stance",String(is.level))+" · "+is.days+"일째 · 현재 "+relWord(is.rel)),
   FV._h("div",{class:"issue-nums"},
    "예상 판매 "+FF.fInt(is.preview)+"t · 관계 유지 기준 "+FF.fInt(is.quota)+"t"),
   FV._h("div",{class:"issue-verdict"},FV.say("feasible",is.feasible)),
   accepted
    ?FV._h("span",{class:"issue-ack"},"의도적 포기")
    :FV._h("button",{class:"issue-btn",onClick:function(){FF.acceptIssue(is.i)}},"포기")
  ]);
 });
 return FV._h("div",{id:"kissue",class:"issuebar"},sigRows.concat(issueRows));
}

FV.ChannelBar=function(){
 FF.observe();
 if(FF.isOver())return null;
 var P=FF.stancePlan(), IP=FF.issuePlan();
 var issueOf=function(i){
  for(var k=0;k<IP.issues.length;k++)if(IP.issues[k].i===i)return IP.issues[k];
  return null;
 };
 var STANCE_LEVELS=[0,1,2,3];
 var rows=P.rows.map(function(r,i){
  var issue=issueOf(i);
  var statusTxt=issue?(" · "+(issue.resolution==="accepted"?"포기함":"회복 중")):"";
  var missTxt=P.missed[i]>=1?(" · 다른 판로 우선으로 "+FF.fInt(P.missed[i])+"t 못 받음"):"";
  var condTxt=r.price+"원 · 주문 "+FF.fInt(P.est[i])+"t · 최대 "+r.cap+"t"+
   (r.floor>0?(" · 보장 "+r.floor+"t"):"");
  return FV._h("div",{class:"chan-card"},[
   FV._h("div",{class:"chan-id"},[
    FV._h("span",{class:"chan-name"},FV.say("channel",r.key)),
    FV._h("span",{class:"chan-rel"},FV.say("relword",String(r.rel))+" "+r.rel)
   ]),
   FV._h("div",{class:"chan-cond"},condTxt),
   FV._h("div",{class:"chan-policy"},STANCE_LEVELS.map(function(lv){
    return FV._h("button",{class:"pol"+(P.levels[i]===lv?" pol-on":""),
     onClick:function(){FF.setChannelStance(i,lv)}},FV.say("stance",String(lv)));
   })),
   FV._h("div",{class:"chan-preview"},"예상 "+FF.fInt(P.preview[i])+"t"+statusTxt+missTxt)
  ]);
 });
 return FV._h("div",{id:"kchan",class:"chan"},[
  FV._h("div",{class:"chan-head"},[
   FV._h("div",{class:"chan-head-num"},"재고 "+FF.fInt(P.inv)+"t · 오래된 재고 "+FF.fInt(FF.oldStock())+"t"),
   FV._h("div",{class:"chan-head-note"},"입고 예상 "+FF.fInt(P.exp)+"t · 판매 한도 "+FF.capsOf().sales+"t")
  ]),
  rows,
  FV._h("div",{class:"chan-sum"},[
   FV._h("span",{},"보장 판로부터 확보한 뒤 나머지를 태도 비중으로 나눈다"),
   FV._h("button",{class:"cs cs-auto",onClick:function(){FF.clearStance()}},"초기화")
  ])
 ]);
}

// 판매 한도 증설. 표시는 항상, 값은 커널의 하루 총 판매 상한이다.
FV.CapacityButton=function(){
 FF.observe();
 if(FF.isOver()||!FF.started())return null;
 var on=FF.queued("sales"), opt=FF.optionOf("sales");
 return FV._h("button",{id:"kbs",class:"btn-cell"+(on?" opt-on":""),
   style:{borderColor:on?"var(--border-accent)":"var(--border-strong)",
     background:"transparent",opacity:(opt.affordable||on)?"1":"0.4"},
   onClick:function(){if(!FF.isOver())FF.toggleBuy("sales")}},[
  FV._h("div",{},"판매 한도 늘리기"),
  FV._h("div",{class:"opt-price"},FV.capShift("sales")+" · "+mo(opt.cost)+"원")
 ]);
}


FV.FirstDayPrompt=function(){
 
 return FV._html`
  <${FV._F}>
   <${FV.Panel} id="kexplore" className="card">
    <div style=${{fontSize:"13px",color:"var(--text-primary)",marginBottom:"4px"}}>개장 전</div>
    <div style=${{fontSize:"12px",color:"var(--text-secondary)",lineHeight:"1.6"}}>
     이번 달 전망을 보고 초과분을 얼마나 더 받을지 정한다. 계약은 지금만 맺을 수 있다.</div>
   <//>
   <${FV.MonthOutlook} data=${FF.monthOutlook()} />
   <div id="kopening" class="opts">
    ${FF.C.contract.options.map(function(o,i){
      return FV._html`<${FV.ContractOption} opt=${o} id=${"kbc"+i} />`;
    })}
   </div>
  <//>`;
}



// 당일 결과. 판로별 판매량과 매출과 관계 변화. 다음 판단의 근거다.
FV.DayResultView=function(){
 var rows=FF.dayChannelResult();
 if(!rows)return null;
 return FV._h("div",{id:"kdayresult",class:"dayresult"},rows.map(function(r){
  var chg=r.changed?(" · 관계 "+FV.say("relword",String(r.relFrom))+" → "+FV.say("relword",String(r.relTo))):"";
  return FV._h("div",{class:"dr-row"},
   FV.say("channel",r.key)+" "+FF.fInt(r.sold)+"t 판매 · "+mo(r.revenue)+"원"+chg);
 }));
}

FV.FlowView=function(){
 var d=FF.today();
 return FV._html`
  <div id="kylabel" class="lbl">${d?(d.day+"일 결과"):"운영 시작 전"}</div>
  <${FV.FlowSummary} day=${d} />
  <${FV.DayResultView} />
  <div id="kchain" class="gap-s">
   <${FV.FlowDiagram} day=${d} inventory=${FF.inventory()} />
  </div>`;
}


FV.NavBarView=function(){
 FF.observe(); FF.SIG.newGame.value;
 var mid=!FF.isOver()&&FF.started(), done=FF.isOver(), arm=FF.SIG.newGame.value;
 var S=FF.status();
 var d=S?S.day:1, pf=S?S.profit:null;
 var label=function(){
  if(FF.isOver())return "운영 종료";
  if(!FF.started())return null;
  var sig=FF.signalOf();
  if(sig.length){
   var s0=sig[0];
   var name=FV.say("channel",FF.C.channels[s0.i].key);
   return "최근 사건: "+name+" 관계가 "+(s0.type==="recover"?"회복되었습니다":"악화되었습니다");
  }
  var ev=FF.evt();
  return ev?FV.EVENT_TEXT[ev.b]:"특이사항 없이 운영 중";
 }();
 var newGame=function(){
  var m=!FF.isOver()&&FF.started();
  if(m&&!FF.SIG.newGame.value){
   FF.SIG.newGame.value=true;
   setTimeout(function(){FF.SIG.newGame.value=false},FF.C.ui.newArmMs);
   return;
  }
  FF.SIG.newGame.value=false;
  var el=document.getElementById("kseed");
  FV.newGame(el&&el.value?el.value:0);
  if(el)el.value="";
 };
 return FV._html`
  <${FV._F}>
   <div style=${{display:"flex",alignItems:"center",gap:"6px",margin:"20px 0 12px"}}>
    <div style=${{fontSize:"16px",fontWeight:"600",letterSpacing:"-.01em",flex:"1"}}>양파 · 30일 운영</div>
    <input id="kseed" inputmode="numeric" placeholder="시드" class="btn-sm"
     style=${{width:"64px",background:"transparent",color:"var(--text-primary)",border:"1px solid var(--border-strong)",borderRadius:"var(--radius)"}} />
    <button id="knew" class="btn-sm"
     style=${{
      borderColor:arm?"var(--border-warning)":(mid?"var(--border-strong)":"var(--border-accent)"),
      color:arm?"var(--text-warning)":(mid?"var(--text-muted)":(done?"var(--text-success)":"var(--text-primary)"))
     }}
     onClick=${newGame}>${arm?"버리고 새 게임":(done?"새 게임 ▸":"새 게임")}</button>
   </div>
   <div style=${{display:"flex",gap:"14px",flexWrap:"wrap",paddingBottom:"10px",borderBottom:"1px solid var(--border)",marginBottom:"14px"}}>
    <div style=${{fontSize:"13px",color:"var(--text-secondary)"}}>일차 <span id="kd" style=${{color:"var(--text-primary)",fontWeight:"500"}}>${d}</span> / ${FF.C.days}</div>
    <div style=${{fontSize:"13px",color:"var(--text-secondary)"}}>현금 <span id="kc" style=${{color:"var(--text-primary)",fontWeight:"500"}}>${mo(S.cash)}</span></div>
    <div style=${{fontSize:"13px",color:"var(--text-secondary)"}}>어제 손익 <span id="kp" style=${{fontWeight:"500",color:pf===null?"var(--text-primary)":(pf>=0?"var(--text-success)":"var(--text-danger)")}}>${pf===null?"—":((pf>=0?"+":"-")+mo(Math.abs(pf)))}</span></div>
    <div style=${{fontSize:"13px",color:"var(--text-secondary)"}}>시드 <span id="ks" style=${{color:"var(--text-primary)"}}>${S.seed}</span></div>
   </div>
   ${label?FV._html`<div id="klabel" class="lbl">${label}</div>`:null}
  <//>`;
}

// 개장 전 화면. 본문에 남는다. 전망을 넓게 봐야 하기 때문이다.
FV.OpeningView=function(){
 FF.observe(); if(FF.isOver()||FF.started())return null;
 return FV._html`<${FV.FirstDayPrompt} />`;
}

FV.ForecastView=function(){
 FF.observe();
 if(!FF.started()||FF.isOver())return null;
 return FV._html`<div id="kchart" class="gap-m"><${FV.ForecastMatrix} matrix=${FF.matrixData()} /></div>`;
}

FV.TimelineChartView=function(){
 FF.observe();
 if(!FF.isOver()||!FF.started())return null;
 return FV._html`<div id="kchart" class="gap-m"><${FV.TimelineChart} data=${FF.chartData()} /></div>`;
}

FV.GameResultView=function(){
 FF.GAME.value;
 if(!FF.isOver())return null;
 return FV._html`
  <div id="kbrief">
   <${FV.Panel} className="card">
    ${FV.endCardNode()}
   <//>
  </div>`;
}

// 시계 막대. 진행과 속도를 고른다.
// 최근 추세 두 줄. 계약과 판매의 신호를 항상 볼 수 있게 한다.
FV.TrendStrip=function(){
 FF.observe();
 if(!FF.started()||FF.isOver())return null;
 var S=FF.recentSeries(8);
 if(S.stock.length<2)return null;
 var last=function(a){return a[a.length-1]};
 return FV._html`
  <div id="ktrend" class="trendstrip">
   <${FV.Spark} label="재고" values=${S.stock} now=${FF.fInt(last(S.stock))+"t"} floor=${8} day=${last(S.days)} />
   <${FV.Spark} label="못 판 주문" values=${S.missed} now=${FF.fInt(last(S.missed))+"t"} floor=${2} day=${last(S.days)} />
  </div>`;
}

FV.ClockBar=function(){
 FF.observe(); FF.GAME.value;
 var c=FF.clockOf();
 if(FF.isOver()||!FF.started())return null;
 var btn=function(label,on,fn){
  return FV._h("button",{class:"clk"+(on?" clk-on":""),onClick:fn},label);
 };
 return FV._html`
  <div id="kclock" class="clockbar">
   ${btn(c.running?"❚❚":"▶",c.running,function(){
     if(c.running)FV.stopClock(); else FV.startClock();
     FF.setClock(!c.running);
   })}
   <span class="clk-day">
    ${c.running?(FV.clockLeft()+"초"):"정지"} · ${FF.dayOf()} / ${FF.C.days}일</span>
  </div>`;
}

FV.DockView=function(){
 FF.observe();
 var started=FF.started(), over=FF.isOver();
 var goText=over?"30일 종료 · 결과 확인":(started?"하루 넘기기":"첫날 운영");
 var arm=FF.SIG.fin.value, leftD=FF.C.days-FF.dayOf()+1;
 var finish=function(){
  if(!FF.SIG.fin.value){
   FF.SIG.fin.value=true;
   setTimeout(function(){FF.SIG.fin.value=false},FF.C.ui.armMs);
   return;
  }
  FF.SIG.fin.value=false;FF.stepDay(FF.Cmd.finish());
 };
 return FV._html`
  <div class="dock">
   <${FV.ClockBar} />
   <${FV.TrendStrip} />
   <${FV.IssueBar} />
   <${FV.ChannelBar} />
   <${FV.CapacityButton} />
   <button id="kgo" class="btn-full"
    style=${{borderColor:over?"var(--border)":"var(--border-strong)",color:over?"var(--text-muted)":"var(--text-primary)"}}
    onClick=${function(){if(!FF.isOver())FF.tickDay()}}>${goText}</button>
   ${started&&!over?FV._html`
    <button id="kfin" class="btn-sub"
     style=${{borderColor:"var(--text-danger)",color:arm?"var(--text-danger)":"var(--text-secondary)",background:arm?"var(--bg-danger)":"transparent"}}
     onClick=${finish}>
     ${arm?FV._html`
      <b>30일까지 운영</b><br />
      <span style=${{fontSize:"11px"}}>남은 ${leftD}일을 더 사지 않고 운영한다. 되돌릴 수 없다.</span>`:FV._html`
      운영 종료<br />
      <span style=${{fontSize:"11px",color:"var(--text-danger)"}}>되돌릴 수 없다 · 이후 투자 불가</span>`}
    </button>`:null}
  </div>`;
}

FV.OutlookView=function(){
 FF.observe();
 if(!FF.started()||FF.isOver())return null;
 return FV._html`<${FV.MonthOutlook} data=${FF.monthOutlook()} />`;
}

// 사건 이력. 지금까지의 관계 신호를 최신순으로 나열한다. 없으면 안내 한 줄만 보인다.
FV.EventLogView=function(){
 FF.observe();
 if(!FF.started()||FF.isOver())return null;
 var log=FF.relLogOf();
 if(!log.length)return FV._h("div",{class:"sub"},"아직 발생한 사건이 없다");
 var rows=log.slice().reverse().map(function(s){
  var name=FV.say("channel",FF.C.channels[s.i].key);
  var verb=FV.say("signal",s.type);
  return FV._h("div",{class:"rl-row"},[
   FV._h("span",{class:"rl-day"},s.day+"일"),
   name+" "+verb+" · "+FV.say("relword",String(s.from))+" → "+FV.say("relword",String(s.to))
  ]);
 });
 return FV._h("div",{class:"rellog"},rows);
}

FV.PlayPager=function(){
 if(!FF.histLen()||FF.isOver())return null;
 return FV._html`
  <nav class="tabs">
   <a href="#p0">어제 흐름</a>
   <a href="#p1">사건 이력</a>
   <a href="#p2">월간 전망</a>
  </nav>
  <div class="pager">
   <section class="pane" id="p0"><${FV.FlowView} /></section>
   <section class="pane" id="p1"><${FV.EventLogView} /></section>
   <section class="pane" id="p2"><${FV.OutlookView} /></section>
  </div>`;
}

FV.App=function(){
 FF.observe();
 var fresh=!FF.histLen(), over=FF.isOver();
 return FV._html`
  <div>
   <${FV.NavBarView} />
   <${FV.ForecastView} />
   <${FV.TimelineChartView} />
   <${FV.GameResultView} />
   <${FV.OpeningView} />

   ${fresh?FV._html`<${FV.FlowView} />`:null}
   <${FV.PlayPager} />
   ${over?FV._html`<${FV.FlowView} />`:null}

   <div class="dock-space"></div>
   <${FV.DockView} />
  </div>`;
}
// 실시간 시계. 표현 시간과 시뮬레이션 시간을 분리한다.
// 재생을 누를 때만 타이머가 생긴다. 누르지 않으면 타이머가 없다.
FV.CLOCK_MS=5000;
// 시계 수명. 시작과 정지를 명시적으로 관리한다.
// 다음 하루까지 남은 초.
FV.clockLeft=function(){
 return Math.max(0,Math.round((FV.CLOCK_MS-(FV._acc||0))/1000));
}

FV.newGame=function(seed){
 FV.stopClock();
 FF.startNew(seed);
}

FV.TICK_MS=1000;
FV.startClock=function(){
 if(FV._timer)return;
 FV._timer=setInterval(function(){
  if(!FF.clockOf().running||FF.isOver()){FV.stopClock();return}
  FV._acc=(FV._acc||0)+FV.TICK_MS;
  if(FV._acc>=FV.CLOCK_MS){FV._acc=0;FF.tickDay()}
  else FF.repaint();
 },FV.TICK_MS);
}

// 시계를 멈춘다. 테스트와 창 종료에서 부른다.
FV.stopClock=function(){
 if(!FV._timer)return;
 clearInterval(FV._timer);
 FV._timer=null; FV._acc=0;
}

FV.paint=function(){
 if(FV.MOUNT)return;
 FV.MOUNT=document.getElementById("app");
 FV._render(FV._html`<${FV.App} />`,FV.MOUNT);
}


