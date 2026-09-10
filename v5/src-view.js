
FV.MOUNT=null;






FV.FlowSummary=function(props){
 // 안의 펼치기(FV.OPEN)가 열리고 닫히는 것은 props.day가 안 바뀌므로, 이 컴포넌트가 직접
 // 구독하지 않으면 다시 그려지지 않는다. 다른 상호작용 컴포넌트와 같은 이유로 observe를 부른다.
 FF.observe();
 var d=props.day;
 if(FF.isOver())return FV._html`<div id="kbn" class="sub-p">${FF.isBust()?"현금 소진":FF.C.days+"일 운영 결과"}</div>`;
 if(!d)return FV._html`<div id="kbn" class="sub-p"></div>`;
 // 병목 표시는 실제로 뭔가 놓쳤을 때만 쓴다. 수요가 적어 여력이 남은 날은 정상 상태이지 장애가 아니다.
 // "어제"라고만 쓰면 지금 보고 있는 오늘의 예상치와 섞여 읽힌다. 날짜 숫자를 직접 박아 시점을 명확히 한다.
 var lost=FF.isLossCause(d.b);
 var boost=FF.contractBoostToday();
 // 판로별 상세는 펼치기로 내린다. 여기서는 하루 전체 총계만 보인다.
 var revTotal=(d.revCh||[]).reduce(function(a,b){return a+b},0);
 return FV._html`
  <div id="kbn" class="sub-p">
   <span style=${{fontSize:"12px",color:"var(--text-muted)"}}>${d.day+"일차 "+(lost?"막힌 곳":"상태")}</span><br />
   <span style=${{color:lost?"var(--text-warning)":"var(--text-secondary)"}}>${FV.BL[d.b]}</span><br />
   <span style=${{fontSize:"12px",color:"var(--text-secondary)"}}>${FV.causeLine(d)}</span><br />
   <span style=${{fontSize:"12px",color:"var(--text-secondary)"}}>실제 입고 ${FF.fInt(d.acc)}t · 생산 ${FF.fInt(d.prod)}t</span><br />
   <span style=${{fontSize:"12px",color:"var(--text-secondary)"}}>판매 ${FF.fInt(d.sold)}t / 주문 ${FF.fInt(d.dem)}t · 매출 ${mo(Math.round(revTotal))}원</span>
   ${boost>=1?FV._html`<br /><span id="kcontractboost" style=${{fontSize:"12px",color:"var(--text-success)"}}>계약 발동 · 초과분 매입계약으로 ${boost}t 추가 입고</span>`:null}
   <div style=${{marginTop:"6px"}}>
    <${FV.Fold} id="dayresult" title="판로별 상세" render=${function(){return FV._html`<${FV.DayResultView} />`}} />
   </div>
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
 var byCh=FF.factsByChannel(), G=FF.factsGlobal(), IP=FF.issuePlan();
 var issueOf=function(i){
  for(var k=0;k<IP.issues.length;k++)if(IP.issues[k].i===i)return IP.issues[k];
  return null;
 };
 var STANCE_LEVELS=[0,1,2,3];
 // 라벨과 값을 같은 순서, 같은 칸 너비로 둔다. 판로 셋을 나란히 봤을 때 같은 줄끼리 비교되게 하기 위해서다.
 var kv=function(label,value,extraClass){
  return FV._h("div",{class:"chan-kv"+(extraClass?(" "+extraClass):"")},[
   FV._h("span",{class:"chan-kv-label"},label), " ",
   FV._h("span",{class:"chan-kv-value"},value)
  ]);
 };
 // 판단 위계 순서: 관계(장기 전략) -> 배정/주문(정책의 결과) -> 가격/최대/보장(판단 근거) -> 정책 버튼.
 // 화면은 커널 상태를 직접 읽지 않고 FF.facts()가 낸 판로 중심 투영(byCh)만 읽는다.
 var rows=byCh.map(function(r,i){
  var issue=issueOf(i);
  var statusTxt=issue?(" · "+(issue.resolution==="accepted"?"포기함":"회복 중")):"";
  var missed=r['curr.plan.allocation.missed'], assigned=r['curr.plan.allocation.assigned'];
  var order=r['curr.forecast.demand.order'], level=r['curr.plan.allocation.stance'];
  var floor=r['curr.state.allocation.floor'];
  // 임계값은 실제 1t(내부 2단위)를 기준으로 한다. 이 자료형은 1 unit = 0.5t다.
  var missTxt=missed>=2?(FF.fInt(missed)+"t을 다른 판로에 양보"):"";
  return FV._h("div",{class:"chan-card"},[
   FV._h("div",{class:"chan-id"},[
    FV._h("span",{class:"chan-name"},FV.say("channel",r.key))
   ]),
   kv("관계",FV.say("relword",String(r['curr.state.relation.level'])),"chan-rel"),
   FV._h("div",{class:"chan-alloc"},[
    FV._h("span",{class:"chan-kv-label"},"배정")," ",
    FV._h("span",{class:"chan-kv-value"},FF.fInt(assigned)+"t"),
    " / 주문 "+FF.fInt(order)+"t"+statusTxt
   ]),
   missTxt?FV._h("div",{class:"chan-kv-note"},missTxt):null,
   FV._h("div",{class:"chan-cond"},[
    kv("가격",r['curr.state.finance.price']+"원"),
    kv("최대",r['curr.state.allocation.cap']+"t"),
    kv("보장",floor>0?(floor+"t"):"—")
   ]),
   FV._h("div",{class:"chan-policy"},STANCE_LEVELS.map(function(lv){
    return FV._h("button",{class:"pol"+(level===lv?" pol-on":""),
     onClick:function(){FF.setChannelStance(i,lv)}},FV.say("stance",String(lv)));
   }))
  ]);
 });
 // 판매 가능(공급 쪽 상한)과 예상 판매(배정의 합, Σ 판로 배정)를 나란히 둔다.
 // 플레이어가 판로 세 줄을 직접 더하지 않아도 오늘 몇 t을 팔 계획인지 바로 보이게 하기 위해서다.
 // 둘이 다르면(미배정>0) 수요가 판매 가능보다 적어서 판매 가능을 다 못 채운다는 뜻이다.
 // pool/sellable/unassigned 등은 사실 투영(G)이 이미 낸 값이다. 화면은 더하고 빼지 않고 그대로 읽는다.
 var pool=G['curr.plan.inventory.pool'], inv=G['curr.state.inventory.stock'], exp=G['curr.state.supply.intake'];
 var sum=G['curr.plan.inventory.assigned'], sellable=G['curr.plan.inventory.sellable'], unassigned=G['curr.plan.inventory.unassigned'];
 var capSales=FF.capsOf().sales, old=FF.oldStock();
 return FV._h("div",{id:"kchan",class:"chan"},[
  FV._h("div",{class:"chan-head"},[
   FV._h("div",{class:"chan-head-col"},[
    FV._h("div",{class:"chan-head-main"},[
     FV._h("span",{class:"chan-head-label"},"판매 가능"),
     FV._h("span",{class:"chan-head-value"},FF.fInt(pool)+"t")
    ]),
    FV._h("div",{class:"chan-head-note"},
     "재고 "+FF.fInt(inv)+"t · 오늘 확정 입고 "+FF.fInt(exp)+"t"+
     (sellable>capSales?(" · 판매 한도 "+capSales+"t"):""))
   ]),
   FV._h("div",{class:"chan-head-col"},[
    FV._h("div",{class:"chan-head-main"},[
     FV._h("span",{class:"chan-head-label"},"예상 판매"),
     FV._h("span",{class:"chan-head-value"},FF.fInt(sum)+"t")
    ]),
    unassigned>=2?FV._h("div",{class:"chan-head-note"},"미배정 "+FF.fInt(unassigned)+"t"):null
   ]),
   old>=2?FV._h("div",{class:"chan-head-old"},"오래된 재고 "+FF.fInt(old)+"t"):null
  ]),
  rows,
  FV._h("div",{class:"chan-sum"},[
   FV._h("span",{},"보장 판로부터 확보한 뒤 나머지를 태도 비중으로 나눈다"),
   FV._h("button",{class:"cs cs-auto",onClick:function(){FF.clearStance()}},"초기화")
  ])
 ]);
}

// 판매 한도 증설. 최근에 한도가 실제 병목이었거나 지금 배정에서 놓치는 물량이 있을 때만 보인다.
FV.CapacityButton=function(){
 FF.observe();
 if(FF.isOver()||!FF.started())return null;
 var on=FF.queued("sales");
 if(!on){
  var hit=FF.capHits("sales",5);
  var shortfall=FF.factsByChannel().some(function(r){return r['curr.plan.allocation.missed']>=2});
  if(!hit.n&&!hit.last&&!shortfall)return null;
 }
 var opt=FF.optionOf("sales");
 return FV._h("button",{id:"kbs",class:"btn-cell"+(on?" opt-on":""),
   style:{borderColor:on?"var(--border-accent)":"var(--border-strong)",
     background:"transparent",opacity:(opt.affordable||on)?"1":"0.4"},
   onClick:function(){if(!FF.isOver())FF.toggleBuy("sales")}},[
  FV._h("div",{},"판매 한도 늘리기"),
  FV._h("div",{class:"opt-price"},FV.capShift("sales")+" · "+mo(opt.cost)+"원"),
  FV._h("div",{class:"opt-note",style:{color:opt.overRun?"var(--text-warning)":undefined}},FV.paybackNote(opt))
 ]);
}

// 이슈 #22/#26: 조달 능력 증설. CapacityButton과 같은 "평소엔 숨김" 패턴이다 - 최근 5일 중
// 조달 능력 때문에 실제로 놓친 날이 있을 때만 보인다(#9: 트리거는 관측된 사실, 처방이 아니다).
FV.ProcureButton=function(){
 FF.observe();
 if(FF.isOver()||!FF.started())return null;
 var on=FF.queued("procure");
 if(!on){
  var hit=FF.capHits("procure",5);
  if(!hit.n&&!hit.last)return null;
 }
 var opt=FF.optionOf("procure");
 return FV._h("button",{id:"kbp",class:"btn-cell"+(on?" opt-on":""),
   style:{borderColor:on?"var(--border-accent)":"var(--border-strong)",
     background:"transparent",opacity:(opt.affordable||on)?"1":"0.4"},
   onClick:function(){if(!FF.isOver())FF.toggleBuy("procure")}},[
  FV._h("div",{},"조달 능력 늘리기"),
  FV._h("div",{class:"opt-price"},FV.capShift("procure")+" · "+mo(opt.cost)+"원"),
  FV._h("div",{class:"opt-note",style:{color:opt.overRun?"var(--text-warning)":undefined}},FV.paybackNote(opt))
 ]);
}


// 이슈 #25/#27/#28: 자동진행 WARNING. episode 시작(또는 Procurement 21일 재알림)이
// "오늘" 발생했을 때만 보인다 - 문제가 계속돼도 매일 다시 뜨지 않는다(#25가 확인한 알림
// 폭주를 피하려고 #27이 검증한 최소 알림 정책 그대로다). 자동 PAUSE는 없다 - 시간은
// 계속 흐르고 플레이어가 필요하면 직접 멈춘다.
FV.WarningBar=function(){
 FF.observe();
 if(FF.isOver()||!FF.started())return null;
 var day=FF.dayOf(), W=FF.warnOf();
 var fired=Object.keys(W).filter(function(k){return W[k].active&&W[k].lastNotifyDay===day});
 if(!fired.length)return null;
 return FV._h("div",{id:"kwarnbar",class:"card-note"},
  fired.map(function(k){
   return FV._h("div",{style:{color:"var(--text-warning)"}},FV.say("warn",k));
  }));
}

// 이슈 #11: AP(매입채무) 상태. 자동 완충장치라 결정할 게 없지만, 잔액이 있을 때만 짧게
// 보여준다 - 현금이 "왜" 실제 매입비보다 여유 있어 보이는지 설명하기 위해서다.
FV.ApNote=function(){
 FF.observe();
 if(!FF.started()||FF.isOver())return null;
 var A=FF.apStatus();
 if(A.outstanding<=0)return null;
 return FV._html`
  <div id="kap" class="card-note">
   매입채무 잔액 ${mo(A.outstanding)}원(7일 뒤 자동 상환) · 남은 가용 신용 ${mo(A.available)}원</div>`;
}

// 이슈 #11: 매출채권 조기현금화(factoring). 판매 한도 증설(CapacityButton)과 같은 "평소엔
// 숨김" 패턴이다 - runway5가 위험 신호일 때(FF.factorPlan().eligible)만 보인다. AP와 달리
// 이건 진짜 플레이어 결정이라 버튼 하나가 아니라 금액을 직접 고른다.
FV.FactorButton=function(){
 FF.observe();
 if(FF.isOver()||!FF.started())return null;
 var P=FF.factorPlan();
 var on=FF.queued("factor");
 if(!P.eligible&&!on)return null;
 var confirm=function(amount){
  if(!(amount>0)){FF.clearQueue();return}
  FF.queueFactor(Math.min(amount,P.outstanding));
 };
 var curAmount=on?FF.queuedFactorAmount():P.suggested;
 return FV._html`
  <div id="kfactor" class="card-note">
   <div style=${{fontSize:"13px",color:"var(--text-primary)",marginBottom:"2px"}}>매출채권 조기현금화</div>
   <div style=${{fontSize:"12px",color:"var(--text-secondary)"}}>
    5일 자금여력 ${mo(P.runway)}원 · 미회수 매출채권 ${mo(P.outstanding)}원</div>
   <div style=${{display:"flex",gap:"6px",alignItems:"center",marginTop:"6px"}}>
    <input id="kfactoramt" inputmode="numeric" value=${curAmount}
     style=${{width:"92px",background:"transparent",color:"var(--text-primary)",
       border:"1px solid var(--border-strong)",borderRadius:"var(--radius)",padding:"4px 6px"}} />
    <button id="kfactorgo" class="btn-sm"
      style=${{borderColor:on?"var(--border-accent)":"var(--border-strong)"}}
      onClick=${function(){
       var el=document.getElementById("kfactoramt");
       confirm(el&&el.value?parseInt(el.value,10)||0:P.suggested);
      }}>필요한 만큼만</button>
    ${on?FV._h("button",{id:"kfactorcancel",class:"btn-sm",onClick:function(){FF.clearQueue()}},"취소"):null}
   </div>
   <div style=${{fontSize:"11px",color:"var(--text-muted)",marginTop:"4px"}}>
    제안 금액 ${mo(P.suggested)}원 기준 · 받는 현금 ${mo(P.previewCashIn)}원 · 할인비용 ${mo(P.previewCost)}원</div>
  </div>`;
}

// 안내 → 전망 → 계약 입력 → 실행까지 개장 전 결정 하나를 한 컨테이너에 담는다.
FV.FirstDayPrompt=function(){
 return FV._html`
  <${FV.Panel} id="kexplore" className="card">
   <div style=${{fontSize:"13px",color:"var(--text-primary)",marginBottom:"4px"}}>개장 전</div>
   <div style=${{fontSize:"12px",color:"var(--text-secondary)",lineHeight:"1.6"}}>
    앞으로 ${FF.OUTLOOK_HORIZON}일 전망을 보고 초과분 계약을 정한다. 계약은 지금만 맺을 수 있다.</div>
   <${FV.Outlook} data=${FF.outlook()} />
   <div class="fd-subhead">초과분 계약</div>
   <div style=${{fontSize:"11px",color:"var(--text-muted)"}}>오늘 계약하면 내일부터 적용된다.</div>
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

// 판로별 상세는 FlowSummary 안의 펼치기가 이미 보여준다. 여기서는 되풀이하지 않는다.
FV.FlowView=function(){
 var d=FF.today();
 return FV._html`
  <div id="kylabel" class="lbl">${d?(d.day+"일 결과"):"운영 시작 전"}</div>
  <${FV.FlowSummary} day=${d} />
  <div id="kchain" class="gap-s">
   <${FV.FlowDiagram} day=${d} inventory=${FF.inventory()} />
  </div>`;
}

// 농가 -> 입고 -> 창고 -> 판매 흐름도. 결과를 뜯어볼 때만 찾아보는 상세 화면이다.
FV.FlowDetailView=function(){
 var d=FF.today();
 return FV._html`
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
    <div style=${{fontSize:"16px",fontWeight:"600",letterSpacing:"-.01em",flex:"1"}}>양파 · ${FF.C.days}일 운영</div>
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
 return FV._html`<div id="kchart" class="gap-m"><${FV.ForecastMatrix} matrix=${FF.forecastOnly()} /></div>`;
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

// 이슈 #33: 자동진행 배속. 365일 완주에 필요한 실제 대기시간을 줄이는 유일한
// 손잡이다. TICK_MS(1000ms)보다 하루가 짧아지면 그 하루 안에서는 heartbeat가
// 한 번뿐이라 tickDay가 heartbeat당 하나로 묶여버리므로, 배속표는 그 상한(5배)
// 아래로만 둔다 - 그래야 매일이 빠짐없이 한 번씩 화면에 그려져 WARNING을 놓치지 않는다.
FV.SPEEDS=[1,2,4];
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
   <span class="clk-speeds">
    ${FV.SPEEDS.map(function(sp){
      return FV._h("button",{class:"clk-speed"+(c.speed===sp?" clk-speed-on":""),
        onClick:function(){FF.setClockSpeed(sp)}},sp+"×");
    })}
   </span>
   <span class="clk-day">
    ${c.running?(FV.clockLeft()+"초"):"정지"} · ${FF.dayOf()} / ${FF.C.days}일</span>
  </div>`;
}

FV.DockView=function(){
 FF.observe();
 var started=FF.started(), over=FF.isOver();
 var goText=over?(FF.C.days+"일 종료 · 결과 확인"):(started?"하루 넘기기":"첫날 운영");
 var arm=FF.SIG.fin.value, leftD=FF.daysLeft();
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
   <button id="kgo" class="btn-full"
    style=${{borderColor:over?"var(--border)":"var(--border-strong)",color:over?"var(--text-muted)":"var(--text-primary)"}}
    onClick=${function(){if(!FF.isOver())FF.tickDay()}}>${goText}</button>
   ${started&&!over?FV._html`
    <button id="kfin" class="btn-sub"
     style=${{borderColor:"var(--text-danger)",color:arm?"var(--text-danger)":"var(--text-secondary)",background:arm?"var(--bg-danger)":"transparent"}}
     onClick=${finish}>
     ${arm?FV._html`
      <b>${FF.C.days}일까지 운영</b><br />
      <span style=${{fontSize:"11px"}}>남은 ${leftD}일을 더 사지 않고 운영한다. 되돌릴 수 없다.</span>`:FV._html`
      운영 종료<br />
      <span style=${{fontSize:"11px",color:"var(--text-danger)"}}>되돌릴 수 없다 · 이후 투자 불가</span>`}
    </button>`:null}
  </div>`;
}

FV.OutlookView=function(){
 FF.observe();
 if(!FF.started()||FF.isOver())return null;
 return FV._html`<${FV.Outlook} data=${FF.outlook()} />`;
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

// 어제 흐름은 이제 FlowSummary가 상단에서 직접 보여준다. 탭을 셋으로 줄인다.
FV.PlayPager=function(){
 if(!FF.histLen()||FF.isOver())return null;
 return FV._html`
  <nav class="tabs">
   <a href="#p0">사건 이력</a>
   <a href="#p1">전망</a>
   <a href="#p2">상세 운영</a>
  </nav>
  <div class="pager">
   <section class="pane" id="p0"><${FV.EventLogView} /></section>
   <section class="pane" id="p1"><${FV.OutlookView} /></section>
   <section class="pane" id="p2"><${FV.FlowDetailView} /></section>
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

   ${(!fresh&&!over)?FV._html`<${FV.FlowSummary} day=${FF.today()} />`:null}
   <${FV.WarningBar} />
   <${FV.IssueBar} />
   <${FV.ChannelBar} />
   <${FV.ApNote} />
   <${FV.CapacityButton} />
   <${FV.ProcureButton} />
   <${FV.FactorButton} />
   <${FV.TrendStrip} />

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
// 이슈 #33: 하루가 실제로 몇 ms인지는 CLOCK_MS를 배속으로 나눈 값이다.
FV.dayMs=function(){return FV.CLOCK_MS/(FF.clockOf().speed||1)}
// 다음 하루까지 남은 초.
FV.clockLeft=function(){
 return Math.max(0,Math.round((FV.dayMs()-(FV._acc||0))/1000));
}

FV.newGame=function(seed){
 FV.stopClock();
 FF.startNew(seed);
}

// 이슈 #33: heartbeat 간격이다. _acc는 이 값의 배수로만 늘어나므로, 배속별 하루
// 길이(5000/2500/1250ms)를 전부 나누어떨어지게 해야 실제 속도가 라벨과 어긋나지
// 않는다(1000ms였을 때는 1250ms가 나누어떨어지지 않아 그 하루가 2000ms로 반올림돼
// 4배속이 실제로는 2.5배로만 나오는 문제가 있었다).
FV.TICK_MS=250;
FV.startClock=function(){
 if(FV._timer)return;
 FV._timer=setInterval(function(){
  if(!FF.clockOf().running||FF.isOver()){FV.stopClock();return}
  FV._acc=(FV._acc||0)+FV.TICK_MS;
  if(FV._acc>=FV.dayMs()){FV._acc=0;FF.tickDay()}
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


