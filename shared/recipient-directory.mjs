export function formatCareNumber(value){
 const number=typeof value==='string'?value.trim():'';
 if(!number||number.startsWith('__draft__:'))return '인정번호 미등록';
 return 'L'+number.replace(/^l+/i,'').trim();
}
export function recipientServiceSignal(person,status){
 if(person.isDraft)return {state:'black',label:'기초 정보 입력 중'};
 if(person.enabled===false||status==='계약종료'||status==='계약 만료')return {state:'red',label:person.enabled===false?'계약 종료':'계약 만료'};
 if(person.servicePaused)return {state:'red',label:'서비스 일시정지'};
 if(['급여갱신필요','계약종료예정'].includes(status))return {state:'yellow',label:'계약 갱신 필요'};
 if(status==='급여시작')return {state:'idle',label:'서비스 시작 예정'};
 return {state:'green',label:'서비스 진행 중'};
}
