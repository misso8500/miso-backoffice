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

export function recipientContractMonth(person,month){
 const inMonth=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value&&value.slice(0,7)===month;
 const starts=inMonth(person.serviceStartDate),ends=inMonth(person.serviceEndDate);
 return {starts,ends,tone:ends?'end':starts?'start':null};
}

export const getRecipientStatus = (recipient, now = new Date()) => {
  if (recipient.isDraft) return "정보입력중";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const start = new Date(`${recipient.serviceStartDate}T00:00:00`).getTime();
  const expiry = new Date(`${recipient.serviceEndDate}T00:00:00`).getTime();
  const daysUntilExpiry = Math.ceil((expiry - today) / 86_400_000);

  if (recipient.enabled===false || daysUntilExpiry < 0) return "계약종료";
  if (today < start) return "급여시작";
  if (daysUntilExpiry <= 14) return "계약종료예정";
  if (daysUntilExpiry <= 60) return "급여갱신필요";
  return "급여제공중";
};
