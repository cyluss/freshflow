FV.OutlookBar=function(props){
 var v=props.value, tone=props.tone;
 var h=Math.max(4,Math.round(v/60*34));
 return FV._html`
  <div class="ob">
   <span class="ob-pct">${v}%</span>
   <span class=${"ob-bar ob-"+tone} style=${{height:h+"px"}}></span>
   <span class="ob-name">${props.name}</span>
  </div>`;
}

FV.OutlookSpan=function(props){
 var s=props.span, group=props.group;
 var names=FV.WORD.level[group];
 // 판정은 원본 확률로, 막대와 숫자는 5% 단위로 보여준다.
 var verdict=FV.say(group==="supply"?"verdictSupply":"verdictDemand",
   FF.outlookVerdict(s.pct));
 var q=FF.quantizePct(s.pct,5);
 return FV._html`
  <div class="ospan">
   <div class="ospan-head">
    <span class="ospan-days">${s.from}~${s.to}일</span>
   </div>
   <div class="ospan-verdict">${verdict}</div>
   <div class="ospan-bars">
    <${FV.OutlookBar} value=${q[0]} name=${names[0]} tone="low" />
    <${FV.OutlookBar} value=${q[1]} name=${names[1]} tone="mid" />
    <${FV.OutlookBar} value=${q[2]} name=${names[2]} tone="high" />
   </div>
  </div>`;
}

FV.Outlook=function(props){
 var O=props.data;
 if(!O)return null;
 var block=function(title,group,rows){
  return FV._html`
   <${FV._F}>
    <div class="outlook-head">${title} 전망</div>
    <div class="ospans">
     ${rows.map(function(s){return FV._html`<${FV.OutlookSpan} span=${s} group=${group} />`})}
    </div>
   <//>`;
 };
 return FV._html`
  <div id="koutlook" class="outlook-block">
   <div style=${{fontSize:"11px",color:"var(--text-muted)",marginBottom:"6px"}}>
    ${O.horizonStart}~${O.horizonEnd}일 전망 · 각 기간에 예상되는 상태다
   </div>
   ${block("생산","supply",O.supply)}
   ${block("수요","demand",O.demand)}
  </div>`;
}

