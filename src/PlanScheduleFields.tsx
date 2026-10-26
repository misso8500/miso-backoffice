import DateInput from './DateInput';
import {halfYearEnd,isCalendarDate,planDeadline,deadlineLabel} from '../shared/care-plan-periods.mjs';
import type {RecipientPlanScheduleInput,RecognitionPeriod} from './types';
export const planCategories: Record<RecipientPlanScheduleInput['category'],string>={initial:'신규 작성',regular:'정기 작성 (반기)',recognition_renewal:'인정 갱신',grade_change:'등급 변경',needs_change:'서비스 욕구 변화'};
export function defaultPlanEnd(start:string,institutionEnd:string,recognitionEnd?:string) {
  if(!isCalendarDate(start))return '';
  return [halfYearEnd(start),institutionEnd,recognitionEnd].filter((d):d is string=>Boolean(d&&isCalendarDate(d)&&d>=start)).sort()[0];
}
export default function PlanScheduleFields({start,setStart,schedule,setSchedule,institution,periods,today,locked,busy}: {
  start:string;setStart:(value:string)=>void;schedule:RecipientPlanScheduleInput;setSchedule:(value:RecipientPlanScheduleInput)=>void;
  institution:{startDate:string;endDate:string};periods:RecognitionPeriod[];today:string;locked:boolean;busy:boolean;
}) {
  const due=planDeadline(schedule.category,start);
  const patch=(fields:Partial<RecipientPlanScheduleInput>)=>setSchedule({...schedule,...fields});
  const recognition=schedule.recognitionPeriod??{id:'',startDate:'',endDate:'',careGrade:''};
  return <>
    <p className="plan-period-context">연결할 기관 이용기간: <strong>{institution.startDate||'시작일 미등록'} ~ {institution.endDate||'만료일 미등록'}</strong></p>
    {(!institution.startDate||!institution.endDate)&&<p className="form-error">아래 ‘계약 기간 수정·갱신’에서 기관 이용기간을 먼저 등록해 주세요.</p>}
    <div className="plan-edit-metadata">
      <label>계획 종류<select value={schedule.category} disabled={busy||locked} onChange={event=>patch({category:event.target.value as RecipientPlanScheduleInput['category']})}>{Object.entries(planCategories).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <label>작성 상태<select value={schedule.status} disabled={busy} onChange={event=>patch({status:event.target.value as 'draft'|'completed'})}><option value="draft">작성 중 · 임시 저장</option><option value="completed">작성·통보 완료</option></select></label>
      <label>계획 실행 시작일<DateInput required disabled={busy||locked} value={start} onChange={event=>{setStart(event.target.value);patch({endDate:defaultPlanEnd(event.target.value,institution.endDate,recognition.endDate)});}}/></label>
      <label>계획 실행 종료일<DateInput required disabled={busy} value={schedule.endDate} min={isCalendarDate(start)?start:undefined} max={isCalendarDate(start)?halfYearEnd(start):undefined} onChange={event=>patch({endDate:event.target.value})}/></label>
    </div>
    <p className="contract-attachment-note">정기 계획은 1월 1일 또는 7월 1일부터 시작합니다. 신규·중간 변경은 실제 시작일부터 해당 반기 말까지이며, 기관 이용·인정 기간이 먼저 끝나면 그 안에서 정합니다.</p>
    <div className="plan-deadline-card"><strong>작성·통보 목표 마감일: {due||'사전 마감 적용 제외'}</strong><span>{isCalendarDate(start)?deadlineLabel(schedule,start,today):'실행 시작일을 입력해 주세요.'}</span><small>정기 계획은 시작일 10일 전까지 작성·통보하는 기관의 목표입니다. 늦은 기록도 실제 날짜로 저장할 수 있습니다.</small></div>
    <div className="plan-edit-metadata"><label>실제 작성일<DateInput disabled={busy} max={today} value={schedule.writtenDate||''} onChange={event=>patch({writtenDate:event.target.value||null})}/></label><label>실제 통보일<DateInput disabled={busy} max={today} value={schedule.notifiedDate||''} onChange={event=>patch({notifiedDate:event.target.value||null})}/></label></div>
    <h4>장기요양 인정기간</h4>
    <label>기존 인정서류 기간에서 선택<select disabled={busy} value={periods.some(p=>p.id===recognition.id)?recognition.id:''} onChange={event=>{
      const period=periods.find(p=>p.id===event.target.value);
      patch({recognitionPeriod:period?{...period,careGrade:recognition.careGrade||''}:{id:'',startDate:'',endDate:'',careGrade:''},endDate:defaultPlanEnd(start,institution.endDate,period?.endDate)});
    }}><option value="">인정서 날짜 직접 입력</option>{periods.map(p=><option key={p.id} value={p.id}>{p.startDate} ~ {p.endDate}</option>)}</select></label>
    <div className="plan-edit-metadata"><label>인정 시작일<DateInput disabled={busy} value={recognition.startDate} onChange={event=>patch({recognitionPeriod:{...recognition,id:'',startDate:event.target.value}})}/></label><label>인정 종료일<DateInput disabled={busy} value={recognition.endDate} onChange={event=>patch({recognitionPeriod:{...recognition,id:'',endDate:event.target.value},endDate:defaultPlanEnd(start,institution.endDate,event.target.value)})}/></label><label>해당 인정기간의 등급<select disabled={busy} value={recognition.careGrade||''} onChange={event=>patch({recognitionPeriod:{...recognition,careGrade:event.target.value}})}><option value="">등급 선택</option>{['1등급','2등급','3등급','4등급','5등급','인지지원등급'].map(grade=><option key={grade}>{grade}</option>)}</select></label></div>
    <p className="contract-attachment-note">파일 없이 기간과 메모를 입력하여 완료할 수 있습니다. 인정기간과 등급은 인정서를 확인해서 입력해 주세요.</p>
  </>;
}
