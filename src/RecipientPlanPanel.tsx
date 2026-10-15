import { useEffect, useRef, useState } from 'react';
import PlanScheduleFields, {defaultPlanEnd,planCategories} from './PlanScheduleFields';
import {halfYearStart,nextHalfYearStart} from '../shared/care-plan-periods.mjs';
import { loadRecipientPlan, saveRecipientPlan } from './storage';
import { dateInputError } from './lib/date-input';
import type { RecipientPlanNotes, RecipientPlanState, RecipientPlanVersion, RecipientPlanScheduleInput } from './types';

export const planNoteFields: { key: keyof RecipientPlanNotes; label: string; placeholder: string }[] = [
  {key:'medicalHistory',label:'병력 · 건강 메모',placeholder:'확인된 병력, 건강 상태, 돌봄 시 주의사항'},
  {key:'caregiverRequirements',label:'요양보호사 구인조건 메모',placeholder:'필요한 요양보호사의 조건, 가능한 요일·시간'},
  {key:'familyNotes',label:'가족사항 메모',placeholder:'동거 가족, 보호자와의 연락 및 돌봄 협조 사항'},
  {key:'hospitalNotes',label:'관련병원 메모',placeholder:'이용 병원, 진료과, 방문 시 참고사항'},
  {key:'servicePlanNotes',label:'급여제공계획 메모',placeholder:'필요한 서비스, 제공 방식과 목표, 변경할 사항'}
];
const emptyNotes: RecipientPlanNotes={medicalHistory:'',caregiverRequirements:'',familyNotes:'',hospitalNotes:'',servicePlanNotes:''};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function PlanNotes({notes}: {notes:RecipientPlanNotes}) {return <dl className="recipient-plan-notes">{planNoteFields.map(field=><div key={field.key}><dt>{field.label}</dt><dd>{notes[field.key]||'미등록'}</dd></div>)}</dl>;}
export default function RecipientPlanPanel({ recipientId, focusOnMount=false, initiallyEditing=false, onSaved }: {
  recipientId:string; focusOnMount?:boolean; initiallyEditing?:boolean; onSaved:(state:RecipientPlanState)=>void;
}) {
  const [state,setState]=useState<RecipientPlanState|null>(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
  const [editing,setEditing]=useState(false),[notes,setNotes]=useState<RecipientPlanNotes>(emptyNotes),[effectiveDate,setEffectiveDate]=useState(today);
  const [kind,setKind]=useState<'change'|'correction'|'progress'>('change'),[reason,setReason]=useState(''),[source,setSource]=useState<RecipientPlanVersion|null>(null);
  const [schedule,setSchedule]=useState<RecipientPlanScheduleInput>({category:'initial',status:'draft',endDate:'',writtenDate:null,notifiedDate:null,recognitionPeriod:null});
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[showHistory,setShowHistory]=useState(false),[attempt,setAttempt]=useState(0);
  const panel=useRef<HTMLElement>(null),form=useRef<HTMLFormElement>(null),errorBox=useRef<HTMLParagraphElement>(null);
  useEffect(()=>{
    let active=true;setLoading(true);setError('');
    void loadRecipientPlan(recipientId).then(data=>{if(!active)return;setState(data);setNotes(data.current?.notes??data.legacyNotes);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[recipientId,attempt,initiallyEditing]);
  useEffect(()=>{if(focusOnMount&&!loading){panel.current?.scrollIntoView({block:'start'});panel.current?.focus();}},[focusOnMount,loading]);
  useEffect(()=>{if(editing)form.current?.querySelector<HTMLInputElement>('input')?.focus();},[editing]);
  useEffect(()=>{if(error&&editing){errorBox.current?.scrollIntoView({block:'nearest'});errorBox.current?.focus();}},[error,editing]);
  useEffect(()=>{if(initiallyEditing&&state&&!loading&&!editing)start();},[initiallyEditing,loading]);
  function start(version:RecipientPlanVersion|null=null,correction=false) {
    if(!state)return;
    const selected=version??state.current;
    const resume=Boolean(version?.schedule);
    const institution=state.context.institutionPeriod;
    const date=version?.effectiveDate??(state.plans.length?(state.regularRequirement?.startDate??nextHalfYearStart(today())):(institution.startDate||today()));
    const period=state.context.recognitionPeriods.find(p=>p.startDate<=date&&p.endDate>=date)??null;
    setNotes(selected?.notes??state.legacyNotes);setEffectiveDate(date);
    setSchedule(resume?{...version!.schedule!}:{category:state.plans.length?'regular':'initial',status:'draft',endDate:defaultPlanEnd(date,institution.endDate,period?.endDate),writtenDate:null,notifiedDate:null,recognitionPeriod:period?{...period,careGrade:state.context.careGrade}:null});
    setSource(version);setKind(correction?'correction':resume?'progress':'change');setReason('');setError('');setNotice('');setEditing(true);
  }

  return <section ref={panel} tabIndex={-1} className="recipient-plan-panel" aria-label="수급자 계획">
    <div className="section-title-row"><div><h3>수급자 계획</h3><p>현재 상태와 돌봄 방향을 함께 확인합니다.</p></div>{!editing&&<button type="button" className="secondary-button" disabled={loading||saving||!state} onClick={()=>start()}>계획 작성·변경</button>}</div>
    {loading&&<p role="status">계획 불러오는 중…</p>}
    {error&&!editing&&<p ref={errorBox} tabIndex={-1} role="alert" className="form-error">{error}</p>}
    {!loading&&error&&!editing&&<button type="button" className="secondary-button" onClick={()=>setAttempt(attempt+1)}>다시 불러오기</button>}
    {notice&&<p role="status">{notice}</p>}
    {state&&!loading&&<>
      {state.regularRequirement&&<div className="plan-deadline-card"><strong>정기 계획 {state.regularRequirement.startDate} ~ {state.regularRequirement.endDate}</strong><span>작성·통보 목표 마감 {state.regularRequirement.deadline} · {state.regularRequirement.status==='completed'?'완료':state.regularRequirement.deadlinePassed?'목표 마감 지남':state.regularRequirement.status==='draft'?'작성 중':'작성 필요'}</span></div>}
      {!editing&&state.plans.length>0&&<div className="plan-execution-list">{[...state.plans].reverse().map(p=><article key={p.id}><div><strong>{p.executionStatus} · {p.effectiveDate} ~ {p.executionEndDate}</strong><p>{planCategories[p.schedule.category]} · {p.deadlineStatus}</p><p>작성일 {p.schedule.writtenDate||'미입력'} / 통보일 {p.schedule.notifiedDate||'미입력'}{p.schedule.deadline&&` / 목표 마감 ${p.schedule.deadline}`}</p></div><button type="button" className="secondary-button" onClick={()=>start(p)}>{p.schedule.status==='draft'?'작성 계속·완료':'내용 수정'}</button></article>)}</div>}
      {state.nextEffectiveDate&&<p className="plan-scheduled-note">{state.nextEffectiveDate}부터 적용할 계획이 있습니다. 아래 변경 이력에서 확인해 주세요.</p>}
      {editing?<form ref={form} noValidate onSubmit={async event=>{
        event.preventDefault();setError('');
        const dateError=dateInputError(effectiveDate,true);if(dateError){setError(`적용일: ${dateError}`);return;}
        if(!reason.trim()){setError('변경 사유를 입력해 주세요.');return;}
        if(kind==='correction'&&(!source||effectiveDate!==source.effectiveDate)){setError('정정할 계획을 선택하고 기존 적용일을 유지해 주세요.');return;}
        setSaving(true);try{
          const result=await saveRecipientPlan(recipientId,{version:state.version,notes,effectiveDate,schedule,changeKind:kind,changeReason:reason,...(source?{sourceVersion:source.version}:{})});
          setState(result);setEditing(false);onSaved(result);
          setNotice(result.version===state.version?'변경된 내용이 없어 기존 계획을 유지했습니다.':schedule.status==='draft'?'작성 중인 계획을 임시 저장했습니다. 작성 계속·완료 버튼으로 이어서 작성할 수 있습니다.':effectiveDate>today()?'작성·통보 완료한 예정 계획을 저장했습니다. 적용일부터 실행 중으로 표시합니다.':'계획을 저장하고 이전 내용을 이력으로 보관했습니다.');
        }catch(e){setError(e instanceof Error?e.message:'계획을 저장하지 못했습니다.');}finally{setSaving(false);}
      }}>
        <PlanScheduleFields start={effectiveDate} setStart={setEffectiveDate} schedule={schedule} setSchedule={next=>{
          if(next.category!==schedule.category&&next.category==='regular'){
            const date=state.regularRequirement?.startDate??halfYearStart(effectiveDate);setEffectiveDate(date);next={...next,endDate:defaultPlanEnd(date,state.context.institutionPeriod.endDate,next.recognitionPeriod?.endDate)};
          }setSchedule(next);
        }} institution={source?.schedule?.institutionPeriod??state.context.institutionPeriod} periods={state.context.recognitionPeriods} today={today()} locked={Boolean(source)} busy={saving}/>
        <p className="contract-attachment-note">빈 메모는 ‘미등록’으로 표시됩니다. 해당 사항이 없다면 ‘해당 없음’이라고 적어 주세요. 작성 중인 계획은 실행 중으로 표시하지 않습니다. 작성·통보 완료 후 실행기간에 맞춰 표시합니다.</p>
        <div className="plan-edit-fields">{planNoteFields.map(field=><label key={field.key}>{field.label}<textarea maxLength={5000} disabled={saving} value={notes[field.key]} placeholder={field.placeholder} onChange={event=>setNotes(current=>({...current,[field.key]:event.target.value}))}/></label>)}</div>
        <label className="plan-reason-field">변경 사유<textarea required maxLength={1000} disabled={saving} value={reason} onChange={event=>setReason(event.target.value)} placeholder="예: 인정 갱신, 등급 변경, 가족 사정 변경, 오탈자 정정"/></label>
        <p className="contract-attachment-note">작성자는 로그인한 계정으로 자동 기록합니다. 저장하지 않고 닫으면 입력 내용이 사라집니다.</p>
        {error&&<p ref={errorBox} tabIndex={-1} role="alert" className="form-error">{error}</p>}
        <div className="form-actions"><button type="button" className="secondary-button" disabled={saving} onClick={()=>{setEditing(false);setError('');}}>취소</button><button type="submit" className="primary-button" disabled={saving}>{saving?'저장 중…':'계획 저장'}</button></div>
        {error.includes('다른 사용자가')&&<button type="button" className="secondary-button" disabled={saving} onClick={()=>{if(window.confirm('입력 중인 내용을 버리고 최신 계획을 불러올까요?')){setEditing(false);setAttempt(attempt+1);}}}>최신 계획 다시 불러오기</button>}
      </form>:<>
        {state.current?<div className="plan-current-meta"><strong>{state.executionCurrent?`실행 중 · ${state.executionCurrent.effectiveDate} ~ ${state.executionCurrent.executionEndDate}`:'최근 입력 정보 · 현재 실행 중인 계획 없음'}</strong><span>적용일 {state.current.effectiveDate}</span><span>작성자 {state.current.authorName}</span></div>:<p className="contract-attachment-note">아직 적용된 계획 이력이 없습니다. 기존에 입력한 병력·구인조건이 있으면 아래에 표시합니다.</p>}
        <PlanNotes notes={state.current?.notes??state.legacyNotes}/>
      </>}
      <button type="button" className="secondary-button" onClick={()=>setShowHistory(!showHistory)}>{showHistory?'계획 이력 접기':`계획 변경 이력 보기 (${state.history.length}건)`}</button>
      {showHistory&&<div className="plan-history">{!state.history.length&&<p>저장된 계획 변경 이력이 없습니다.</p>}{state.history.map(version=><details key={version.id}><summary><strong>{version.changeKind==='legacy'?'기존 입력 정보':version.changeKind==='correction'?'오탈자 정정':version.changeKind==='progress'?'작성 내용 수정':'계획 작성·변경'}</strong><span>{version.effectiveDate?`적용일 ${version.effectiveDate}`:'적용일 기록 없음'}</span><span>{version.id===state.executionCurrent?.id?'실행 중':version.schedule?.status==='draft'?'작성 중':version.id===state.current?.id?'최근 입력 정보':version.effectiveDate&&version.effectiveDate>today()?'적용 예정':'이전 기록'}</span></summary>
        {version.schedule&&<p>{planCategories[version.schedule.category]} · 실행기간 {version.effectiveDate} ~ {version.schedule.endDate}<br/>목표 마감 {version.schedule.deadline||'사전 마감 제외'} · 실제 작성 {version.schedule.writtenDate||'미입력'} · 통보 {version.schedule.notifiedDate||'미입력'}</p>}
        <p>사유: {version.changeReason}</p><p>작성자: {version.authorName} · 기록일: {new Date(version.createdAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</p>
        {version.sourceVersion&&<p>정정 대상: {version.sourceVersion}번째 기록</p>}
        <PlanNotes notes={version.notes}/>
        {!editing&&version.changeKind!=='legacy'&&(!version.schedule||state.plans.some(p=>p.id===version.id))&&<button type="button" className="secondary-button" onClick={()=>start(version,true)}>이 기록의 오탈자 정정</button>}
      </details>)}</div>}
    </>}
  </section>;
}
