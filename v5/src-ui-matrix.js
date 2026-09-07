FV.MatrixCell=function(props){
 var color=props.warn?"var(--text-warning)":(props.muted?"var(--text-muted)":(props.color||"var(--text-primary)"));
 return FV._html`<span style=${{
  minWidth:"32px",flex:"1",textAlign:"center",fontSize:"11px",color:color,
  opacity:props.muted?"0.45":"1"
 }}>${props.text}</span>`;
}

FV.MatrixHeader=function(props){
 var M=props.matrix;
 return FV._html`<div style=${{display:"flex",gap:"2px"}}>
  <span style=${{width:"26px",flexShrink:"0"}}></span>
  ${M.days.map(function(d){return FV._html`<${FV.MatrixCell} text=${String(d)} color="var(--text-muted)" />`;})}
  ${Array.from({length:M.FC},function(_,i){return FV._html`<${FV.MatrixCell} text=${"+"+(i+1)} color="var(--text-muted)" />`;})}
 </div>`;
}

FV.MatrixRow=function(props){
 var r=props.row, fc=props.fc;
 return FV._html`<div style=${{display:"flex",gap:"2px",padding:"2px 0"}}>
  <span style=${{width:"26px",flexShrink:"0",fontSize:"11px",color:"var(--text-secondary)"}}>${FV.say("row",r.name)}</span>
  ${r.cells.map(function(c){
    var text=c.muted?"·":(r.group==="kind"?FV.lblOf(c.code):FV.say(r.group,c.code));
    return FV._html`<${FV.MatrixCell} text=${text} warn=${c.warn} muted=${c.muted} />`;})}
  ${Array.from({length:fc},function(_,i){
    var fv=r.future[i];
    return FV._html`<${FV.MatrixCell} text=${fv?FV.say(r.group,fv):"·"} color="var(--text-muted)" />`;})}
 </div>`;
}

FV.ForecastMatrix=function(props){
 var M=props.matrix;
 if(!M)return null;
 var summary="최근 "+M.days.length+"일 상태"+(M.FC?" · 오른쪽은 앞 "+M.FC+"일 전망":"")+(M.over?"":" · 남은 "+M.left+"일");
 return FV._html`<div>
  <div style=${{fontSize:"11px",color:"var(--text-muted)",marginBottom:"4px"}}>${summary}</div>
  <${FV.MatrixHeader} matrix=${M} />
  ${M.rows.map(function(r){return FV._html`<${FV.MatrixRow} row=${r} fc=${M.FC} />`;})}
 </div>`;
}

