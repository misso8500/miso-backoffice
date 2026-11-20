import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { requestJson } from './storage';
import { loadWorkCalendar, type WorkCalendarData } from './lib/work-tasks';
import { attendanceLabels, roleOn, type StaffRole, type StaffDocument, type StaffMonth, type StaffProfile, type StaffRow } from './lib/staff-records';
import { AttendancePaper, printStaffPaper } from './StaffRecordPrint';
import { recurrenceToday } from '../shared/work-recurrence.mjs';

import './StaffRecordCalendar.css';

function RecordAccordion({title,summary,children,initialOpen=false}:{title:string;summary?:string;children:ReactNode;initialOpen?:boolean}) {
  const [open,setOpen]=useState(initialOpen),id=useId();
  return <section className={`record-accordion ${open?'is-open':''}`}><button type="button" className="record-accordion-toggle" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)}><span><strong>{title}</strong>{summary&&<small>{summary}</small>}</span><ChevronDown size={18}/></button><div id={id} className="record-collapse" inert={!open}><div className="record-collapse-clip"><div className="record-accordion-content">{children}</div></div></div></section>;
}

export default function StaffRecordCalendar({profile,role,month,onMonthChange,onJournal,onDirty,onBusy}:{
  profile:StaffProfile;role:StaffRole|null;month:string;onMonthChange:(month:string)=>void;onJournal:()=>void;
  onDirty:(value:boolean)=>void;onBusy:(value:boolean)=>void;
}) {
  const [date,setDate]=useState('');
  const [editorOpen,setEditorOpen]=useState(false);
  const calendarRef=useRef<HTMLDivElement>(null);
  const editorRef=useRef<HTMLElement>(null);
  const [data,setData]=useState<{attendance:StaffMonth;calendar:WorkCalendarData}|null>(null);
  const [busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const path=`/api/work/records/attendance/${month}?staffId=${encodeURIComponent(profile.staffId)}`;
  useEffect(()=>{onDirty(dirty);},[dirty,onDirty]);
  useEffect(()=>{onBusy(busy);},[busy,onBusy]);
  useEffect(()=>{
    let active=true;
    setData(null);setBusy(true);setError('');setNotice('');setDirty(false);
    const last=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate();
    void Promise.all([requestJson<StaffMonth>(path),loadWorkCalendar(month+'-01',month+'-'+last,profile.staffId)])
      .then(([attendance,calendar])=>{if(active){setData({attendance,calendar});setDate('');setEditorOpen(false);}})
      .catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;};
  },[month,profile.staffId,path]);
  const attendance=data?.attendance.document;
  const matchesRole=(date:string)=>!role||!profile.employment||roleOn(profile.employment,date)===role;
  const row=attendance?.payload.rows.find(row=>row.date===date&&matchesRole(row.date));
  const editable=attendance?.status==='draft';
  const rows=attendance?.payload.rows.filter(row=>matchesRole(row.date))??[];
  const pendingDays=rows.filter(day=>day.kind==='pending');
  const dayIndex=rows.findIndex(day=>day.date===date);

  function openDay(day:string) {
    setDate(day);
    setEditorOpen(true);
    requestAnimationFrame(()=>{
      editorRef.current?.focus({preventScroll:true});
      editorRef.current?.scrollIntoView({block:'nearest'});
    });
  }

  function change(patch:Partial<StaffRow>) {
    if(!data||!attendance||!editable)return;
    const rows=attendance.payload.rows.map(row=>row.date===date?{...row,...patch,reviewed:patch.reviewed??false}:row);
    setData({...data,attendance:{...data.attendance,document:{...attendance,payload:{...attendance.payload,rows}}}});
    setDirty(true);
  }

  function markRemainingOff() {
    if(!data||!attendance||!editable||!window.confirm('확인 필요 날짜를 모두 휴무로 표시할까요? 출근·결근·연차가 있으면 먼저 해당 날짜를 입력해 주세요.'))return;
    const rows=attendance.payload.rows.map(row=>row.kind==='pending'&&matchesRole(row.date)
      ? {...row,kind:'off' as const,start:'',end:'',hours:0,reviewed:false}
      : row);
    setData({...data,attendance:{...data.attendance,document:{...attendance,payload:{...attendance.payload,rows}}}});
    setDirty(true);
  }

  async function save(action:'save'|'confirm'|'reopen') {
    if(!data||!attendance||busy)return;
    const reason=action==='reopen'?window.prompt('출근 기록을 정정하는 사유를 입력해 주세요.')??'':'';
    if(action==='reopen'&&!reason.trim())return;
    if(action==='confirm'&&!window.confirm('롱텀케어 기록과 이달의 근태·출퇴근 시간을 모두 대조했나요? 이 내용으로 달력을 등록하고 출근부를 확정합니다.'))return;
    const payload=action==='confirm'
      ? {...attendance.payload,rows:attendance.payload.rows.map(row=>({...row,reviewed:true}))}
      : attendance.payload;
    setBusy(true);setError('');setNotice('');
    try {
      const latest=await requestJson<StaffMonth>(path);
      if(latest.document.version!==attendance.version)throw new Error('다른 화면에서 출근 기록이 변경되었습니다. 최신 기록과 비교해 주세요.');
      if(action==='confirm'&&latest.sourceHash!==data.attendance.sourceHash) {
        setData({...data,attendance:{...latest,document:attendance,sourceChanged:true}});
        throw new Error('업무 수행 또는 연차 기록이 바뀌었습니다. 달력에 반영된 최신 근거를 확인한 뒤 다시 확정해 주세요.');
      }
      const document=await requestJson<StaffDocument>(path,{method:'PUT',body:JSON.stringify({version:attendance.version,payload,sourceHash:latest.sourceHash,action,reason})});
      setData({...data,attendance:{...latest,document,sourceChanged:false}});
      setDirty(false);
      setNotice(action==='confirm'?'달력을 등록하고 출근부를 확정했습니다. 업무수행일지에서 초안을 보완할 수 있습니다.':action==='reopen'?'정정 사유를 남기고 출근 기록을 다시 열었습니다.':'달력 초안을 저장했습니다.');
    } catch(e){setError(e instanceof Error?e.message:'저장하지 못했습니다.');}finally{setBusy(false);}
  }
  return <div className="staff-calendar-records"><div className="staff-toolbar record-month-toolbar"><label>작성 월<input aria-label="통합 근무기록 월" type="month" value={month} disabled={busy} onChange={e=>{if(e.target.value&&(!dirty||window.confirm('저장하지 않은 내용을 닫을까요?')))onMonthChange(e.target.value);}}/></label>{data&&<span>출근부 {attendance?.status==='confirmed'?'확정':'초안'}</span>}</div>
    {error&&<p role="alert" className="work-day-error">{error}</p>}{notice&&<p role="status" className="work-notice">{notice}</p>}
    {!data?(busy&&<p role="status">업무 달력과 근무기록을 불러오는 중입니다.</p>):<>
    {data.attendance.sourceChanged&&<p className="staff-warning">원본 업무·연차가 변경되었습니다. 달력의 최신 근거와 기록을 비교해 주세요.</p>}
    <div className="staff-toolbar">{editable?<><button className="secondary-button" disabled={busy||!pendingDays.length} onClick={markRemainingOff}>미입력 날짜를 휴무로 표시</button><button className="secondary-button" disabled={busy||!dirty} onClick={()=>void save('save')}>달력 초안 저장</button><button className="primary-button" disabled={busy||attendance?.payload.rows.some(day=>day.kind==='pending')} onClick={()=>void save('confirm')}>달력 등록 및 출근부 확정</button></>:attendance&&<><button className="secondary-button" disabled={busy} onClick={()=>void save('reopen')}>정정 사유 남기고 다시 열기</button><button className="secondary-button" disabled={busy||!rows.length} onClick={()=>printStaffPaper(<AttendancePaper document={attendance} visibleDate={matchesRole} jobTitle={role??undefined}/>)}>출근부 인쇄</button><button className="primary-button" disabled={busy} onClick={onJournal}>업무수행일지 열기</button></>}</div>
    <p className="staff-help">롱텀케어 출근 기록을 보면서 날짜별 근태와 출퇴근 시간을 입력하세요. 출근을 선택하면 직원 기본시간이 채워집니다. 실제 시간과 인정시간을 확인한 뒤 달력을 등록하세요.</p>
    <div className="record-month-summary"><strong>{profile.name} · {Number(month.slice(5))}월</strong><span>출근 {rows.filter(day=>day.kind==='work').length}일</span><span>미입력 {pendingDays.length}일</span><span className="is-done">검토 {attendance?.payload.rows.filter(day=>day.reviewed).length}일</span><small>{dirty?'저장하지 않은 변경이 있습니다.':'저장된 기록을 확인하고 있습니다.'}</small></div>
    <RecordAccordion title="월 근무기록" summary="날짜를 눌러 출근 기록을 작성·검토하세요." initialOpen>
    {role&&rows.length===0&&<p className="staff-help">선택한 달에 {role} 발령 기간이 없습니다.</p>}
    {role&&editable&&pendingDays.length===0&&attendance?.payload.rows.some(day=>day.kind==='pending')&&<p className="staff-help">다른 직함 또는 입사 전 날짜의 미입력 기록은 전체 근태에서 확인하세요.</p>}
    {editable&&pendingDays.length>0&&<div className="staff-toolbar"><button type="button" className="secondary-button" disabled={busy} onClick={()=>openDay(pendingDays[0].date)}>첫 미입력 날짜 열기</button></div>}
    <div className={`record-calendar-layout ${editorOpen&&row?'has-editor':''}`}><div><section className="record-calendar-card"><div className="record-calendar-heading"><h2>{month} · {profile.name}</h2><small>보라 · 검토 전 / 초록 · 검토 완료</small></div><div className="staff-calendar" ref={calendarRef}>{['일','월','화','수','목','금','토'].map((day,index)=><strong className={`record-weekday day-${index}`} key={day}>{day}</strong>)}{Array.from({length:new Date(month+'-01T12:00:00Z').getUTCDay()},(_,i)=><span key={'blank'+i}/>)}{attendance?.payload.rows.map(day=>{if(!matchesRole(day.date))return <span key={day.date}/>;const plans=data.calendar.plans.filter(p=>p.date===day.date&&p.status==='planned');const deadlines=data.calendar.deadlines.filter(p=>p.dueDate===day.date);const executions=data.attendance.executions.filter(e=>e.date===day.date);const reviewed=day.reviewed;const hasNote=Boolean(day.note);return <button type="button" key={day.date} disabled={busy} aria-label={`${day.date} ${attendanceLabels[day.kind]} ${reviewed?'검토 완료':'검토 전'}`} className={`${reviewed?'is-reviewed':''} ${day.kind!=='pending'?'is-recorded':''} ${day.date===recurrenceToday()?'is-today':''}`} aria-pressed={editorOpen&&date===day.date} onClick={()=>openDay(day.date)}><strong>{Number(day.date.slice(8))}일</strong><span>{attendanceLabels[day.kind]} {day.kind==='leave'?day.leaveDays+'일':''}</span><small>계획 {plans.length} · 할 일 {deadlines.length}<br/>수행 {executions.length}</small><small>{reviewed?'✓ 검토 완료':'검토 전'}{hasNote?' · 기록':''}</small></button>;})}</div></section><RecordAccordion title="날짜 미지정 할 일" summary={`${data.calendar.unplanned.length}건`}>{data.calendar.unplanned.length?<ul className="record-task-list">{data.calendar.unplanned.map(task=><li key={task.id}>{task.title}</li>)}</ul>:<p className="staff-help">날짜 미지정 할 일이 없습니다.</p>}</RecordAccordion></div>
    <div className="record-editor-slide" inert={!editorOpen}><div className="record-editor-clip">{row&&<section ref={editorRef} tabIndex={-1} className="record-day-editor" aria-label="근무기록 작성"><header><div><small>{profile.name} · 출근 기록</small><h2>{date}</h2></div><button type="button" className="icon-button" disabled={busy} aria-label="근무기록 작성 닫기" onClick={()=>{setEditorOpen(false);calendarRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus();}}><X size={18}/></button></header><div className="staff-toolbar" aria-label="날짜 이동"><button type="button" className="secondary-button" disabled={busy||dayIndex<=0} onClick={()=>setDate(rows[dayIndex-1].date)}>이전 날짜</button><button type="button" className="secondary-button" disabled={busy||dayIndex>=rows.length-1} onClick={()=>setDate(rows[dayIndex+1].date)}>다음 날짜</button></div><div className="staff-detail-heading"><button type="button" className="staff-review-button" aria-pressed={row.reviewed} disabled={busy||!editable} onClick={()=>change({reviewed:!row.reviewed})}><Check size={20} aria-hidden="true"/>{row.reviewed?'검토 완료됨':'검토 완료'}</button><small className="staff-help">{editable?'검토 표시는 달력 초안에 저장할 수 있습니다.':'확정된 기록입니다. 수정하려면 월 기록을 다시 열어 주세요.'}</small></div><RecordAccordion key={date} title="업무 계획·실제 수행 근거" summary={`${data.attendance.executions.filter(value=>value.date===date).length}건의 수행 기록`}><h3>업무 계획·할 일</h3>{data.calendar.plans.filter(p=>p.date===date&&p.status==='planned').map(p=><p key={p.id}>계획 · {p.snapshot.title}</p>)}{data.calendar.deadlines.filter(p=>p.dueDate===date).map(p=><p key={p.id}>할 일 · {p.title}</p>)}<h3>실제 수행 근거</h3>{data.attendance.executions.filter(e=>e.date===date).map(e=><p key={e.id}>{e.period==='morning'?'오전':e.period==='afternoon'?'오후':'시간 미확인'} · {e.content}</p>)}{data.attendance.leaveDates?.filter(d=>d.date===date).map(d=><p key={d.date} className="staff-warning">확정 연차 계획 {d.days}일</p>)}
    </RecordAccordion><fieldset disabled={busy||!editable}><label>근태<select aria-label="근태" value={row.kind} onChange={e=>change({kind:e.target.value as StaffRow['kind'],...(['leave','off','absent'].includes(e.target.value)?{start:'',end:'',hours:0}:e.target.value==='work'?{start:profile.startTime,end:profile.endTime,hours:profile.hours}:{})})}>{Object.entries(attendanceLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>{row.kind==='leave'&&<label>연차 일수<select value={row.leaveDays} onChange={e=>change({leaveDays:Number(e.target.value)})}><option value={1}>1일</option><option value={0.5}>반차 0.5일</option></select></label>}
    <div className="staff-profile-grid"><label>출근<input type="time" value={row.start} onChange={e=>change({start:e.target.value})}/></label><label>퇴근<input type="time" value={row.end} onChange={e=>change({end:e.target.value})}/></label><label>근무시간<input type="number" min={0} max={24} step={0.5} value={row.hours} onChange={e=>change({hours:Number(e.target.value)})}/></label></div>
    <label>근태 비고·연차 사유<input maxLength={1000} value={row.note} onChange={e=>change({note:e.target.value})}/></label></fieldset><div className="record-editor-actions"><span>{dirty?'변경 내용은 아직 저장되지 않았습니다.':'저장된 월 기록입니다.'}</span><button type="button" className="primary-button" disabled={busy||!editable||!dirty} onClick={()=>void save('save')}>{busy?'저장 중…':'달력 초안 저장'}</button></div></section>}</div></div>
    </div></RecordAccordion></>}
  </div>;
}
