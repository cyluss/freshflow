// 결과 화면 접이식의 열림 상태. 화면에만 쓰이므로 신호가 아니다.
FV.OPEN={};


/* ---- View primitives --------------------------------------------------
 * props: atomic values and display options
 * children: nested UI structure
 * primitives do not know domain concepts and do not calculate game values
 * --------------------------------------------------------------------- */
FV.Panel=function(props){
 var p=props||{}, cls=p.className||"panel";
 return FV._html`<section id=${p.id} class=${cls}>${p.children}</section>`;
};

FV.Section=function(props){
 var p=props||{};
 return FV._html`
  <section>
   ${p.title?FV._html`<div class="section-title">${p.title}</div>`:null}
   ${p.children}
  </section>`;
};

FV.StatRow=function(props){
 var p=props||{};
 return FV._html`
  <div class="stat-row">
   <span class="stat-label">${p.label}</span>
   <span class="stat-value">${p.value}</span>
   <span class="stat-note">${p.note||""}</span>
  </div>`;
};

// 접이식. 펼칠 때만 본문을 만든다. render 는 함수다.
// 접이식. 펼칠 때만 본문을 만든다. render 는 함수다.
FV.Fold=function(props){
 var p=props||{}, id=p.id, open=!!FV.OPEN[id];
 var onToggle=function(e){
  var now=!!e.target.open;
  if(now===!!FV.OPEN[id])return;
  FV.OPEN[id]=now;
  FF.repaint();
 };
 return FV._h("details",{class:"fold",open:open,onToggle:onToggle},[
  FV._h("summary",{class:"fold-head","data-fold":id},p.title),
  open?FV._h("div",{class:"fold-body"},[p.render()]):null
 ]);
};



FV.OpportunityCell=function(props){
 var c=props.cell, best=props.best;
 if(!c)return FV._html`<span></span>`;
 var top=(best!==null&&c.gain===best&&c.gain>0);
 var delta=(c.delta===null)?"":(c.flat?"·":((c.delta>=0?"+":"")+mo(c.delta)));
 return FV._html`
  <span style=${{textAlign:"right",whiteSpace:"nowrap"}}>
   <span style=${{color:c.gain>=0?"var(--text-success)":"var(--text-warning)",fontWeight:top?"600":"400"}}>${(c.gain>=0?"+":"")+mo(c.gain)}</span>
   <span style=${{fontSize:"10px",marginLeft:"5px",color:c.flat?"var(--text-muted)":"var(--text-secondary)"}}>${delta}</span>
  </span>`;
};

FV.OpportunityRow=function(props){
 var M=props.matrix, row=props.row;
 return FV._html`
  <div style=${{display:"grid",gridTemplateColumns:props.columns,gap:"8px",fontSize:"12px",padding:"3px 0",borderBottom:"0.5px solid var(--border)"}}>
   <span style=${{color:"var(--text-muted)"}}>${row.day}</span>
   ${M.kinds.map(function(k){return FV._html`<${FV.OpportunityCell} cell=${row.cells[k]} best=${M.best[k]} />`;})}
  </div>`;
};

FV.ContractChance=function(){
 var c=FF.contractChance();
 if(!c)return null;
 return FV._html`
  <${FV.StatRow} label="첫날 최적 계약량"
    value=${c.gain>0?((c.x===0?"계약 없음":("+"+c.x+"t"))):"지금 선택이 최선"}
    note=${c.gain>0?("+"+mo(c.gain)):(c.mine===0?"계약 없음":("+"+c.mine+"t"))} />`;
}

