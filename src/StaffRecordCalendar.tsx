import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { requestJson } from './storage';
import { loadWorkCalendar, type WorkCalendarData } from './lib/work-tasks';
import { attendanceLabels, type StaffMonth, type StaffProfile, type StaffRow } from './lib/staff-records';
import { AttendancePaper, JournalPaper, printStaffPaper } from './StaffRecordPrint';
import { recurrenceToday } from '../shared/work-recurrence.mjs';

export default function StaffRecordCalendar({profile,onDirty,onBusy}:{profile:StaffProfile;onDirty:(value:boolean)=>void;onBusy:(value:boolean)=>void}) {
  const [month,setMonth]=useState(recurrenceToday().slice(0,7)),[date,setDate]=useState('');
  const [data,setData]=useState<{attendance:StaffMonth;journal:StaffMonth;calendar:WorkCalendarData}|null>(null);
  const [busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const path=(kind:string)=>`/api/work/records/${kind}/${month}?staffId=${encodeURIComponent(profile.staffId)}`;
  useEffect(()=>{onDirty(dirty);},[dirty,onDirty]);
  useEffect(()=>{onBusy(busy);},[busy,onBusy]);
  useEffect(()=>{let active=true;setData(null);setBusy(true);setError('');setNotice('');
    const last=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate();
    void Promise.all([requestJson<StaffMonth>(path('attendance')),requestJson<StaffMonth>(path('journal')),loadWorkCalendar(month+'-01',month+'-'+last,profile.staffId)]).then(([attendance,journal,calendar])=>{if(active){setData({attendance,journal,calendar});setDate(month+'-01');setDirty(false);}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};
  },[month,profile.staffId]);
  const attendance=data?.attendance.document,journal=data?.journal.document;
  const row=attendance?.payload.rows.find(row=>row.date===date),entry=journal?.payload.rows.find(row=>row.date===date);
  const editable=attendance?.status==='draft'&&journal?.status==='draft';
  function change(patch:Partial<StaffRow>) {
    if(!data||!editable)return;
    setData({...data,...Object.fromEntries((['attendance','journal'] as const).map(kind=>[kind,{...data[kind],document:{...data[kind].document,payload:{...data[kind].document.payload,rows:data[kind].document.payload.rows.map(row=>row.date===date?{...row,...patch,reviewed:patch.reviewed??false}:row)}}}]))});setDirty(true);
  }
  function prepare() {
    if(!data||!editable)return;
    setData({...data,...Object.fromEntries((['attendance','journal'] as const).map(kind=>[kind,{...data[kind],document:{...data[kind].document,payload:{...data[kind].document.payload,rows:data[kind].document.payload.rows.map(row=>{
      if(row.kind!=='pending')return row;
      const leave=data.attendance.leaveDates?.find(d=>d.date===row.date),off=[0,6].includes(new Date(row.date+'T12:00:00Z').getUTCDay());
      return {...row,kind:leave?'leave':off?'off':'work',start:leave||off?'':profile.startTime,end:leave||off?'':profile.endTime,hours:leave||off?0:profile.hours,leaveDays:leave?.days??1,reviewed:false};
    })}}}]))});setDirty(true);
  }
  async function save(action:'save'|'confirm'|'reopen') {
    if(!data||busy)return;
    const reason=action==='reopen'?window.prompt('수정 사유를 입력해 주세요.')??'':'';
    if(action==='reopen'&&!reason.trim())return;
    setBusy(true);setError('');setNotice('');
    try {
      const bodies=Object.fromEntries((['attendance','journal'] as const).map(kind=>[kind,{version:data[kind].document.version,payload:data[kind].document.payload,sourceHash:data[kind].sourceHash,action:action==='reopen'&&data[kind].document.status==='draft'?'save':action,reason}]));
      await requestJson(path('workspace'),{method:'PUT',body:JSON.stringify(bodies)});
      const [attendance,journal]=await Promise.all([requestJson<StaffMonth>(path('attendance')),requestJson<StaffMonth>(path('journal'))]);
      setData({...data,attendance,journal});setDirty(false);setNotice(action==='confirm'?'출근부와 업무수행일지를 함께 확정했습니다.':action==='reopen'?'수정 사유를 남기고 다시 열었습니다.':'근무기록을 저장했습니다. 연차 입력은 연차대장에 자동 반영했습니다.');
    } catch(e){setError(e instanceof Error?e.message:'저장하지 못했습니다.');}finally{setBusy(false);}
  }
  return <><div className="staff-toolbar"><label>작성 월<input aria-label="통합 근무기록 월" type="month" value={month} disabled={busy} onChange={e=>{if(e.target.value&&(!dirty||window.confirm('저장하지 않은 내용을 닫을까요?')))setMonth(e.target.value);}}/></label>{data&&<span>출근부 {attendance?.status==='confirmed'?'확정':'초안'} · 업무일지 {journal?.status==='confirmed'?'확정':'초안'}</span>}</div>
    {error&&<p role="alert" className="work-day-error">{error}</p>}{notice&&<p role="status" className="work-notice">{notice}</p>}
    {!data?<p role="status">업무 달력과 근무기록을 불러오는 중입니다.</p>:<>
    {(data.attendance.sourceChanged||data.journal.sourceChanged)&&<p className="staff-warning">원본 업무·연차가 변경되었습니다. 달력의 최신 근거와 기록을 비교해 주세요.</p>}
    <div className="staff-toolbar">{editable?<><button className="secondary-button" disabled={busy} onClick={prepare}>미작성 날짜 기본근무 채우기</button><button className="secondary-button" disabled={busy} onClick={()=>void save('save')}>함께 저장</button><button className="primary-button" disabled={busy} onClick={()=>void save('confirm')}>검토한 월 기록 함께 확정</button></>:<button className="secondary-button" disabled={busy} onClick={()=>void save('reopen')}>수정 사유 남기고 함께 열기</button>}{attendance?.status==='confirmed'&&journal?.status==='confirmed'&&<><button className="secondary-button" disabled={busy||dirty} onClick={()=>printStaffPaper(<AttendancePaper document={attendance}/>)}>출근부 인쇄</button><button className="secondary-button" disabled={busy||dirty} onClick={()=>printStaffPaper(<JournalPaper document={journal}/>)}>업무수행일지 인쇄</button></>}</div>
    <p className="staff-help">날짜를 선택해 근태와 업무를 함께 수정하고 검토하세요. 기본근무 채우기는 평일 출근·주말 휴무를 제안하며 공휴일은 직접 확인해 주세요. 계획·할 일은 수행 기록과 구분해 표시합니다. 연차는 저장하면 연차대장에 계획 초안이 생성되며, 근무 확정 시 실제 사용으로 집계됩니다.</p>
    <div className="staff-workspace"><section className="staff-card"><h2>{month} · {profile.name}</h2><div className="staff-calendar">{['일','월','화','수','목','금','토'].map(day=><strong key={day}>{day}</strong>)}{Array.from({length:new Date(month+'-01T12:00:00Z').getUTCDay()},(_,i)=><span key={'blank'+i}/>)}{attendance?.payload.rows.map(day=>{const plans=data.calendar.plans.filter(p=>p.date===day.date&&p.status==='planned');const deadlines=data.calendar.deadlines.filter(p=>p.dueDate===day.date);const executions=data.attendance.executions.filter(e=>e.date===day.date);return <button type="button" key={day.date} className={day.reviewed?'is-reviewed':undefined} aria-pressed={date===day.date} onClick={()=>setDate(day.date)}><strong>{Number(day.date.slice(8))}일</strong><span>{attendanceLabels[day.kind]} {day.kind==='leave'?day.leaveDays+'일':''}</span><small>계획 {plans.length} · 할 일 {deadlines.length}<br/>수행 {executions.length}</small><small>{day.reviewed?'✓ 검토 완료':'검토 필요'}</small></button>;})}</div><h3>날짜 미지정 할 일</h3>{data.calendar.unplanned.map(task=><p key={task.id}>{task.title}</p>)}{!data.calendar.unplanned.length&&<p className="staff-help">없음</p>}</section>
    {row&&entry&&<section className="staff-card"><div className="staff-detail-heading"><h2>{date} 근무·업무 검토</h2><button type="button" className="staff-review-button" aria-pressed={row.reviewed&&entry.reviewed} disabled={busy||!editable} onClick={()=>change({reviewed:!(row.reviewed&&entry.reviewed)})}><Check size={20} aria-hidden="true"/>{row.reviewed&&entry.reviewed?'검토 완료됨':'검토 완료'}</button></div><h3>업무 계획·할 일</h3>{data.calendar.plans.filter(p=>p.date===date&&p.status==='planned').map(p=><p key={p.id}>계획 · {p.snapshot.title}</p>)}{data.calendar.deadlines.filter(p=>p.dueDate===date).map(p=><p key={p.id}>할 일 · {p.title}</p>)}<h3>실제 수행 근거</h3>{data.attendance.executions.filter(e=>e.date===date).map(e=><p key={e.id}>{e.period==='morning'?'오전':e.period==='afternoon'?'오후':'시간 미확인'} · {e.content}</p>)}{data.attendance.leaveDates?.filter(d=>d.date===date).map(d=><p key={d.date} className="staff-warning">확정 연차 계획 {d.days}일</p>)}
    <fieldset disabled={busy||!editable}><label>근태<select value={row.kind} onChange={e=>change({kind:e.target.value as StaffRow['kind'],...(['leave','off','absent'].includes(e.target.value)?{start:'',end:'',hours:0}:e.target.value==='work'?{start:profile.startTime,end:profile.endTime,hours:profile.hours}:{})})}>{Object.entries(attendanceLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>{row.kind==='leave'&&<label>연차 일수<select value={row.leaveDays} onChange={e=>change({leaveDays:Number(e.target.value)})}><option value={1}>1일</option><option value={0.5}>반차 0.5일</option></select></label>}
    <div className="staff-profile-grid"><label>출근<input type="time" value={row.start} onChange={e=>change({start:e.target.value})}/></label><label>퇴근<input type="time" value={row.end} onChange={e=>change({end:e.target.value})}/></label><label>근무시간<input type="number" min={0} max={24} step={0.5} value={row.hours} onChange={e=>change({hours:Number(e.target.value)})}/></label></div>
    <label>근태 비고·연차 사유<input maxLength={1000} value={row.note} onChange={e=>change({note:e.target.value})}/></label>{([['morning','오전 업무'],['afternoon','오후 업무'],['unknown','시간대 미확인 업무'],['morningNote','오전 비고'],['afternoonNote','오후 비고'],['other','기타 사항']] as const).map(([key,label])=><label key={key}>{label}<textarea maxLength={5000} value={entry[key]} onChange={e=>change({[key]:e.target.value})}/></label>)}</fieldset></section>}
    </div></>}
  </>;
}
