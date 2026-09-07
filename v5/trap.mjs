// 관계 회복 가능성 검증. 판로가 관계 0(끊김)에 떨어진 뒤 다시 오를 수 있는가.
// 커널 규칙: 회복하려면 toCh >= quota(원자재, 관계와 무관) 를 채워야 한다.
// 그런데 관계가 내려가면 그 판로의 하루 상한(cap) 도 함께 줄어든다.
// cap(관계 0) < quota 이면 그 판로는 이론적으로도 다시 채울 수 없다.
import fs from 'fs';
const FF=new Function('var FF={},FV={};'+fs.readFileSync('src-core.js','utf8')+'\nreturn FF;')();
const R=FF.C;
console.log('# 판로별 관계 단계 상한과 회복 기준(quota)\n');
console.log('| 판로 | quota(회복 기준) | rel0 상한 | rel1 상한 | rel2 상한 | rel3 상한 | 회복 가능? |');
console.log('|---|---|---|---|---|---|---|');
R.channels.forEach(function(c){
 var caps=R.rel.cap.map(function(m){return Math.round(c.cap*m*10)/10});
 var canRecover=caps.map(function(cap){return cap>=c.quota-1e-9});
 var cells=caps.map(function(v,i){return v+(canRecover[i]?'':'✗')}).join(' | ');
 console.log('| '+c.key+' | '+c.quota+'t | '+cells+' | '+(canRecover.every(Boolean)?'항상 가능':'막히는 단계 있음')+' |');
});
