// 클립보드 조작. 화면 계층에서 DOM 을 만지는 유일한 곳이다.
FV.copyLog=function(){
 var S=FF.status(), B=FF.buysOf();
 var lines=["seed "+S.seed+" 현금 "+Math.round(S.cash)+" 입고 "+B.intake+"회 판매 "+B.sales,
  "일차\t설비\t몇 번째\t앞으로\t최근\t가동\t남은 날\t계기"];
 var BL=FF.buylogOf();
 for(var i=0;i<BL.length;i++){var b=BL[i];
  lines.push(b.day+"\t"+FV.lblOf(b.kind)+"\t"+b.nth+"\t"+FV.trendWord(b.gap)+"\t"+(b.hitLen<3?("관측"+b.hitLen+"일"):(b.hitLen+"일중"+b.hitN+"일"))+"\t"+b.util+"%\t"+b.left+"\t"+FV.say("path",b.path))}
 var txt=lines.join("\n");
 FF.LASTDUMP=txt;
 try{if(navigator&&navigator.clipboard)navigator.clipboard.writeText(txt)}catch{}
 var ta=document.getElementById("kdump");
 if(ta){ta.style.height="120px";ta.style.opacity="1";ta.value=txt;
  try{ta.select();ta.setSelectionRange(0,txt.length);document.execCommand("copy")}catch{}}
 var b2=document.getElementById("kcopy");
 if(b2)b2.textContent="복사됨. 안 되면 아래 상자를 길게 눌러 선택한다";
}