FV.OpportunityAnalysis=function(props){
 var M=props.matrix;
 if(!M)return FV._html`<div style=${{fontSize:"12px",color:"var(--text-secondary)"}}>더 살 날이 없다.</div>`;
 var COL="14% "+M.kinds.map(function(){return "1fr"}).join(" ");
 return FV._html`
  <${FV._F}>
   <div style=${{fontSize:"11px",color:"var(--text-muted)",lineHeight:"1.6",marginBottom:"6px"}}>
    그날 하나를 더 샀을 때의 현금 차이<br />
    · 유지비만큼 변함 (입고 ${M.maint.intake} / 판매 ${M.maint.sales})
   </div>
   <div style=${{display:"grid",gridTemplateColumns:COL,gap:"8px",fontSize:"11px",padding:"4px 0",borderBottom:"0.5px solid var(--border)"}}>
    <span style=${{color:"var(--text-muted)"}}>일</span>
    ${M.kinds.map(function(k){return FV._html`<span style=${{textAlign:"right",color:"var(--text-secondary)"}}>${FV.lblOf(k)}</span>`;})}
   </div>
   ${M.rows.map(function(row){return FV._html`<${FV.OpportunityRow} matrix=${M} row=${row} columns=${COL} />`;})}
  <//>`;
};


FV.finBriefNode=function(){
 if(!FF.finDayOf())return null;
 return FV._html`
  <${FV.StatRow}
   label="운영 종료"
   value=${FF.finDayOf()+"일차"}
   note=${(FF.finDayOf()+1)+"~"+FF.C.days+"일 자동 운영"}
  />`;
}

FV.finAfterNode=function(){
 var a=FF.finAfterTop();
 if(!a||a.state==="same")return null;
 if(a.state==="none")return FV._html`
  <${FV.StatRow} label="종료 후 기회" value="없음" note="접은 뒤로는 이득 없음" />`;
 return FV._html`
  <${FV.StatRow}
   label="종료 후 최대 기회"
   value=${a.day+"일 "+FV.lblOf(a.kind)}
   note=${"+"+mo(a.gain)}
  />`;
}

FV.missedBriefNode=function(){
 var t=FF.missedTop();
 if(!t)return FV._html`
  <${FV.StatRow} label="놓친 최대 기회" value="없음" note="어느 날 더 사도 늘지 않음" />`;
 var a=FF.finAfterTop();
 var ctx=(a&&a.state==="same")?"운영 종료 이후":(a&&a.state==="other")?"운영 종료 전":"";
 var span=t.spread?(t.spanFrom+"~"+t.spanTo+"일"):(t.day+"일");
 return FV._html`
  <${FV._F}>
   <${FV.StatRow}
    label="놓친 최대 기회"
    value=${t.day+"일 "+FV.lblOf(t.kind)}
    note=${"+"+mo(t.gain)}
   />
   <${FV.StatRow} label="유효 구간" value=${span} note=${ctx} />
  <//>`;
}

// 초과분 계약 누적 효과. 첫날 선택과 30일 뒤 결과를 잇는 긴 피드백 고리라서 따로 보여준다.
FV.ContractStatsView=function(){
 var c=FF.contractStats();
 if(!c||c.size<=0)return null;
 return FV._html`<${FV._F}>
  <${FV.StatRow} label="초과분 계약" value=${"+"+c.size+"t"} note=${mo(c.cost)+"원"} />
  <${FV.StatRow} label="발동" value=${c.hitDays+"일"} note=${"추가 입고 "+FF.fInt(c.extra)+"t"} />
  <${FV.StatRow} label="계약 기여" value=${(c.contrib>=0?"+":"")+mo(c.contrib)} note="계약 없이 다시 돌린 결과와의 차이" />
 <//>`;
}

FV.contribNode=function(){
 var rows=FF.contribRows();
 if(!rows.length)return null;
 return FV._html`
  <${FV._F}>
   ${rows.map(function(r){return FV._html`
    <div style=${{display:"flex",justifyContent:"space-between",padding:"3px 0",fontSize:"13px"}}>
     <span style=${{color:"var(--text-secondary)"}}>${r.day}일 ${FV.lblOf(r.kind)}</span>
     <span style=${{color:r.contrib>=0?"var(--text-success)":"var(--text-warning)"}}>
      ${(r.contrib>=0?"+":"")+mo(r.contrib)}
     </span>
    </div>`;})}
  <//>`;
}

