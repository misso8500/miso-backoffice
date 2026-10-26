import {halfYearEnd,halfYearStart,isCalendarDate,moveDate,nextHalfYearStart,planDeadline,deadlineLabel} from '../shared/care-plan-periods.mjs';
const error=message=>Object.assign(new Error(message),{status:400});
export const categories=['initial','regular','recognition_renewal','grade_change','needs_change'];
const periodKey=p=>p?`${p.startDate}/${p.endDate}`:'';
export function planContext(recipient,recognitionPeriods=[]) {
  return {institutionPeriod:{startDate:recipient.serviceStartDate||'',endDate:recipient.serviceEndDate||''},careGrade:recipient.careGrade||'',recognitionPeriods};
}
export function normalizePlanSchedule(body,recipient,versions,source,today) {
  const value=body.schedule;
  if(!value||typeof value!=='object')throw error('계획 종류와 실행기간, 작성·통보 정보를 입력해 주세요.');
  if(!categories.includes(value.category)||!['draft','completed'].includes(value.status))throw error('계획 종류와 작성 상태를 확인해 주세요.');
  const institution=source?.schedule?.institutionPeriod??{startDate:recipient.serviceStartDate,endDate:recipient.serviceEndDate};
  if(!isCalendarDate(institution.startDate)||!isCalendarDate(institution.endDate)||institution.startDate>institution.endDate)throw error('수급자 상세에서 기관 이용계약 시작일과 만료일을 먼저 등록해 주세요.');
  const start=body.effectiveDate,end=value.endDate;
  if(!isCalendarDate(end)||end<start||end>halfYearEnd(start))throw error('계획 종료일은 시작일 이후이면서 해당 반기 말 이내여야 합니다.');
  if(start<institution.startDate||end>institution.endDate)throw error('급여제공계획 실행기간은 연결한 기관 이용기간 안이어야 합니다.');
  if(value.category==='regular'&&start!==halfYearStart(start))throw error('정기 계획의 시작일은 1월 1일 또는 7월 1일입니다. 중간 변경은 해당 사유를 선택해 주세요.');
  let recognition=null;
  if(value.recognitionPeriod&&(value.recognitionPeriod.startDate||value.recognitionPeriod.endDate||value.recognitionPeriod.careGrade||value.recognitionPeriod.id)){
    const p=value.recognitionPeriod;
    if(!isCalendarDate(p.startDate)||!isCalendarDate(p.endDate)||p.startDate>p.endDate)throw error('인정서의 인정 시작일과 종료일을 확인해 주세요.');
    if(start<p.startDate||end>p.endDate)throw error('계획 실행기간이 장기요양 인정기간을 벗어납니다. 인정 갱신 정보를 확인해 주세요.');
    const grades=['1등급','2등급','3등급','4등급','5등급','인지지원등급'];
    if(p.careGrade&&!grades.includes(p.careGrade))throw error('인정기간에 해당하는 등급을 확인해 주세요.');
    recognition={id:typeof p.id==='string'?p.id.slice(0,100):'',startDate:p.startDate,endDate:p.endDate,careGrade:p.careGrade||''};
  }
  const actual=key=>{
    const date=value[key]||null;
    if(date&&(!isCalendarDate(date)||date>today))throw error('실제 작성일·통보일에는 오늘 이전의 날짜를 입력해 주세요.');
    return date;
  };
  const writtenDate=actual('writtenDate'),notifiedDate=actual('notifiedDate');
  if(notifiedDate&&(!writtenDate||notifiedDate<writtenDate))throw error('통보일은 작성일과 같거나 이후여야 합니다.');
  if(value.status==='completed'&&(!writtenDate||!notifiedDate||!recognition||!recognition.careGrade||!body.notes.servicePlanNotes.trim()))throw error('완료하려면 작성일·통보일, 인정기간·등급, 급여제공계획 메모를 입력해 주세요. 파일 첨부는 필수가 아닙니다.');
  if(source?.schedule){
    if(value.category!==source.schedule.category||(source.schedule.recognitionPeriod&&periodKey(recognition)!==periodKey(source.schedule.recognitionPeriod)))throw error('정정·완료 기록은 기존 계획 종류와 인정기간을 유지해야 합니다. 실제 변경이면 새 계획을 작성해 주세요.');
  }else if(['initial','regular'].includes(value.category)){
    const same=versions.some(p=>p.schedule&&p.effectiveDate===start&&periodKey(p.schedule.institutionPeriod)===periodKey(institution));
    if(same)throw Object.assign(error('해당 시작일의 계획이 있습니다. 기존 계획의 작성 계속 또는 정정을 선택해 주세요.'),{status:409});
  }
  return {category:value.category,status:value.status,endDate:end,writtenDate,notifiedDate,deadline:planDeadline(value.category,start),institutionPeriod:{...institution},recognitionPeriod:recognition};
}
export function executionPlans(versions,today) {
  const latest=new Map();
  for(const p of versions){if(!p.schedule)continue;const key=p.planId||p.id;if(!latest.has(key)||latest.get(key).version<p.version)latest.set(key,p);}
  const plans=[...latest.values()].sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate)||a.version-b.version);
  return plans.map(p=>{
    const next=plans.find(n=>n.schedule.status==='completed'&&periodKey(n.schedule.institutionPeriod)===periodKey(p.schedule.institutionPeriod)&&(n.effectiveDate>p.effectiveDate||(n.effectiveDate===p.effectiveDate&&n.version>p.version)));
    const executionEndDate=p.schedule.status==='completed'&&next&&next.effectiveDate<=p.schedule.endDate?moveDate(next.effectiveDate,-1):p.schedule.endDate;
    const replaced=executionEndDate<p.effectiveDate;
    const active=p.schedule.status==='completed'&&!replaced&&p.effectiveDate<=today&&executionEndDate>=today;
    const label=p.schedule.status==='draft'?'작성 중':replaced?'동일일자 계획으로 대체':active?'실행 중':p.effectiveDate>today?'적용 예정':next&&executionEndDate<p.schedule.endDate?'후속 계획으로 변경':'실행 종료';
    return {...p,executionEndDate,executionStatus:label,deadlineStatus:deadlineLabel(p.schedule,p.effectiveDate,today),active};
  });
}
export function regularRequirement(recipient,plans,today) {
  const start=recipient.serviceStartDate,end=recipient.serviceEndDate;
  if(!isCalendarDate(start)||!isCalendarDate(end))return null;
  const relevant=plans.filter(p=>periodKey(p.schedule.institutionPeriod)===`${start}/${end}`);
  if(!relevant.length)return null;
  const currentHalf=halfYearStart(today);
  const candidate=relevant.some(p=>p.active)?nextHalfYearStart(today):currentHalf;
  if(candidate<start||candidate>end)return null;
  const record=[...relevant].reverse().find(p=>p.effectiveDate===candidate&&periodKey(p.schedule.institutionPeriod)===`${start}/${end}`);
  if(record?.schedule.category==='initial')return null;
  const deadline=planDeadline('regular',candidate);
  return {startDate:candidate,endDate:halfYearEnd(candidate)<end?halfYearEnd(candidate):end,deadline,status:record?.schedule.status==='completed'?'completed':record?'draft':'missing',deadlinePassed:today>deadline,planId:record?.planId??null};
}
