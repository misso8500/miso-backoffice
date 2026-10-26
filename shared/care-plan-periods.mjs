export function isCalendarDate(value) {
  return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value>='1000-01-01' && Number.isFinite(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
}
export function moveDate(value,days) { const date=new Date(`${value}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10); }
export function halfYearStart(value) {return `${value.slice(0,4)}-${Number(value.slice(5,7))<=6?'01-01':'07-01'}`;}
export function halfYearEnd(value) {return `${value.slice(0,4)}-${Number(value.slice(5,7))<=6?'06-30':'12-31'}`;}
export function nextHalfYearStart(value) {return Number(value.slice(5,7))<=6?`${value.slice(0,4)}-07-01`:`${String(Number(value.slice(0,4))+1).padStart(4,'0')}-01-01`;}
export function planDeadline(category,startDate) {return category==='regular'&&isCalendarDate(startDate)?moveDate(startDate,-10):null;}
export function deadlineLabel(schedule,startDate,today) {
  if(!schedule)return '기간 확인 필요';
  const due=planDeadline(schedule.category,startDate);
  if(!due)return schedule.category==='initial'?'신규 · 사전 마감 제외':'수시 변경 · 사전 마감 제외';
  if(schedule.status==='completed')return schedule.writtenDate<=due&&schedule.notifiedDate<=due?'기한 내 완료':'마감 후 완료';
  if(today>due)return '목표 마감 지남';
  return today===due?'오늘 목표 마감':'작성·통보 준비';
}