// 관계 포트폴리오 복기. 판로마다 이번 판 전체의 관계 경로를 막대로 보여준다.
FV.RelPortfolioView=function(){
 var P=FF.relPortfolio();
 return FV._html`<${FV._F}>
  ${P.map(function(p){
    return FV._html`<${FV.Spark} label=${FV.say("channel",p.key)}
     values=${p.series} now=${FV.say("relword",String(p.final))} floor=${3} day=${p.series.length} />`;
  })}
 <//>`;
}

// 관계 전환점. 언제 무엇이 바뀌었고 그날 어떤 태도였는지 한 줄로 남긴다.
FV.RelTimelineView=function(){
 var T=FF.relTimeline();
 if(!T.length)return FV._html`<div style=${{fontSize:"12px",color:"var(--text-muted)"}}>관계 변화가 없었다</div>`;
 return FV._html`<${FV._F}>
  ${T.map(function(t){
    return FV._html`<div class="dr-row">${t.day}일 ${FV.say("channel",FF.C.channels[t.i].key)} ${FV.say("signal",t.type)}
     · 관계 ${FV.say("relword",String(t.from))} → ${FV.say("relword",String(t.to))}
     · 그날 태도 ${FV.say("stance",String(t.level))}</div>`;
  })}
 <//>`;
}

// 관계 형성. 최종 관계와 30일 경로, 그리고 무엇이 언제 바뀌었는지를 함께 보여준다.
FV.RelFormationView=function(){
 return FV._html`<${FV._F}>
  <${FV.RelPortfolioView} />
  <${FV.RelTimelineView} />
 <//>`;
}

// 주요 결정 복기. 판로 태도가 바뀐 날마다 전후와 그날 관계를 나열한다.
FV.PolicyReviewView=function(){
 var changes=FF.policyChanges();
 if(!changes.length)return FV._html`<div style=${{fontSize:"12px",color:"var(--text-muted)"}}>정책 변경이 없었다</div>`;
 return FV._html`<${FV._F}>
  ${changes.map(function(c){
    return FV._html`<div class="dr-row">${c.day}일 ${FV.say("channel",FF.C.channels[c.i].key)}
     ${FV.say("stance",String(c.from))} → ${FV.say("stance",String(c.to))}
     · 그날 관계 ${FV.say("relword",String(c.relAfter))}</div>`;
  })}
 <//>`;
}

// 판로별 성과. 이번 판 전체의 판매와 매출을 판로마다 보여준다.
FV.EarningsView=function(){
 var E=FF.endCardData(), rows=FF.channelTotals();
 return FV._html`<${FV._F}>
  <${FV.StatRow} label="최종 현금" value=${mo(E.cash)} note=${"시드 "+E.seed} />
  ${rows.map(function(r){
    return FV._html`<${FV.StatRow} label=${FV.say("channel",r.key)} value=${FF.fInt(r.sold)+"t 판매"} note=${mo(r.revenue)} />`;
  })}
 <//>`;
}

