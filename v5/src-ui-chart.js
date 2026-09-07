FV.ChartLegend=function(props){
 var D=props.data;
 return FV._html`
  <div style=${{fontSize:"11px",color:"var(--text-muted)",marginBottom:"4px"}}>
   <span style=${{color:"var(--text-primary)"}}>━</span> 생산 ·
   <span style=${{color:"var(--text-secondary)"}}>╌</span> 판매 ·
   <span style=${{color:"var(--text-muted)"}}>▮</span> 재고 ·
   <span style=${{color:"var(--text-warning)"}}>●</span>
   ${" 사건(위 유입·중간 창고·아래 유출) · ◆ 증설"+(D.FC>0?" · 오른쪽은 앞으로 "+D.FC+"일 가능 범위":"")}
  </div>`;
};

FV.ChartPlot=function(props){
 var D=props.data;
 if(!D)return null;
 var W=FF.C.chart.w,H=FF.C.chart.h,PAD=FF.C.chart.pad,BH=FF.C.chart.barH,GAP=FF.C.chart.gap;
 var TOP=PAD+20;
 var x=function(day){return PAD+(day-1)/(D.domain-1)*(W-2*PAD)};
 var y=function(v){return TOP+(1-v/D.max)*(H-BH-GAP-PAD-TOP)};
 var bw=(W-2*PAD)/D.domain;

 var inventory=D.rows.map(function(r){
  var hh=Math.max(1,r.end/Math.max(D.maxInv,FF.C.cap.storage)*BH);
  return FV._html`<rect
   x=${(PAD+(r.day-1)*bw).toFixed(1)}
   y=${(H-PAD-hh).toFixed(1)}
   width=${Math.max(1.5,bw*0.8).toFixed(1)}
   height=${hh.toFixed(1)}
   fill="var(--text-muted)" opacity="0.5" />`;
 });

 var forecast=[];
 if(D.FC>0){
  var xNow=x(D.nowDay), lx=x(D.labelDay)+6;
  forecast.push(FV._html`<line
   x1=${xNow.toFixed(1)} y1=${PAD}
   x2=${xNow.toFixed(1)} y2=${(H-BH-GAP-PAD).toFixed(1)}
   stroke="var(--border-strong)" stroke-width="0.7" stroke-dasharray="2 2" />`);
  forecast.push(FV._html`<text x=${lx.toFixed(1)} y=${PAD+7} font-size="7.5" fill="var(--text-primary)">${"생산 "+D.supplyDir}</text>`);
  forecast.push(FV._html`<text x=${lx.toFixed(1)} y=${PAD+16} font-size="7.5" fill="var(--text-secondary)">${"수요 "+D.demandDir}</text>`);
  var whiskers=function(bands,col,dx){
   return bands.map(function(b){
    var px=x(b.day)+dx, y1=y(b.hi), y2=y(b.lo);
    return FV._html`<g>
     <line x1=${px.toFixed(1)} y1=${y1.toFixed(1)} x2=${px.toFixed(1)} y2=${y2.toFixed(1)} stroke=${col} stroke-width="1.4" opacity="0.8" />
     <line x1=${(px-2.5).toFixed(1)} y1=${y1.toFixed(1)} x2=${(px+2.5).toFixed(1)} y2=${y1.toFixed(1)} stroke=${col} stroke-width="1" opacity="0.8" />
     <line x1=${(px-2.5).toFixed(1)} y1=${y2.toFixed(1)} x2=${(px+2.5).toFixed(1)} y2=${y2.toFixed(1)} stroke=${col} stroke-width="1" opacity="0.8" />
    </g>`;
   });
  };
  forecast=forecast.concat(whiskers(D.supplyBand,"var(--text-primary)",-3));
  forecast=forecast.concat(whiskers(D.demandBand,"var(--text-secondary)",3));
 }

 var points=function(key){return D.rows.map(function(r){return x(r.day).toFixed(1)+","+y(r[key]).toFixed(1)}).join(" ")};
 var events=D.events.map(function(e){
  var lane=(e.b==="intake")?0.22:(e.b==="store"||e.b==="stock")?0.5:0.78;
  return FV._html`<circle cx=${x(e.day).toFixed(1)} cy=${(PAD+lane*(H-BH-GAP-2*PAD)).toFixed(1)} r="2.2" fill="var(--text-warning)" />`;
 });
 var mods=D.mods.map(function(m,i){
  var bx=x(m.day);
  var col=D.scored?(m.contrib>=0?"var(--text-success)":"var(--text-warning)"):"var(--text-primary)";
  var ly=(i%2===0)?(PAD+9):(PAD+18), anc="middle", tx=bx;
  if(bx<28){anc="start";tx=PAD}
  else if(bx>W-28){anc="end";tx=W-PAD}
  return FV._html`<g>
   <rect x=${(bx-2.5).toFixed(1)} y=${PAD+1} width="5" height="5" transform=${"rotate(45 "+bx.toFixed(1)+" "+(PAD+3.5)+")"} fill=${col} />
   <line x1=${bx.toFixed(1)} y1=${PAD+6} x2=${bx.toFixed(1)} y2=${H-PAD} stroke=${col} stroke-width="0.5" opacity="0.4" />
   ${D.scored?FV._html`<text x=${tx.toFixed(1)} y=${ly} font-size="7.5" fill=${col} text-anchor=${anc}>${(m.contrib>=0?"+":"")+m.contrib}</text>`:null}
  </g>`;
 });

 return FV._html`<svg viewBox=${"0 0 "+W+" "+H} style=${{width:"100%",height:"auto",display:"block"}}>
  ${inventory}
  ${forecast}
  <polyline points=${points("prod")} fill="none" stroke="var(--text-primary)" stroke-width="1.6" />
  <polyline points=${points("sold")} fill="none" stroke="var(--text-secondary)" stroke-width="1.6" stroke-dasharray="3 2" />
  ${events}
  ${mods}
 </svg>`;
};

FV.ChartAxis=function(props){
 return FV._html`<div style=${{display:"flex",justifyContent:"space-between",fontSize:"10px",color:"var(--text-muted)"}}>
  <span>1일</span><span>${props.domain}일</span>
 </div>`;
};

FV.TimelineChart=function(props){
 var D=props.data;
 if(!D)return null;
 return FV._html`<div>
  <${FV.ChartLegend} data=${D} />
  <${FV.ChartPlot} data=${D} />
  <${FV.ChartAxis} domain=${D.domain} />
 </div>`;
};


// 월간 전망표. 기상청 1개월전망 형식이다.
// 각 구간은 낮음 / 비슷 / 높음 세 확률과 한 줄 판정을 낸다.

// 막대 여덟 칸으로 최근 추세를 보여준다. 숫자보다 방향이 먼저 읽힌다.
FV.Spark=function(props){
 var v=props.values||[];
 if(v.length<2)return null;
 var max=Math.max.apply(null,v.concat([props.floor||1]));
 var BLK=["\u2581","\u2582","\u2583","\u2584","\u2585","\u2586","\u2587","\u2588"];
 var chars=v.map(function(x){
  var i=Math.min(BLK.length-1,Math.max(0,Math.round(x/max*(BLK.length-1))));
  return BLK[i];
 }).join("");
 var head=chars.slice(0,-1), tail=chars.slice(-1);
 return FV._html`
  <div class="spark">
   <span class="spark-name">${props.label}</span>
   <span class="spark-bars">${head}<span class="spark-new" key=${props.day}>${tail}</span></span>
   <span class="spark-now">${props.now}</span>
  </div>`;
}
