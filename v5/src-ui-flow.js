FV.FlowMetric=function(props){
 return FV._html`
  <div style=${{display:"flex",alignItems:"baseline",gap:"8px"}}>
   <span style=${{width:"30px",fontSize:"12px",color:props.hot?"var(--text-warning)":"var(--text-secondary)"}}>${props.name}</span>
   <span style=${{flex:"1",fontSize:"11px",color:"var(--text-muted)"}}>${props.sub||""}</span>
   <span style=${{fontSize:"15px",fontWeight:"500",color:props.hot?"var(--text-warning)":"var(--text-primary)"}}>${props.value}</span>
  </div>`;
}

FV.SplitBar=function(props){
 var total=props.a+props.b; if(total<=0)total=1;
 var pa=Math.round(props.a/total*100);
 var seg=function(width,bg,fg,label){
  return FV._html`<div style=${{width:width+"%",background:bg,color:fg,textAlign:"center",whiteSpace:"nowrap",overflow:"hidden"}}>${width>=22?label:""}</div>`;
 };
 return FV._html`
  <div style=${{display:"flex",height:"13px",borderRadius:"2px",overflow:"hidden",marginTop:"4px",fontSize:"10px",lineHeight:"13px"}}>
   ${seg(pa,"var(--border-strong)","var(--text-primary)",props.labelA)}
   ${seg(100-pa,"var(--bg-danger)","var(--text-danger)",props.labelB)}
  </div>`;
}

FV.FillBar=function(props){
 var width=Math.min(100,Math.max(1,Math.round(props.value/props.cap*100)));
 return FV._html`
  <div style=${{height:"6px",background:"var(--surface-1)",borderRadius:"3px",overflow:"hidden",marginTop:"4px"}}>
   <div style=${{height:"6px",width:width+"%",background:"var(--text-muted)"}}></div>
  </div>`;
}

FV.FlowConnector=function(props){
 if(!props.visible)return null;
 var width=Math.max(2,Math.round(props.value/props.max*10));
 return FV._html`
  <div style=${{display:"flex",alignItems:"center",gap:"6px",height:"12px",paddingLeft:"38px"}}>
   <div style=${{width:width+"px",height:"12px",background:"var(--border-strong)",opacity:"0.7"}}></div>
   <span style=${{fontSize:"10px",color:"var(--text-muted)"}}>${FF.fInt(props.value)}t</span>
  </div>`;
}

FV.FlowStage=function(props){
 return FV._html`
  <div style=${{padding:"5px 9px",borderLeft:"3px solid "+(props.hot?"var(--border-warning)":"transparent"),background:props.hot?"var(--bg-warning)":"transparent"}}>
   ${props.children}
  </div>
  ${props.note?FV._html`<div style=${{padding:"1px 9px 3px 38px",fontSize:"11px"}}>${props.note}</div>`:null}
  ${props.loss?FV._html`<div style=${{padding:"0 9px 4px 38px",fontSize:"11px",color:"var(--text-danger)"}}>└ ${props.loss}</div>`:null}`;
}

FV.FlowDiagram=function(props){
 var d=props.day;
 var iv=props.inventory;
 var li=FF.lostInflow(d);
 var prod=d?d.prod:0, acc=d?d.acc:0, sold=d?d.sold:0;
 var caps=FF.capsOf();
 var flowMax=Math.max(caps.intake,caps.sales,FF.C.cap.storage);
 var lossText=li?li.parts.map(function(p){return FV.say("cause",p.cause)+" "+FF.fInt(p.amt)}).join(" / "):"";

 var invNote=function(){
  var st=FF.invStats();
  if(!st)return null;
  var dtxt=st.med!==null?("체류 중앙값 "+st.med+"일 · 90% "+st.p90+"일"):"체류 —";
  return FV._html`<span style=${{color:"var(--text-muted)"}}>최근 ${st.win}일 ${dtxt} · 로스 ${st.lossPct}%</span>`;
 };
 var recNote=function(kind){
  var st=FF.recoverStats(kind);
  if(!st)return null;
  return FV._html`
   <span style=${{color:st.val>=0?"var(--text-success)":"var(--text-warning)"}}>이 증설로 현재 ${st.val>=0?"+":""}${mo(st.val)}</span>
   ${st.delta!==null?FV._html`<span style=${{color:"var(--text-muted)"}}> · 전일보다 ${st.delta>=0?"+":""}${mo(st.delta)}</span>`:null}`;
 };

 return FV._html`
  <div style=${{border:"1px solid var(--border)",borderRadius:"var(--radius)",overflow:"hidden"}}>
   <${FV.FlowStage} hot=${!!(d&&d.b==="supply")} loss=${lossText}>
    <${FV.FlowMetric} name="농가" value=${d?FF.fInt(prod)+"t":"—"} hot=${!!(d&&d.b==="supply")} sub=${"매입 "+mo(FF.C.farm)+"원/t"} />
    ${d?FV._html`<${FV.SplitBar} a=${acc} b=${prod-acc} labelA=${"입고 "+FF.fInt(acc)} labelB=${"미입고 "+FF.fInt(prod-acc)} />`:null}
   <//>
   <${FV.FlowConnector} visible=${!!d} value=${acc} max=${flowMax} />

   <${FV.FlowStage} hot=${!!(d&&d.b==="intake")} note=${recNote("intake")}>
    <${FV.FlowMetric} name="입고" value=${d?FF.fInt(acc)+"t":"—"} hot=${!!(d&&d.b==="intake")} sub=${"하루 한도 "+caps.intake+"t"} />
   <//>
   <${FV.FlowConnector} visible=${!!d} value=${acc} max=${flowMax} />

   <${FV.FlowStage} hot=${!!(d&&(d.b==="store"||d.b==="stock"))} note=${invNote()} loss=${(d&&d.wT>FF.C.ui.eps)?("보관 중 상함 "+FF.fInt(d.wT)+"t"):""}>
    <${FV.FlowMetric} name="창고" value=${FF.fInt(iv)+"t"} hot=${!!(d&&(d.b==="store"||d.b==="stock"))} sub=${"용량 "+FF.C.cap.storage+"t"} />
    <${FV.FillBar} value=${iv} cap=${caps.storage} />
   <//>
   <${FV.FlowConnector} visible=${!!d} value=${sold} max=${flowMax} />

   <${FV.FlowStage} hot=${!!(d&&d.b==="ship")} note=${recNote("sales")}>
    <${FV.FlowMetric} name="판매" value=${d?FF.fInt(sold)+"t":"—"} hot=${!!(d&&d.b==="ship")} sub=${"하루 한도 "+caps.sales+"t"} />
   <//>
  </div>`;
}