FV.endCardNode=function(){
 var E=FF.endCardData();

 var titleNode=FV._html`
  <div style=${{fontSize:"15px",fontWeight:"600",marginBottom:"2px"}}>${E.bust?"현금 소진 · 운영 중단":FF.C.days+"일 운영 결과"}</div>`;

 return FV._html`
  <${FV._F}>
   ${titleNode}
   <${FV.Section} title="나는 어떻게 벌었나">
    <${FV.EarningsView} />
   <//>
   <${FV.Section} title="어떤 관계를 만들었나">
    <${FV.RelFormationView} />
   <//>
   <${FV.Section} title="내 결정이 무엇을 바꿨나">
    <${FV.PolicyReviewView} />
   <//>
   <${FV.Fold} id="perf" title="성과 분석"
     render=${function(){return FV._html`
       <${FV._F}>
        <${FV.StatRow} label="무투자 대비" value=${(E.vsIdle>=0?"+":"")+mo(E.vsIdle)} note="내 투자 묶음의 효과" />
        <${FV.StatRow} label="증설" value=${(E.buysContract+E.buysSales===0)?"없음":((E.buysContract?("계약 +"+E.contractSize+"t · "):"")+"판매 "+E.buysSales+"회")} note=${mo(E.spent)+" 투입"} />
        <${FV.ContractStatsView} />
        ${FV.contribNode()}
        ${FV.finBriefNode()}
        <${FV.StatRow} label="사후 기준 대비" value=${(E.vsHindsight>=0?"+":"")+mo(E.vsHindsight)} note=${"기준 "+(E.baseContract?("계약 +"+E.baseContract+"t · "):"")+"판매 "+E.baseSales+"회"} />
        ${FV.missedBriefNode()}
        ${FV.finAfterNode()}
        <div style=${{marginTop:"8px",fontSize:"11px",color:"var(--text-muted)"}}>
         사후 기준은 30일을 미리 알 때 같은 횟수로 얻는 최선이다. 사는 날은 이틀 간격으로 고정했다.
        </div>
       <//>`}} />
   <${FV.Fold} id="ops" title="운영 결과"
     render=${function(){return FV._html`<${FV.OperationResult} data=${E} />`}} />
   <${FV.Fold} id="mods" title="투자 분석"
     render=${function(){
       var rows=FF.modRows();
       return rows.length?FV._html`<${FV.InvestmentAnalysis} rows=${rows} />`
         :FV._html`<div style=${{fontSize:"12px",color:"var(--text-muted)"}}>이번 판에는 아무것도 사지 않았다.</div>`;
     }} />
   <${FV.Fold} id="miss" title="기회 분석"
     render=${function(){return FV._html`
       <${FV._F}>
        <${FV.ContractChance} />
        <${FV.OpportunityAnalysis} matrix=${FF.missedMatrix()} />
       <//>`}} />
   <${FV.Fold} id="log" title="전체 기록"
     render=${function(){return FV._html`<${FV.FullLog} />`}} />
  <//>`;
}


FV.OperationResult=function(props){
 var E=props.data;
 return FV._html`
  <${FV._F}>
   <${FV.StatRow} label="최종 재고" value=${FF.fInt(E.inv)+" t"} note=${"저장 "+FF.C.cap.storage+" t"} />
   <${FV.StatRow} label="최종 용량" value=${"입고 "+E.capIntake+" / 판매 "+E.capShipping} note=${"시작 "+FF.C.cap.intake+" / "+FF.C.cap.sales} />
   <${FV.StatRow} label="총 투자비" value=${mo(E.spent)} note=${E.buysContract+E.buysSales+"회"} />
   <${FV.StatRow} label="종료 시 처분가치" value=${mo(E.salvaged)} note=${"취득비의 "+Math.round(FF.C.salvage*100)+"%"} />
   <${FV.StatRow} label="재고 체류일" value=${E.dwellMed!==null?("중앙값 "+E.dwellMed+"일 / 90% "+E.dwellP90+"일"):"—"} note=${"판매된 물량 기준, TTL "+FF.C.ttl+"일"} />
   <${FV.StatRow} label="로스율" value=${E.lossPct!==null?E.lossPct+"%":"—"} note="상함 / 입고" />
   <${FV.StatRow} label="입고 평균 가동" value=${E.useIntake.toFixed(0)+"%"} note=${FF.C.days+"일 기준"} />
   <${FV.StatRow} label="판매 평균 가동" value=${E.useShipping.toFixed(0)+"%"} note=${FF.C.days+"일 기준"} />
   <${FV.StatRow} label="수요 국면" value=${E.demandPhase[0]+"일 침체, "+E.demandPhase[1]+"일 정상, "+E.demandPhase[2]+"일 호황"} />
   <${FV.StatRow} label="생산 국면" value=${E.supplyPhase[0]+"일 부족, "+E.supplyPhase[1]+"일 평년, "+E.supplyPhase[2]+"일 풍작"} />
   <div style=${{marginTop:"8px",fontSize:"12px",color:"var(--text-secondary)"}}>${FV.worldNote()}</div>
  <//>`;
};

