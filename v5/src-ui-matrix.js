FV.MatrixCell=function(props){
 var color=props.warn?"var(--text-warning)":(props.muted?"var(--text-muted)":(props.color||"var(--text-primary)"));
 return FV._html`<span style=${{
  minWidth:"32px",flex:"1",textAlign:"center",fontSize:"11px",color:color,
  opacity:props.muted?"0.45":"1"
 }}>${props.text}</span>`;
}

// 생산·수요 전망만 남긴 표. 지난 며칠의 상태는 어제 결과/오늘 확정치가 이미 보여준다.
FV.ForecastMatrix=function(props){
 var M=props.matrix;
 if(!M)return null;
 var row=function(label,group,vals){
  return FV._html`<div style=${{display:"flex",gap:"2px",padding:"2px 0"}}>
   <span style=${{width:"26px",flexShrink:"0",fontSize:"11px",color:"var(--text-secondary)"}}>${label}</span>
   ${vals.map(function(v){return FV._html`<${FV.MatrixCell} text=${FV.say(group,v)} color="var(--text-muted)" />`;})}
  </div>`;
 };
 return FV._html`<div>
  <div style=${{fontSize:"11px",color:"var(--text-muted)",marginBottom:"4px"}}>앞으로 ${M.FC}일</div>
  ${row(FV.say("row","supply"),"supply",M.supply)}
  ${row(FV.say("row","demand"),"demand",M.demand)}
 </div>`;
}
