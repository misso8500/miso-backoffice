import {isCalendarDate} from './care-plan-periods.mjs';
export function renewalDate(end) {
 if(!isCalendarDate(end))return null;
 const date=new Date(`${end}T00:00:00Z`),day=date.getUTCDate();
 date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()-1);
 const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
 date.setUTCDate(Math.min(day,last));return date.toISOString().slice(0,10);
}
export function recognitionPeriods(recipient) {
 const unique=new Map();
 // Document dates are authoritative; plan snapshots can supply the grade for that period.
 const inputs=[...(recipient.recognitionPeriods??[]),...(recipient.planSummary?.plans??[]).map(p=>p.schedule?.recognitionPeriod).filter(Boolean)];
 for(const p of inputs){if(!isCalendarDate(p.startDate)||!isCalendarDate(p.endDate)||p.startDate>p.endDate)continue;
  const key=`${p.startDate}/${p.endDate}`,existing=unique.get(key);
  unique.set(key,{...existing,...p,id:existing?.id||p.id||key,careGrade:p.careGrade||existing?.careGrade||''});
 }
 return [...unique.values()].sort((a,b)=>b.startDate.localeCompare(a.startDate)||b.endDate.localeCompare(a.endDate));
}
export function currentRecognition(periods,today) {
 return periods.find(p=>p.startDate<=today&&p.endDate>=today)??periods.filter(p=>p.startDate>today).sort((a,b)=>a.startDate.localeCompare(b.startDate))[0]??periods[0]??null;
}
export function recognitionStatus(period,today) {
 if(!period)return '인정기간 미등록';
 return period.startDate>today?'인정 시작 예정':period.endDate<today?'인정기간 만료':'인정기간 유효';
}
export function previousPeriod(event) {
 try {const p=JSON.parse(event.memo||'{}');return {startDate:isCalendarDate(p.previousStartDate)?p.previousStartDate:'',endDate:isCalendarDate(p.previousEndDate)?p.previousEndDate:''};}catch{return {startDate:'',endDate:''};}
}
export function institutionStatus(recipient,today) {
 if(recipient.enabled===false)return '비활성화';
 if(!isCalendarDate(recipient.serviceStartDate)||!isCalendarDate(recipient.serviceEndDate)||recipient.serviceStartDate>recipient.serviceEndDate)return '기간 확인 필요';
 if(recipient.serviceEndDate<today)return '계약 만료';
 if(recipient.serviceStartDate>today)return '이용 시작 예정';
 return '계약 중';
}