FV.InvestmentRow=function(props){
 var r=props.row, lbl=FV.lblOf(r.kind);
 if(r.days===0){
  return FV._html`
   <div style=${{fontSize:"12px",color:"var(--text-secondary)",padding:"3px 0"}}>
    ${r.day}일 ${lbl} · 내일부터 작동
   </div>`;
 }
 var zero=(FF.isOver()&&r.idle)?"추가 용량 사용 없음 · ":"";
 return FV._html`
  <div style=${{fontSize:"12px",color:"var(--text-secondary)",padding:"4px 0"}}>
   <div>${r.day}일 ${lbl} · ${r.days}일 보유</div>
   <div style=${{paddingLeft:"10px"}}>
    추가 용량 사용 ${Math.round(r.extra)}t (여력의 ${Math.round(r.fill*100)}%) · 들인 돈 ${mo(r.cost)} ·
    <span style=${{color:r.contrib>=0?"var(--text-success)":"var(--text-warning)"}}>
     ${zero}이 증설의 기여 ${(r.contrib>=0?"+":"")+mo(r.contrib)}
    </span>
   </div>
  </div>`;
};

FV.InvestmentAnalysis=function(props){
 var rows=props.rows||[];
 if(!rows.length)return null;
 return FV._html`
  <${FV._F}>
   <div style=${{fontSize:"12px",color:"var(--text-muted)",margin:"0 0 6px"}}>
    기여는 그 설비 하나만 빼고 30일을 다시 돌린 결과와의 차이다. 설비끼리 영향을 주므로 합계는 전체 차이와 다르다.
   </div>
   ${rows.map(function(r){return FV._html`<${FV.InvestmentRow} row=${r} />`;})}
  <//>`;
};


FV.FullLog=function(){
 return FV._html`
  <${FV._F}>
   <${FV.TimelineLog} items=${FF.timelineOf()} />
   <${FV.DailyLog} rows=${FF.recent(FF.C.ui.logRows).reverse()} />
   <${FV.BuyLog} rows=${FF.buylogOf()} />
  <//>`;
};

FV.BuyLog=function(props){
 var BL=props.rows||[];
 if(!BL.length)return FV._html`<div style=${{color:"var(--text-muted)",marginTop:"12px"}}>이번 판에는 아무것도 사지 않았다.</div>`;
 var COL="repeat(8,minmax(0,1fr))";
 var HEAD=["일차","설비","몇 번째","앞으로","최근","가동","남은 날","계기"];
 var grid=function(extra){return Object.assign({display:"grid",gridTemplateColumns:COL,gap:"4px",borderBottom:"0.5px solid var(--border)"},extra)};
 return FV._html`
  <${FV._F}>
   <div style=${{marginTop:"14px",fontSize:"12px",color:"var(--text-muted)"}}>증설 기록</div>
   <div style=${grid({fontSize:"11px",padding:"5px 0",color:"var(--text-muted)"})}>
    ${HEAD.map(function(x){return FV._html`<span>${x}</span>`;})}
   </div>
   ${BL.map(function(b){return FV._html`
    <div style=${grid({fontSize:"12px",padding:"4px 0",color:"var(--text-primary)"})}>
     <span>${b.day}</span><span>${FV.lblOf(b.kind)}</span><span>${b.nth}회</span>
     <span>${FV.trendWord(b.gap)}</span><span>${b.kind==="contract"?"개장 전망":(b.hitLen<3?("관측 "+b.hitLen+"일"):(b.hitLen+"일 중 "+b.hitN+"일"))}</span>
     <span>${b.util===null?"—":(b.util+"%")}</span><span>${b.left}일</span><span>${FV.say("path",b.path)}</span>
    </div>`;})}
   <button id="kcopy" style=${{width:"100%",padding:"9px",fontSize:"12px",marginTop:"10px"}} onClick=${function(){FV.copyLog()}}>기록 복사</button>
   <textarea id="kdump" readonly style=${{width:"100%",height:"0",opacity:"0",border:"0",padding:"0"}}></textarea>
  <//>`;
};

