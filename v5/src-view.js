
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

FV.ChannelBar=function(){
 FF.observe();
 if(FF.isOver())return null;
 var P=FF.allocPlan(), eps=FF.C.ui.zero;
 var stepBtn=function(i,dir,on){
  return FV._h("button",{class:"cs",disabled:!on,
   onClick:function(){if(on)FF.bumpChannel(i,dir)}},dir>0?"+":"\u2212");
 };
 var rows=P.rows.map(function(r,i){
  var t=P.tons[i];
  return FV._h("div",{class:"chan-row"},[
   FV._h("span",{class:"chan-name"},FV.say("channel",r.key)),
   FV._h("span",{class:"chan-rel"},FV.say("relword",String(r.rel))),
   FV._h("div",{class:"chan-step"},[
    stepBtn(i,-1,t>eps),
    FV._h("input",{class:"cn",inputmode:"numeric",value:FF.fInt(t),
     onChange:function(e){FF.setChannelTons(i,parseFloat(e.target.value))}}),
    FV._h("span",{class:"cn-unit"},"t"),
    stepBtn(i,1,t<r.cap-eps&&P.rest>eps)
   ]),
   FV._h("span",{class:"chan-info"},
    r.price+"원 · 최대 "+r.cap+"t"+(r.floor>0?(" · 보장 "+r.floor+"t"):"")),
   FV._h("span",{class:"chan-term"},
    (r.settle===0?"당일 정산":(r.settle+"일 뒤 정산"))+" · "+r.quota+"t 넣으면 관계 상승")
  ]);
 });
 var note=(P.rest>eps)?FV._h("span",{class:"chan-rest"},"남김 "+FF.fInt(P.rest)+"t")
   :((P.rest<-eps)?FV._h("span",{class:"chan-rest"},"초과 "+FF.fInt(-P.rest)+"t"):null);
 return FV._h("div",{id:"kchan",class:"chan"},[
  FV._h("div",{class:"chan-head"},
   "이월 "+FF.fInt(P.inv)+"t + 오늘 입고 예상 "+FF.fInt(P.exp)+"t · 판로가 받는 최대 "+FF.fInt(P.target)+"t"),
  rows,
  FV._h("div",{class:"chan-sum"},[
   FV._h("span",{},"합계 "+FF.fInt(P.sum)+" / "+FF.fInt(P.target)+"t"),
   note,
   FV._h("button",{class:"cs cs-auto"+(P.auto?" cw-on":""),
    onClick:function(){FF.clearAlloc()}},"자동")
  ])
 ]);
}


// 첫날. 월간 전망을 보고 계약 여부를 정한다. 계약은 이 화면에서만 산다.
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



FV.FlowView=function(){
 var d=FF.today();
 return FV._html`
  <div id="kylabel" class="lbl">${d?(d.day+"일 결과"):"운영 시작 전"}</div>
  <${FV.FlowSummary} day=${d} />
  <div id="kchain" class="gap-s">
   <${FV.FlowDiagram} day=${d} inventory=${FF.inventory()} />
  </div>`;
}


// 이번 판에 산 것들. 진행 중에만 보인다.
FV.HistoryView=function(){
 if(!FF.started()||FF.isOver())return null;
 var modRows=FF.modRows();
 if(!modRows.length)return null;
 return FV._html`
  <div>
   ${modRows.map(function(m){
     return FV._html`<div class="card-note">${m.day}일 ${FV.lblOf(m.kind)}</div>`;
   })}
  </div>`;
}


FV.NavBarView=function(){
 FF.observe(); FF.SIG.newGame.value;
 var mid=!FF.isOver()&&FF.started(), done=FF.isOver(), arm=FF.SIG.newGame.value;
 var S=FF.status();
 var d=S?S.day:1, pf=S?S.profit:null;
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
  <//>`;
}

// 개장 전 화면. 본문에 남는다. 전망을 넓게 봐야 하기 때문이다.
FV.OpeningView=function(){
 FF.observe(); if(FF.isOver()||FF.started())return null;
 return FV._html`<${FV.FirstDayPrompt} />`;
}

// 진행 중 결정. 독 안에 들어간다.
FV.DecisionView=function(){
 FF.observe(); FF.SIG.manual.value;
 if(FF.isOver())return FV._html`<div id="klabel" class="lbl">운영 종료</div>`;
 if(!FF.started())return null;
 var ev=FF.evt();
 var evTxt=ev?FV.EVENT_TEXT[ev.b]:"특이사항 없이 운영 중";
 return FV._html`
  <div id="klabel" class="lbl">${evTxt} · 남은 ${FF.C.days-FF.dayOf()+1}일</div>`;
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
   <${FV.ChannelBar} />
   <${FV.DecisionView} />
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

FV.PlayPager=function(){
 if(!FF.histLen()||FF.isOver())return null;
 return FV._html`
  <nav class="tabs">
   <a href="#p0">어제 흐름</a>
   <a href="#p1">일별 기록</a>
   <a href="#p2">월간 전망</a>
  </nav>
  <div class="pager">
   <section class="pane" id="p0"><${FV.FlowView} /></section>
   <section class="pane" id="p1"><${FV.HistoryView} /></section>
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