FV.TimelineLog=function(props){
 var TL=props.items||[];
 if(!TL.length)return null;
 var sayBuy=function(t){
  return (t.kind==="contract")
   ? ("초과분 매입 계약 · 한도 넘는 날 "+t.newCap+"t 더 받는다")
   : ("판매 한도 늘리기 · 다음날 "+t.newCap+"t/일 적용");
 };
 var byDay={};
 TL.forEach(function(t){
  var k2="d"+t.day;
  if(!byDay[k2])byDay[k2]={sort:t.day+0.5,kind:"day",day:t.day,ev:[],act:[]};
  if(t.type==="event")byDay[k2].ev.push(FV.EVENT_TEXT[t.b]||"");
  else if(t.type==="buy")byDay[k2].act.push(sayBuy(t));
  else if(t.type==="finish")byDay[k2].act.push("운영 종료 선택, 남은 기간 자동 운영");
 });
 var arr=Object.keys(byDay).map(function(k){return byDay[k]}).sort(function(a,b){return a.sort-b.sort});
 return FV._html`
  <div style=${{fontSize:"12px",lineHeight:"1.7"}}>
   <div style=${{fontSize:"12px",color:"var(--text-muted)",marginBottom:"6px"}}>진행 기록</div>
   ${arr.map(function(r){
    if(r.kind==="auto")return FV._html`<div style=${{color:"var(--text-muted)",padding:"3px 0"}}>${r.text}</div>`;
    return FV._html`
     <div style=${{display:"flex",gap:"8px",padding:"3px 0"}}>
      <span style=${{width:"34px",color:"var(--text-secondary)",flexShrink:"0"}}>${r.day}일</span>
      <span style=${{flex:"1"}}>
       ${r.ev.length?FV._html`<span style=${{color:"var(--text-warning)"}}>${r.ev.join(", ")}</span>`:null}
       ${r.ev.length&&r.act.length?" → ":null}
       ${r.act.length?FV._html`<span style=${{color:"var(--text-primary)"}}>${r.act.join(", ")}</span>`:null}
      </span>
     </div>`;
   })}
  </div>`;
};

FV.DailyLog=function(props){
 var rows=props.rows||[];
 var HEAD=["일차","생산","수요","판매","미입고","상함","못판수요","손익"];
 var grid={display:"grid",gridTemplateColumns:"repeat(8,minmax(0,1fr))",gap:"2px",fontSize:"11px"};
 if(!rows.length)return FV._html`<div style=${{color:"var(--text-muted)"}}>하루를 운영하면 결과가 쌓인다.</div>`;
 var cell=function(v,right,color){var st={};if(right)st.textAlign="right";if(color)st.color=color;return FV._html`<span style=${st}>${v}</span>`};
 return FV._html`
  <${FV._F}>
   <div style=${Object.assign({},grid,{padding:"4px 0",borderBottom:"0.5px solid var(--border)"})}>
    ${HEAD.map(function(h,i){return cell(h,i>0);})}
   </div>
   ${rows.map(function(r){return FV._html`
    <div style=${Object.assign({},grid,{padding:"3px 0",borderBottom:"0.5px solid var(--border)",color:"var(--text-primary)"})}>
     ${cell(String(r.day),false)}${cell(FF.fInt(r.prod),true)}${cell(FF.fInt(r.dem),true)}${cell(FF.fInt(r.sold),true)}
     ${cell(FF.fInt((FF.lostInflow(r)||{total:0}).total),true)}${cell(FF.fInt(r.wT),true)}${cell(FF.fInt(r.missed),true)}
     ${cell(mo(r.profit),true,r.profit>=0?"var(--text-success)":"var(--text-danger)")}
    </div>`;})}
  <//>`;
};


